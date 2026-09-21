# ADR 0003 — The contradiction engine: the value-comparison vocabulary, the scope-overlap and symmetry questions, and two findings against the plan itself

- **Date:** 2026-09-22
- **Status:** accepted
- **Phase / milestone:** M4 (BUILD) — `lib/contradiction/`

## Context

`memory-plan.md` §5 (cause 1) and `PLAN.md`'s M4 row require `contradict(older, newer)`: a four-outcome
`ContradictionCheck` (`no-conflict | superseded | disputed | not-comparable`), firing only on the same
`(subject, predicate)` with overlapping `scope`, built on a locally-authored, closed, typed
value-comparison vocabulary (`equals | gte | lte | in | tolerance`), failing closed on type mismatch, never
mutating either input, and never calling a model or the network. `lib/contradiction/**` is FROZEN after
this milestone. This ADR records the design questions the milestone brief posed explicitly, one forward
note from M1's own ADR (`0001-contracts.md`) that M4 is the first caller positioned to close, and two
findings against `memory-plan.md`'s own text, disclosed rather than silently resolved.

## Decision 1 — VALUE-COMPARISON VOCABULARY: five operators, each restricted to the value shapes it can honestly judge

**Alternatives considered:**

- **Mirror `decision-engine`'s four operators (`equals`/`gte`/`lte`/`in`) unchanged, add nothing for
  tolerance.** Rejected: `memory-plan.md` §5's own `no-conflict` clause names tolerance directly ("exact-
  equal, or within a declared numeric tolerance for `predicate`s that define one") — omitting it would
  leave a named success-criterion example (implicitly, sensor-like numeric predicates) unimplementable.
- **A generic `distance(a, b): number` + threshold, usable for any `Json` shape via a caller-supplied
  metric function.** Rejected outright: a metric FUNCTION is exactly the closure-valued-field mistake
  `DecayPolicy` (M1 ADR, Decision 4) already reversed twice over in this account's history — unserializable,
  incomparable, unreplayable. A metric expressed as DATA (e.g. `{ metric: "levenshtein" }`) was also
  considered and rejected: no concrete predicate in this plan needs string/array tolerance, and inventing a
  metric-selection sub-vocabulary for a case nobody has yet is the exact "speculative flexibility" the
  house rules warn against (this account's own standing note: "tolerating a case nobody asked for produced
  five bypasses on a sibling project; the fix was a negative diff").
- **Chosen:** `ValueComparator` (`value-comparator.ts`) — a closed, five-member discriminated union on
  `op`, DATA evaluated by `compareValues`, never a predicate closure (the identical discipline
  `DecayPolicy`/`ValueConstraint` already established). `equals` is the default (`DEFAULT_VALUE_COMPARATOR`)
  and the only operator `contradict()` uses when a caller supplies none, so the plan's own literal
  `contradict(older, newer)` two-argument call form still works unchanged — `comparator` is an optional
  third parameter, not a breaking third requirement.

**What each operator means, precisely, and for which `Json` shapes (the ADR's own design question,
answered in code and in `value-comparator.ts`'s header, not left to prose alone):**

| op | applies to | "agree" means |
|---|---|---|
| `equals` | any `Json` shape | same top-level shape AND deep-equal (arrays order-sensitive, objects key-order-insensitive) |
| `gte` | finite `number` only | `newer >= older` — a declared monotonic-non-decreasing invariant, not a symmetric equality test |
| `lte` | finite `number` only | `newer <= older` — the mirror invariant |
| `in` | `string \| number \| boolean` only | both values are members of the same declared synonym set |
| `tolerance` | finite `number` only | `\|newer - older\| <= epsilon` (epsilon required, finite, non-negative) |

**`tolerance` is deliberately NOT extended to dates, strings, or arrays.** A `CapturedAt` difference already
has its own purpose-built elapsed-time machinery (`ageOf`, captured-at.ts) answering a different question
(a memory's own freshness, not two memories' value agreement) — reusing it here would conflate the two. A
string metric (edit distance? token overlap?) or an array metric (per-element distance? set distance?) both
need an invented, arbitrarily-chosen formula with no concrete predicate in this plan asking for one.
`tolerance` stays two lines of code and one precondition rather than growing a metric-selection
sub-vocabulary nobody has a real case for yet.

**`gte`/`lte` are NOT symmetric equality checks, on purpose.** Unlike `equals`, "agree" under `gte` means
"the newer reading did not violate a declared floor" — a genuinely directional invariant (an odometer only
increasing, a running total that never refunds), not "these two numbers happen to be close." A violation
(the newer value went backward) is treated as a REAL disagreement, falling through to the same
`superseded`/`disputed` tier split (Decision 6 below) as any other value conflict — it is not a
separate "invalid data" outcome, because the data is perfectly well-typed; it is the CLAIM that conflicts.

**`compareValues` never throws.** A malformed comparator (a negative/non-finite `epsilon`, an empty `in`
set) resolves to `"comparator-inapplicable"`, the same fail-closed instinct `decision-engine`'s own
`evaluateConstraint` applies to a malformed `ValueConstraint`.

## Decision 2 — SCOPE OVERLAP: exact superset containment, in EITHER direction; genuine partial intersection is `not-comparable`

**The ADR's own design question:** two memories whose scopes intersect but where neither contains the
other — is that `not-comparable`, or something else?

**Alternatives considered:**

- **Any non-empty intersection of entries counts as overlap.** Rejected: this would let two claims that
  were never asserted about the same combined bounded context contradict each other on the strength of
  sharing just ONE dimension out of several (e.g. `[{account:acme},{department:sales}]` vs.
  `[{account:acme},{department:eng}]` sharing only `account:acme`) — exactly the "close enough" fuzzy
  matching `lib/contracts/scope.ts`'s own header argues this project structurally refuses ("compared by
  exact set containment, never by substring or fuzzy match... a hard boolean gate").
- **Require exact scope equality.** Rejected as too strict: a memory scoped to `[{account:acme}]` and one
  scoped to `[{account:acme},{user:vlad}]` are plainly about overlapping bounded contexts (the narrower
  claim lives entirely inside the broader one), and refusing to compare them at all would make
  contradiction detection blind to a very ordinary case — a claim recorded at account granularity later
  contradicted by one recorded at user-within-account granularity.
- **Chosen:** overlap iff `scopeIsSupersetOf(older.scope, newer.scope) || scopeIsSupersetOf(newer.scope,
  older.scope)` — reusing `lib/contracts/scope.ts`'s own frozen function in both directions, the minimal,
  non-speculative extension of a relation `lib/contracts` already defines and already argues for, rather
  than inventing a new fuzzy-overlap concept from scratch. Two scopes that genuinely intersect but where
  neither contains the other are DELIBERATELY treated as NOT overlapping — `contradict` returns
  `not-comparable` (`"scope-not-overlapping"`) rather than adjudicating a conflict between two claims each
  carrying a bounded context the other doesn't fully share.

## Decision 3 — SYMMETRY: NOT symmetric by design; proven anti-symmetric via a `believedAt` ordering gate

**The ADR's own design question:** is `contradict` symmetric? What does `superseded` mean if the arguments
are swapped?

**Chosen answer: NO, `contradict(a, b)` and `contradict(b, a)` are not required to agree**, because the two
parameters are ROLES ("the older claim," "the newer claim"), not an interchangeable unordered pair —
`superseded`/`disputed`'s own meaning is stated entirely in terms of which argument is older and which is
newer, so swapping them asks a genuinely different question, not a re-ask of the same one.

**What IS proven, and load-bearing:** `contradict` checks `newer.believedAt` strictly after
`older.believedAt` (via `Date.parse`, numeric epoch-ms comparison — see Decision 5 below for why not a
string comparison) BEFORE any value is read, and fails closed to `not-comparable`
(`"clock-order-violated"`) if that ordering does not hold. This makes it structurally impossible for BOTH
`contradict(a, b)` and `contradict(b, a)` to reach the value-comparison step for the same pair with
different `believedAt` values — whichever call order has the wrong relative ordering is refused before it
can produce a misleading answer. `__tests__/contradict.test.ts`'s dedicated symmetry test proves this
directly: for any two same-`(subject,predicate)`-and-overlapping-scope memories with different `believedAt`,
EXACTLY ONE of the two call orders can ever produce anything other than `not-comparable`.

**Alternative considered and rejected: accept the two memories as an unordered pair and internally sort by
`believedAt`.** This would make `contradict` genuinely commutative, but it would also silently absorb a
caller's mistake (passing the memories in the wrong order) rather than surfacing it — and would make a
GENUINE tie (Decision 4) ambiguous to sort at all. Refusing wrong-order calls outright is more honest about
what the function actually computes: a directional claim about "older" vs. "newer," not a symmetric
predicate over two unordered claims.

## Decision 4 — SAME `believedAt`: a genuine tie fails closed to `not-comparable`

**The ADR's own design question:** what happens when the two memories have the same `believedAt`? Fail
closed, and say what closed means here.

**Chosen:** a tie (`newer.believedAt` numerically equal to `older.believedAt`) is treated EXACTLY like a
caller passing the memories in the wrong order — `not-comparable`, `"clock-order-violated"`. This function
has no principled way to decide which of two claims recorded at the identical instant is "the newer one,"
and the `superseded`/`disputed` split's entire mechanism (§5.1) is defined in terms of "newer" meaning
something. **Closed, here, means: this function refuses to guess, rather than silently breaking the tie by
argument order** — which is exactly the "whichever side happens to run the comparison first" outcome
`memory-plan.md` §5 says this project must never produce, restated for a tie in TIME rather than a tie in
confidence.

**Alternative considered and rejected: fall back to comparing `id` or object identity to break the tie
deterministically.** Rejected: `Memory.id` is an opaque identity token (memory-id.ts's own header: "a
UUID, a ULID, whatever the eventual store generates") with no meaningful ordering — breaking a genuine time
tie by comparing opaque ids would be arbitrary dressed up as deterministic, not a real resolution.

## Decision 5 — `believedAt` COMPARISON: numeric epoch-ms via `Date.parse`, never lexicographic string comparison

Not one of the ADR's four posed questions, but found while implementing Decision 3/4's ordering check, and
recorded because it is a real correctness bug class, not a style preference. `CapturedAt`'s own grammar
(captured-at.ts) permits either a `Z` suffix or an explicit `+hh:mm`/`-hh:mm` offset, and variable
sub-second precision. Two valid `CapturedAt` strings for the same real instant, or in the wrong relative
order, do NOT always compare correctly as plain strings (`"2026-06-01T01:30:00.000Z"` sorts lexicographically
AFTER `"2026-06-01T03:00:00.000+02:00"`, even though the second string names the EARLIER real instant,
01:00 UTC). `contradict` compares `Date.parse(older.believedAt)` against `Date.parse(newer.believedAt)` —
the same calendar authority `captured-at.ts`'s own `parseCapturedAt`/`ageOf` already trust — never the raw
strings. `__tests__/contradict.test.ts` proves this directly with a same-real-instant-class pair at
differing UTC offsets that a naive string comparison would misorder.

## Decision 6 — `contradict` COMPARES `Provenance.tier` DIRECTLY (not `Memory.confidence`), closing M1's own ADR forward note the RIGHT way — REVISED after independent review

**This decision was wrong in this milestone's first pass, and is recorded here as revised, not silently
corrected — the earlier reasoning was internally sound and still persuaded a careful reader toward the
wrong rule, which is a worse failure than an unconvincing wrong answer.**

**The first-pass decision:** `.genesis/decisions/0001-contracts.md`, Decision 1, left `Provenance.tier`'s
mapping to a numeric confidence explicitly unresolved: "Whoever needs it first should decide it with a real
case in hand." Reasoning that `ConfidenceTier` (`"direct-avowal" | "derived-inference"`) "has no numeric
ordering of its own," the first pass had `contradict` read `newer.confidence >= older.confidence` directly
off `Memory.confidence` instead.

**Why that was wrong, not merely a stylistic alternative:** a two-member union DOES have an obvious total
order, and `PLAN.md`'s own M4 success criteria state the `superseded`/`disputed` rule directly in terms of
the two TIER NAMES, never in terms of a numeric confidence value: "two same-tier `human` avowals... resolve
to `superseded`... two same-tier `derived` inferences... resolve to `disputed`." The proof that exposed the
error: two `direct-avowal` memories with wildly divergent recorded confidence (`0.9` and `0.1`) must still
resolve to `superseded` under the plan's own worked example (a person restating a fact supersedes their own
earlier statement, full stop) — and the confidence-number comparison gets this case wrong, resolving it to
`disputed` instead. That gap was flagged, honestly, as this milestone's own "weakest point" in its first
build report, framed as a documentation/discipline gap ("whoever constructs a `Memory` must assign
`confidence` consistent with `tier`"). Independent review correctly reframed it: this was not a discipline
gap to document, it was the WRONG MECHANISM to begin with.

**Chosen (revised):** `contradict` calls `resolveTierSplit(older.source.tier, newer.source.tier)`
(`tier-split.ts`) directly. `Memory.confidence` plays NO role in the `superseded`/`disputed` decision at
all. The complete rule, four cases (see `tier-split.ts`'s own header for the full worked argument):

1. `newer.tier` OUTRANKS `older.tier` (`derived-inference` → `direct-avowal`) → `superseded`.
2. SAME tier, both `direct-avowal` → `superseded` (§5.1's worked example: a restated direct avowal
   supersedes the earlier one).
3. SAME tier, both `derived-inference` → `disputed` (§5.1's other worked example: two independent
   inferences disagreeing is genuine uncertainty, not a restatement — neither wins).
4. `newer.tier` is OUTRANKED BY `older.tier` (`direct-avowal` → `derived-inference`) → `disputed` (this is
   §5.1's "a fresher-but-lower-confidence value must not auto-win," read correctly as a TIER statement: an
   inference arriving after a direct avowal does not overturn it, no matter how confident the inference is
   or how recent).

**Cases 2 and 3 are deliberately asymmetric — the plan's own asymmetry, not an arbitrary choice made by
this milestone.** A `direct-avowal` is a claim ABOUT ITSELF (the subject stating their own current state):
a newer one is not really in "dispute" with an older one, it is simply an update, in the same way a
person's own restated address is never ambiguous about which statement is current. A `derived-inference` is
a claim ABOUT the subject FROM THE OUTSIDE (parsed, computed, OCR'd): two independent inferences disagreeing
is genuine evidence of uncertainty in the world, not merely a restatement, so being "newer" does not entitle
one inference to silently overrule the other. Treating both same-tier cases identically (both `superseded`,
or both `disputed`) would have been the easier, more symmetric-looking rule to write — and would have
contradicted the plan's own worked contrast, which explicitly gives the two cases opposite outcomes.

**This closes the structural weakness this milestone's own first build report flagged, rather than merely
documenting it.** `contradict`'s correctness for the `superseded`/`disputed` split no longer depends on
whoever constructs a `Memory` having assigned `confidence` consistently with `source.tier` — there is no
such dependency left to rely on. Proven directly, not merely asserted, in `__tests__/contradict.test.ts`:
two `direct-avowal` memories with confidence `0.9` (older, losing) and `0.1` (newer, winning) resolve to
`superseded`; the same test with the confidence values swapped (or with any other pair) resolves identically
— tier, not confidence, decides. `__tests__/tier-split.test.ts` proves `resolveTierSplit` in isolation
against all four cases of the closed 2×2 tier space.

**Alternatives considered and rejected:**

- **The first-pass mechanism itself** (compare `Memory.confidence` directly) — superseded by the argument
  above; kept in this ADR as a revision, not deleted, because the reasoning that led to it (and why it was
  wrong) is itself useful record for whoever next touches this file.
- **A `tierForKind`-style `SourceKind → ConfidenceTier` mapping.** Not needed here at all — `contradict`
  never reads `Provenance.kind`, only `Provenance.tier`, which M1 already made a required, caller-supplied
  field. This alternative would have solved a problem `contradict` doesn't have.
- **Comparing BOTH tier and confidence** (tier as a first-pass filter, confidence as a tie-breaker within
  the same tier). Rejected: the plan's own worked contrast gives a definite answer for each same-tier case
  (`superseded` for direct-avowal, `disputed` for derived-inference) with no tie-breaking role left for
  confidence to play — adding one would silently reintroduce the exact failure mode (a confidence number
  deciding the case) this revision exists to remove.

## Finding 1 — `memory-plan.md` §5's own `not-comparable` sentence is ambiguous against `PLAN.md`'s M4 success criteria; `PLAN.md` is followed

§5's prose for `not-comparable` reads: "fails closed to `disputed` as well, never silently 'no conflict'" —
which, read hyper-literally, could mean `not-comparable` collapses INTO `disputed` (a third variant folding
into a second), rather than remaining its own, fourth, distinct outcome. This reading is REJECTED here, in
favor of `PLAN.md`'s own M4 success criteria (the row this milestone's brief names as authoritative), which
requires `not-comparable` as its own, fourth, distinct `ContradictionCheck` outcome with its own dedicated
test ("a type-mismatched comparison... fails closed to `not-comparable`, never throws and never silently
resolves either way"). `contradiction-check.ts`'s own header records this exact ambiguity and reading:
§5's sentence is treated as "`not-comparable`, LIKE `disputed`, never hands a caller a decisive winner"
(both are non-committal outcomes), not as "these two outcomes are the same value." Flagged here as a
genuine ambiguity in the plan text, not silently reconciled.

## Finding 2 — §5.1's `disputed` clause names a "freshness window" condition this milestone cannot honestly evaluate, and does not attempt to

§5.1's own text: "`newer.confidence` is lower than `older`'s **and** `older` is still inside its own
freshness window." The FIRST conjunct is superseded entirely by Decision 6's revision above (the split is
now decided on tier, not on a confidence comparison, so this half of the plan's literal sentence no longer
describes the actual mechanism — see Decision 6 for why the plan's own worked examples support the tier
reading). The SECOND conjunct — "older is still inside its own freshness window" — requires evaluating a
`DecayPolicy` against `now`: exactly `lib/decay/**` (M3), which this milestone's brief explicitly forbids
importing, stubbing, or waiting for, and `contradict`'s own signature (`memory-plan.md`'s own outcome line:
"`contradict(older, newer)`") never names a `now` parameter to compute it with. **This freshness half of
§5.1's condition is DELIBERATELY UNIMPLEMENTED AT THIS LAYER — a stated scope boundary, not an oversight
and not something this milestone forgot to get to.** `contradict` treats that conjunct as a PRECONDITION
owned by `contradict`'s eventual caller (M5's `lib/store/**`,
which will have both `now` and `lib/decay/**`), not as something recomputed internally. In practice: a
store is expected to call `contradict` only for `older` memories that are still LIVE (a memory already
decayed past `DecayPolicy.forgetFloor` would already have been `forget(..., "age-exceeded", now)`'d by
M3/M5's own machinery before ever reaching `contradict`), so "older is still inside its freshness window"
reduces, in practice, to "older is still a live `Memory<TValue>`" — which IS structurally guaranteed by
`contradict`'s own parameter type (a `TombstonedMemory` cannot satisfy `Memory<TValue>` at all, per M1's
own Decision 2). This is disclosed here as a genuine simplification, not silently worked around: the
alternative — inventing a `now` parameter and a decay call this milestone's own stated signature never asks
for — would be worse, exactly the "inventing an interface M3 may contradict" this milestone's brief warns
against. **If this reduction turns out to be wrong once M5 exists for real** (e.g. if a store ever needs to
compare two memories where "still fresh" is not equivalent to "still live" under some future `DecayPolicy`
shape), that is M5's finding to make, with a real case in hand — not something this milestone should have
guessed at.

## Consequences

- Positive: the value-comparison vocabulary is closed, small, and every operator's applicable value shapes
  are enforced at runtime (never a silent wrong-shape comparison) — matches this account's own "speculative
  flexibility costs rounds" lesson directly, by refusing to add a sixth operator or a metric-selection
  sub-vocabulary nobody has a concrete case for.
- Positive: `contradict`'s `believedAt` ordering check both closes a genuine string-vs-numeric-timestamp
  comparison bug class AND gives the symmetry/tie ADR questions one mechanism, not two ad hoc rules.
- Positive: Decision 6 (as revised) closes M1's own explicitly-left-open forward note with a real case in
  hand, exactly as that ADR asked for — and closes it on the vocabulary the plan's own success criteria
  actually use (tier names), not a numeric proxy for them.
- Positive, closing what was flagged as this milestone's own weakest point in its first build report:
  because the `superseded`/`disputed` split now reads `source.tier` directly, `contradict`'s correctness
  no longer depends on whoever constructs a `Memory` having assigned `confidence` consistently with
  `source.tier` — that dependency is GONE, not merely documented as a risk. `__tests__/contradict.test.ts`
  proves this directly with two `direct-avowal` memories at wildly divergent recorded confidence (`0.9`
  and `0.1`) still resolving to `superseded`, which is exactly the case the first-pass (confidence-based)
  mechanism got wrong.
- Negative / cost, disclosed as this milestone's own weakest point now (see the build report): Finding 2 means
  `contradict`'s `disputed` outcome is, strictly, a narrower rule than §5.1's own prose describes — it is
  correct whenever its "older is still live" precondition holds, and this milestone has no way to verify
  that precondition from inside `lib/contradiction/**` alone.
- Forward note for M5: `contradict` assumes its caller only ever passes a LIVE `older` (enforced by the
  type system) and — per Finding 2 — implicitly assumes that "live" and "still fresh" coincide. M5's real
  `lib/store/**` should call `contradict` only for the pair of memories actually competing to be the live
  belief for a `(subject, predicate, scope)`, in `(older, newer)` `believedAt` order, exactly once per
  affirmation — not batch-compare arbitrary historical pairs.

## Alternatives rejected (summary, cross-referenced above)

- A caller-supplied metric closure for `tolerance`/a generic `distance` function (Decision 1) — the same
  unserializable-closure mistake `DecayPolicy` already reversed twice.
- Extending `tolerance` to dates/strings/arrays (Decision 1) — no concrete predicate needs it; would invent
  an arbitrary metric.
- Any non-empty scope-entry intersection counting as "overlap" (Decision 2) — the exact fuzzy matching
  `scope.ts` already refuses.
- Requiring exact scope equality for contradiction eligibility (Decision 2) — too strict for the plan's own
  ordinary case of nested bounded contexts.
- Treating `contradict` as commutative by internally sorting on `believedAt` (Decision 3) — would silently
  absorb a caller's argument-order mistake instead of surfacing it.
- Breaking a genuine `believedAt` tie by comparing opaque `id`s (Decision 4) — arbitrary dressed up as
  deterministic.
- Comparing `Memory.confidence` directly instead of `source.tier` (Decision 6, this milestone's OWN first
  pass) — internally consistent reasoning that nonetheless produced a rule the plan's own success criteria
  do not describe; revised after independent review found the proof case (`0.9` vs. `0.1`, same tier) it
  got wrong.
- A `SourceKind → ConfidenceTier` mapping (Decision 6) — solves a problem `contradict` doesn't have; it
  only ever reads the already-required `Provenance.tier` field, never `Provenance.kind`.
- Using confidence as a same-tier tie-breaker alongside tier (Decision 6) — the plan's own worked contrast
  already gives a definite answer for each same-tier case; a tie-breaker would silently reintroduce the
  exact confidence-decides failure mode the revision removes.
- Silently reconciling §5's ambiguous `not-comparable`/`disputed` sentence in favor of either reading
  without recording the ambiguity (Finding 1).
- Inventing a `now` parameter and a decay call inside `contradict` to evaluate §5.1's "freshness window"
  conjunct literally (Finding 2) — reaches into M3's frozen-elsewhere territory on no signature authority.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

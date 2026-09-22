# Architecture: Memory → decay → contradiction → forgetting → query

This is a snapshot, not a tour of the module list — `lib/contracts/`, `lib/decay/`, `lib/contradiction/`, and
`lib/store/` already document themselves file by file and ADR by ADR, and repeating that here would just be a
worse copy. What earns this document its place is the other half of the story: **at each stage, what does the
system refuse to do, and why.** Every refusal named below is backed by a real, currently-passing test — file
and assertion name, not paraphrase — so a reader can go look. Anything found while writing this that could not
be traced to a real, currently-passing test was cut rather than stated at lower confidence; none of the
refusals below are guesses.

**A stage-order caveat, stated up front because a sibling project on this same account was rejected eight
times for exactly this kind of claim going unchecked.** The five stages below are named in the order
`memory-plan.md` §3–§6 poses them and `PLAN.md`'s own milestone rows build them (M1 → M3 → M4 → M5), and they
are also the real order a single `queryBelief()` call executes internally — checked directly in
`lib/store/belief-query.ts`, not assumed from the milestone numbering: `partitionByDecay` (decay) runs first,
on every candidate, before anything is eligible to reach `contradict()`; the two-or-more-candidates branch
then calls `contradict()` (contradiction); a `"superseded"` verdict from that call is resolved immediately by
calling `forget()` (forgetting), lazily, right there; and the function's own return value — the
`BeliefAnswer` plus every tombstone minted along the way — is the query answer. **This is not, however, a
layered import chain the way the analogous diagram is in this account's `decision-engine`/`shadow-run`
siblings.** Checked directly with `grep -rhn '^import' lib/*/[!_]*.ts` (excluding `__tests__/`), not assumed:
`lib/decay/*.ts` imports only from `lib/contracts`; `lib/contradiction/*.ts` imports only from
`lib/contracts` and from within itself; neither ever imports the other, in either direction, and neither
imports `lib/store`. `lib/store/belief-query.ts` is the one file that imports both `lib/decay` (`decay`) and
`lib/contradiction` (`contradict`, `assertNeverContradictionCheck`, `value-comparator`) — it is the composer,
not a fifth peer in the same chain. So "decay" and "contradiction" are independent siblings at the type
level, each built on the same frozen base (`lib/contracts`) and never on each other; the five-stage
*sequence* below is a fact about what one function calls, in what order, not a fact about what imports what.
A diagram that drew all five as a single linear import stack would be asserting a structural fact this
codebase does not have.

```
    MEMORY                DECAY                 CONTRADICTION           FORGETTING              QUERY
lib/contracts/       lib/decay/            lib/contradiction/      lib/store/forget.ts     lib/store/
memory.ts, ...       decay.ts,             contradict.ts,                                 belief-query.ts
                      query-confidence.ts   tier-split.ts,
                                            value-comparator.ts
   │                     │                      │                       │                      │
   ▼                     ▼                      ▼                       ▼                      ▼
a typed, frozen-     a pure freshness       a pure four-outcome     a pure, non-mutating    composes all
by-type-only          interpreter over      comparison over          constructor of a       four: sweeps
belief record —       a declared            Provenance.tier          TombstonedMemory +      decay first,
Memory<TValue>,       DecayPolicy —         alone (never             Tombstone pair —        resolves a live
never a               believed/doubted/     Memory.confidence)      never mutates,           contradiction
TombstonedMemory      forgettable,          — no-conflict /          never resurrects         second, mints
in the same slot      never a side          superseded / disputed                            whatever
                       effect                / not-comparable                                 tombstones
                                                                                               either step
                                                                                               needs, and
                                                                                               answers
```

---

## Stage 1 — Memory (`lib/contracts/memory.ts`, `tombstoned-memory.ts`, `forget-reason.ts`, `belief-answer.ts`, `json.ts`)

**Job:** fix the shapes every later stage imports and none may redefine — a typed, comparable claim, never a
chunk of text with fields attached (`memory-plan.md` §3) — or refuse to typecheck rather than let a caller
construct one that lies about itself.

**What it refuses, and why:**

- **Refuses to let `Memory.value` hold a function, a `Date`/`Map`/`Set`, a symbol-keyed property, a circular
  reference, or an accessor property (a getter) — checked structurally, not merely typed against.**
  `isPlainData` (`json.ts`) walks the value by reflection and rejects each of these even when a cast defeats
  the type system (`TValue extends Json`), because a getter that returns different values on two reads would
  break "same input, same fingerprint-shaped identity, always," the same way a smuggled function would break
  serialization.
  *Tests:* `lib/contracts/__tests__/json.test.ts` — `"rejects a function value, even nested"`, `"rejects a
  symbol-keyed property"`, `"rejects Date/Map/Set and other non-plain prototypes"`, `"rejects a circular
  reference"`, `"rejects an accessor property WITHOUT invoking it (no side effect from the check itself)"`;
  `lib/contracts/__tests__/memory.test.ts` — `"RUNTIME companion to the type-level Json constraint: ...
  Memory.value defeats the type system via a cast ..., but the runtime plain-data guard still rejects it"`.
- **Refuses to let a `TombstonedMemory` satisfy a live-query function's `Memory<TValue>` parameter — a
  compile-time refusal, not a runtime `if (status !== "tombstoned")`.** `Memory.status` is a three-member
  union (`"believed" | "doubted" | "disputed"`) deliberately narrower than `memory-plan.md` §3's own
  four-member sketch (which includes `"tombstoned"`); `TombstonedMemory.status` is the single literal
  `"tombstoned"`, not a member of that union, so no `TombstonedMemory` value structurally satisfies `Memory`.
  *Tests:* `lib/contracts/__tests__/live-query-refusal.test.ts` — `"TYPE-LEVEL: passing a TombstonedMemory
  where the query expects ReadonlyArray<Memory<TValue>> does not compile"`, `"... a MIXED array of one live
  memory and one tombstoned memory is also refused — the refusal is per-element ..."`; re-proven against the
  real, shipped function (not a stand-in) in `lib/store/__tests__/belief-query-refusal.test.ts`.
- **Refuses to let a `CausedTombstone` (reason `"contradicted"`/`"superseded"`) omit `supersededBy`, or an
  `UncausedTombstone` (the other three reasons) carry one.** `Tombstone` is a two-branch discriminated union,
  not one interface with an optional field — the plan's own "present iff" comment (§4) is now true by
  construction.
  *Tests:* `lib/contracts/__tests__/tombstone.test.ts` — `"TYPE-LEVEL: a CausedTombstone missing supersededBy
  does not compile"`, `"TYPE-LEVEL: an UncausedTombstone with a supersededBy field does not compile"`.
- **Refuses a sixth `ForgetReason`, or any free-text reason, at the type level.** The union is closed to
  exactly five members.
  *Tests:* `lib/contracts/__tests__/forget-reason.test.ts` — `"TYPE-LEVEL: an arbitrary free-text reason does
  not compile"`, `"TYPE-LEVEL: a plausible-but-wrong reason ('purged', not one of the five) does not
  compile"`.
- **Refuses a fifth `BeliefAnswer` variant, or a consumer that doesn't handle all four, to compile silently.**
  `assertNeverBeliefAnswer` makes an unhandled variant a real `tsc` error, not a runtime `default:` branch
  nobody notices is stale.
  *Test:* `lib/contracts/__tests__/belief-answer.test.ts` — `"PROOF (on a local, equivalent stand-in —
  BeliefAnswer itself stays frozen at four for this milestone): a fifth variant fails to compile until every
  consumer handles it"`.
- **Refuses reassignment of any field after construction — at the type level.** Every field on `Memory`,
  `TombstonedMemory`, and `Tombstone` is `readonly`; assigning to `value`, `status`, `confidence`, `id`, or
  `tombstone` after construction is a compile error.
  *Tests:* `memory.test.ts`'s `"IMMUTABLE — TYPE-LEVEL"` block (four tests); `tombstoned-memory.test.ts`'s
  equivalent for `tombstone`; `tombstone.test.ts` — `"Tombstone is immutable — assigning to any field after
  construction does not compile"`.

**Named limit, disclosed rather than closed:** unlike this account's `shadow-run` sibling (whose `World` is
deep-frozen at runtime by `makeWorld`), **nothing in `lib/contracts` deep-freezes a constructed `Memory` at
runtime.** `readonly` is a compile-time-only guarantee; a caller reaching for `as any`, or mutating a *nested*
field one level down (`memory.source.revocable = false` — `Provenance`'s own fields are independently
`readonly`, but nothing here deep-freezes the constructed object graph), is not caught. This is a real,
disclosed limitation `memory.ts`'s own header states directly, not a gap discovered while writing this
document: M1 defines no `Memory`-constructing API at all, so there is no single construction site that could
own a deep-freeze the way `makeWorld` does in the sibling project.

**Named limit, disclosed rather than closed:** `isPlainData`'s reflection-based walk can be defeated the same
way `shadow-run`'s equivalent check can — a hostile `Proxy` can fabricate its own `ownKeys` /
`getOwnPropertyDescriptor` answers and hide a function-valued or unstable property entirely.
*Test:* `json.test.ts` — `"KNOWN LIMITATION: a Proxy can fabricate an accessor-free, function-free view of
itself and defeat this check entirely — not a fix, a demonstration"`.

## Stage 2 — Decay (`lib/decay/decay.ts`, `query-confidence.ts`)

**Job:** interpret a memory's own declared, data-only `DecayPolicy` against `now` into a freshness verdict —
`believed` / `doubted` / `forgettable`, plus a computed confidence — as a pure function with no side effect,
never a hardcoded `if (age > X)`.

**What it refuses, and why:**

- **Refuses to report a confidence higher than the one recorded, at any elapsed time, under any policy.** The
  curve (`recordedConfidence * 0.5^(elapsed/halfLifeMs)`) is strictly decreasing and clamped; a
  `never-decays` policy holds the recorded value indefinitely but never exceeds it either.
  *Test:* `lib/decay/__tests__/decay.test.ts` — `"never produces a confidence higher than the recorded one,
  at any elapsed time, including zero"`.
- **Refuses to fabricate a high confidence when the clock is inconsistent.** A `now` earlier than
  `lastAffirmedAt` (or `believedAt`) fails closed to `ZERO_CONFIDENCE`/`"doubted"` — never `confidence: 1`,
  never a crash.
  *Tests:* `decay.test.ts`'s `"clock-inconsistency fails closed"` block — `"a 'now' earlier than
  lastAffirmedAt never produces a confidence higher than the recorded one ... never a fabricated confidence:
  1"`, plus the `believedAt` variant and the "does NOT overtighten" boundary case (`now === lastAffirmedAt` is
  consistent).
- **Refuses to hide the exact threshold crossing behind smoothing.** No EMA. One millisecond before
  `halfLifeMs`, still `"believed"`; exactly at it, flips to `"doubted"` at confidence exactly `0.4`. One
  millisecond before `2 * halfLifeMs`, still `"doubted"`; exactly at it, flips to `"forgettable"` at
  confidence exactly `0.2`.
  *Tests:* `decay.test.ts`'s `"threshold-flip"` block, all five tests.
- **Refuses to survive a malformed `DecayPolicy` on accidental arithmetic — validates explicitly, before any
  curve runs.** `halfLifeMs <= 0`, non-finite, or `forgetFloor > doubtedThreshold` all fail closed to
  `{confidence: ZERO_CONFIDENCE, status: "forgettable"}` — deliberately the *strictest* verdict this function
  has, stricter than clock-inconsistency's `"doubted"`, because a broken policy misconfigures every future
  call, not just this one. A `forgetFloor` at or above `1` is rejected the same way (it would make every
  memory forgettable from the instant it is created).
  *Tests:* `decay.test.ts`'s `"malformed policy fails closed"` block — the exact `halfLifeMs: 0` case this
  milestone's own first build report named as its weakest point, a negative `halfLifeMs`, a non-finite one, a
  `forgetFloor > doubtedThreshold`, and `forgetFloor` at the maximum (`1`) — each with a paired "does NOT
  overtighten" boundary test (`forgetFloor === doubtedThreshold` stays valid; a floor just below `1` stays
  valid).
- **Refuses to decide what happens next.** `decay()` has no side effect and constructs no `Tombstone` — a
  `"forgettable"` verdict is a fact reported, not an action taken; whether to act on it belongs entirely to
  the forgetting stage.
  *Source:* `decay.ts`'s own header, ADR 0002 Decision 3; consequence proven by `decay()`'s own signature
  never taking a mutable store and no test anywhere constructing a `Tombstone` from this file.
- **Refuses to let its own architectural boundary go unchecked.** A copied, hardened architecture test
  (matching `lib/contradiction`'s and `lib/store`'s own copies) parses every non-test file with the real
  TypeScript compiler and fails the file as an automatic offender if it does not parse; rejects any import
  outside `lib/decay`/`lib/contracts`; rejects a bare global `fetch(...)` call, including one hidden inside a
  template-literal interpolation or behind a regex-literal-with-backtick tokenizer trick.
  *Tests:* `lib/decay/__tests__/architecture.test.ts` — the three top-level checks plus the
  `"EXPLOIT REGRESSION"` blocks (rounds 2–5).

**Named limit, not previously listed, found while tracing this stage:** ADR 0002's own forward note for M5
instructs, by name, "M5's `BeliefQuery` should import `queryConfidence`" (`lib/decay/query-confidence.ts`) as
the composed, query-facing confidence function. **Checked directly:** `lib/store/belief-query.ts` never
imports `queryConfidence` at all — it calls `decay()` directly and reads `DecayResult.confidence` off the
result. This produces the identical number for a live memory (`queryConfidence`'s own live branch is nothing
but `decay(record, now).confidence`), so it is not a behavioral bug, and `queryConfidence` is genuinely used
elsewhere (`components/AnswerPanel.tsx`, and `lib/store/__tests__/belief-query.test.ts`'s own assertions
against a reconstructed tombstoned record) — but the forward note's own naming was not followed literally,
and nothing pins that the two stay equivalent if `queryConfidence` or `partitionByDecay` ever diverges.

## Stage 3 — Contradiction (`lib/contradiction/contradict.ts`, `tier-split.ts`, `value-comparator.ts`)

**Job:** given two memories for the same `(subject, predicate)` with overlapping scope, decide exactly one of
four outcomes — `no-conflict` / `superseded` / `disputed` / `not-comparable` — as a pure function over a
closed, typed value-comparison vocabulary, never calling a model or the network.

**What it refuses, and why:**

- **Refuses to compare across different subjects or predicates, or across scopes that do not contain one
  another.** Both checks run *before* any value comparison and fail closed to `not-comparable`. A genuine
  partial overlap — two scopes that intersect but where neither contains the other — is deliberately *also*
  `not-comparable`, not treated as overlapping.
  *Tests:* `lib/contradiction/__tests__/contradict.test.ts` — `"different subjects fail closed to
  not-comparable"`, `"different predicates on the same subject also fail closed"`, `"checked before value
  comparison: mismatched subject wins over a would-be value disagreement"`, and the `"scope overlap"` block's
  `"PARTIAL OVERLAP (ADR design question): scopes that genuinely intersect but where NEITHER contains the
  other are not-comparable, not silently treated as overlapping"`.
- **Refuses to guess which memory is "newer" on a `believedAt` tie, or when the caller passes them in the
  wrong order.** Both fail closed to `not-comparable`/`"clock-order-violated"` — proven symmetric: for any
  pair with genuinely different `believedAt`, at most one call order ever produces a non-`not-comparable`
  outcome.
  *Tests:* `contradict.test.ts`'s `"clock ordering"` block — `"a genuine tie ... fails closed to
  not-comparable"`, `"the caller's own args passed out of order ... fails closed ... rather than silently
  swapping them"`, `"SYMMETRY (ADR design question): ... at most one call order ever produces a
  non-not-comparable outcome"`; compared by real elapsed time (`Date.parse`), not lexicographic string order,
  proven directly with a same-instant pair at differing UTC offsets that a naive string comparison would
  misorder.
- **Refuses to let `Memory.confidence` decide `superseded` vs. `disputed` — decides on `Provenance.tier`
  alone.** This is a *corrected* refusal, not an original design: M4's first pass compared recorded
  confidence directly and was rejected on independent review because two `direct-avowal` memories at
  confidence `0.9` (older) and `0.1` (newer) resolved to `disputed` under that mechanism, contradicting the
  plan's own worked example (a person restating a fact supersedes their own earlier statement, regardless of
  how confidently either was recorded). Its own tests had passed only because the fixtures happened to assign
  confidence consistently with tier. `contradict()` now calls `resolveTierSplit(older.tier, newer.tier)`
  directly; `Memory.confidence` plays no role in this decision at all.
  *Tests:* `contradict.test.ts` — `"PROOF (the weakest point flagged in this milestone's own build report,
  now closed): two direct-avowal memories with WILDLY DIVERGENT recorded confidence (0.9 vs. 0.1) still
  resolve to superseded"`, and the derived-inference mirror, `"same-tier derived-inference stays disputed
  even when the NEWER scan has the HIGHER recorded confidence"`; `lib/contradiction/__tests__/tier-split.test.ts`
  proves all four tier combinations directly. *Record:* `.genesis/decisions/0003-contradiction.md`, Decision
  6 (revised); PR #8's own body: *"a well-tested, convincingly-argued mechanism that did not match the
  spec."*
- **Refuses a malformed comparator, or a value shape an operator cannot honestly judge, by throwing or
  guessing — reports `"comparator-inapplicable"` instead.** A negative or non-finite `tolerance` epsilon, an
  empty `in` set, or a numeric-only operator (`gte`/`lte`/`tolerance`) given a non-numeric value all fail
  closed the same way; `compareValues` never throws for any of its five operators.
  *Tests:* `lib/contradiction/__tests__/value-comparator.test.ts` — the `"is inapplicable"` cases across all
  five operator blocks, and `"never throws for any of the five operators, even on hostile/malformed input"`.
- **Refuses to mutate either input.** Deep-frozen fixtures pass through every one of the four outcomes without
  throwing, and the result's `older`/`newer` fields are the same object references as the inputs, never
  copies.
  *Tests:* `lib/contradiction/__tests__/immutability.test.ts`, all seven tests.
- **Refuses to let its own architectural boundary go unchecked** — the identical copied architecture test
  described under Decay, scoped to `lib/contradiction`/`lib/contracts`.
  *Test:* `lib/contradiction/__tests__/architecture.test.ts`.

**Named limit, stated at full strength, not merely disclosed once and forgotten:** `contradict()` has no `now`
parameter and cannot itself evaluate whether "`older` is still inside its own freshness window" — the second
half of §5.1's `disputed` condition. It assumes its caller only ever passes a live `Memory` for `older`, which
is enforced by the type system (a `TombstonedMemory` cannot satisfy `Memory<TValue>`) but is *not* the same
guarantee as "still fresh," since `decay()` has no side effect and a memory can remain structurally live for
however long nobody calls `forget()` on it. This reduction ("still live" ≈ "still fresh") is exactly the
precondition Stage 5 (query) has to take responsibility for enforcing on every call — see below.
*Record:* `.genesis/decisions/0003-contradiction.md`, Finding 2; `.genesis/decisions/0004-store.md`, Decision
3.

## Stage 4 — Forgetting (`lib/store/forget.ts`)

**Job:** turn a live `Memory` plus a `ForgetReason` into a real `TombstonedMemory` + `Tombstone` pair —
tombstoning, never physical deletion — as the one function in this codebase that changes retrievability.

**What it refuses, and why:**

- **Refuses to let a caller construct a `Tombstone` with `supersededBy` present for an uncaused reason, or
  absent for a caused one — enforced again at the one call site that actually builds a `Tombstone`, not only
  on the type it constructs.** Two overload signatures (`(memory, "contradicted" | "superseded", now,
  supersededBy)` vs. `(memory, "age-exceeded" | "scope-exited" | "source-revoked", now)`) make this a
  compile error at the call site, with a runtime backstop (`isCausedReason`) that throws — rather than
  silently constructing a malformed `Tombstone` — for the one path a caller could still reach by defeating the
  overloads with a type cast.
  *Tests:* `lib/store/__tests__/forget.test.ts` — the `"TYPE-LEVEL: the overloaded signature enforces
  ..."` block, including the `@ts-expect-error` proof in both directions, and `"RUNTIME BACKSTOP: a caller
  that defeats the overloads with a type cast still gets a thrown error, never a silently-malformed
  Tombstone"`.
- **Refuses to mutate its input, and refuses to lose any field.** A deep-frozen fixture memory passes through
  unchanged; every field the original `Memory` carried is preserved byte-for-byte in the returned
  `TombstonedMemory`, proven by direct object comparison, not a shape assertion.
  *Tests:* `forget.test.ts` — `"forget() never mutates its input"` block; `"forget() preserves every other
  field byte-for-byte"` block.
- **Refuses to offer a way back.** No `unforget`/`resurrect` function exists anywhere in this codebase — the
  only occurrence of either word in `lib/store/**` is the comment naming its own absence
  (`grep -rn "unforget\|resurrect" lib/store` returns exactly one line, and it is that comment). A source that
  is later reinstated, or a contradiction later reversed by a fresher direct avowal, is represented as a
  *brand-new* `Memory` competing at whatever future query needs to compare it — the original tombstone stays
  exactly what it always was: permanent proof that between one moment and another, this store did not believe
  the tombstoned value.
  *Record:* `.genesis/decisions/0004-store.md`, Decision 4.
- **Refuses to invent a registry for the two least-specified `ForgetReason`s.** Neither `scope-exited` nor
  `source-revoked` has a detection mechanism anywhere in `lib/store/**` — both are plain, direct calls a
  caller makes once it has independently observed the triggering event. `scope-exited`'s own trigger was left
  genuinely unbuilt at this stage ("the reason with the least specified trigger," per the plan's own words) —
  M6's domain adapter (`domains/personal-assistant/store.ts`'s `closeScope`) is the first and only caller that
  gives it one (account deletion), and it too invents no registry, only a plain filter over currently-live
  memories.
  *Record:* `.genesis/decisions/0004-store.md`, Decision 5; `.genesis/decisions/0005-domain.md`, Decision 3.
  *Verified directly:* `grep -rn "revoke" lib/store/*.ts` returns exactly one hit, the `"source-revoked"`
  string literal itself — no revocation registry, listener, or webhook handler exists at this layer, and
  `lib/contracts/provenance.ts`'s header — which once asserted, wrongly, that M5 owned such a registry — was
  corrected (comment-only) once M6 found the claim false.

## Stage 5 — Query (`lib/store/belief-query.ts`)

**Job:** compose all four prior stages into one `queryBelief(candidates, tombstones, now)` call that answers
exactly one of `BeliefAnswer`'s four variants, minting any tombstone the answer honestly requires along the
way — never trusting a stored label, never guessing.

**What it refuses, and why:**

- **Refuses to accept a `TombstonedMemory` in `candidates` at all — the real consumer of Stage 1's compile-time
  refusal, re-proven against the shipped function, not a stand-in.**
  *Test:* `lib/store/__tests__/belief-query-refusal.test.ts` — `"TYPE-LEVEL: a TombstonedMemory[] does not
  satisfy queryBelief's ReadonlyArray<Memory<TValue>> candidates parameter"`.
- **Refuses to silently fall back to the highest-confidence tombstoned value when every candidate for a
  `(subject, predicate, scope)` is gone.** Returns `{status: "unknown", reason:
  "all-known-memories-tombstoned", tombstones: [...]}` — the plan's own named falsifiability test, proven
  directly.
  *Test:* `lib/store/__tests__/belief-query.test.ts` — `"unknown/all-known-memories-tombstoned — the plan's
  own falsifiability test ..."`.
- **Refuses to trust ADR 0003's own left-open precondition — enforces "still live implies still fresh" itself,
  on every call, not via a maintenance step a caller might skip.** `partitionByDecay` runs first, on every
  element of `candidates`; anything that has decayed past its `forgetFloor` is swept into a real, freshly
  minted `age-exceeded` tombstone and reported, never left to reach `contradict()` at a stale confidence.
  *Test:* `belief-query.test.ts`'s `"queryBelief composes decay"` block — `"a single candidate at exactly the
  forgetFloor is swept into a REAL, freshly-minted age-exceeded tombstone, and reported as
  all-known-memories-tombstoned, never as believed/doubted with a near-zero confidence"`.
- **Refuses to answer `"disputed"` for a live-detected `superseded` outcome — answers on the newer memory and
  mints the loser's tombstone right there instead.** This is a *corrected* refusal: an earlier revision
  collapsed `superseded` into `disputed` on the reasoning that `BeliefAnswer.believed` has nowhere to carry a
  tombstone — reasoning that was internally coherent and directly contradicted `memory-plan.md` §8's own demo
  text ("the system answers with the new address ... and produces the tombstone"). The fix gave the tombstone
  somewhere to go (`BeliefQueryResult.newlyForgotten`) rather than withholding the correct answer.
  *Tests:* `belief-query.test.ts`'s `"§8's demo moment"` block — `"the query answers believed on the newer
  address, never disputed"`, `"the same call ALSO produces a real tombstone naming the old memory ..."`, `"the
  old memory's confidence reads as zero the instant the new one arrived ..."`. *Record:*
  `.genesis/decisions/0004-store.md`, Decision 2 (revised).
- **Refuses to distinguish a genuine dispute from a refusal to compare at all — and this is a real, permanent
  limit, not an oversight.** `contradict()`'s `"disputed"` and `"not-comparable"` outcomes both collapse to
  the identical `BeliefAnswer.disputed` variant, because that frozen variant's only payload is a two-candidate
  tuple with no field for *why* neither side won. **`BeliefAnswer`'s `disputed` variant carries no reason
  field, so a genuine dispute (two independent, disagreeing derived inferences) and a not-comparable pair (a
  scope mismatch, a `believedAt` tie) are indistinguishable to a caller reading the answer alone** — a real
  reader who cares *why* has no way to tell from `BeliefAnswer` itself; only `contradict()`'s own, non-exported
  intermediate outcome ever knew. **This does not currently manifest in the shipped demo:** `not-comparable`'s
  three triggers (mismatched subject/predicate, non-overlapping scope, a `believedAt` tie or wrong ordering)
  are each structurally unreachable from `components/DemoAssistant.tsx`'s own construction — checked directly,
  not assumed: `SUBJECT` and the `shipping-address` predicate are fixed constants shared by both demo facts,
  both use the same `DEFAULT_SCOPE`, and `nextNow()` (`DemoAssistant.tsx`) guards every send against a tied
  timestamp by incrementing a monotonic clock ref, so two facts can never share a `believedAt`. The collapse is
  real and permanent in the type; it is simply never exercised by this project's own demo.
  *Record:* `.genesis/decisions/0004-store.md`, Decision 2a. *Verified:* `grep -n "believedAtRaw\|systemNow"
  components/DemoAssistant.tsx` and its `nextNow()` implementation.
- **Refuses to trust a live `Memory`'s own recorded `status` field for any of the above — recomputes every
  answer fresh, from `(confidence, decayPolicy, believedAt, source.tier, now)`, every call.** `Memory.status`
  (`"believed" | "doubted" | "disputed"`) is part of the frozen Stage-1 type and is never read by `decay()`,
  `contradict()`, or `queryBelief()` to decide anything — a finding M6's own ADR made explicitly (ADR 0005) and
  M7 pinned as a dedicated regression test. See its own subsection below; it is too easy to miss as a footnote
  to this stage alone.
- **Refuses to let more than two fresh candidates silently produce an unsupported N-way answer.** Only the two
  most-recently-`believedAt` fresh candidates are compared; a defensively-oversized input (three or more) does
  not crash, but the rest are excluded from the answer — a disclosed fallback, not a claim that three-way
  disputes are meaningfully supported.
  *Test:* `belief-query.test.ts` — `"DEFENSIVE: more than two fresh candidates for one query — the two
  most-recently-believed are used, the rest are excluded, and this does not crash"`.

**Named limit, stated at full strength — the same-tick race this project's own plan named for itself before
any code existed.** `tests/failures/case-1-interleaved-affirm-during-query.test.ts` is an **honest partial
pin**, not a full one. This entire codebase is single-threaded and synchronous — `queryBelief`/`recordFact`/
`query` contain no `await`, no callback, no generator, and therefore no point at which a second call could
execute *while* a first is paused mid-body. A true interleaving cannot be constructed here; JavaScript's
run-to-completion semantics make it structurally impossible. What the test proves instead, honestly labelled
as such: (1a) a caller that captures a `candidates`/`StoreState` snapshot, lets a contending `recordFact`
commit, and only *then* finishes its own query computation against the stale snapshot gets a real, reproducible
stale `"believed"` answer — the vulnerability is real, not hypothetical; (1b) every real caller in this
codebase (`scripts/demo-memory.ts`, `domains/personal-assistant/__tests__/store.test.ts`) threads `StoreState`
monotonically and never exhibits it. Nothing under `lib/store/**` or `domains/personal-assistant/**` gives a
*type-level* guarantee against a future stateful caller (an async UI update, a debounced input) reintroducing
1a's exact shape — the discipline that prevents it today is convention, not enforcement, and M7's own ADR says
so plainly rather than overclaiming a guarantee the type system does not provide. **Checked directly against
the now-merged M8 UI, not left as an open question:** `grep -n "useEffect\|useCallback\|setTimeout\|async
\|await " components/DemoAssistant.tsx components/AnswerPanel.tsx components/BaselinePanel.tsx app/page.tsx`
returns zero matches — no async gap exists anywhere in the shipped component tree for a stale snapshot to
survive across, so the specific risk this test's own header worried about did not land in M8. That does not
retroactively make the pin full; it means the one caller most likely to reopen the gap was checked and, for
now, does not.
*Record:* `.genesis/decisions/0006-failure-suite.md`, Decision 2 and Decision 6.

---

## Memory.status: a field that looks load-bearing and is not

**Worth its own subsection, not a footnote to Stage 1 or Stage 5, because a reader who only skims either
section could reasonably conclude the opposite.** `Memory.status` has existed since M1, sits on every `Memory`
value, and is narrowed to exactly three members *specifically so* the Stage-1 tombstone refusal is possible —
so it looks exactly like the kind of field a query engine would read to decide `believed`/`doubted`/`disputed`.
**It is never read for that purpose by any engine function in this codebase.** `git grep -n '\.status' --
lib/contracts lib/decay lib/contradiction lib/store domains/personal-assistant` (excluding `__tests__/`) finds
exactly four occurrences outside the literal type declarations, and every one is a *different* field:
`record.status === "tombstoned"` (the `Memory`/`TombstonedMemory` type discriminant itself, in
`effective-confidence.ts` and `query-confidence.ts` — checking for the one value that is *not* a member of
`Memory.status`'s own union, never a business-logic read of a live memory's label) and `result.status ===
"forgettable"`/`"doubted"` (`DecayResult.status`, `decay.ts`'s own, deliberately different three-member union,
read inside `belief-query.ts`). `decay()`, `contradict()`, and `queryBelief()` each recompute their own answer
fresh, from confidence/decay-policy/tier/time, every call — never from a memory's own stored label.
`domains/personal-assistant/facts.ts`'s `toMemory` always sets `status: "believed"` at construction for
exactly this reason: it is the only honest label available before anything has had a chance to decay or
contradict the memory, and nothing downstream would trust a more specific one anyway.

**This is pinned, not merely observed, and the pin's own honesty is itself disclosed.**
`tests/failures/case-10-memory-status-never-read.test.ts` is an **honest partial pin**: a textual scan over
today's committed, non-test source across all five engine/domain directories, matching a direct
`status === "believed"|"disputed"` comparison whether reached by property access or a destructured local. Two
real gaps were found and handled differently, both worth stating at full strength:

- **A false positive from an earlier draft, removed rather than special-cased.** The first draft also matched
  a bare `case "believed":`/`case "disputed":` label, and flagged `lib/store/belief-query.ts`'s own `switch
  (check.outcome) { case "disputed": case "not-comparable": ... }` — a switch over `ContradictionCheck.outcome`
  that merely happens to share the string `"disputed"` with `Memory.status`. A purely textual scan cannot tell
  "a case label on a switch over `Memory.status`" apart from "a case label on any other switch reusing the same
  string" without real parsing, so the `case` leg was dropped entirely rather than patched around this one known
  offender.
- **A currently-open false positive on comments, disclosed and deliberately not patched.** Closing a
  destructuring gap (`const { status } = memory; if (status === "believed")`, found by independent
  verification after this file's first approval) required broadening the match from `\.status` to a bare
  word-boundary `\bstatus\b`. That broadening makes the scan blind to context: **the literal phrase appearing
  inside a comment or a string/template literal is flagged exactly as a real comparison would be** — reproduced
  directly, a bare comment containing the phrase `status === "believed"` with no executable code at all fails
  the scan. Nothing on this branch trips it today (this very paragraph avoids spelling the phrase out
  unbroken), so it is a latent brittleness, not a live defect — but the file's own header states plainly that
  the honest fix is to parse (the same TypeScript-compiler-based approach the architecture tests already use),
  never a cleverer regex, and that reaching for a cleverer regex is the exact mistake that produced seven
  bypasses on a sibling project's own line-anchored guards.

*Record:* `.genesis/decisions/0005-domain.md`'s own "Finding — `Memory.status` is never read by any engine"
section; `.genesis/decisions/0006-failure-suite.md`, Decision 3 (Finding 1) and Decision 6.

## The domain adapter: composing all five stages, and a guard that could pass by staying silent

`domains/personal-assistant/store.ts`'s `recordFact`/`query` are the one real caller in this codebase that
drives all five stages end to end for a live scenario, composing `contradict()`, `forget()`, and
`queryBelief()` — never reimplementing any of their arithmetic (`git grep -n "0.5 \*\*\|Math.pow\|tier ==="
domains/` returns nothing). It owns exactly one small piece of local logic no frozen layer was ever asked to
provide: `newerSourceOutranks`/`TIER_RANK`, a two-line table judging whether an *agreeing* restatement from a
higher tier deserves to replace the record it agrees with (the one real case for `ForgetReason: "superseded"`
— a `current-city` guess later confirmed directly by the user). This is deliberately **not** a reuse of
`lib/contradiction/tier-split.ts`'s `resolveTierSplit`, which judges *disagreeing* values — an earlier revision
did reuse it and was corrected on independent review, because borrowing that function's ordering arithmetic
silently depended on its disagreement semantics never changing either.

**The guard that keeps these two independent tables from drifting was itself found to be vacuous, and its fix
is worth stating precisely, because it is a shape of bug this whole project's discipline is built to catch.**
`domains/personal-assistant/__tests__/tier-rank-agreement.test.ts`'s first version stated both of its
assertions as implications: "if the domain says newer outranks older, then `lib/contradiction` must resolve
that pair as `superseded`." **A domain table that reported `false` for every pair — that nothing ever outranks
anything — would satisfy both implications vacuously and pass, because their premise would simply never be
met.** This was found while investigating an unrelated overclaim (a prior ADR draft credited a different test,
Case 8, with covering the cross-tier ordering; checked and found false, since Case 8's own two sub-tests are
both same-tier). The fix, landed in PR #15: two additional, *positive* assertions that the domain actually
reports outranking for the one cross-tier pair where the plan's own worked contrast requires it
(`derived-inference` outranked by `direct-avowal`, and not the reverse), plus a direct proof of falsifiability —
inverting the domain's own answer for that pair and confirming the test would then fail. Restored, the guard
passes; flattened to constant `false`, two of its five tests fail. **What the guard still cannot catch, named
rather than left implicit:** both tables agreeing on a *jointly wrong* cross-tier ordering — a shared mistake
neither implication nor the new positive assertions would ever surface, since they check agreement, not
correctness against the plan's own worked example independently in each file.

*Record:* `domains/personal-assistant/__tests__/tier-rank-agreement.test.ts`'s own header; PR #15's own body;
`.genesis/decisions/0006-failure-suite.md`, Decision 3 (Finding 3) and Decision 6.

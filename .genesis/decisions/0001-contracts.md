# ADR 0001 — The four contracts: alternatives considered, and the two corrections to the plan's own literal sketch

- **Date:** 2026-09-20
- **Status:** accepted
- **Phase / milestone:** M1 (BUILD) — `lib/contracts/`

## Context

`memory-plan.md` names four irreducible types (§6) that every later milestone must import and none may
redefine: `Memory<TValue>`, `ForgetReason`, `Tombstone`, `BeliefAnswer`, plus supporting `Provenance`,
`Scope`, `Confidence`, and `DecayPolicy`. M1's job is to fix these shapes exactly once, correctly, because
`lib/contracts/**` freezes at the end of this milestone — a mistake here is a mistake every one of the
other eight milestones inherits. This ADR records the alternatives considered for each type, one
significant reused-thinking-not-code decision (`DecayPolicy`), and two corrections this build made to the
plan's own literal sketch, discovered while making M1's own success criteria (not just §3/§4's prose)
actually compile.

## Decision 1 — PROVENANCE: caller-supplied tier, not a `kind → tier` function this milestone would invent

**Alternatives considered:**

- **Auto-derive `ConfidenceTier` from `SourceKind`** via a `tierForKind(kind): ConfidenceTier` mapping
  function living in `provenance.ts`. This is the most literal reading of §5.1's "the tier is fixed by the
  source kind at the moment a memory is created." Rejected: the plan's own text only ever works ONE
  concrete mapping (`human` → direct avowal, a `derived` OCR scan → derived inference) — it never states
  what `counterparty` or `system` map to. Encoding a guessed four-way table into a file that freezes at the
  end of this milestone, on no stated authority beyond one worked example, would be a worse mistake than
  leaving the decision to whichever later milestone (M4's contradiction engine, or M6's domain adapter)
  first has a real case in front of it that needs a `counterparty`/`system` default.
- **A single system-wide trust score** instead of a per-`Provenance` tier. Rejected outright per
  `memory-plan.md` §0's own checklist: "that 'confidence' and 'source' are meant as per-memory typed fields
  ... not e.g. a single system-wide trust score" is explicitly flagged as an inference worth double-checking
  against the original brief, and every other decision in this file follows the per-memory reading.
- **Chosen:** `tier: ConfidenceTier` is a required, caller-supplied field on `Provenance`, with
  `ConfidenceTier` itself a closed, TWO-member union (`"direct-avowal" | "derived-inference"`) rather than
  a four-member union mirroring `SourceKind` one-for-one. Two, not four, because the plan's own worked
  contrast (§5.1) never needs more than two, and a third/fourth tier invented now for a case the plan never
  argues for would be exactly the "speculative flexibility nobody asked for" the house rules warn against.

## Decision 2 — MEMORY.STATUS: narrowed from the plan's own four-member sketch to three — the milestone's central correction

This is the most significant correction in this pass, and it was found by trying to make M1's own success
criterion compile, not by disagreeing with the plan's prose on style grounds.

**The plan's own literal sketch (§3):**

```ts
Memory<TValue> {
  // ...
  status: "believed" | "doubted" | "disputed" | "tombstoned"
}
```

**Why this cannot satisfy M1's own success criterion.** M1's success criteria (and M5's, which restates
it) require: "the live-query function's parameter type refuses a `TombstonedMemory` at compile time... a
compile-time refusal, not a runtime check." If tombstoning is the fourth value of `Memory.status`'s own
field, that refusal is unenforceable: a function typed to accept `Memory<TValue>` has to accept ANY object
that structurally satisfies that interface — including one whose `status` happens to be `"tombstoned"`. The
object literal `{ ...allTheOtherFields, status: "tombstoned" }` is still a perfectly well-formed
`Memory<TValue>` under the plan's own sketch; TypeScript has no way to reject "a `Memory` whose `status`
field holds one particular string value" without either (a) a runtime `if`, which the success criterion
explicitly rules out, or (b) moving tombstoning to a structurally distinct type. There is no third option
that keeps `status` a single four-member field on one type and still gets a *compile-time* refusal.

**The fix, chosen:** `Memory<TValue>.status` is narrowed to `"believed" | "doubted" | "disputed"` — three
members. Tombstoning produces a `TombstonedMemory<TValue>` (`tombstoned-memory.ts`), a SEPARATE type
sharing every other field (via a common `MemoryCore<TValue>`, `memory-core.ts`) but with `status:
"tombstoned"` — a literal not present in `Memory.status`'s own union. This is what makes the refusal
structural: `TombstonedMemory` simply does not satisfy `Memory<TValue>`, for the same reason a `string`
does not satisfy a `"foo" | "bar"` literal union — no cast, no runtime check, no cooperation required from
the function being called. Proven directly in `__tests__/live-query-refusal.test.ts` against a
representative stand-in for M5's real `BeliefQuery` signature.

**Why this reads as a correction, not a disagreement, and why it's recorded this explicitly:** the plan's
§4/§10/M5-criteria text already talks about "the tombstoned records are structurally a different type,
`TombstonedMemory`" in the SAME breath as §3's four-member `status` sketch — the plan's own later sections
already assume the fix this ADR makes; §3's inline sketch is simply the one place that hadn't caught up to
it yet. This is the same category of correction shadow-run's own ADR 0001 recorded for `ProjectedEffect`'s
unused `TState` parameter: verified against this repo's own `tsc`, not assumed, and written down rather
than silently applied.

## Decision 3 — TOMBSTONE: a discriminated union, not one interface with an optional `supersededBy?`

**The plan's own literal sketch (§4):**

```ts
Tombstone {
  // ...
  supersededBy?: MemoryId  // present iff reason is "contradicted" or "superseded"
}
```

**Why the comment states a real constraint the type doesn't enforce.** An optional field can be present
or absent for ANY `reason` value — nothing stops `{ reason: "age-exceeded", supersededBy: someId }`
(present when the plan says it must be absent) or `{ reason: "contradicted" }` with `supersededBy` omitted
(absent when the plan says it "must name exactly which memory caused it"). This account's own standing
account-wide note — "never write a comment stating something the code contradicts" — is the exact failure
mode a bare `?:` field next to an "iff" comment invites the first time someone edits this file without
re-reading the prose.

**Chosen:** a two-branch discriminated union. `CausedTombstone` (`reason: "contradicted" | "superseded"`)
REQUIRES `supersededBy: MemoryId`. `UncausedTombstone` (`reason: "age-exceeded" | "scope-exited" |
"source-revoked"`) has no such field at all — adding one to a value typed as `UncausedTombstone` is an
excess-property error. Both directions of the "iff" are now structural, proven in
`__tests__/tombstone.test.ts`: a `CausedTombstone` missing `supersededBy`, and an `UncausedTombstone`
literal that adds one, both fail to compile.

**Alternative considered and rejected:** keep the single interface, and instead write a runtime assertion
(`assertTombstoneShape`) checking the "iff" at construction time. Rejected: this milestone builds no
`Tombstone`-constructing engine (that's M5's `forget()`), so a runtime assertion here would have no call
site to actually run at — it would be exported, untested by anything that calls it for real, and would
reintroduce exactly the "asserted, not proven" gap this project's own verification discipline exists to
close. The type-level fix costs nothing at M1 and needs no future caller to be honest.

## Decision 4 — DECAYPOLICY: data, evaluated by an interpreter, never a function — the milestone's own flagged risk

**The plan's own text (§5.2)** describes `decayPolicy` as "a declared, typed function (e.g., linear-to-
floor over a configured half-life)." Read literally, "typed function" could mean a real JS function value.
The milestone brief this ADR responds to flags this explicitly: "`DecayPolicy` is the field most at risk
here: if you are tempted to make it a function, don't; make it data that an interpreter evaluates."

**Why this would repeat a mistake this account's own sibling projects already made and reversed, twice,
one layer over:**

1. decision-engine's `Prohibition.matches` started as a predicate closure `(action: Action) => boolean`.
   Unserializable, so its audit trail could only record prohibitions BY ID, requiring a replay caller to
   re-supply the real predicates — an honest but real limitation forced entirely by the closure
   (`decision-engine/.genesis/decisions/0003-audit-model.md`).
2. shadow-run's `Rollback.runnable` was drafted as `{ compensate: (world) => world }` and reversed before
   any code existed: "cannot be recorded into an audit-style trail, cannot be replayed by an independent
   verifier, and cannot be compared for equality" (`shadow-run/.genesis/decisions/0001-contracts.md`,
   Decision 5).

**Why the stakes are the same here, not merely analogous:** `memory-plan.md` §10's own required failure
suite (M7) needs to REPLAY a race between an `affirm` and a query and prove what the store *should* have
decided — impossible if "how this memory decays" has no serializable representation to check a claim
against. A closure-valued `decayPolicy` would also defeat M1's own "two memories differing only in `id`"
equality proof, since a function can only be compared by reference or by `toString()`-scraping, neither
acceptable under this project's own discipline.

**Chosen:** `DecayPolicy` is a closed, two-member discriminated union — `"linear-to-floor"` (carrying
`halfLifeMs`, `doubtedThreshold`, `forgetFloor` as data) and `"never-decays"` — DATA that M3's
`lib/decay/**` (unbuilt) will interpret. `halfLifeMs` is itself a branded `Milliseconds`
(`captured-at.ts`), not a bare number, for the same reason every other quantity in this directory is
branded.

**Alternative considered and rejected:** an open-ended `{ formula: string; params: ... }` expression
language "for flexibility." Rejected for the same reason `memory-plan.md` cites decision-engine's own
`ValueConstraint` precedent: nobody has a concrete second curve shape that needs this, and a `formula:
string` field is one step from being the exact "model's prose" escape hatch this project's whole read path
(§2) exists to refuse.

## Decision 5 — BELIEFANSWER: closed four-variant union, exhaustively matched, never a ranked list or a bare score

**Alternatives considered:**

- **A ranked list of candidate memories with scores** (the plain-retrieval shape). Rejected outright: this
  is precisely the mechanism §2 argues this project must structurally refuse — a ranked list always has a
  top-1, and this project's whole thesis is that it must sometimes structurally have none.
- **A single `{ believed: boolean; confidence: number }`.** Rejected: collapses `doubted` (still the only
  candidate, but visibly weaker) and `disputed` (two live candidates, neither mechanically resolved) into
  indistinguishable "not fully believed" states, and gives `unknown` no way to distinguish "never believed"
  from "used to be believed, now tombstoned" — precisely the distinction §2's closing paragraph says this
  project exists to make answerable.
- **Chosen:** the plan's own four-variant sketch (§6), taken as-is (no correction needed here, unlike
  Decisions 2–3): `believed | doubted | disputed | unknown`, each carrying exactly the fact that makes it
  that variant — never a bare label. Paired with `assertNeverBeliefAnswer`, the same exhaustiveness-proof
  pattern as decision-engine's `assertNeverOutcome` / shadow-run's `assertNeverReconciliation`. The real
  union stays frozen at four for this milestone; `__tests__/belief-answer.test.ts` demonstrates the "a
  fifth variant fails to compile until handled everywhere" mechanism on an equivalent local stand-in rather
  than dishonestly widening the frozen type — the same choice shadow-run's own `reconciliation.test.ts`
  documents making for the identical reason.

## Decision 6 — EFFECTIVECONFIDENCE: implemented for real, but only as far as this milestone can honestly compute

`memory-plan.md` §3 resolves a contradiction by separating `Memory.confidence` (recorded, immutable) from
`effectiveConfidence` (computed, query-facing): "`0` for any `TombstonedMemory`... otherwise `decay(memory,
now).confidence`."

**Alternative considered and rejected: declare only the function's TYPE, implement nothing.** This would
avoid any risk of encroaching on M3's `lib/decay/**` freeze boundary. Rejected: a bare type signature with
no body would leave "make the distinction real in the types, not just in prose" (M1's own success
criterion) exactly as unproven as the plan's prose already is — a reviewer would have nothing to run.

**Alternative considered and rejected: implement the full decay curve now, inside M1.** Rejected: this
would be M3's job done early, inside a file that freezes at the end of THIS milestone — exactly the kind
of freeze-boundary violation this project's own verification discipline (mirroring the sibling projects'
`DONE.html` gate) exists to catch, just committed by the author instead of caught by a verifier.

**Chosen:** implement exactly the two branches this milestone can decide with full honesty, and leave the
third stated as a disclosed limitation:

1. `status === "tombstoned"` → `ZERO_CONFIDENCE`, unconditionally, discriminated on the type-level `status`
   tag — never by reading the record's own stored `confidence` number, even though `TombstonedMemory`
   (via `MemoryCore`) still carries one. Fully correct per §3's own text.
2. Live, but `now` is clock-inconsistent relative to `lastAffirmedAt` → `ZERO_CONFIDENCE`, reusing `ageOf`
   (`captured-at.ts`)'s own clock-skew handling. This previews, rather than contradicts, §5.2's own spec
   for M3's real `decay()` ("a clock-inconsistent `now` fails closed to... most doubted, never a fabricated
   `confidence: 1`") — M3 inherits this branch unchanged.
3. Live, clock-consistent → returns `record.confidence` UNCHANGED. This is the disclosed limitation:
   `decay()` does not exist yet. Returning the recorded value is the mathematically exact answer at zero
   elapsed decay for any monotonic curve, and it is asserted directly, by name, in
   `__tests__/effective-confidence.test.ts` ("the live branch does NOT vary with elapsed time yet... this
   assertion is expected to start FAILING the moment M3's real decay() lands") — a test written to break
   the moment the limitation is fixed, not one that would keep passing silently forever.

This is named again in this milestone's own build report as the single weakest point to attack first: a
verifier who only reads the function's signature and the tombstoned-branch test could reasonably believe
more is computed here than actually is.

## Consequences

- Positive: `Memory`/`TombstonedMemory`'s split makes the compile-time tombstone refusal a property of the
  TYPES, checkable by any future milestone's own `tsc` run, not a discipline every later author has to
  remember to uphold by convention.
- Positive: `Tombstone`'s two-branch split means the "present iff" comment in `memory-plan.md` §4 is true
  by construction from M1 onward, never merely true by convention next to a field that doesn't enforce it.
- Negative / cost: `Provenance.tier` has no default and no derivation helper — every future caller (M4, M6)
  must state it explicitly, with no convenience shortcut. Accepted: the alternative was guessing a mapping
  this milestone has no authority to fix into a frozen file.
- Negative / cost: `effectiveConfidence`'s live branch is not yet real decay — M3 inherits a function that
  looks complete from its signature but is only two-thirds implemented. Mitigated, not eliminated, by the
  test that is designed to fail once M3 lands.
- Forward note for M3: replace ONLY `effective-confidence.ts`'s final `return record.confidence;` with a
  real call to `decay(record, now).confidence`. The tombstoned-zero and clock-inconsistency branches above
  are already correct under §3/§7's own rules and should not need to change.
- Forward note for M4/M6: `Provenance.tier`'s mapping from `SourceKind` (if one is ever needed generically,
  rather than decided per call site) is an open question this ADR deliberately left unresolved — see
  Decision 1. Whoever needs it first should decide it with a real case in hand, and record that decision
  in its own ADR rather than silently baking a guess into a helper.

## Alternatives rejected (summary, cross-referenced above)

- Auto-deriving `ConfidenceTier` from `SourceKind` inside this milestone (Decision 1) — no stated mapping
  beyond one worked example; guessing the rest is unauthorized speculation in a frozen file.
- A single system-wide trust score instead of per-memory `Provenance`/`Confidence` (Decision 1) —
  contradicts `memory-plan.md` §0's own explicit reading of the brief.
- `Memory.status` as a four-member union including `"tombstoned"` (Decision 2) — cannot satisfy this
  milestone's own compile-time-refusal success criterion.
- `Tombstone.supersededBy` as a bare optional field (Decision 3) — the "present iff" comment would state a
  constraint the type doesn't enforce, the exact failure mode this account's standing note warns against.
- `DecayPolicy` as a closure (Decision 4) — the plan's own flagged risk, and the same mistake this
  account's siblings already made and reversed twice.
- An open `{ formula: string }` expression language for `DecayPolicy` (Decision 4) — speculative
  flexibility with no second concrete case.
- A ranked-list/bare-score `BeliefAnswer` (Decision 5) — exactly the mechanism §2 argues this project must
  structurally refuse.
- Declaring only `effectiveConfidence`'s type, or fully implementing decay early (Decision 6) — the first
  leaves the success criterion unproven; the second violates M3's own freeze boundary ahead of time.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

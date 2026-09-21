# ADR 0002 — The decay engine: curve choice, the `forgettable`/status split, `Provenance.tier`, and the `effectiveConfidence` question

- **Date:** 2026-09-22
- **Status:** proposed (the `effectiveConfidence` wiring below is a recommendation, not yet applied — see
  "Decision 5" and this build's own report for why)
- **Phase / milestone:** M3 (BUILD) — `lib/decay/`

## Context

M1 (`.genesis/decisions/0001-contracts.md`, Decision 4) fixed `DecayPolicy`'s SHAPE as closed, two-member
data (`"linear-to-floor"` / `"never-decays"`) and explicitly left the CURVE unbuilt: "`halfLifeMs` names the
curve's parameter, not the curve itself — M3's `lib/decay/**` ... is the interpreter that actually computes
a confidence value from `(policy, memory, now)`." This ADR records that interpreter's design, the four
design questions this milestone's own brief asked to be settled with reasoning rather than left unasked, and
the one question this build did NOT resolve unilaterally — whether `lib/contracts/effective-confidence.ts`
(frozen) should be reopened to call the new `decay()`.

## Decision 1 — The curve: exponential half-life, applied honestly to a field named for it, with a disclosed naming mismatch inherited from M1

**The one available parameter is `halfLifeMs`.** "Half-life" is unambiguously an exponential-decay term (the
time for a quantity to fall to half its value) — there is no principled way to read a field with that name
as driving a straight-line curve. `decay()` therefore computes:

```
confidence(t) = recordedConfidence * 0.5 ^ (elapsedMs / halfLifeMs)
```

clamped into `[0, recordedConfidence]` and re-validated through `parseConfidence` before being handed back as
a `Confidence`.

**Disclosed inconsistency, not silently fixed:** `DecayPolicy`'s own discriminant literal is
`"linear-to-floor"`, not `"exponential-half-life"` or similar — a real naming mismatch between the frozen
type's tag and the only curve its own field name supports. This build does not have authority to rename a
frozen `lib/contracts` literal, and inventing a *different*, non-exponential curve just to make "linear"
true would misread `halfLifeMs` outright (a truly linear-to-floor curve needs a slope or an end time, not a
half-life). **This is named directly in this build's own report as a plan/contracts inconsistency worth a
future revision, not treated as license to invent a contradictory formula.**

**Alternative considered and rejected: a genuinely linear ramp, reinterpreting `halfLifeMs` as "time to reach
zero."** Rejected because it silently redefines what a reviewer reading `decay-policy.ts`'s own field name
would expect ("half-life" would then not even approximately describe the field's behavior), and because nothing
in `memory-plan.md` or the M1 ADR argues for a linear curve over an exponential one — the tag name
(`"linear-to-floor"`) looks like it was chosen for readability ("decays toward a floor") rather than as a
precise mathematical commitment, and the field it actually carries settles the real behavior.

## Decision 2 — At and beyond the final threshold: confidence keeps evaluating the same closed-form curve; it does not freeze, and it structurally cannot go negative

**The plan's own question:** "does confidence floor at zero, or keep decaying meaninglessly?"

**Chosen:** there is no special-cased floor-and-stop. The same `recordedConfidence * 0.5^(elapsed/halfLife)`
expression keeps being evaluated for arbitrarily large `elapsed` — which, being a strictly decreasing
exponential bounded below by 0, asymptotically approaches (and, once floating-point precision is exhausted,
numerically reaches) zero on its own, never overshoots past it, and never comes back up. A `Math.max(0, ...)`
clamp exists only as a defensive backstop against a pathological input (see Decision 1's clamp), not as the
mechanism that keeps the curve honest — the curve is already well-behaved by construction. `status`
separately reports `"forgettable"` once `forgetFloor` is crossed and stays `"forgettable"` for every later
`now`, proven directly in `__tests__/decay.test.ts`'s "long after the forget floor" test (confidence keeps
falling, monotonically, never re-crosses upward).

**Alternative considered and rejected: hard-clamp confidence to `forgetFloor` itself once crossed** (so a
"forgotten" memory's reported confidence never reads as lower than the floor that condemned it). Rejected:
this would make `confidence` stop being an honest measurement the moment it matters most — two memories both
long past their floor, one barely past it and one decayed for years, would report identically, discarding
real information a caller (or a future audit) might want. The continuous, unclamped-below number costs
nothing and loses nothing; `status: "forgettable"` alone is what a caller should act on, not a magic
plateau value.

## Decision 3 — `forgettable` is a DERIVED property computed by `decay()`, never a value `Memory.status` carries

**The plan's own question:** "is `forgettable` a *status* the memory carries, or a *derived* property
computed at query time?"

**Chosen:** derived. `decay()`'s own return type, `DecayResult`, carries its OWN three-member `status` union
(`"believed" | "doubted" | "forgettable"`) — a type distinct from, not an extension of, `Memory.status`'s
frozen three-member union (`"believed" | "doubted" | "disputed"`, `memory.ts`). Two independent reasons, both
load-bearing, not just one:

1. **Consistency with M1's own precedent.** `memory-plan.md` §3 already drew exactly this line for
   `confidence` vs. `effectiveConfidence`: "What decay ... change[s] is not that field; they change what a
   *query* is willing to report." `Memory.confidence` is recorded and immutable; `effectiveConfidence` is
   computed and query-facing. `forgettable` is the same kind of fact — a statement about what a query
   *currently* believes, not a fact recorded permanently onto the memory at creation time — and keeping it
   computed, not stored, is the same design decision applied to a second field instead of a new one invented
   for this milestone.
2. **`Memory.status` cannot honestly gain a fourth member without reopening a file this milestone has no
   authority over.** M1's own ADR (Decision 2) narrowed `Memory.status` to exactly three members *specifically
   so* `"tombstoned"` could be a structurally distinct type (`TombstonedMemory`) rather than a fourth status
   value, making the live-query compile-time refusal possible. Adding `"forgettable"` as a fifth/fourth member
   now would reopen that exact frozen decision for a reason M1 never anticipated, and — more concretely —
   `"forgettable"` is not something a `Memory` genuinely IS at any fixed point; it is a fact ABOUT a `Memory`
   *at a given `now`*, which a stored field on an immutable record cannot represent without becoming stale the
   instant time moves on. A derived, computed value is the only honest representation.

**Consequence, stated plainly:** crossing `forgetFloor` does not tombstone anything. `decay()` has no side
effect (Decision on purity below) and does not construct a `Tombstone` — that is M5's `lib/store/**` (unbuilt),
which is expected to read `decay(memory, now).status === "forgettable"` and, if so, call
`forget(memory, "age-exceeded", now)`. `lib/decay/**` only computes the fact; a later, still-unbuilt milestone
acts on it.

## Decision 4 — `Provenance.tier` does NOT change the decay curve — asked and deliberately left unanswered here

**The plan's own question:** "does decay interact with `Provenance.tier`? ... If you add that, justify it;
if you don't, say why not."

**Chosen: no interaction, by design, not by oversight.** Three reasons:

1. **No concrete case to justify it.** `memory-plan.md` §5.1 works `ConfidenceTier` hard for the
   `contradict()` split (M4's job, `superseded` vs. `disputed`), but never states or implies that a
   `direct-avowal` and a `derived-inference` memory should decay at *different rates* purely from age — the
   plan's own freshness-decay prose (§5, cause 2) never mentions `tier` at all. Inventing a tier-scaled decay
   rate now, with no worked example anywhere in the plan to calibrate it against, is exactly the
   "speculative flexibility nobody asked for" this account's own standing note warns cost a sibling five
   bypasses.
2. **The mechanism that DOES exist for this is `DecayPolicy` itself, already per-memory.** `decayPolicy`
   lives on `MemoryCore`, i.e. on every individual `Memory`, not globally — a caller who DOES want a
   `derived-inference` memory to decay faster than a `direct-avowal` one already has the tool to express
   that today, by constructing that memory with a shorter `halfLifeMs`. `Provenance.tier` reaching INTO the
   decay curve as a second, implicit adjustment would be a hidden multiplier competing with a
   `decayPolicy` a caller set explicitly — two knobs controlling the same one number, with no stated rule for
   how they'd combine, is a worse design than the one already available.
3. **Ownership.** Even if a tier-scaled rate were wanted, deciding *how much* faster `derived-inference`
   should decay is exactly the kind of judgment call M1's own Decision 1 already refused to make for
   `SourceKind → ConfidenceTier`, for the identical reason: no stated authority beyond one worked example.
   That decision, if ever made, belongs to whichever milestone has a real case in front of it (M6's domain
   adapter is the most likely candidate, choosing `decayPolicy` per predicate/source when it constructs real
   memories) — not to this one, guessing.

## Decision 5 — `effectiveConfidence`'s live branch: RECOMMENDATION ONLY, not applied by this build

`lib/contracts/effective-confidence.ts` (frozen) currently returns `record.confidence` unchanged on its live,
clock-consistent branch, explicitly disclosed there and in `.genesis/decisions/0001-contracts.md` (Decision 6)
as "the one HONEST, DISCLOSED LIMITATION of this milestone... M3 replaces ONLY this final `return` with a real
call to `decay(record, now).confidence`; the tombstoned-zero and clock-inconsistency branches above are
already correct ... and should not need to change." `lib/contracts/__tests__/effective-confidence.test.ts`
carries a test asserting the live branch does NOT vary with elapsed time, written, by its own name, to start
failing "the moment M3's real decay() lands."

**This build's recommendation, with reasoning, per this milestone's own instruction not to decide this
unilaterally:**

- **The structural change is exactly as small and as already-specified as M1 left it.** Replace
  `effective-confidence.ts`'s final `return record.confidence;` with
  `return decay(record, now).confidence;`, plus one new import (`decay` from `../decay/decay.js`). No other
  line changes. `decay`'s own clock-inconsistency branch already returns `ZERO_CONFIDENCE`, so
  `effectiveConfidence`'s own separate clock check (its second branch) becomes provably redundant with
  `decay`'s internal one the moment this wiring lands — harmless to leave in place (belt-and-suspenders,
  and it is `effectiveConfidence`'s own established, correct behavior per the M1 ADR, not something this
  milestone should touch either way), but worth naming so a future reader does not mistake redundancy for
  disagreement between the two checks.
- **`lib/decay` importing FROM `lib/contracts` is already normal and already tested** — this milestone's
  architecture test (`lib/decay/__tests__/architecture.test.ts`) allows exactly `lib/decay/` and
  `lib/contracts/` as `decay()`'s own dependency roots. The proposed change runs the dependency the other
  way (`lib/contracts` importing from `lib/decay`), which is new, but not architecturally unusual: M1's own
  header already anticipated it by name ("M3's `lib/decay/**`... is the interpreter... M3 replaces ONLY this
  final `return`").
- **Why this build still did not just make the edit:** the milestone brief for this build is explicit that
  "the cleanest structure" question — whether decay belongs behind a function `lib/contracts` calls, whether
  `effectiveConfidence` should MOVE to `lib/decay`, or whether contracts must be reopened at all — is "the
  orchestrator's [call]," even when the file's own header and the prior ADR already telegraph the answer.
  Treating a strongly-telegraphed answer as self-authorizing is exactly the unilateral-decision failure mode
  the brief names outright ("Do not decide this unilaterally"). This build stops short of editing
  `lib/contracts/effective-confidence.ts`, leaves `git diff main -- lib/contracts` empty, and reports this
  recommendation instead.
- **A second alternative structure considered, and why "replace the final return" is still preferred over
  it:** moving `effectiveConfidence` itself into `lib/decay/` (so the computed-confidence function lives next
  to the engine it depends on, and `lib/contracts` never imports "downward" from a later milestone at all).
  Rejected as the RECOMMENDED option, not merely as inferior: `effectiveConfidence`'s own signature and
  tombstoned/clock branches are `Memory`/`TombstonedMemory`-shaped type-system work that M1 already built,
  tested, and froze correctly per its own ADR (Decision 6: "already correct under §3/§7's own rules and
  should not need to change") — relocating the whole function would touch code that isn't broken, move a
  name every future milestone (M4's contradiction engine, M6's domain adapter) will import from
  `lib/contracts`'s public barrel today, and would be a strictly bigger frozen-boundary change than the
  one-line swap M1's own header already asked for. The one-line replacement is both the smaller diff and the
  one the prior milestone's authors already committed to in writing.
- **A finding surfaced by tracing this through, reported here because it affects whether the pinning test
  will actually do its job:** `lib/contracts/__tests__/fixtures.ts`'s `fixtureMemory` defaults
  `decayPolicy` to `{ kind: "never-decays" }`. The pinning test
  (`effective-confidence.test.ts`, "DISCLOSED LIMITATION, ASSERTED DIRECTLY") builds its memory via
  `fixtureMemory(...)` without overriding `decayPolicy`. Under THIS milestone's own `decay()`, a
  `"never-decays"` memory's confidence is, correctly, unchanged by elapsed time (Decision 3's "never-decays"
  branch: `{ confidence: memory.confidence, status: "believed" }`, unconditionally). **That means even after
  the recommended one-line wiring lands, this specific pinning test will keep PASSING, not start failing as
  its own name promises** — not because decay is still missing, but because the fixture it happens to use
  genuinely does not decay. The test's own premise assumed the fixture would exercise a real curve; it
  doesn't. **This build's recommendation, if/when contracts reopens for the wiring change:** the pinning
  test's decayPolicy-sensitive assertion needs a second case (or an override) using a `"linear-to-floor"`
  policy with nonzero elapsed time, alongside keeping the existing `"never-decays"` case as a legitimate,
  separate assertion ("a never-decays memory's effective confidence is unchanged even after wiring — correct
  behavior, not a regression"). Deleting the existing test would erase a real, still-true fact; simply
  leaving it as the only test would make the "moment M3 lands" claim in its own name false. This is flagged
  here rather than fixed here, since fixing it means editing a frozen file this build is not authorizing
  itself to edit.

## Decision 6 — Purity, proven directly

`decay()` takes `(memory, now)` and nothing else — no `Date.now()`, no `systemNow()` (captured-at.ts), no
module-level mutable state. `__tests__/decay.test.ts`'s "purity" block proves three repeat calls on the same
inputs deep-equal each other, and that the input `memory` object is untouched (compared via
`JSON.parse(JSON.stringify(...))` before/after). The architecture test does not itself check for `Date.now`
literally (that is a different concern than the LLM/network/fetch grep it runs), so purity is proven by the
dedicated behavioral test, not the architecture one — recorded here so a reviewer knows which test carries
which claim.

## Consequences

- Positive: `decay()` is a small, total, closed-form function with an exact, tested threshold boundary —
  the sibling-project precedent this milestone was warned to avoid repeating (an EMA-shaped trust counter
  with no clean threshold test) does not apply here.
- Positive: `forgettable` staying derived keeps `Memory.status` untouched and the M1 tombstone-refusal
  property intact — this milestone adds a new computed vocabulary without reopening the frozen type it
  would otherwise have been tempted to extend.
- Negative / cost: the `"linear-to-floor"` / `halfLifeMs` naming mismatch (Decision 1) is now baked into two
  files across two milestones (decay-policy.ts's tag, decay.ts's interpretation) rather than fixed once —
  cheap to leave named as a finding, expensive to silently paper over with a formula the field's own name
  doesn't support.
- Negative / cost: `effectiveConfidence`'s live branch is NOT wired to real decay by this build — M3's own
  demo (`npm test -- decay`) proves the engine works in isolation, but `npm test -- contracts` (or a caller
  reading `BeliefQuery` results, once M5 exists) still sees M1's disclosed placeholder until the orchestrator
  authorizes the one-line change recorded in Decision 5.
- Forward note for whoever authorizes Decision 5's wiring: also update the pinning test per the finding
  recorded there — the existing assertion alone will not fail even after the wiring lands, because its
  fixture's default policy is `"never-decays"`.
- Forward note for M4/M5/M6: `lib/decay`'s only allowed dependency (per its own architecture test) is
  `lib/contracts`. `lib/contradiction/**` (M4) is untouched and unimported here, per this milestone's own
  scope boundary — if M4 or M5 ever needs decay's OUTPUT (e.g. the store deciding whether to call
  `forget(..., "age-exceeded", ...)`), it should import `decay` from `lib/decay` the same way this file
  imports from `lib/contracts`, not reinvent the threshold logic.

## Alternatives rejected (summary, cross-referenced above)

- A genuinely linear decay curve, reinterpreting `halfLifeMs` as "time to zero" (Decision 1) — contradicts
  the field's own name with no textual support for doing so.
- Hard-clamping reported confidence to `forgetFloor` once crossed (Decision 2) — discards real information a
  caller might want past the floor, for no stated benefit over a monotonic, unclamped-below curve.
- `forgettable` as a fourth/fifth member of `Memory.status` (Decision 3) — would reopen a frozen M1 decision
  for a reason M1 never anticipated, and cannot honestly represent a `now`-relative fact on an immutable,
  point-in-time record.
- A `Provenance.tier`-scaled decay rate (Decision 4) — no concrete case anywhere in the plan, and a
  competing, unstated-precedence second knob over a rate `decayPolicy` already controls explicitly per
  memory.
- Unilaterally wiring `decay()` into frozen `effective-confidence.ts` inside this same build (Decision 5) —
  the exact "decide this unilaterally" failure mode this milestone's own brief warns against, even with a
  strongly telegraphed answer already on record from M1.
- Moving `effectiveConfidence` itself into `lib/decay/` (Decision 5) — a bigger frozen-boundary change than
  the one-line swap M1's own header already specified, touching correct, already-tested code for no
  structural gain.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

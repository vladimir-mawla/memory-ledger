# ADR 0002 — The decay engine: curve choice, the `forgettable`/status split, `Provenance.tier`, the `effectiveConfidence` question, and policy validation

- **Date:** 2026-09-22 (amended same day, after orchestrator ruling)
- **Status:** accepted
- **Phase / milestone:** M3 (BUILD) — `lib/decay/`

## Context

M1 (`.genesis/decisions/0001-contracts.md`, Decision 4) fixed `DecayPolicy`'s SHAPE as closed, two-member
data and explicitly left the CURVE unbuilt: "`halfLifeMs` names the curve's parameter, not the curve itself —
`lib/decay/**` (M3) is the interpreter that actually computes a confidence value from `(policy, memory,
now)`." This ADR records that interpreter's design, the four design questions this milestone's own brief
asked to be settled with reasoning rather than left unasked, the resolution of the `effectiveConfidence`
question this build escalated rather than decided unilaterally, the rename that resolution's own sibling
finding triggered, and an explicit-validation fix for a self-named weak point.

## Decision 1 — The curve: exponential half-life — and the `"half-life"` rename

**The one available parameter is `halfLifeMs`.** "Half-life" is unambiguously an exponential-decay term (the
time for a quantity to fall to half its value) — there is no principled way to read a field with that name
as driving a straight-line curve. `decay()` therefore computes:

```
confidence(t) = recordedConfidence * 0.5 ^ (elapsedMs / halfLifeMs)
```

clamped into `[0, recordedConfidence]` and re-validated through `parseConfidence` before being handed back as
a `Confidence`.

**This build's first pass found a real naming mismatch and reported it rather than silently working around
it:** `DecayPolicy`'s decaying variant was originally named `"linear-to-floor"` by M1, but the only curve its
own field name (`halfLifeMs`) can honestly express is exponential, not linear. **The orchestrator's ruling:
fix the name, not just document the mismatch** — "a shipped type carrying a permanently wrong name is worse
than a one-line reopening, and M5/M6/M8 will all read that discriminant." `lib/contracts` was reopened,
narrowly, for exactly this rename (plus the `effectiveConfidence` documentation fix, Decision 5):

- `lib/contracts/decay-policy.ts` — discriminant literal `"linear-to-floor"` → `"half-life"`, plus a header
  paragraph recording the rename and pointing here.
- `lib/contracts/__tests__/decay-policy.test.ts` — every literal/string reference updated to match.
- `lib/decay/decay.ts`, `lib/decay/__tests__/fixtures.ts`, `lib/decay/__tests__/decay.test.ts` — every
  reference to the old literal updated; the "naming mismatch" discussion in `decay.ts`'s own header is
  replaced with a note that the rename happened and why.

**Scope check, per the orchestrator's own "if the rename touches more than the discriminant string and its
references, stop and report" instruction:** it did not. The rename touches exactly the `kind` literal
(`"linear-to-floor"` → `"half-life"`) everywhere it appears, plus prose describing it — no field was added,
removed, or retyped, no other discriminant changed, and no consumer outside `lib/contracts`/`lib/decay`
exists yet to be touched (M4/M5/M6 are unbuilt or, for M4, off-limits). `git diff main -- lib/contracts`
(reported in this build's own report) shows the full, narrow scope directly.

**Alternative considered and rejected (unchanged from this ADR's first pass): a genuinely linear ramp,
reinterpreting `halfLifeMs` as "time to reach zero."** Rejected because it silently redefines what a reviewer
reading `decay-policy.ts`'s own field name would expect, and nothing in `memory-plan.md` or the M1 ADR argues
for a linear curve over an exponential one.

**Note on `memory-plan.md` §5.2's own prose** ("a declared, typed function (e.g., linear-to-floor over a
configured half-life)"): that planning document is left as-is — it records what was written before any code
existed, and rewriting a foundational plan document to retroactively match an implementation detail (a type
literal's exact spelling) would misrepresent when the decision was actually made. This ADR, and
`decay-policy.ts`'s own header, are the record of the rename; a reader of `memory-plan.md` alone should treat
its `"linear-to-floor"` phrase as historical framing, not the current discriminant.

## Decision 2 — At and beyond the final threshold: confidence keeps evaluating the same closed-form curve; it does not freeze, and it structurally cannot go negative

**The plan's own question:** "does confidence floor at zero, or keep decaying meaninglessly?"

**Chosen:** there is no special-cased floor-and-stop. The same `recordedConfidence * 0.5^(elapsed/halfLife)`
expression keeps being evaluated for arbitrarily large `elapsed` — which, being a strictly decreasing
exponential bounded below by 0, asymptotically approaches (and, once floating-point precision is exhausted,
numerically reaches) zero on its own, never overshoots past it, and never comes back up. `status` separately
reports `"forgettable"` once `forgetFloor` is crossed and stays `"forgettable"` for every later `now`, proven
directly in `__tests__/decay.test.ts`'s "long after the forget floor" test (confidence keeps falling,
monotonically, never re-crosses upward).

**Alternative considered and rejected: hard-clamp confidence to `forgetFloor` itself once crossed.** Rejected:
this would make `confidence` stop being an honest measurement the moment it matters most — two memories both
long past their floor, one barely past it and one decayed for years, would report identically, discarding
real information a caller (or a future audit) might want.

## Decision 3 — `forgettable` is a DERIVED property computed by `decay()`, never a value `Memory.status` carries

**The plan's own question:** "is `forgettable` a *status* the memory carries, or a *derived* property
computed at query time?"

**Chosen:** derived. `decay()`'s own return type, `DecayResult`, carries its OWN three-member `status` union
(`"believed" | "doubted" | "forgettable"`) — a type distinct from, not an extension of, `Memory.status`'s
frozen three-member union (`"believed" | "doubted" | "disputed"`, `memory.ts`). Two independent reasons, both
load-bearing, not just one:

1. **Consistency with M1's own precedent.** `memory-plan.md` §3 already drew exactly this line for
   `confidence` vs. `effectiveConfidence`. `forgettable` is the same kind of fact — a statement about what a
   query *currently* believes, not a fact recorded permanently onto the memory at creation time.
2. **`Memory.status` cannot honestly gain a fourth member without reopening a file this milestone has no
   authority over (for this).** M1's own ADR (Decision 2) narrowed `Memory.status` to exactly three members
   *specifically so* `"tombstoned"` could be a structurally distinct type, making the live-query compile-time
   refusal possible. `"forgettable"` is not something a `Memory` genuinely IS at any fixed point; it is a
   fact ABOUT a `Memory` *at a given `now`*, which a stored field on an immutable record cannot represent
   without becoming stale the instant time moves on.

**Consequence, stated plainly:** crossing `forgetFloor` does not tombstone anything. `decay()` has no side
effect and does not construct a `Tombstone` — that is M5's `lib/store/**` (unbuilt), which is expected to
read `decay(memory, now).status === "forgettable"` and, if so, call `forget(memory, "age-exceeded", now)`.

## Decision 4 — `Provenance.tier` does NOT change the decay curve — asked and deliberately left unanswered here

**The plan's own question:** "does decay interact with `Provenance.tier`? ... If you add that, justify it;
if you don't, say why not."

**Chosen: no interaction, by design, not by oversight.**

1. **No concrete case to justify it.** `memory-plan.md`'s freshness-decay prose (§5, cause 2) never mentions
   `tier` at all, and inventing a tier-scaled decay rate now, with no worked example to calibrate against, is
   the "speculative flexibility nobody asked for" this account's own standing note warns cost a sibling five
   bypasses.
2. **The mechanism that DOES exist for this is `DecayPolicy` itself, already per-memory.** A caller who wants
   a `derived-inference` memory to decay faster already has the tool: construct it with a shorter
   `halfLifeMs`. A hidden `tier`-based multiplier would be a second, competing, unstated-precedence knob over
   the same one number.
3. **Ownership.** Deciding *how much* faster a lower tier should decay is a judgment call belonging to
   whichever milestone has a real case in front of it (M6's domain adapter, most likely) — not to this one,
   guessing.

## Decision 5 — `effectiveConfidence`: RULED, not merely recommended — `lib/contracts` stays exactly as written; the composed answer lives in `lib/decay`

**This build's first pass recommended, but explicitly did not apply, wiring `decay(record, now).confidence`
into `effective-confidence.ts`'s final `return`** — exactly what M1's own ADR (Decision 6) and that file's
header both instructed. Escalated rather than decided unilaterally, per this milestone's own brief.

**The orchestrator's ruling: that instruction was WRONG, not merely undecided.** `lib/decay` imports
`lib/contracts` — five imports, confirmed by the architecture test (`Memory`, `TombstonedMemory`, `Json`,
`Confidence`/`ZERO_CONFIDENCE`, `CapturedAt`). If `lib/contracts/effective-confidence.ts` also imported
`decay` FROM `lib/decay`, the two directories would import each other — a real circular dependency, not a
hypothetical one — and it would invert this project's own layering, where `lib/contracts` is the frozen BASE
every later milestone (`lib/decay`, `lib/contradiction`, `lib/store`) is built on top of, never the reverse.
M1's ADR could not have seen this: it was written before `lib/decay` existed to import anything from
`lib/contracts` at all.

**The resolution is architectural, not a wiring change:**

- **`effectiveConfidence` (`lib/contracts/effective-confidence.ts`) stays EXACTLY as it was — zero executable
  lines changed.** It was never a stub: it correctly and completely answers everything decidable AT ITS OWN
  LAYER (tombstoned → zero, clock-inconsistent → zero, otherwise the recorded value). Only its HEADER COMMENT
  changed, replacing the now-impossible promise ("M3 replaces ONLY this final `return`...") with the true
  architectural reason it will not, and pointing by name at the function that does compose the real answer.
  `git diff -- lib/contracts/effective-confidence.ts` (reported in this build's own report) shows this
  directly: every changed line is inside the `/** ... */` header; the function body is byte-identical.
- **The composed, query-facing answer is `queryConfidence(record, now)`, new in
  `lib/decay/query-confidence.ts`.** It is the one place both `Memory`/`TombstonedMemory` (from
  `lib/contracts`) and the real `decay` interpreter (right here) are visible at once: tombstoned → zero
  (structural, mirroring `effectiveConfidence`'s own check), otherwise `decay(record, now).confidence` —
  no duplicated clock check, since `decay` already fails closed on clock-inconsistency internally.
  `__tests__/query-confidence.test.ts` proves it agrees with `effectiveConfidence` at every boundary they
  share (tombstoned, zero elapsed time) and diverges the moment real elapsed time matters on a decaying
  policy — the exact split this ADR argues for, proven directly rather than only asserted in prose.
- **The pinning-test finding is now correctly framed as PERMANENT, not temporary.** This build's first pass
  found that `lib/contracts/__tests__/fixtures.ts`'s `fixtureMemory` defaults `decayPolicy` to
  `"never-decays"`, so the existing pinning test (`effective-confidence.test.ts`) would keep PASSING even
  after a wiring change, contrary to its own "expected to start FAILING" comment. Since the wiring is now
  never happening at that layer, the finding's fix is simpler than first proposed: **not** "add a
  decaying-policy case to this frozen test" (which would require constructing a `decay`-aware scenario inside
  `lib/contracts`, itself layering-inverted), but **correct the test's own description to state what it
  actually, permanently pins** — done, comment-only, in `effective-confidence.test.ts`'s two affected `it(...)`
  titles and one inline comment; the assertions themselves (`expect(...).toBe(...)`) are untouched, since the
  behavior they check was already correct and remains correct. The decaying-policy case this finding always
  needed lives instead in `lib/decay/__tests__/query-confidence.test.ts`, on the function that actually
  composes decay — `"AGREES with effectiveConfidence ... DIVERGES once real time has passed ..."`.
- **Alternative considered and rejected again: moving `effectiveConfidence` itself into `lib/decay/`.**
  Still rejected, for the same reason as this ADR's first pass: it would touch correct, already-tested code
  for no structural gain, and would move a name every future milestone imports from `lib/contracts`'s public
  barrel today. `queryConfidence` as a NEW, separate function at the layer that needs it is the smaller,
  correctly-directed change.

## Decision 6 — Purity, proven directly

`decay()` takes `(memory, now)` and nothing else — no `Date.now()`, no `systemNow()` (captured-at.ts), no
module-level mutable state. `__tests__/decay.test.ts`'s "purity" block proves three repeat calls on the same
inputs deep-equal each other, and that the input `memory` object is untouched.

## Decision 7 — Malformed-policy handling: EXPLICIT validation, fail closed — not accidental arithmetic

This build's own report named its weakest point: `decay()` never validated a `DecayPolicy`'s internal sanity
(`halfLifeMs <= 0`, non-finite, or `forgetFloor > doubtedThreshold`). The arithmetic happened to survive these
cases (a `0/0` division yields `NaN`, which `parseConfidence` rejects, falling back to `ZERO_CONFIDENCE`; the
`Math.min`/`Math.max` clamp prevents a negative `halfLifeMs` from producing a rebound above the recorded
confidence) — true, but untested, and therefore an accident of the arithmetic, not a guarantee.

**Ruling: prefer explicit validation over relying on arithmetic to keep defending itself.** `validateHalfLifePolicy`
(`decay.ts`) now checks, BEFORE any curve arithmetic runs: `halfLifeMs` is finite; `halfLifeMs` is strictly
positive; `forgetFloor` does not exceed `doubtedThreshold`. A policy that fails any check makes `decay` return
`{ confidence: ZERO_CONFIDENCE, status: "forgettable" }` — **deliberately the strictest verdict this file has,
stricter than the clock-inconsistency branch's `"doubted"`.** The two branches are NOT collapsed into one,
because they mean different things: a clock-inconsistent `now` is a one-time bad reading about a single call
(the memory's own configuration may be perfectly fine); a malformed policy is a defect in the memory's OWN
CONFIGURATION that will misbehave on every future call as well, so it earns the worst honest answer rather
than something a later, well-formed `now` could ever recover from.

`__tests__/decay.test.ts`'s "malformed policy" block tests every case named in this build's own weakest-point
finding directly: `halfLifeMs: 0` at `elapsed = 0` (the exact case named), a negative `halfLifeMs`, a
non-finite `halfLifeMs` (`Infinity`/`NaN`, reachable only via a brand-defeating cast — exercised deliberately
inside `__tests__/`, which `brand-casts.test.ts` exempts), and `forgetFloor > doubtedThreshold`. A
"does NOT overtighten" case (`forgetFloor === doubtedThreshold`, equal, not exceeding) is included alongside,
proving the validation is exact, not merely conservative in a way that would reject valid configurations too.

The pre-existing arithmetic defenses (the clamp in `decayedConfidence`, the `parseConfidence`-reject fallback)
are kept as belt-and-suspenders, with their comments updated to say so plainly — they are no longer the
primary defence, and the file's own header states this distinction rather than leaving a reader to assume
the clamp alone was ever the intended guarantee.

**Alternative considered and rejected: throw an exception for an invalid policy instead of returning a
sentinel result.** Rejected: every other pure function in this codebase's `lib/contracts`/`lib/decay`
(`ageOf`, `parseConfidence`, `parseCapturedAt`, `decay`'s own clock-inconsistency branch) fails closed by
RETURNING an explicit "this didn't work" result, never by throwing — keeping `decay` total (never throws) lets
callers (like `queryConfidence`) compose it unconditionally, without a `try`/`catch` at every call site.
Introducing the one throwing pure function in this family, for this one edge case, would be an inconsistent
special case with no stated benefit over the sentinel-result pattern already established everywhere else
here.

## Consequences

- Positive: `decay()` is a small, total, closed-form function with an exact, tested threshold boundary, an
  honestly-named policy variant, and explicit (not accidental) defence against a malformed policy.
- Positive: `forgettable` staying derived keeps `Memory.status` untouched and the M1 tombstone-refusal
  property intact.
- Positive: the `effectiveConfidence`/`queryConfidence` split keeps `lib/contracts` acyclic and correctly
  layered — a property this build's first pass would have quietly broken had the original recommendation
  been applied without the orchestrator's check.
- Negative / cost: `lib/contracts` was reopened twice in this milestone (the rename, and the
  `effectiveConfidence` header) — both narrow, both doc/literal-only or comment-only respectively, both
  reported with an explicit `git diff` rather than asserted clean by name alone.
- Forward note for M4/M5/M6: the real, current-belief-reporting function to call is `queryConfidence`
  (`lib/decay/query-confidence.ts`), not `effectiveConfidence` (`lib/contracts`) — the latter is now
  documented, permanently, as structural-only. M5's `BeliefQuery` should import `queryConfidence`.
- Forward note for whoever builds M5: `decay(memory, now).status === "forgettable"` is the signal to call
  `forget(memory, "age-exceeded", now)` — `lib/decay` never does this itself.

## Alternatives rejected (summary, cross-referenced above)

- A genuinely linear decay curve, reinterpreting `halfLifeMs` as "time to zero" (Decision 1).
- Hard-clamping reported confidence to `forgetFloor` once crossed (Decision 2).
- `forgettable` as a fourth/fifth member of `Memory.status` (Decision 3).
- A `Provenance.tier`-scaled decay rate (Decision 4).
- Leaving the `effectiveConfidence` question as a standing recommendation rather than a ruling, or applying
  the original recommendation (wiring `decay` directly into `effective-confidence.ts`) without checking for
  the circular import it would create (Decision 5) — the orchestrator's own check caught this before it
  landed.
- Moving `effectiveConfidence` itself into `lib/decay/` (Decision 5) — still rejected on the same grounds as
  this ADR's first pass.
- Throwing on a malformed policy instead of returning a fail-closed sentinel (Decision 7) — inconsistent with
  every other pure function in this codebase's own family.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

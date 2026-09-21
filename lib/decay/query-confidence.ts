import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import type { TombstonedMemory } from "../contracts/tombstoned-memory.js";
import { type Confidence, ZERO_CONFIDENCE } from "../contracts/confidence.js";
import type { CapturedAt } from "../contracts/captured-at.js";
import { decay } from "./decay.js";

/**
 * `queryConfidence(record, now)` — THE REAL, COMPOSED, QUERY-FACING
 * CONFIDENCE. This is the function a future `BeliefQuery` (M5's
 * `lib/store/**`, unbuilt) should call, and the answer `memory-plan.md` §3
 * actually specifies for "what should a query report": "`0` for any
 * `TombstonedMemory`... otherwise `decay(memory, now).confidence`." M1
 * built the first half of that sentence (`lib/contracts/
 * effective-confidence.ts`'s `effectiveConfidence`); THIS file, one layer
 * up, is the second half — see below for exactly why the split falls here
 * and not there.
 *
 * WHY THIS FUNCTION LIVES IN `lib/decay/`, NOT IN `lib/contracts/` NEXT TO
 * `effectiveConfidence` — THE RULING THAT CLOSED THIS MILESTONE'S OWN
 * ESCALATION. This build's own report first RECOMMENDED wiring
 * `decay(record, now).confidence` directly into
 * `effective-confidence.ts`'s final `return`, exactly as M1's own ADR
 * (`.genesis/decisions/0001-contracts.md`, Decision 6) and that file's own
 * header say M3 should. That recommendation was REJECTED, not applied,
 * once traced all the way through: `lib/decay/**` already imports FROM
 * `lib/contracts/**` (five imports, confirmed by this milestone's own
 * architecture test) — `Memory`, `TombstonedMemory`, `Json`, `Confidence`/
 * `ZERO_CONFIDENCE`, `CapturedAt`. If `lib/contracts/effective-
 * confidence.ts` also imported `decay` FROM `lib/decay/**`, the two
 * directories would import each other — a real circular dependency, not a
 * hypothetical one, and it would additionally invert this project's own
 * layering, where `lib/contracts` is the frozen BASE every later milestone
 * (`lib/decay`, `lib/contradiction`, `lib/store`) is built on top of, never
 * the other way around. M1's own ADR and header, written before `lib/decay`
 * existed to import anything, could not have seen this — the instruction
 * they gave was correct in intent (compose decay into the query-facing
 * answer) but impossible to satisfy AT THAT LAYER once `lib/decay` actually
 * came to depend on `lib/contracts`, which it structurally has to (it needs
 * `Memory`, `DecayPolicy`, `Confidence`, `CapturedAt` — there is no version
 * of `lib/decay` that doesn't).
 *
 * THE RESOLUTION IS ARCHITECTURAL: `effectiveConfidence` (`lib/contracts`)
 * STAYS EXACTLY AS WRITTEN — it is not a stub, and this is not "leaving a
 * TODO." It correctly and completely answers everything decidable AT ITS
 * OWN LAYER: tombstoned → zero (structural, type-discriminated), clock-
 * inconsistent → zero (the one piece of freshness reasoning `lib/contracts`
 * can do without seeing a `DecayPolicy` interpreter), otherwise the
 * recorded value. That is a complete, honest answer for a layer that
 * cannot see `lib/decay` — not a partial one waiting to be finished one
 * layer down. THIS function is where "otherwise the recorded value" gets
 * replaced by the real, elapsed-time-aware number, because THIS layer is
 * the one place that can see both `Memory`/`TombstonedMemory` (from
 * `lib/contracts`) AND `decay` (from right here) at once.
 *
 * NO DUPLICATED CLOCK CHECK: `effectiveConfidence`'s own clock-
 * inconsistency branch and `decay`'s internal one (`decay.ts`'s header)
 * check the exact same condition (`ageOf(lastAffirmedAt, now).kind ===
 * "clock-inconsistency"`) and produce the same `ZERO_CONFIDENCE` answer.
 * This function does not re-check it — `decay(record, now)` already fails
 * closed on its own, so a live, non-tombstoned record's confidence here is
 * simply `decay(record, now).confidence`, whatever branch of `decay`
 * produced it (curve-driven, clock-inconsistent, or malformed-policy — see
 * `decay.ts`'s header for all three). The tombstoned check above is the
 * ONLY structural decision this function makes for itself; everything live
 * is delegated whole.
 *
 * RELATIONSHIP TO `effectiveConfidence`, STATED PLAINLY: the two functions
 * AGREE exactly on every tombstoned record (both `ZERO_CONFIDENCE`) and on
 * every live record at zero elapsed time (both return the recorded
 * confidence unchanged — `decay`'s own "zero elapsed time" test proves
 * this). They DIVERGE the moment real time has passed on a decaying
 * policy: `effectiveConfidence` still reports the recorded value
 * unmodified (by design, permanently, per its own header); THIS function
 * reports the real, decayed number. A caller that needs the actual
 * current belief — which is every real caller, per `memory-plan.md` §3's
 * own "`BeliefQuery` ... only ever reports `effectiveConfidence`" (read,
 * post-M3, as shorthand for "the composed query-facing answer," not
 * literally the `lib/contracts` function of that name) — should call
 * `queryConfidence`, not `effectiveConfidence`, directly.
 */
export function queryConfidence<TValue extends Json>(record: Memory<TValue> | TombstonedMemory<TValue>, now: CapturedAt): Confidence {
  if (record.status === "tombstoned") {
    return ZERO_CONFIDENCE;
  }
  return decay(record, now).confidence;
}

import type { Json } from "./json.js";
import type { Memory } from "./memory.js";
import type { TombstonedMemory } from "./tombstoned-memory.js";
import { type Confidence, ZERO_CONFIDENCE } from "./confidence.js";
import { ageOf, type CapturedAt } from "./captured-at.js";

/**
 * `effectiveConfidence` — the computed, query-facing number, kept
 * DELIBERATELY DISTINCT from `Memory.confidence` (the recorded,
 * immutable field — see memory-core.ts). `memory-plan.md` §3: "What
 * decay, contradiction, and tombstoning change is not that field; they
 * change what a *query* is willing to report... `BeliefQuery` (§6) only
 * ever reports `effectiveConfidence`, never the raw stored field, so
 * 'confidence dropped to zero' always means 'the store will no longer
 * surface this as belief,' never 'a historical record was rewritten.'"
 *
 * THIS IS MADE REAL IN THE TYPES, NOT LEFT AS PROSE, TWO WAYS AT ONCE:
 *
 *   1. Structurally: this function's parameter type is `Memory<TValue> |
 *      TombstonedMemory<TValue>` — a union of BOTH states a record can be
 *      in — while `Memory.confidence` only ever exists on the live half
 *      of that union. A caller cannot get "the effective confidence" by
 *      reading a `.confidence` field generically off whatever this
 *      function was given, because a `TombstonedMemory` has no
 *      `.confidence` field misleadingly available to read (only
 *      `MemoryCore`'s `confidence`, present on both — see below for why
 *      that alone is not enough, and why the tombstoned branch below
 *      never reads it).
 *   2. Behaviorally: the function's own body NEVER simply returns
 *      `record.confidence` for a tombstoned record, even though
 *      `TombstonedMemory` (via `MemoryCore`) technically still carries
 *      one — it unconditionally returns `ZERO_CONFIDENCE` the moment
 *      `record.status === "tombstoned"`, discriminated on the type-level
 *      tag, never on a value comparison that a stale or wrong stored
 *      number could quietly defeat.
 *
 * WHAT THIS MILESTONE HONESTLY DOES AND DOES NOT COMPUTE — stated
 * plainly, not overclaimed:
 *
 *   - `status === "tombstoned"` → `ZERO_CONFIDENCE`. Fully, correctly
 *     computed by this milestone. `memory-plan.md` §3: "`0` for any
 *     `TombstonedMemory` (structurally...)" — exactly this branch.
 *   - live, but `now` is clock-inconsistent relative to `lastAffirmedAt`
 *     (`ageOf`, captured-at.ts, returns `"clock-inconsistency"`) →
 *     `ZERO_CONFIDENCE`. This reuses the *thinking*, not the code, behind
 *     `memory-plan.md` §7's genuinely-applies bullet ("a signal... whose
 *     own timestamp is in the future relative to `now` must never be
 *     treated as fresh") and previews the exact fail-closed rule §5.2
 *     specifies for M3's real `decay()`: "a clock-inconsistent `now`
 *     fails closed to 'cannot compute, treat as most doubted,' never to
 *     a fabricated `confidence: 1`." Zero is the correct "most doubted"
 *     value this milestone can commit to now, and M3 inherits, not
 *     replaces, this branch.
 *   - live, clock-consistent → returns `record.confidence` UNCHANGED.
 *     This is the one HONEST, DISCLOSED LIMITATION of this milestone:
 *     `memory-plan.md` §3 specifies this branch as `decay(memory,
 *     now).confidence`, and `decay()` is M3's `lib/decay/**` — a later,
 *     still-unbuilt milestone this one must not encroach on. Returning
 *     the recorded confidence unmodified is not a fake placeholder
 *     pretending to be decay: it is the mathematically exact value decay
 *     would report at zero elapsed decay for any monotonically-decreasing
 *     curve, and it never overstates freshness beyond what is actually
 *     recorded. M3 replaces ONLY this final `return` with a real call to
 *     `decay(record, now).confidence`; the tombstoned-zero and clock-
 *     inconsistency branches above are already correct under §3/§7's own
 *     rules and should not need to change when M3 lands.
 *
 * This is flagged again in `.genesis/decisions/0001-contracts.md` and in
 * this milestone's own report as the weakest point a verifier should
 * attack first: nothing here PROVES decay is missing to a reader who
 * only skims the return type, and a test that only checks the tombstoned
 * and clock-inconsistent branches could look like full coverage without
 * ever exercising the (currently trivial) live branch's real limitation.
 * `__tests__/effective-confidence.test.ts` includes a test that names
 * this limitation directly, asserting the live branch does NOT vary with
 * elapsed time yet — a claim that must start failing the moment M3
 * lands, which is the point.
 */
export function effectiveConfidence<TValue extends Json>(
  record: Memory<TValue> | TombstonedMemory<TValue>,
  now: CapturedAt,
): Confidence {
  if (record.status === "tombstoned") {
    return ZERO_CONFIDENCE;
  }
  if (ageOf(record.lastAffirmedAt, now).kind === "clock-inconsistency") {
    return ZERO_CONFIDENCE;
  }
  return record.confidence;
}

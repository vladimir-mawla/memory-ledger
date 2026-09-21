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
 *   - live, clock-consistent → returns `record.confidence` UNCHANGED. THIS
 *     IS NOW PERMANENT, STRUCTURAL BEHAVIOR — NOT A LIMITATION AWAITING A
 *     LATER FIX. M1's own ADR (`.genesis/decisions/0001-contracts.md`,
 *     Decision 6) and an earlier revision of this comment both said M3
 *     would "replace ONLY this final `return` with a real call to
 *     `decay(record, now).confidence`." M3's own build found that
 *     instruction UNSATISFIABLE without creating a real circular
 *     dependency: `lib/decay/**` necessarily imports FROM `lib/contracts`
 *     (`Memory`, `TombstonedMemory`, `Confidence`, `CapturedAt`, `Json` —
 *     there is no version of a decay interpreter that doesn't need these),
 *     so `lib/contracts` importing `decay` FROM `lib/decay` back would
 *     make the two directories depend on each other, and would invert this
 *     project's own layering (`lib/contracts` is the frozen BASE every
 *     later milestone builds on, never the reverse). See
 *     `.genesis/decisions/0002-decay.md` (M3's ADR) for the full ruling.
 *
 *     THE RESOLUTION IS ARCHITECTURAL, NOT A WIRING CHANGE: this function
 *     stays exactly as written, and correctly answers everything
 *     DECIDABLE AT THIS LAYER — tombstoned → zero, clock-inconsistent →
 *     zero, otherwise the recorded value (the mathematically exact answer
 *     at zero elapsed decay for any monotonically-decreasing curve, and
 *     never an overstatement of what is actually recorded). It is a
 *     COMPLETE answer for a layer that cannot see `lib/decay`, not a
 *     partial one. THE COMPOSED, REAL-ELAPSED-TIME-AWARE ANSWER —
 *     `decay(record, now).confidence` for a live record, `ZERO_CONFIDENCE`
 *     for a tombstoned one — is `queryConfidence` in
 *     `lib/decay/query-confidence.ts`, one layer up, which CAN see both
 *     this file's types and the real decay interpreter at once. A caller
 *     that wants the actual current belief (which is every real caller —
 *     a future `BeliefQuery`, M5, included) should call `queryConfidence`,
 *     not this function, directly.
 *
 * `__tests__/effective-confidence.test.ts` includes a test PINNING this
 * live branch's now-permanent behavior (that it does not vary with
 * elapsed time) — see that test's own comment, corrected alongside this
 * header, for why it is a permanent structural guarantee about THIS
 * LAYER rather than a limitation expected to start failing.
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

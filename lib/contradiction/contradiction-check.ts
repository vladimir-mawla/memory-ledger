import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import type { ComparisonInapplicableReason } from "./value-comparator.js";

/**
 * `NotComparableReason` — the closed vocabulary naming WHY `contradict()`
 * refused to reach a verdict, never a bare `not-comparable` with no fact
 * attached (same "never a bare label" discipline `lib/contracts`'
 * `BeliefAnswer`/`InvalidConfidence`/`InvalidCapturedAt` all follow).
 *
 *   - `"different-subject-or-predicate"` — the two memories are not even
 *     claims about the same `(subject, predicate)`. `memory-plan.md` §5:
 *     contradiction "fires only on the same `(subject, predicate)`."
 *   - `"scope-not-overlapping"` — checked SECOND, before any value
 *     comparison, per this milestone's brief ("Scope overlap is exact
 *     superset containment per the plan's §3, checked before anything
 *     else") — see contradict.ts's own header for exactly what "overlap"
 *     means here and why (the ADR's "partial scope overlap" design
 *     question).
 *   - `"clock-order-violated"` — `newer.believedAt` is not strictly after
 *     `older.believedAt`. Covers BOTH a caller passing the two memories in
 *     the wrong `(older, newer)` order AND a genuine tie (identical
 *     `believedAt`) — the ADR's "same `believedAt`" design question is
 *     answered here: a tie fails closed to `not-comparable`, it is never
 *     silently treated as "no difference in time, so compare confidence
 *     anyway." See contradict.ts's header for the fuller argument
 *     (this is also what makes `contradict` non-symmetric in a provable
 *     way: for any two same-subject/predicate/scope memories with
 *     genuinely different `believedAt`, AT MOST ONE of the two call orders
 *     can pass this check).
 *   - `"value-type-mismatch"` / `"comparator-inapplicable"` — re-exported
 *     from `value-comparator.ts` (`ComparisonInapplicableReason`) rather
 *     than duplicated here, so the two files cannot silently drift on what
 *     these two reasons mean. `memory-plan.md` §5's own worked case ("a
 *     `predicate` whose value type changed") is `"value-type-mismatch"`.
 */
export type NotComparableReason = ComparisonInapplicableReason | "different-subject-or-predicate" | "scope-not-overlapping" | "clock-order-violated";

/**
 * `ContradictionCheck<TValue>` — `contradict()`'s own return type
 * (contradict.ts), the M4 analogue of `lib/contracts`' `BeliefAnswer`: a
 * closed, exhaustively-matched, four-outcome union, never a bare
 * boolean/string. `memory-plan.md` §5 names all four outcomes; this file
 * makes each one carry exactly the fact that makes it that outcome, the
 * same discipline `belief-answer.ts`'s own header describes for its four
 * variants.
 *
 * EVERY VARIANT CARRIES BOTH COMPARED MEMORIES (`older`/`newer`, or
 * `candidates` for `disputed`) — not merely for symmetry with
 * `BeliefAnswer`, but because a caller building an audit trail (M5's
 * eventual `lib/store/**`) needs the two ids on EVERY outcome, not just the
 * ones that changed something: "these two memories were compared and
 * agreed" is exactly as auditable a fact as "these two disagreed and X
 * won."
 *
 *   - `"no-conflict"` — values agree under the comparator; neither memory's
 *     status/liveness changes. `memory-plan.md` §5: "values agree
 *     (exact-equal, or within a declared numeric tolerance...)."
 *   - `"superseded"` — values disagree, and `newer.confidence` is at or
 *     above `older.confidence` (§5.1's plain numeric comparison on
 *     RECORDED confidence — see contradict.ts's header for why this
 *     milestone reads `Memory.confidence` directly rather than inventing a
 *     `Provenance.tier` → number mapping M1's own ADR left unresolved).
 *     `older` is the losing memory a caller should `forget(older,
 *     "contradicted", now)` with `supersededBy: newer.id` (M5, unbuilt);
 *     `newer` is the winner. Naming both, by reference, satisfies this
 *     milestone's own success criterion ("naming both ids" — `Memory.id`
 *     is on both).
 *   - `"disputed"` — values disagree, and `newer.confidence` is strictly
 *     LOWER than `older.confidence`: `memory-plan.md` §5.1's explicit
 *     non-negotiable — "a fresher-but-lower-confidence value must not
 *     auto-win." `candidates` is a fixed 2-tuple (`[older, newer]`, always
 *     in THAT order — deterministic, not "whichever the caller happened to
 *     name first"), mirroring `BeliefAnswer.disputed`'s own tuple shape
 *     exactly (a caller merging M4's `disputed` into a `BeliefAnswer`
 *     later needs no reshaping).
 *   - `"not-comparable"` — see `NotComparableReason` above for the five
 *     reasons this can fire, and contradict.ts for the order they are
 *     checked in (structural gates first, value comparison last).
 *
 * ONE DELIBERATE READING OF AN AMBIGUOUS PLAN SENTENCE, RECORDED HERE
 * RATHER THAN SILENTLY RESOLVED: `memory-plan.md` §5's own prose for
 * `not-comparable` reads "fails closed to `disputed` as well, never
 * silently 'no conflict'" — which, read hyper-literally, could mean
 * `not-comparable` IS `disputed` (a third variant collapsing into a
 * second). That reading is REJECTED here in favor of `PLAN.md`'s own M4
 * success criteria (the authoritative row per this milestone's brief),
 * which requires `not-comparable` as ITS OWN, FOURTH outcome, distinct
 * from `disputed`, with its own dedicated test ("a type-mismatched
 * comparison... fails closed to `not-comparable`, never throws and never
 * silently resolves either way"). The plan's sentence is read here as
 * "`not-comparable`, LIKE `disputed`, never hands a caller a decisive
 * winner" (both are non-committal outcomes), not as "these two outcomes
 * are the same value" — see this milestone's own build report for this
 * named as a finding, not silently reconciled.
 */
export type ContradictionCheck<TValue extends Json = Json> =
  | { readonly outcome: "no-conflict"; readonly older: Memory<TValue>; readonly newer: Memory<TValue> }
  | { readonly outcome: "superseded"; readonly older: Memory<TValue>; readonly newer: Memory<TValue> }
  | { readonly outcome: "disputed"; readonly candidates: readonly [Memory<TValue>, Memory<TValue>] }
  | {
      readonly outcome: "not-comparable";
      readonly reason: NotComparableReason;
      readonly older: Memory<TValue>;
      readonly newer: Memory<TValue>;
    };

/**
 * Exhaustiveness helper, same pattern as `lib/contracts`'
 * `assertNeverBeliefAnswer` and shadow-run's `assertNeverReconciliation`.
 * Never called at runtime for any value TypeScript itself considers
 * reachable — its only job is to make an unhandled fifth outcome a COMPILE
 * error at whatever `switch`/`if`-chain consumes a `ContradictionCheck`.
 */
export function assertNeverContradictionCheck(value: never): never {
  throw new Error(`Unreachable: unhandled ContradictionCheck outcome ${JSON.stringify(value)}`);
}

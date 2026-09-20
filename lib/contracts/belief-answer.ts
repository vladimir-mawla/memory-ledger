import type { Json } from "./json.js";
import type { Memory } from "./memory.js";
import type { Confidence } from "./confidence.js";
import type { Tombstone } from "./tombstone.js";

/**
 * `BeliefAnswer<TValue>` — the read-time contract, and the type that makes
 * `memory-plan.md` §2's structural argument real rather than asserted:
 * "this system's read path is not 'rank everything and return the top
 * result.' It is a closed, exhaustively-matched query outcome... three of
 * whose four variants... are literally impossible for a similarity
 * ranker to produce, because they require the store to have compared its
 * own contents against each other and against a forgetting policy
 * *before* the query ever arrives, and to be willing to hand back 'no
 * current answer' instead of a ranked one." This is the fourth of this
 * milestone's four irreducible types.
 *
 * FOUR VARIANTS, EXHAUSTIVELY MATCHED, NEVER A BARE BOOLEAN/STRING/SCORE —
 * the same discipline decision-engine's `Decision` (five outcomes) and
 * shadow-run's `Reconciliation` (three statuses) both use, one layer
 * over:
 *
 *   - `"believed"`  — the memory this subject/predicate/scope currently
 *     resolves to, at full confidence.
 *   - `"doubted"`   — still the only live candidate, but its confidence
 *     has crossed `DecayPolicy.doubtedThreshold` (decay-policy.ts) —
 *     `reason: "age-exceeded"` is the ONLY doubt cause a query answer
 *     itself carries, because it is the only doubt cause that does NOT
 *     also change which memory is live (contradiction and revocation both
 *     end in a `forget()`, moving the record out of query-eligibility
 *     entirely — see forget-reason.ts).
 *   - `"disputed"`  — two live memories of the same `(subject, predicate,
 *     scope)` disagree and neither won mechanically (`memory-plan.md`
 *     §5.1's `disputed` outcome). `candidates` is a fixed 2-tuple, not an
 *     array of arbitrary length: `contradict()` (M4, unbuilt) is defined
 *     over exactly two memories at a time, and a tuple says so at the type
 *     level rather than requiring every consumer to re-check `.length ===
 *     2` defensively.
 *   - `"unknown"`   — no live candidate at all, for one of two
 *     structurally different reasons a caller needs to tell apart:
 *     `"no-memory"` (nothing was ever believed about this) vs.
 *     `"all-known-memories-tombstoned"` (something WAS believed, and
 *     every candidate for it is now a `TombstonedMemory` —
 *     tombstoned-memory.ts — the exact case `memory-plan.md` §4's
 *     falsifiability test targets: "a system that never actually forgets
 *     anything has no mechanic to demo"). `tombstones` is populated for
 *     BOTH reasons (empty for `"no-memory"`, non-empty for
 *     `"all-known-memories-tombstoned"`) rather than being a field only
 *     the second reason carries, because a discriminated union keyed on
 *     `reason` with a per-branch optional field would reintroduce exactly
 *     the "present iff" prose-only constraint `tombstone.ts`'s own header
 *     explains why this project no longer accepts; a plain, always-
 *     present, possibly-empty array needs no such caveat.
 *
 * `assertNeverBeliefAnswer` — the exhaustiveness helper, same pattern as
 * decision-engine's `assertNeverOutcome` / shadow-run's
 * `assertNeverReconciliation`. Never called at runtime (the `never`
 * parameter type makes that impossible for any value TypeScript itself
 * considers reachable); its only job is to make an unhandled variant a
 * COMPILE error at the call site the moment a fifth variant is ever added.
 * `BeliefAnswer` itself is frozen at four variants for this milestone (no
 * later milestone may widen it without unfreezing `lib/contracts/**`), so
 * `__tests__/belief-answer.test.ts` demonstrates the mechanism on an
 * equivalent, LOCAL five-variant stand-in type rather than dishonestly
 * widening the real one just to prove a point — the same choice
 * shadow-run's own `reconciliation.test.ts` documents making for the
 * identical reason.
 */
export type BeliefAnswer<TValue extends Json = Json> =
  | { readonly status: "believed"; readonly memory: Memory<TValue>; readonly confidence: Confidence }
  | {
      readonly status: "doubted";
      readonly memory: Memory<TValue>;
      readonly confidence: Confidence;
      readonly reason: "age-exceeded";
    }
  | { readonly status: "disputed"; readonly candidates: readonly [Memory<TValue>, Memory<TValue>] }
  | {
      readonly status: "unknown";
      readonly reason: "no-memory" | "all-known-memories-tombstoned";
      readonly tombstones: readonly Tombstone[];
    };

export function assertNeverBeliefAnswer(value: never): never {
  throw new Error(`Unreachable: unhandled BeliefAnswer status ${JSON.stringify(value)}`);
}

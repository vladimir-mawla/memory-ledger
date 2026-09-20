import type { MemoryId } from "./memory-id.js";
import type { TombstoneId } from "./tombstone-id.js";
import type { ForgetReason } from "./forget-reason.js";
import type { CapturedAt } from "./captured-at.js";

/**
 * `Tombstone` — the forgetting record. `memory-plan.md` §4: "A system that
 * deletes rows cannot answer 'what did you forget and why' — there is
 * nothing left to point at." This is one of this milestone's four
 * irreducible types, and the ONE most load-bearing for the brief's own
 * "explicit forgetting policy" ask (`memory-plan.md` §0).
 *
 * A DISCRIMINATED UNION ON `reason`, NOT ONE INTERFACE WITH AN OPTIONAL
 * `supersededBy?` — a deliberate, verified correction to the plan's own
 * literal sketch, recorded in full in `.genesis/decisions/0001-contracts.md`
 * (Decision 3). §4's sketch writes `supersededBy?: MemoryId // present
 * iff reason is "contradicted" or "superseded"` as a single optional
 * field on one `Tombstone` interface covering all five reasons. That
 * comment states a real constraint ("present IFF"), but a bare `?:` field
 * cannot enforce it: nothing stops a caller from constructing a
 * `{ reason: "age-exceeded", supersededBy: someId }` (present when it
 * shouldn't be) or a `{ reason: "contradicted" }` with `supersededBy`
 * omitted (absent when the plan says it must name "exactly which memory
 * caused it") — both would satisfy an interface with only an optional
 * field, silently. Given this project's own stated discipline ("never
 * write a comment stating something the code contradicts" —
 * `memory-plan.md`'s own account-wide standing note), leaving the "iff"
 * as prose next to a field the type system doesn't actually constrain
 * that way was rejected. Splitting `Tombstone` into two branches makes the
 * constraint STRUCTURAL: `CausedTombstone` (below) requires
 * `supersededBy`; `UncausedTombstone` has no such field at all, so
 * constructing one WITH a `supersededBy` is an excess-property error at
 * any object-literal call site (`__tests__/tombstone.test.ts` proves
 * both: a `CausedTombstone` missing `supersededBy`, and an
 * `UncausedTombstone` literal that tries to add one, both fail to
 * compile).
 *
 *   - `CausedTombstone` — `reason: "contradicted" | "superseded"`.
 *     `supersededBy: MemoryId` is REQUIRED: `memory-plan.md` §4 requires
 *     these two reasons to name "exactly which memory caused it" — the
 *     newer memory that won the comparison (§5.1).
 *   - `UncausedTombstone` — `reason: "age-exceeded" | "scope-exited" |
 *     "source-revoked"`. No `supersededBy`: none of these three reasons
 *     is caused by another memory at all — age crosses a floor on its
 *     own, a scope closes on its own, a source's revocation is a fact
 *     about the source, not about a competing belief.
 *
 * IMMUTABLE, APPEND-ONLY — same discipline as `Memory` (memory.ts): every
 * field is `readonly`, and this file exports no mutator. A `Tombstone`, once
 * written, is the permanent, on-the-record answer to "what did you forget
 * and why" (§4's "proof-of-forgetting, part 1: the record").
 */
export interface CausedTombstone {
  readonly id: TombstoneId;
  readonly memoryId: MemoryId;
  readonly reason: "contradicted" | "superseded";
  readonly forgottenAt: CapturedAt;
  readonly supersededBy: MemoryId;
}

export interface UncausedTombstone {
  readonly id: TombstoneId;
  readonly memoryId: MemoryId;
  readonly reason: "age-exceeded" | "scope-exited" | "source-revoked";
  readonly forgottenAt: CapturedAt;
}

export type Tombstone = CausedTombstone | UncausedTombstone;

/**
 * Compile-time proof that the two branches' `reason` literals partition
 * `ForgetReason` (forget-reason.ts) exactly — every one of the five
 * reasons appears in exactly one branch, none is left out, and neither
 * branch smuggles in a sixth. If a future edit to either branch's
 * `reason` union drifted out of sync with `ForgetReason` (a typo, a
 * reason moved to the wrong branch, a new `ForgetReason` member added
 * without updating either branch here), `_reasonPartitionIsExact` stops
 * being assignable to `true` and `tsc` fails right here — never silently.
 */
type _ReasonPartitionIsExact = Tombstone["reason"] extends ForgetReason
  ? ForgetReason extends Tombstone["reason"]
    ? true
    : false
  : false;
const _reasonPartitionIsExact: _ReasonPartitionIsExact = true;
void _reasonPartitionIsExact;

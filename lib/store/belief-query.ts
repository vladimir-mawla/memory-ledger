import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import type { Tombstone } from "../contracts/tombstone.js";
import type { CapturedAt } from "../contracts/captured-at.js";
import type { BeliefAnswer } from "../contracts/belief-answer.js";
import { decay, type DecayResult } from "../decay/decay.js";
import { contradict } from "../contradiction/contradict.js";
import { assertNeverContradictionCheck } from "../contradiction/contradiction-check.js";
import { type ValueComparator, DEFAULT_VALUE_COMPARATOR } from "../contradiction/value-comparator.js";
import { forget } from "./forget.js";

/**
 * `BeliefQuery<TValue>` / `queryBelief` — `memory-plan.md` §4/§6's read
 * path, and this milestone's second deliverable. `memory-plan.md` §4: "A
 * 'current belief' query... over a corpus where every candidate memory for
 * `(subject, predicate, scope)` is tombstoned must return `{status:
 * 'unknown', reason: 'all-known-memories-tombstoned', tombstones: [...]}`
 * — never silently fall back to the highest-confidence tombstoned value."
 *
 * ─────────────────────────────────────────────────────────────────────────
 * THE COMPILE-TIME REFUSAL, MADE REAL (not just expressible, per M1)
 * ─────────────────────────────────────────────────────────────────────────
 * `candidates: ReadonlyArray<Memory<TValue>>` — never `TombstonedMemory`,
 * never a union of the two. `Memory.status` (`"believed" | "doubted" |
 * "disputed"`) does not include `"tombstoned"`, so a `TombstonedMemory`
 * literal or variable is NOT assignable into this parameter — a compile
 * error at the CALL SITE, not a runtime `if (candidate.status !==
 * "tombstoned")` anywhere in this file. This is the real consumer M1's own
 * `__tests__/live-query-refusal.test.ts` proved the property FOR, against a
 * representative stand-in it explicitly said "M5 owns the real one."
 * `__tests__/belief-query-refusal.test.ts` (this milestone) re-proves the
 * identical `@ts-expect-error` shape against THIS function, the real one —
 * see that test file for why an unused `@ts-expect-error` is itself a
 * compile error (`TS2578`), which is what makes the proof real rather than
 * decorative: if this refusal property were ever accidentally lost (e.g. a
 * future edit widened `Memory.status` to include `"tombstoned"`, undoing
 * M1's own Decision 2), the `@ts-expect-error` line would stop suppressing
 * anything, and `tsc` would fail on THAT line specifically, not stay
 * silently green.
 *
 * Tombstoned records enter this function ONLY as `Tombstone`
 * (`lib/contracts/tombstone.ts`) — the small, immutable receipt, never the
 * full `TombstonedMemory` payload. This is deliberate, not a missed
 * opportunity to accept richer input: `BeliefAnswer.unknown.tombstones` is
 * itself typed `readonly Tombstone[]` (`belief-answer.ts`, frozen), so a
 * caller holding `TombstonedMemory<TValue>[]` extracts `.tombstone` from
 * each before calling this function — the extraction happens OUTSIDE this
 * file, and this file's own parameter list never has a slot a
 * `TombstonedMemory` could be smuggled into.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * PRECONDITION (mirrors `contradict`'s own, per ADR 0003's forward note for
 * M5): `candidates` is already the correctly-scoped set of LIVE memories
 * for exactly one `(subject, predicate, scope)` query — grouping by those
 * three fields is the caller's job (a real store's index), not this
 * function's; `queryBelief` never reads `.subject`/`.predicate`/`.scope`
 * itself to filter its own input. `tombstones` is, similarly, whatever
 * subset of the caller's tombstone log the caller believes is relevant to
 * report for this same query — this function does not filter that either.
 * A caller that hands `queryBelief` an unrelated tombstone log alongside an
 * unrelated candidate list gets an unrelated (but not incorrect, given what
 * it was told) answer — the same "trusts its caller's grouping" discipline
 * `contradict.ts`'s own header discloses for `(subject, predicate)` and
 * scope-overlap eligibility one layer down.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMPOSITION, NOT REIMPLEMENTATION — the ADR's own design question,
 * answered directly in code
 * ─────────────────────────────────────────────────────────────────────────
 * This file contains no decay curve and no value-comparison logic of its
 * own. Every freshness judgment is `decay()` (`lib/decay/decay.ts`,
 * frozen); every disagreement judgment is `contradict()`
 * (`lib/contradiction/contradict.ts`, frozen); every act of forgetting is
 * `forget()` (`./forget.ts`, this milestone, same directory). Two concrete
 * compositions:
 *
 *   1. AGE-EXCEEDED, LAZILY, AT QUERY TIME. `.genesis/decisions/
 *      0002-decay.md`'s own forward note for M5: "`decay(memory,
 *      now).status === 'forgettable'` is the signal to call `forget(memory,
 *      'age-exceeded', now)` — `lib/decay` never does this itself."
 *      `partitionByDecay` (below) is that composition: any candidate whose
 *      OWN decay curve has already crossed its `forgetFloor` is converted,
 *      right here, into a real `Tombstone` via `forget(...,
 *      "age-exceeded", now)` and folded into this call's own
 *      `unknown.tombstones` reporting — never reported as `"believed"`/
 *      `"doubted"` with a confidence number that would, if printed, already
 *      read as effectively zero. See "WHO ENFORCES THE ADR 0003
 *      PRECONDITION" below for why this lazy, per-call sweep — rather than
 *      a separate maintenance job the caller must remember to run first —
 *      is this milestone's answer to that design question.
 *   2. DISPUTED/SUPERSEDED/NOT-COMPARABLE, VIA A LIVE `contradict()` CALL,
 *      NEVER A STORED `Memory.status` READ. When exactly two live
 *      candidates remain after step 1, this function does not trust
 *      whatever `status` field either memory happens to carry (a caller
 *      could construct a `Memory` with `status: "believed"` even though a
 *      real disagreement exists — `lib/contracts` never validates that
 *      `status` was set consistently with the OTHER live memories around
 *      it, because a `Memory` in isolation has no way to know about its
 *      siblings). Instead, `queryBelief` calls `contradict(older, newer)`
 *      itself, ordered by `believedAt` (mirroring `contradict`'s own
 *      anti-symmetry requirement), and answers from THAT outcome — see
 *      "TWO OR MORE LIVE CANDIDATES" below for the full four-way switch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHO ENFORCES THE ADR 0003 PRECONDITION? — the design question this
 * milestone was explicitly handed
 * ─────────────────────────────────────────────────────────────────────────
 * `.genesis/decisions/0003-contradiction.md`, Finding 2, left one
 * precondition unverified at the contradiction layer: "'older is still
 * inside its freshness window' reduces, in practice, to 'older is still a
 * live `Memory<TValue>`'... If this reduction turns out to be wrong once M5
 * exists for real... that is M5's finding to make." Answered here, with a
 * real case in hand: the reduction is NOT sound in general — a `Memory`
 * can structurally remain "live" (not yet a `TombstonedMemory`) for
 * however long nobody calls `forget` on it, decay's own curve notwithstanding,
 * because `decay()` has no side effect (`lib/decay/decay.ts`'s own header:
 * "has no side effect and does not construct a `Tombstone`"). So this
 * store DOES have to enforce the freshness precondition itself, and it does
 * so INSIDE `queryBelief`, on every call, rather than via a separate
 * maintenance function a caller might forget to run first: `partitionByDecay`
 * (below) is the very first thing this function does, on every element of
 * `candidates`, BEFORE any candidate is eligible to reach `contradict` at
 * all (see the two-or-more-candidates branch below — it only ever receives
 * elements of `fresh`, never raw `candidates`). This makes ADR 0003's own
 * assumed precondition TRUE BY CONSTRUCTION at the one call site that
 * matters, rather than merely documented and hoped for.
 *
 * A DELIBERATELY REJECTED ALTERNATIVE: a separate, standalone `sweepDecayed`
 * maintenance function the caller must remember to run before every query.
 * Rejected because "remember to run this first" is exactly the kind of
 * discipline-by-convention this account's own standing note about
 * conflating a stated constraint with an enforced one warns against — the
 * en­forcement belongs inside the one function whose own correctness
 * actually depends on it holding, not in a second function a caller could
 * skip.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ZERO, ONE, TWO-OR-MORE LIVE CANDIDATES — the whole decision tree
 * ─────────────────────────────────────────────────────────────────────────
 *   - ZERO fresh candidates (after step 1's sweep): `"unknown"`. `reason:
 *     "no-memory"` if there is truly nothing to point at (the ORIGINAL
 *     `tombstones` argument was empty AND nothing was swept just now);
 *     otherwise `reason: "all-known-memories-tombstoned"`, `tombstones`
 *     carrying both the caller-supplied log AND anything this call itself
 *     just swept — `memory-plan.md` §4's own falsifiable test, satisfied
 *     directly, never inferred from the absence of a crash.
 *   - EXACTLY ONE fresh candidate: `"believed"` or `"doubted"`, decided by
 *     THAT candidate's own already-computed `DecayResult.status` (no second
 *     `decay()` call — `partitionByDecay` keeps the result it already
 *     computed rather than discarding and recomputing it), confidence taken
 *     from the SAME `DecayResult`, never from `memory.confidence` directly
 *     (`memory-plan.md` §3: a query "only ever reports
 *     `effectiveConfidence`" — read, post-M3, as the composed answer,
 *     `decay(...).confidence`, exactly what M3's own ADR's forward note for
 *     M5 says to call).
 *   - TWO OR MORE fresh candidates: the two with the LATEST `believedAt`
 *     are taken as `(older, newer)` and handed to `contradict`. (More than
 *     two fresh, same-key candidates coexisting is a violation of this
 *     function's own precondition — a well-formed store's write path,
 *     un­built by this milestone, is expected to keep at most two live per
 *     key, exactly the pair a `disputed` outcome leaves behind — so this is
 *     disclosed, tested defensively for "does not crash, does not silently
 *     drop the disagreement," and not exhaustively specified beyond that.)
 *     `contradict(older, newer)`'s four outcomes:
 *       - `"no-conflict"` — the two values genuinely agree; nothing to
 *         report as a disagreement, so this answers `"believed"` on
 *         `newer` (the fresher of two agreeing statements) at its own
 *         decayed confidence.
 *       - `"disputed"` — `memory-plan.md` §5.1's own outcome, answered
 *         directly: `{status: "disputed", candidates: [older, newer]}`.
 *       - `"superseded"` OR `"not-comparable"` — treated IDENTICALLY to
 *         `"disputed"` here, and this is a genuine, disclosed finding of
 *         this milestone, not an oversight: `"superseded"` means `older`
 *         SHOULD already have been tombstoned by whichever write-time
 *         process affirmed `newer` (this milestone builds no such
 *         write-time `affirm`/reconciliation orchestration — PLAN.md's own
 *         M5 row asks for `forget` and the read path, not a full write
 *         path). Two live memories BOTH still being visible to a query
 *         despite one having lost, mechanically, is exactly
 *         `memory-plan.md` §10's same-tick race shape. This function could
 *         lazily mint the missing tombstone right here (`forget(older,
 *         "contradicted", now, newer.id)`) — but `BeliefAnswer`'s frozen
 *         `"believed"` variant has nowhere to put that tombstone for the
 *         caller to see or persist, so doing so would silently discard the
 *         very proof `memory-plan.md` §4 requires to exist ("the record...
 *         is the 'here is the receipt' half"). Reporting `"believed"`
 *         anyway, with the tombstone thrown away unread, would be worse
 *         than reporting `"disputed"`: it would look resolved while
 *         leaving no receipt behind. `memory-plan.md` §10(a)'s own
 *         acceptance criterion — "either `disputed` or reflects the new
 *         memory — never a `believed` answer built from data already
 *         superseded" — is satisfied by the SAFER of its two named options.
 *         Actually reconciling this race (tombstoning `older` for real,
 *         durably) is this milestone's own named forward note for M6's
 *         write-path/M7's failure suite, not something this read-only
 *         function does silently. `"not-comparable"` gets the same
 *         treatment for the same underlying reason: never silently prefer
 *         one candidate when `contradict` itself would not commit to a
 *         verdict.
 */

export type BeliefQuery<TValue extends Json> = (
  candidates: ReadonlyArray<Memory<TValue>>,
  tombstones: ReadonlyArray<Tombstone>,
  now: CapturedAt,
  comparator?: ValueComparator,
) => BeliefAnswer<TValue>;

interface FreshCandidate<TValue extends Json> {
  readonly memory: Memory<TValue>;
  readonly decay: DecayResult;
}

/** See the file header's "WHO ENFORCES THE ADR 0003 PRECONDITION" — this is that enforcement, run first, on every call. */
function partitionByDecay<TValue extends Json>(
  candidates: ReadonlyArray<Memory<TValue>>,
  now: CapturedAt,
): { readonly fresh: ReadonlyArray<FreshCandidate<TValue>>; readonly newlyForgotten: ReadonlyArray<Tombstone> } {
  const fresh: FreshCandidate<TValue>[] = [];
  const newlyForgotten: Tombstone[] = [];
  for (const memory of candidates) {
    const result = decay(memory, now);
    if (result.status === "forgettable") {
      newlyForgotten.push(forget(memory, "age-exceeded", now).tombstone);
    } else {
      fresh.push({ memory, decay: result });
    }
  }
  return { fresh, newlyForgotten };
}

function believedOrDoubted<TValue extends Json>(candidate: FreshCandidate<TValue>): BeliefAnswer<TValue> {
  const { memory, decay: result } = candidate;
  if (result.status === "doubted") {
    return { status: "doubted", memory, confidence: result.confidence, reason: "age-exceeded" };
  }
  return { status: "believed", memory, confidence: result.confidence };
}

export function queryBelief<TValue extends Json>(
  candidates: ReadonlyArray<Memory<TValue>>,
  tombstones: ReadonlyArray<Tombstone>,
  now: CapturedAt,
  comparator: ValueComparator = DEFAULT_VALUE_COMPARATOR,
): BeliefAnswer<TValue> {
  const { fresh, newlyForgotten } = partitionByDecay(candidates, now);
  const allTombstones = newlyForgotten.length === 0 ? tombstones : [...tombstones, ...newlyForgotten];

  if (fresh.length === 0) {
    return allTombstones.length === 0
      ? { status: "unknown", reason: "no-memory", tombstones: [] }
      : { status: "unknown", reason: "all-known-memories-tombstoned", tombstones: allTombstones };
  }

  if (fresh.length === 1) {
    return believedOrDoubted(fresh[0] as FreshCandidate<TValue>);
  }

  // Two or more — see file header's "ZERO, ONE, TWO-OR-MORE" section for
  // why the two LATEST believedAt are taken, and why every non-agreement
  // outcome answers "disputed".
  const sorted = [...fresh].sort((a, b) => Date.parse(a.memory.believedAt) - Date.parse(b.memory.believedAt));
  const newer = sorted[sorted.length - 1] as FreshCandidate<TValue>;
  const older = sorted[sorted.length - 2] as FreshCandidate<TValue>;

  const check = contradict(older.memory, newer.memory, comparator);
  switch (check.outcome) {
    case "no-conflict":
      return believedOrDoubted(newer);
    case "disputed":
    case "superseded":
    case "not-comparable":
      return { status: "disputed", candidates: [older.memory, newer.memory] };
    default:
      return assertNeverContradictionCheck(check);
  }
}

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
 * REVISED AFTER REVIEW: `"superseded"` NOW ANSWERS FROM THE NEWER MEMORY,
 * NOT `"disputed"` — §8's own demo depends on this
 * ─────────────────────────────────────────────────────────────────────────
 * An earlier revision of this file collapsed THREE of `contradict`'s four
 * outcomes — `"disputed"`, `"superseded"`, `"not-comparable"` — into a
 * single `"disputed"` answer, reasoning that `BeliefAnswer`'s frozen
 * `"believed"` variant has nowhere to carry the tombstone a real supersede
 * resolution would produce. That reasoning was WRONG, not merely
 * conservative: `memory-plan.md` §8's own demo moment is EXACTLY the
 * `"superseded"` case (two same-tier `direct-avowal` memories, the newer
 * disagreeing — ADR 0003's own worked contrast) and its own text is
 * explicit: "the system answers with the new address, reports that the old
 * one is no longer surfaced as belief... and produces the tombstone." An
 * implementation that answers `"disputed"` here shows a judge two
 * addresses side by side on the one screen this whole project is built to
 * get right. See `.genesis/decisions/0004-store.md`, Decision 2 (REVISED),
 * for the full argument this header only summarizes. Two changes fell out
 * of fixing this:
 *
 *   1. `queryBelief` now DOES lazily mint the missing tombstone on a live
 *      `"superseded"` detection — composing `forget(older, "contradicted",
 *      now, newer.id)`, the exact same "lazy tombstone at query time"
 *      pattern this file already used for a decay-forgettable candidate
 *      (`partitionByDecay`, below). This is not a new kind of side effect
 *      introduced for this one case; it is the established pattern applied
 *      to the second place this function already knew something ought to
 *      be forgotten.
 *   2. Since `BeliefAnswer` (frozen, `lib/contracts`) genuinely has no slot
 *      to carry "and by the way, I just forgot this other memory too," this
 *      function's OWN return type is no longer bare `BeliefAnswer<TValue>`
 *      — it is `BeliefQueryResult<TValue>`, a small local wrapper
 *      (`{ answer, newlyForgotten }`) that carries the `BeliefAnswer` AND
 *      every `Tombstone` this one call minted (from BOTH the decay sweep
 *      and a live supersede resolution, uniformly). `memory-plan.md`'s own
 *      text never pins `BeliefQuery`'s exact return shape beyond "the read
 *      path" — M5 owns deciding it, the same authority M1's own ADR used to
 *      correct the plan's literal `Tombstone`/`Memory.status` sketches.
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
 * decorative. Widening this function's RETURN type (above) has no bearing
 * on this proof at all — the refusal lives entirely in the `candidates`
 * PARAMETER's type, untouched by this revision.
 *
 * Tombstoned records enter this function ONLY as `Tombstone`
 * (`lib/contracts/tombstone.ts`) — the small, immutable receipt, never the
 * full `TombstonedMemory` payload. This is deliberate, not a missed
 * opportunity to accept richer input: `BeliefAnswer.unknown.tombstones` is
 * itself typed `readonly Tombstone[]` (`belief-answer.ts`, frozen), so a
 * caller holding `TombstonedMemory<TValue>[]` extracts `.tombstone` from
 * each before calling this function — the extraction happens OUTSIDE this
 * file, and this file's own parameter list never has a slot a
 * `TombstonedMemory` could be smuggled into. The SAME discipline is why
 * `newlyForgotten` (below) is `readonly Tombstone[]`, not
 * `TombstonedMemory[]`: a `Tombstone` alone is already the complete
 * "receipt" `memory-plan.md` §4 asks for, and a caller that wants the full
 * `TombstonedMemory` can reconstruct it by calling `forget` again with the
 * identical `(memory, reason, now[, supersededBy])` — `forget` needs no
 * hidden state to do so.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * "CONFIDENCE DROPPED TO ZERO THE INSTANT THE NEW ONE ARRIVED" —
 * SURFACED, NEVER REWRITTEN
 * ─────────────────────────────────────────────────────────────────────────
 * `memory-plan.md` §8's own language for the demo moment. M1 drew the
 * `Memory.confidence` (recorded, immutable) vs. `effectiveConfidence`
 * (computed) line specifically so this sentence could be literally true
 * without ever rewriting a record (`lib/contracts/effective-
 * confidence.ts`'s own header). Once `older` is tombstoned — here, at query
 * time, on a live `"superseded"` detection — `effectiveConfidence`/
 * `queryConfidence` (`lib/decay/query-confidence.ts`) report EXACTLY `0`
 * for it, unconditionally, discriminated on the type-level `status` tag,
 * the same guarantee those two frozen functions already give any other
 * `TombstonedMemory`. This function never computes or touches a
 * "dropped-to-zero" number itself — it relies on the ALREADY-PROVEN,
 * ALREADY-FROZEN fact that tombstoning IS what makes that number report
 * zero. `__tests__/belief-query.test.ts`'s demo-shaped test proves this
 * directly: it reconstructs the exact `TombstonedMemory` this function's
 * own `newlyForgotten` tombstone corresponds to and asserts
 * `queryConfidence(...) === ZERO_CONFIDENCE`, composing `lib/decay`'s own
 * frozen function rather than re-deriving the claim.
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
 *
 * ─────────────────────────────────────────────────────────────────────────
 * COMPOSITION, NOT REIMPLEMENTATION — the ADR's own design question,
 * answered directly in code
 * ─────────────────────────────────────────────────────────────────────────
 * This file contains no decay curve and no value-comparison logic of its
 * own. Every freshness judgment is `decay()` (`lib/decay/decay.ts`,
 * frozen); every disagreement judgment is `contradict()`
 * (`lib/contradiction/contradict.ts`, frozen); every act of forgetting is
 * `forget()` (`./forget.ts`, this milestone, same directory).
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
 * all. This makes ADR 0003's own assumed precondition TRUE BY CONSTRUCTION
 * at the one call site that matters, rather than merely documented and
 * hoped for.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ZERO, ONE, TWO-OR-MORE LIVE CANDIDATES — the whole decision tree
 * ─────────────────────────────────────────────────────────────────────────
 *   - ZERO fresh candidates (after the decay sweep): `"unknown"`. `reason:
 *     "no-memory"` if there is truly nothing to point at; otherwise
 *     `reason: "all-known-memories-tombstoned"`, `tombstones` carrying both
 *     the caller-supplied log AND anything this call itself just swept —
 *     `memory-plan.md` §4's own falsifiable test, satisfied directly.
 *   - EXACTLY ONE fresh candidate: `"believed"` or `"doubted"`, decided by
 *     THAT candidate's own already-computed `DecayResult` (no second
 *     `decay()` call).
 *   - TWO OR MORE fresh candidates: the two with the LATEST `believedAt`
 *     are taken as `(older, newer)` and handed to `contradict`. (More than
 *     two fresh, same-key candidates coexisting is a violation of this
 *     function's own precondition — disclosed, tested defensively, not
 *     exhaustively specified.) `contradict(older, newer)`'s four outcomes:
 *       - `"no-conflict"` — the two values genuinely agree; answers
 *         `"believed"`/`"doubted"` on `newer` (the fresher of two agreeing
 *         statements) at its own decayed confidence.
 *       - `"superseded"` — `older` LOSES. This function tombstones it right
 *         here (`forget(older, "contradicted", now, newer.id)`, folded into
 *         `newlyForgotten`) and answers `"believed"`/`"doubted"` on `newer`
 *         — never `"disputed"`. This is the fix this revision makes; see
 *         the header section above and `0004-store.md` Decision 2 for the
 *         full argument.
 *       - `"disputed"` — `memory-plan.md` §5.1's own genuine non-outcome:
 *         answered directly, `{status: "disputed", candidates: [older,
 *         newer]}`, nothing tombstoned (neither side lost).
 *       - `"not-comparable"` — `contradict` itself refused to commit to a
 *         verdict (mismatched subject/predicate, non-overlapping scope, or
 *         a `believedAt` tie/inversion — all caller-precondition
 *         violations under this function's own documented contract).
 *         Answered as `"disputed"`, THE SAME VARIANT as a genuine dispute —
 *         a DELIBERATE, DISCLOSED COLLAPSE, not an oversight:
 *         `BeliefAnswer.disputed`'s only payload is the two-candidate
 *         tuple (`belief-answer.ts`, frozen); there is no field to carry
 *         `NotComparableReason` even if this function wanted to, and
 *         `BeliefAnswer` cannot be widened by this milestone to add one.
 *         Both facts share one property that matters for a caller — "no
 *         side has a decisive verdict, nothing was tombstoned" — but a
 *         reader who cares WHY should be told this is where that
 *         distinction is lost, not left to discover it by grep.
 */

export interface BeliefQueryResult<TValue extends Json> {
  readonly answer: BeliefAnswer<TValue>;
  /**
   * Every `Tombstone` THIS call minted — from the decay sweep
   * (`partitionByDecay`) and/or a live `"superseded"` resolution. Not
   * necessarily identical to `answer`'s own `tombstones` field (present
   * only on `unknown`): a `"believed"` answer following a supersede
   * resolution reports the winner in `answer` and the loser's brand-new
   * tombstone HERE — the one place `BeliefAnswer`'s frozen shape has no
   * room for it. Empty whenever this call caused nothing new to be
   * forgotten.
   */
  readonly newlyForgotten: readonly Tombstone[];
}

export type BeliefQuery<TValue extends Json> = (
  candidates: ReadonlyArray<Memory<TValue>>,
  tombstones: ReadonlyArray<Tombstone>,
  now: CapturedAt,
  comparator?: ValueComparator,
) => BeliefQueryResult<TValue>;

interface FreshCandidate<TValue extends Json> {
  readonly memory: Memory<TValue>;
  readonly decay: DecayResult;
}

/** See the file header's "WHO ENFORCES THE ADR 0003 PRECONDITION" — this is that enforcement, run first, on every call. */
function partitionByDecay<TValue extends Json>(
  candidates: ReadonlyArray<Memory<TValue>>,
  now: CapturedAt,
): { readonly fresh: ReadonlyArray<FreshCandidate<TValue>>; readonly newlyForgotten: readonly Tombstone[] } {
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
): BeliefQueryResult<TValue> {
  const { fresh, newlyForgotten: decaySwept } = partitionByDecay(candidates, now);

  if (fresh.length === 0) {
    const allTombstones = decaySwept.length === 0 ? tombstones : [...tombstones, ...decaySwept];
    const answer: BeliefAnswer<TValue> =
      allTombstones.length === 0
        ? { status: "unknown", reason: "no-memory", tombstones: [] }
        : { status: "unknown", reason: "all-known-memories-tombstoned", tombstones: allTombstones };
    return { answer, newlyForgotten: decaySwept };
  }

  if (fresh.length === 1) {
    return { answer: believedOrDoubted(fresh[0] as FreshCandidate<TValue>), newlyForgotten: decaySwept };
  }

  // Two or more — see file header's "ZERO, ONE, TWO-OR-MORE" section for
  // why the two LATEST believedAt are taken, and for the full four-way
  // switch below.
  const sorted = [...fresh].sort((a, b) => Date.parse(a.memory.believedAt) - Date.parse(b.memory.believedAt));
  const newer = sorted[sorted.length - 1] as FreshCandidate<TValue>;
  const older = sorted[sorted.length - 2] as FreshCandidate<TValue>;

  const check = contradict(older.memory, newer.memory, comparator);
  switch (check.outcome) {
    case "no-conflict":
      return { answer: believedOrDoubted(newer), newlyForgotten: decaySwept };
    case "superseded": {
      // `older` lost — tombstone it right here, the same lazy-at-query-time
      // pattern `partitionByDecay` already uses for a decay-forgettable
      // candidate. See the file header's "REVISED AFTER REVIEW" section.
      const tombstoned = forget(older.memory, "contradicted", now, newer.memory.id);
      return { answer: believedOrDoubted(newer), newlyForgotten: [...decaySwept, tombstoned.tombstone] };
    }
    case "disputed":
    case "not-comparable":
      // Deliberately collapsed to the SAME BeliefAnswer variant — see the
      // file header's dedicated paragraph for why, and what is lost by
      // doing so.
      return { answer: { status: "disputed", candidates: [older.memory, newer.memory] }, newlyForgotten: decaySwept };
    default:
      return assertNeverContradictionCheck(check);
  }
}

import type { ConfidenceTier } from "../contracts/provenance.js";

/**
 * `resolveTierSplit` — the actual mechanism behind §5.1's `superseded` vs.
 * `disputed` split. CORRECTED from this milestone's first pass, which
 * compared `Memory.confidence` (the recorded `[0,1]` number) instead of
 * `Provenance.tier` directly — see `.genesis/decisions/0003-contradiction.md`,
 * Decision 6, for the full argument this file's header only summarizes, and
 * for why the first pass's reasoning was internally sound but answered the
 * wrong question.
 *
 * `ConfidenceTier` (`lib/contracts/provenance.ts`) is a closed, TWO-member
 * union — `"direct-avowal" | "derived-inference"` — and `PLAN.md`'s own M4
 * success criteria state the rule directly in terms of THESE TWO WORDS, not
 * in terms of a numeric confidence value: "two same-tier `human` avowals...
 * resolve to `superseded`... two same-tier `derived` inferences... resolve
 * to `disputed`, never an automatic winner." A two-member union has a
 * natural total order (`direct-avowal` outranks `derived-inference` — a
 * first-person statement is definitionally more authoritative about the
 * subject's own current state than an inference drawn about it), and that
 * order, not `Memory.confidence`, is what this function compares.
 *
 * THE RULE, COMPLETE, FOUR CASES:
 *
 *   1. `newer.tier` OUTRANKS `older.tier` (older was `derived-inference`,
 *      newer is `direct-avowal`) → `"superseded"`. A direct avowal arriving
 *      after a mere inference is strictly more authoritative — it should
 *      win regardless of any recorded confidence number either side
 *      happens to carry.
 *   2. SAME tier, BOTH `"direct-avowal"` → `"superseded"`. `memory-plan.md`
 *      §5.1's own worked example: a person restating a fact ("I moved — my
 *      new address is 118 Birch Avenue") supersedes their own earlier
 *      direct statement. Two first-person avowals of the same subject
 *      don't "dispute" each other — the newer one is simply what the
 *      person now says, and a direct avowal is definitionally the
 *      authoritative word on the speaker's own current state.
 *   3. SAME tier, BOTH `"derived-inference"` → `"disputed"`. §5.1's OTHER
 *      worked example: two independently-derived inferences (two separate
 *      OCR scans) disagreeing does NOT mechanically resolve — neither
 *      inference has any special claim over the other, so both stay live
 *      and a query must surface both.
 *   4. `newer.tier` is OUTRANKED BY `older.tier` (older was
 *      `direct-avowal`, newer is `derived-inference`) → `"disputed"`. This
 *      is `memory-plan.md` §5.1's own explicit non-negotiable — "a
 *      fresher-but-lower-confidence value must not auto-win" — read
 *      correctly as a TIER statement, not a confidence-number statement: a
 *      derived inference arriving after a direct avowal does not overturn
 *      it, no matter how recent the inference is or what numeric
 *      confidence it happens to carry.
 *
 * WHY CASES 2 AND 3 ARE ASYMMETRIC, ON PURPOSE, NOT AN ARBITRARY CHOICE —
 * this is the plan's own asymmetry, restated here rather than left looking
 * like a coin flip: a `direct-avowal` is a claim ABOUT ITSELF (the subject
 * stating their own current state), so a newer one is not really in
 * "dispute" with an older one at all — it is simply an update, the same
 * way a person's own restated address is never ambiguous about which
 * statement is current. A `derived-inference` is a claim ABOUT the
 * subject FROM THE OUTSIDE (parsed, computed, OCR'd) — two independent
 * inferences disagreeing is genuine evidence of uncertainty in the WORLD,
 * not merely a restatement, so nothing about being "newer" entitles one
 * inference to silently overrule the other.
 *
 * `Memory.confidence` (the recorded, immutable numeric field) plays NO
 * ROLE in this decision. This is what closes the structural weakness this
 * milestone's own build report first flagged: correctness no longer
 * depends on whoever constructs a `Memory` having assigned `confidence`
 * consistently with `source.tier` — two `direct-avowal` memories with
 * wildly different recorded confidence (`0.9` and `0.1`) still resolve to
 * `superseded`, because tier, not confidence, decides. Proven directly in
 * `__tests__/contradict.test.ts`.
 */
export type TierSplit = "superseded" | "disputed";

const TIER_RANK: Readonly<Record<ConfidenceTier, number>> = {
  "derived-inference": 0,
  "direct-avowal": 1,
};

export function resolveTierSplit(olderTier: ConfidenceTier, newerTier: ConfidenceTier): TierSplit {
  const olderRank = TIER_RANK[olderTier];
  const newerRank = TIER_RANK[newerTier];

  if (newerRank > olderRank) return "superseded"; // case 1: newer tier outranks older.
  if (newerRank < olderRank) return "disputed"; // case 4: newer tier is outranked.

  // Same tier — cases 2/3, deliberately asymmetric. See file header.
  return newerTier === "direct-avowal" ? "superseded" : "disputed";
}

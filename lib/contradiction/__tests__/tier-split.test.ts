import { describe, expect, it } from "vitest";
import { resolveTierSplit } from "../tier-split.js";
import type { ConfidenceTier } from "../../contracts/provenance.js";

/**
 * `resolveTierSplit` in isolation, independent of `contradict()`'s other
 * checks (scope, subject/predicate, `believedAt` ordering, value agreement)
 * — see `__tests__/contradict.test.ts` for the same four cases exercised
 * end-to-end through the real function, including the two PROOF tests that
 * `Memory.confidence` plays no role at all.
 */
describe("resolveTierSplit(olderTier, newerTier) — §5.1's actual mechanism, on tier alone", () => {
  const DIRECT: ConfidenceTier = "direct-avowal";
  const DERIVED: ConfidenceTier = "derived-inference";

  it("case 1: newer outranks older (derived → direct) resolves to superseded", () => {
    expect(resolveTierSplit(DERIVED, DIRECT)).toBe("superseded");
  });

  it("case 2: same tier, both direct-avowal, resolves to superseded — a restated fact supersedes the earlier one", () => {
    expect(resolveTierSplit(DIRECT, DIRECT)).toBe("superseded");
  });

  it("case 3: same tier, both derived-inference, resolves to disputed — two independent inferences disagreeing is genuine uncertainty, not a restatement", () => {
    expect(resolveTierSplit(DERIVED, DERIVED)).toBe("disputed");
  });

  it("case 4: newer is outranked by older (direct → derived) resolves to disputed — an inference never overturns a direct avowal", () => {
    expect(resolveTierSplit(DIRECT, DERIVED)).toBe("disputed");
  });

  it("is a total function over the closed 2x2 tier space — all four combinations produce a defined, closed-vocabulary answer", () => {
    const tiers: readonly ConfidenceTier[] = [DIRECT, DERIVED];
    for (const older of tiers) {
      for (const newer of tiers) {
        expect(["superseded", "disputed"]).toContain(resolveTierSplit(older, newer));
      }
    }
  });

  it("the two same-tier cases are asymmetric, not a copy-paste of each other — direct-avowal and derived-inference resolve oppositely at equal rank", () => {
    expect(resolveTierSplit(DIRECT, DIRECT)).not.toBe(resolveTierSplit(DERIVED, DERIVED));
  });
});

import { describe, expect, it } from "vitest";
import { resolveTierSplit } from "../../../lib/contradiction/index.js";
import type { ConfidenceTier } from "../../../lib/contracts/index.js";
import { newerSourceOutranks } from "../store.js";

/**
 * WHY THIS FILE EXISTS.
 *
 * `recordFact` originally reused `lib/contradiction`'s `resolveTierSplit`
 * to judge whether an AGREEING restatement should supersede an older
 * memory. That was a real coupling defect: `resolveTierSplit` was built to
 * split DISAGREEING values, so this path depended on semantics it has no
 * business depending on — a later refinement of the disagreement half
 * would have silently changed reconfirmation behaviour.
 *
 * Decoupling was correct. But it left TWO independent orderings of the
 * same two-member `ConfidenceTier` enum: one inside
 * `lib/contradiction/tier-split.ts`, one inside this domain's `store.ts`.
 * Independent verification confirmed they were byte-identical AND that no
 * test would catch them drifting — agreement held only because nobody had
 * edited either table.
 *
 * WHAT THIS PINS, PRECISELY. Neither `TIER_RANK` is exported, so this
 * cannot compare the tables directly. It compares BEHAVIOUR over the
 * entire closed 2×2 space instead, which is stronger than comparing two
 * literals: it would survive either module changing HOW it ranks, and
 * fail only if they disagree about the ORDER.
 *
 * WHAT IT DOES NOT PIN. It cannot detect the two modules agreeing on a
 * ranking that is jointly wrong. That is what ADR 0003's and ADR 0005's
 * worked cases are for, and neither this test nor any other can replace
 * reading them.
 */
const TIERS: readonly ConfidenceTier[] = ["derived-inference", "direct-avowal"];

describe("the domain's tier ranking agrees with lib/contradiction's", () => {
  it("strict outranking always implies `superseded`, across the whole 2x2 space", () => {
    for (const older of TIERS) {
      for (const newer of TIERS) {
        if (newerSourceOutranks(older, newer)) {
          expect(
            resolveTierSplit(older, newer),
            `the domain says ${newer} outranks ${older}, so lib/contradiction must resolve that pair as "superseded"`,
          ).toBe("superseded");
        }
      }
    }
  });

  it("`disputed` is never returned for a pair the domain considers strictly outranking", () => {
    // The contrapositive of the above, stated separately so a failure
    // message points at the right half of the invariant.
    for (const older of TIERS) {
      for (const newer of TIERS) {
        if (resolveTierSplit(older, newer) === "disputed") {
          expect(
            newerSourceOutranks(older, newer),
            `lib/contradiction disputes (${older} -> ${newer}), so the domain must not consider ${newer} to outrank ${older}`,
          ).toBe(false);
        }
      }
    }
  });

  it("the two same-tier cases are asymmetric, and both modules see that identically", () => {
    // This is the pair most likely to drift, because it is the one the
    // plan's own worked contrast makes deliberately asymmetric: two
    // direct avowals supersede, two derived inferences dispute.
    expect(newerSourceOutranks("direct-avowal", "direct-avowal")).toBe(false);
    expect(newerSourceOutranks("derived-inference", "derived-inference")).toBe(false);
    expect(resolveTierSplit("direct-avowal", "direct-avowal")).toBe("superseded");
    expect(resolveTierSplit("derived-inference", "derived-inference")).toBe("disputed");
  });

  it("would fail if either ordering flipped — proven by inverting the domain's answer", () => {
    // A guard that cannot fail is not a guard. This asserts the invariant
    // is falsifiable: inverting the domain's verdict for the one strictly
    // ordered pair breaks the implication the first test relies on.
    const inverted = (o: ConfidenceTier, n: ConfidenceTier) => !newerSourceOutranks(o, n);
    expect(inverted("derived-inference", "direct-avowal")).toBe(false);
    expect(resolveTierSplit("derived-inference", "direct-avowal")).toBe("superseded");
  });
});

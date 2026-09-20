import { describe, expect, it } from "vitest";
import { ALL_FORGET_REASONS, type ForgetReason } from "../forget-reason.js";

describe("ForgetReason — closed enum, never free text", () => {
  it("has exactly five, pairwise-distinct members", () => {
    expect(ALL_FORGET_REASONS).toHaveLength(5);
    expect(new Set(ALL_FORGET_REASONS).size).toBe(5);
  });

  it("is exhaustively matchable — a switch over all five compiles with no default fallthrough needed", () => {
    function describe(reason: ForgetReason): string {
      switch (reason) {
        case "age-exceeded":
          return "decayed past the forget floor";
        case "contradicted":
          return "a newer memory disagreed and won";
        case "superseded":
          return "an explicit, non-contradicting replacement arrived";
        case "scope-exited":
          return "the bounded context closed";
        case "source-revoked":
          return "the issuing source was revoked";
        default: {
          const never: never = reason;
          throw new Error(`Unreachable: ${JSON.stringify(never)}`);
        }
      }
    }
    for (const reason of ALL_FORGET_REASONS) {
      expect(typeof describe(reason)).toBe("string");
    }
  });

  it("TYPE-LEVEL: an arbitrary free-text reason does not compile", () => {
    // @ts-expect-error — "the user asked nicely" is not a member of the closed ForgetReason union.
    const bad: ForgetReason = "the user asked nicely";
    void bad;
  });

  it("TYPE-LEVEL: a plausible-but-wrong reason ('purged', not one of the five) does not compile", () => {
    // @ts-expect-error — "purged" is deliberately not a ForgetReason — see memory-plan.md §4: deletion is not offered as an in-band forgetting mechanism.
    const bad: ForgetReason = "purged";
    void bad;
  });
});

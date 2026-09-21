import { describe, expect, it } from "vitest";
import type { DecayPolicy } from "../decay-policy.js";
import type { Milliseconds } from "../captured-at.js";
import type { Confidence } from "../confidence.js";

describe("DecayPolicy", () => {
  it("half-life is constructible with all its required fields", () => {
    const policy: DecayPolicy = {
      kind: "half-life",
      halfLifeMs: (30 * 24 * 60 * 60 * 1000) as Milliseconds,
      doubtedThreshold: 0.5 as Confidence,
      forgetFloor: 0.1 as Confidence,
    };
    expect(policy.kind).toBe("half-life");
  });

  it("never-decays is constructible with no decay parameters at all", () => {
    const policy: DecayPolicy = { kind: "never-decays" };
    expect(policy.kind).toBe("never-decays");
  });

  it("TYPE-LEVEL: half-life missing forgetFloor does not compile", () => {
    // @ts-expect-error — half-life requires forgetFloor; this object omits it.
    const bad: DecayPolicy = {
      kind: "half-life",
      halfLifeMs: 1000 as Milliseconds,
      doubtedThreshold: 0.5 as Confidence,
    };
    void bad;
  });

  it("TYPE-LEVEL: never-decays rejects a decay parameter that belongs to the other branch", () => {
    // @ts-expect-error — never-decays has no halfLifeMs field; this is excess for that branch.
    const bad: DecayPolicy = { kind: "never-decays", halfLifeMs: 1000 as Milliseconds };
    void bad;
  });

  it("TYPE-LEVEL: halfLifeMs must be a Milliseconds, not a bare number — a raw literal does not compile", () => {
    const bad: DecayPolicy = {
      kind: "half-life",
      // @ts-expect-error — halfLifeMs is branded Milliseconds; a bare number literal has not passed through parseMilliseconds-shaped validation.
      halfLifeMs: 1000,
      doubtedThreshold: 0.5 as Confidence,
      forgetFloor: 0.1 as Confidence,
    };
    void bad;
  });

  it("is exhaustively matchable over exactly two kinds", () => {
    function describeKind(policy: DecayPolicy): string {
      switch (policy.kind) {
        case "half-life":
          return "decays";
        case "never-decays":
          return "static";
        default: {
          const never: never = policy;
          throw new Error(`Unreachable: ${JSON.stringify(never)}`);
        }
      }
    }
    expect(describeKind({ kind: "never-decays" })).toBe("static");
  });

  it("is plain, serializable data — no function anywhere in a constructed policy (structural sanity, not the json.ts walk, since DecayPolicy itself is not TValue-parameterized)", () => {
    const policy: DecayPolicy = { kind: "never-decays" };
    expect(JSON.parse(JSON.stringify(policy))).toEqual(policy);
  });
});

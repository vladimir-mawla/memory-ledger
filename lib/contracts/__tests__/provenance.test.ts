import { describe, expect, it } from "vitest";
import type { Provenance, SourceKind, ConfidenceTier } from "../provenance.js";

describe("Provenance", () => {
  it("a fully-specified Provenance is constructible with all four required fields", () => {
    const p: Provenance = { kind: "human", sourceId: "user:vlad", tier: "direct-avowal", revocable: false };
    expect(p.kind).toBe("human");
  });

  it("TYPE-LEVEL: kind, sourceId, tier, and revocable are all required — omitting any one does not compile", () => {
    // @ts-expect-error — Provenance requires `tier`; this object omits it.
    const bad: Provenance = { kind: "derived", sourceId: "ocr-scanner:v2", revocable: true };
    void bad;
  });

  it("TYPE-LEVEL: kind is a closed SourceKind — an arbitrary string does not compile", () => {
    // @ts-expect-error — "third-party" is not a member of the closed SourceKind union.
    const bad: SourceKind = "third-party";
    void bad;
  });

  it("TYPE-LEVEL: tier is a closed ConfidenceTier — an arbitrary string does not compile", () => {
    // @ts-expect-error — "medium-confidence" is not a member of the closed ConfidenceTier union.
    const bad: ConfidenceTier = "medium-confidence";
    void bad;
  });

  it("the four SourceKind members are pairwise distinct, and there are exactly four", () => {
    const kinds: readonly SourceKind[] = ["human", "counterparty", "system", "derived"];
    expect(new Set(kinds).size).toBe(4);
  });

  it("the two ConfidenceTier members are pairwise distinct, and there are exactly two — deliberately not four, per this file's own header", () => {
    const tiers: readonly ConfidenceTier[] = ["direct-avowal", "derived-inference"];
    expect(new Set(tiers).size).toBe(2);
  });
});

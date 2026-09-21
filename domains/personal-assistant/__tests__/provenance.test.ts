import { describe, expect, it } from "vitest";
import { derivedInference, humanAvowal } from "../provenance.js";

describe("provenance — the real tierForKind decision for this domain's two real kinds", () => {
  it("humanAvowal is always kind human, tier direct-avowal, not revocable by default", () => {
    const p = humanAvowal("user:vlad");
    expect(p).toEqual({ kind: "human", sourceId: "user:vlad", tier: "direct-avowal", revocable: false });
  });

  it("humanAvowal can be marked revocable explicitly (no real case in this corpus, but not forbidden)", () => {
    const p = humanAvowal("user:vlad", { revocable: true });
    expect(p.revocable).toBe(true);
  });

  it("derivedInference is always kind derived, tier derived-inference, revocable by default", () => {
    const p = derivedInference("integration:google-calendar");
    expect(p).toEqual({ kind: "derived", sourceId: "integration:google-calendar", tier: "derived-inference", revocable: true });
  });

  it("derivedInference can be marked non-revocable explicitly", () => {
    const p = derivedInference("integration:google-calendar", { revocable: false });
    expect(p.revocable).toBe(false);
  });
});

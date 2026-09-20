import { describe, expect, it } from "vitest";
import { parseConfidence, ZERO_CONFIDENCE, type Confidence } from "../confidence.js";

describe("parseConfidence", () => {
  it("accepts values in [0, 1]", () => {
    expect(parseConfidence(0)).toEqual({ ok: true, value: 0 });
    expect(parseConfidence(1)).toEqual({ ok: true, value: 1 });
    expect(parseConfidence(0.42)).toEqual({ ok: true, value: 0.42 });
  });

  it("rejects out-of-range values", () => {
    expect(parseConfidence(-0.01)).toEqual({ ok: false, error: { kind: "confidence-out-of-range", received: -0.01 } });
    expect(parseConfidence(1.01)).toEqual({ ok: false, error: { kind: "confidence-out-of-range", received: 1.01 } });
  });

  it("rejects non-finite values", () => {
    expect(parseConfidence(NaN)).toEqual({ ok: false, error: { kind: "confidence-not-finite", received: NaN } });
    expect(parseConfidence(Infinity)).toEqual({
      ok: false,
      error: { kind: "confidence-not-finite", received: Infinity },
    });
  });

  it("ZERO_CONFIDENCE is a valid Confidence in range", () => {
    const value: Confidence = ZERO_CONFIDENCE;
    expect(value).toBe(0);
  });

  it("TYPE-LEVEL: a raw number cannot be assigned where Confidence is expected", () => {
    // @ts-expect-error — Confidence is a branded type; a bare number literal has not passed through parseConfidence.
    const bad: Confidence = 0.5;
    void bad;
  });
});

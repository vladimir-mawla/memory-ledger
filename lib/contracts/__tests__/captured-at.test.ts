import { describe, expect, it } from "vitest";
import { ageOf, parseCapturedAt, systemNow, type CapturedAt } from "../captured-at.js";

const NOW = "2026-09-20T12:00:00.000Z" as CapturedAt;

describe("parseCapturedAt", () => {
  it("accepts a valid ISO-8601 UTC instant at or before now", () => {
    const result = parseCapturedAt("2026-09-20T11:00:00.000Z", NOW);
    expect(result).toEqual({ ok: true, value: "2026-09-20T11:00:00.000Z" });
  });

  it("accepts an instant exactly equal to now", () => {
    expect(parseCapturedAt(NOW, NOW)).toEqual({ ok: true, value: NOW });
  });

  it("rejects a non-string value", () => {
    expect(parseCapturedAt(12345, NOW)).toEqual({ ok: false, error: { kind: "not-a-string", received: 12345 } });
  });

  it("rejects a bare date with no time/offset", () => {
    expect(parseCapturedAt("2026-09-20", NOW).ok).toBe(false);
  });

  it("rejects an offset-less timestamp (locale-ambiguous)", () => {
    expect(parseCapturedAt("2026-09-20T11:00:00", NOW).ok).toBe(false);
  });

  it("rejects a shape that matches the regex but is not a real calendar instant", () => {
    expect(parseCapturedAt("2026-13-40T00:00:00Z", NOW).ok).toBe(false);
  });

  it("rejects a future-dated instant relative to the given now — the clock-skew guard", () => {
    const future = "2026-09-21T00:00:00.000Z";
    expect(parseCapturedAt(future, NOW)).toEqual({ ok: false, error: { kind: "future-dated", received: future } });
  });
});

describe("systemNow", () => {
  it("returns a value that itself parses as a valid CapturedAt against a slightly-later now", () => {
    const real = systemNow();
    const laterNow = new Date(Date.parse(real) + 1000).toISOString() as CapturedAt;
    expect(parseCapturedAt(real, laterNow).ok).toBe(true);
  });
});

describe("ageOf", () => {
  it("computes elapsed milliseconds for a capturedAt at or before now", () => {
    const earlier = "2026-09-20T11:00:00.000Z" as CapturedAt;
    expect(ageOf(earlier, NOW)).toEqual({ kind: "elapsed", ms: 60 * 60 * 1000 });
  });

  it("reports zero elapsed time, not clock-inconsistency, when capturedAt equals now", () => {
    expect(ageOf(NOW, NOW)).toEqual({ kind: "elapsed", ms: 0 });
  });

  it("reports clock-inconsistency, never a negative duration, when capturedAt is after now", () => {
    const laterThanNow = "2026-09-21T00:00:00.000Z" as CapturedAt;
    const age = ageOf(laterThanNow, NOW);
    expect(age).toEqual({ kind: "clock-inconsistency" });
    // Guard against a regression that folds this into a bare number: there
    // is no `.ms` on this branch at all, by the Age union's own shape.
    expect("ms" in age).toBe(false);
  });

  it("TYPE-LEVEL: a raw string cannot be assigned where CapturedAt is expected", () => {
    // @ts-expect-error — CapturedAt is branded; a bare string literal has not passed through parseCapturedAt.
    const bad: CapturedAt = "2026-09-20T12:00:00.000Z";
    void bad;
  });
});

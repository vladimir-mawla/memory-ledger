import { describe, expect, it } from "vitest";
import { effectiveConfidence } from "../effective-confidence.js";
import { ZERO_CONFIDENCE, type Confidence } from "../confidence.js";
import type { CapturedAt } from "../captured-at.js";
import { fixtureMemory, fixtureTombstonedMemory, FIXTURE_EARLIER, FIXTURE_NOW } from "./fixtures.js";

describe("effectiveConfidence — computed, query-facing, distinct from Memory.confidence", () => {
  it("is ZERO for any TombstonedMemory, regardless of its recorded confidence", () => {
    const dead = fixtureTombstonedMemory();
    expect(dead.confidence).not.toBe(ZERO_CONFIDENCE); // the RECORDED field is untouched...
    expect(effectiveConfidence(dead, FIXTURE_NOW)).toBe(ZERO_CONFIDENCE); // ...but the COMPUTED answer is always 0.
  });

  it("does not simply forward whatever `.confidence` happens to be on the object it was given — the tombstoned branch is keyed on `status`, not on the stored number", () => {
    // A tombstoned record whose recorded confidence is deliberately HIGH —
    // if this function ever regressed to reading `.confidence` generically
    // instead of checking `status` first, this is the test that would catch it.
    const highConfidenceButDead = fixtureTombstonedMemory({
      confidence: 0.99 as Confidence,
    });
    expect(effectiveConfidence(highConfidenceButDead, FIXTURE_NOW)).toBe(ZERO_CONFIDENCE);
  });

  it("fails closed to ZERO for a live memory whose lastAffirmedAt is AFTER the given now (clock-inconsistency) — never a fabricated high confidence", () => {
    const live = fixtureMemory<string>({ lastAffirmedAt: "2099-01-01T00:00:00.000Z" as CapturedAt });
    expect(effectiveConfidence(live, FIXTURE_NOW)).toBe(ZERO_CONFIDENCE);
  });

  it("for a live, clock-consistent memory, returns the recorded confidence UNCHANGED — permanent, structural behavior at this layer (see effective-confidence.ts's own header): the real, elapsed-time-aware answer is composed one layer up, in lib/decay's queryConfidence, which this file cannot import without creating a circular dependency", () => {
    const live = fixtureMemory<string>({ lastAffirmedAt: FIXTURE_EARLIER, confidence: 0.7 as Confidence });
    expect(effectiveConfidence(live, FIXTURE_NOW)).toBe(live.confidence);
  });

  it("PINNED, PERMANENT BEHAVIOR, ASSERTED DIRECTLY: the live branch does NOT vary with elapsed time, and never will at this layer — lib/decay/query-confidence.ts's own tests are what prove the real, composed answer DOES vary with elapsed time; this test pins the opposite fact about THIS function specifically, on purpose", () => {
    const live = fixtureMemory<string>({ lastAffirmedAt: FIXTURE_EARLIER, confidence: 0.7 as Confidence });
    const soonAfter = effectiveConfidence(live, FIXTURE_EARLIER);
    const monthsLater = effectiveConfidence(live, FIXTURE_NOW);
    expect(soonAfter).toBe(monthsLater); // no decay applied at this layer — true permanently, by design, not a limitation awaiting a fix.
  });

  it("the distinction is structural, not just a naming convention: effectiveConfidence's parameter type accepts BOTH Memory and TombstonedMemory, while Memory.confidence is only ever the recorded field on the live half", () => {
    const live = fixtureMemory<string>();
    const dead = fixtureTombstonedMemory();
    // Both are legal inputs to the same function — proving the function's
    // whole job is to look PAST whichever `.confidence` field is present
    // and decide the query-facing number some other way (status first).
    expect(() => effectiveConfidence(live, FIXTURE_NOW)).not.toThrow();
    expect(() => effectiveConfidence(dead, FIXTURE_NOW)).not.toThrow();
  });
});

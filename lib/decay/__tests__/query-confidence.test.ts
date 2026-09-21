import { describe, expect, it } from "vitest";
import { queryConfidence } from "../query-confidence.js";
import { effectiveConfidence } from "../../contracts/effective-confidence.js";
import { ZERO_CONFIDENCE, type Confidence } from "../../contracts/confidence.js";
import type { CapturedAt } from "../../contracts/captured-at.js";
import { fixtureMemory, fixtureTombstonedMemory, atOffsetMs, FIXTURE_BELIEVED_AT } from "./fixtures.js";

describe("queryConfidence(record, now) — the composed, query-facing answer (decay + structural zeroing, this layer only)", () => {
  describe("tombstoned: ZERO, unconditionally, never reads decay at all", () => {
    it("is ZERO for a TombstonedMemory regardless of its recorded confidence", () => {
      const dead = fixtureTombstonedMemory();
      expect(dead.confidence).not.toBe(ZERO_CONFIDENCE); // the recorded field is untouched...
      expect(queryConfidence(dead, FIXTURE_BELIEVED_AT)).toBe(ZERO_CONFIDENCE); // ...but the composed answer is always 0.
    });

    it("is ZERO even for a tombstoned record whose decayPolicy would otherwise report full confidence at zero elapsed time — status, not the curve, decides this branch", () => {
      const highConfidenceButDead = fixtureTombstonedMemory({ confidence: 0.99 as Confidence });
      expect(queryConfidence(highConfidenceButDead, FIXTURE_BELIEVED_AT)).toBe(ZERO_CONFIDENCE);
    });
  });

  describe("live: forwards decay()'s own computed confidence faithfully", () => {
    it("at zero elapsed time, matches the recorded confidence (same boundary decay() itself proves)", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      expect(queryConfidence(memory, FIXTURE_BELIEVED_AT)).toBe(0.8);
    });

    it("A REAL DECAYING-POLICY CASE, COMPOSED END TO END: confidence at the exact doubted-threshold tick (1000ms, per fixtures.ts's half-life policy) is 0.4, and at the exact forget-floor tick (2000ms) is 0.2 — the same numbers decay.test.ts proves for decay() itself, now proven through the composed function a real caller would actually use", () => {
      const memory = fixtureMemory();
      expect(queryConfidence(memory, atOffsetMs(1000))).toBe(0.4);
      expect(queryConfidence(memory, atOffsetMs(2000))).toBe(0.2);
    });

    it("never produces a confidence higher than the recorded one, at any elapsed time", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      for (const offset of [0, 500, 1000, 2000, 50_000]) {
        expect(queryConfidence(memory, atOffsetMs(offset))).toBeLessThanOrEqual(0.8);
      }
    });

    it("clock-inconsistency fails closed to ZERO here too, via decay()'s own check — no duplicated logic in this file", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence, lastAffirmedAt: FIXTURE_BELIEVED_AT });
      const past = "2025-01-01T00:00:00.000Z" as CapturedAt;
      expect(queryConfidence(memory, past)).toBe(ZERO_CONFIDENCE);
    });
  });

  describe("relationship to lib/contracts's effectiveConfidence — agrees at the boundaries this milestone shares, diverges once real elapsed time matters", () => {
    it("AGREES with effectiveConfidence on every tombstoned record", () => {
      const dead = fixtureTombstonedMemory();
      expect(queryConfidence(dead, FIXTURE_BELIEVED_AT)).toBe(effectiveConfidence(dead, FIXTURE_BELIEVED_AT));
    });

    it("AGREES with effectiveConfidence at zero elapsed time on a live record", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      expect(queryConfidence(memory, FIXTURE_BELIEVED_AT)).toBe(effectiveConfidence(memory, FIXTURE_BELIEVED_AT));
    });

    it("DIVERGES once real time has passed on a decaying policy — effectiveConfidence (lib/contracts, permanently structural-only) still reports the unmodified recorded value; queryConfidence (this file) reports the real, decayed number. This is the exact split this milestone's ADR records, proven directly rather than only asserted in prose.", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      const later = atOffsetMs(1000);
      expect(effectiveConfidence(memory, later)).toBe(0.8); // unchanged — effectiveConfidence's own, permanent, documented behavior.
      expect(queryConfidence(memory, later)).toBe(0.4); // the real, composed answer.
      expect(queryConfidence(memory, later)).not.toBe(effectiveConfidence(memory, later));
    });

    it("does NOT diverge for a never-decays policy — both report the recorded value indefinitely, correctly, since there is nothing for either function to compose beyond the recorded confidence", () => {
      const memory = fixtureMemory({ decayPolicy: { kind: "never-decays" }, confidence: 0.55 as Confidence });
      const muchLater = atOffsetMs(10_000_000);
      expect(effectiveConfidence(memory, muchLater)).toBe(0.55);
      expect(queryConfidence(memory, muchLater)).toBe(0.55);
    });
  });
});

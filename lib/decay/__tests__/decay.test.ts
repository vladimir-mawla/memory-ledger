import { describe, expect, it } from "vitest";
import { decay } from "../decay.js";
import { ZERO_CONFIDENCE, type Confidence } from "../../contracts/confidence.js";
import type { CapturedAt, Milliseconds } from "../../contracts/captured-at.js";
import { fixtureMemory, fixtureDecayingPolicy, atOffsetMs, FIXTURE_BELIEVED_AT } from "./fixtures.js";

describe("decay(memory, now) — the freshness interpreter for a declared DecayPolicy", () => {
  describe("purity: same (memory, now) in, same result out, every time", () => {
    it("repeat calls with identical inputs deep-equal each other", () => {
      const memory = fixtureMemory();
      const now = atOffsetMs(500);
      const first = decay(memory, now);
      const second = decay(memory, now);
      const third = decay(memory, now);
      expect(second).toEqual(first);
      expect(third).toEqual(first);
    });

    it("does not mutate the memory it was given", () => {
      const memory = fixtureMemory();
      const before = JSON.parse(JSON.stringify(memory));
      decay(memory, atOffsetMs(1500));
      expect(JSON.parse(JSON.stringify(memory))).toEqual(before);
    });

    it("at zero elapsed time, returns the recorded confidence exactly — the same value effective-confidence.ts's own (permanently structural, see that file's header) live branch reports before any decay composition happens", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      const result = decay(memory, FIXTURE_BELIEVED_AT);
      expect(result.confidence).toBe(0.8);
      expect(result.status).toBe("believed");
    });
  });

  describe("threshold-flip: EXACT tick boundary, no EMA, no smoothing hiding the crossing", () => {
    // policy: confidence 0.8, halfLifeMs 1000, doubtedThreshold 0.4 (one
    // half-life out), forgetFloor 0.2 (two half-lives out) — see
    // fixtures.ts's own comment for why these numbers are exact under
    // IEEE754, verified directly rather than assumed.

    it("one millisecond before the doubted threshold: still believed", () => {
      const memory = fixtureMemory();
      const result = decay(memory, atOffsetMs(999));
      expect(result.confidence).toBeGreaterThan(0.4);
      expect(result.status).toBe("believed");
    });

    it("exactly at the doubted threshold (age === halfLifeMs): flips to doubted, confidence exactly 0.4", () => {
      const memory = fixtureMemory();
      const result = decay(memory, atOffsetMs(1000));
      expect(result.confidence).toBe(0.4);
      expect(result.status).toBe("doubted");
    });

    it("one millisecond before the forget floor: still doubted, not yet forgettable", () => {
      const memory = fixtureMemory();
      const result = decay(memory, atOffsetMs(1999));
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.status).toBe("doubted");
    });

    it("exactly at the forget floor (age === 2 * halfLifeMs): flips to forgettable, confidence exactly 0.2", () => {
      const memory = fixtureMemory();
      const result = decay(memory, atOffsetMs(2000));
      expect(result.confidence).toBe(0.2);
      expect(result.status).toBe("forgettable");
    });

    it("long after the forget floor: stays forgettable, confidence keeps falling but never below zero and never back above the floor", () => {
      const memory = fixtureMemory();
      const farFuture = decay(memory, atOffsetMs(50_000));
      expect(farFuture.status).toBe("forgettable");
      expect(farFuture.confidence).toBeGreaterThanOrEqual(0);
      expect(farFuture.confidence).toBeLessThanOrEqual(0.2);
      // Monotonically non-increasing: further still is never higher.
      const evenLater = decay(memory, atOffsetMs(100_000));
      expect(evenLater.confidence).toBeLessThanOrEqual(farFuture.confidence);
    });

    it("never produces a confidence higher than the recorded one, at any elapsed time, including zero", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence });
      for (const offset of [0, 1, 500, 999, 1000, 1500, 2000, 10_000]) {
        expect(decay(memory, atOffsetMs(offset)).confidence).toBeLessThanOrEqual(0.8);
      }
    });
  });

  describe("clock-inconsistency fails closed", () => {
    it("a `now` earlier than lastAffirmedAt never produces a confidence higher than the recorded one — fails closed to ZERO_CONFIDENCE, 'most doubted', never a fabricated confidence: 1", () => {
      const memory = fixtureMemory({ confidence: 0.8 as Confidence, lastAffirmedAt: FIXTURE_BELIEVED_AT });
      const past = "2025-01-01T00:00:00.000Z" as CapturedAt; // before FIXTURE_BELIEVED_AT
      const result = decay(memory, past);
      expect(result.confidence).toBe(ZERO_CONFIDENCE);
      expect(result.confidence).toBeLessThanOrEqual(memory.confidence);
      expect(result.status).toBe("doubted");
    });

    it("a `now` earlier than believedAt (and therefore also earlier than lastAffirmedAt, since lastAffirmedAt >= believedAt) is caught by the same check", () => {
      const memory = fixtureMemory({
        believedAt: "2026-01-01T00:00:00.000Z" as CapturedAt,
        lastAffirmedAt: "2026-03-01T00:00:00.000Z" as CapturedAt,
      });
      const beforeBelievedAt = "2025-12-01T00:00:00.000Z" as CapturedAt;
      expect(decay(memory, beforeBelievedAt).confidence).toBe(ZERO_CONFIDENCE);
    });

    it("fails closed the same way regardless of decayPolicy — a never-decays memory with a broken clock is still ZERO_CONFIDENCE, not silently exempted", () => {
      const memory = fixtureMemory({ decayPolicy: { kind: "never-decays" } });
      const past = "2025-01-01T00:00:00.000Z" as CapturedAt;
      expect(decay(memory, past)).toEqual({ confidence: ZERO_CONFIDENCE, status: "doubted" });
    });

    it("does NOT overtighten: `now` exactly equal to lastAffirmedAt is consistent, not flagged", () => {
      const memory = fixtureMemory();
      const result = decay(memory, FIXTURE_BELIEVED_AT);
      expect(result.confidence).toBe(memory.confidence);
      expect(result.status).toBe("believed");
    });
  });

  describe("never-decays: opts out of age-based forgetting, not out of forgetting altogether", () => {
    it("confidence stays at the recorded value indefinitely, regardless of elapsed time", () => {
      const memory = fixtureMemory({ decayPolicy: { kind: "never-decays" }, confidence: 0.55 as Confidence });
      const soon = decay(memory, atOffsetMs(1));
      const muchLater = decay(memory, atOffsetMs(10_000_000));
      expect(soon).toEqual({ confidence: 0.55, status: "believed" });
      expect(muchLater).toEqual({ confidence: 0.55, status: "believed" });
    });

    it("never reports 'doubted' or 'forgettable' from elapsed time alone — this function has no other mechanism to change a never-decays memory's status", () => {
      const memory = fixtureMemory({ decayPolicy: { kind: "never-decays" } });
      for (const offset of [0, 1000, 1_000_000, 1_000_000_000]) {
        expect(decay(memory, atOffsetMs(offset)).status).toBe("believed");
      }
    });
  });

  describe("policy is interpreted as declared DATA, not special-cased per memory", () => {
    it("two memories with identical fields but a differently-configured half-life policy decay differently — proving the policy, not a hardcoded curve, drives the result", () => {
      const slow = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: 10_000 as Milliseconds }) });
      const fast = fixtureMemory({ decayPolicy: fixtureDecayingPolicy() }); // halfLifeMs 1000
      const at = atOffsetMs(1000);
      expect(decay(fast, at).confidence).toBeLessThan(decay(slow, at).confidence);
    });
  });

  describe("malformed policy fails closed — EXPLICITLY VALIDATED, not merely survived by accidental arithmetic", () => {
    it("halfLifeMs: 0 at elapsed = 0 — the exact case this milestone's own build report named as its weakest point — is neither a crash nor a fabricated 'freshly believed', but ZERO_CONFIDENCE/'forgettable'", () => {
      const memory = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: 0 as Milliseconds }) });
      expect(() => decay(memory, FIXTURE_BELIEVED_AT)).not.toThrow();
      expect(decay(memory, FIXTURE_BELIEVED_AT)).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
    });

    it("a negative halfLifeMs is rejected the same way, at any elapsed time", () => {
      const memory = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: -1000 as Milliseconds }) });
      expect(decay(memory, atOffsetMs(500))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
    });

    it("a non-finite halfLifeMs (Infinity/NaN, reachable only via a defeating cast — exercised here deliberately) is rejected the same way", () => {
      const infinite = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: Infinity as Milliseconds }) });
      const notANumber = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: NaN as Milliseconds }) });
      expect(decay(infinite, atOffsetMs(500))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
      expect(decay(notANumber, atOffsetMs(500))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
    });

    it("forgetFloor > doubtedThreshold (an internally inconsistent policy) is rejected outright, never silently reinterpreted by field order", () => {
      const memory = fixtureMemory({
        decayPolicy: fixtureDecayingPolicy({ doubtedThreshold: 0.2 as Confidence, forgetFloor: 0.4 as Confidence }),
      });
      expect(decay(memory, atOffsetMs(500))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
    });

    it("the malformed-policy verdict is stricter than clock-inconsistency's — ZERO_CONFIDENCE/'forgettable', not ZERO_CONFIDENCE/'doubted' — because a broken policy misconfigures every future call, not just this one", () => {
      const memory = fixtureMemory({ decayPolicy: fixtureDecayingPolicy({ halfLifeMs: 0 as Milliseconds }) });
      const result = decay(memory, FIXTURE_BELIEVED_AT);
      expect(result.status).toBe("forgettable");
      expect(result.status).not.toBe("doubted");
    });

    it("does NOT overtighten: a well-formed half-life policy with forgetFloor === doubtedThreshold (equal, not exceeding) is still valid", () => {
      const memory = fixtureMemory({
        decayPolicy: fixtureDecayingPolicy({ doubtedThreshold: 0.3 as Confidence, forgetFloor: 0.3 as Confidence }),
      });
      expect(() => decay(memory, atOffsetMs(500))).not.toThrow();
      expect(decay(memory, atOffsetMs(0)).status).toBe("believed"); // at zero elapsed, confidence is still the recorded 0.8, well above 0.3
    });

    it("a forgetFloor at the maximum (1) is rejected — it would make every memory forgettable from the instant it is created", () => {
      // Found by independent verification, by probe rather than by reading:
      // { forgetFloor: 1, doubtedThreshold: 1 } passed every earlier check
      // (the floor does not EXCEED the threshold) and produced a freshly
      // affirmed memory reporting "forgettable" at elapsed = 0, while its
      // confidence sat correctly at the recorded value.
      //
      // It never crashed, never produced NaN, and never broke the
      // never-exceeds-recorded invariant — which is why it was reported as
      // a caller-configuration footgun rather than a maths defect. It is
      // rejected anyway: `Confidence` is capped at 1, so a floor at 1 means
      // EVERY answer is "forgettable" no matter the half-life or the
      // elapsed time, and a policy whose every answer is the same answer
      // has defeated the curve it configures.
      const memory = fixtureMemory({
        decayPolicy: fixtureDecayingPolicy({ doubtedThreshold: 1 as Confidence, forgetFloor: 1 as Confidence }),
      });
      expect(decay(memory, atOffsetMs(0))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
      // And the reason is the new one, not a pre-existing check misfiring:
      // forgetFloor (1) does not exceed doubtedThreshold (1), so the
      // exceeds-threshold rule cannot be what caught this.
      expect(decay(memory, atOffsetMs(999_999))).toEqual({ confidence: ZERO_CONFIDENCE, status: "forgettable" });
    });

    it("does NOT overtighten: a forgetFloor just below the maximum is valid, and still classifies a fresh memory normally", () => {
      // The rejection above is scoped to >= 1, not to "high". A floor of
      // 0.95 with a recorded confidence of 0.99 is a coherent, aggressive
      // policy and must still work.
      const memory = fixtureMemory({
        confidence: 0.99 as Confidence,
        decayPolicy: fixtureDecayingPolicy({ doubtedThreshold: 0.97 as Confidence, forgetFloor: 0.95 as Confidence }),
      });
      const result = decay(memory, atOffsetMs(0));
      expect(result.confidence).toBe(0.99);
      expect(result.status).toBe("believed");
    });

    it("does NOT overtighten: the ordinary fixture policy used throughout this file is valid and produces normal, non-degenerate results", () => {
      const memory = fixtureMemory();
      const result = decay(memory, atOffsetMs(500));
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.status).toBe("believed");
    });
  });
});

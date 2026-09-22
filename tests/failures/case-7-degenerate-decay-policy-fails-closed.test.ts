import { describe, expect, it } from "vitest";
import type { Confidence } from "../../lib/contracts/confidence.js";
import type { Milliseconds } from "../../lib/contracts/captured-at.js";
import type { DecayPolicy } from "../../lib/contracts/decay-policy.js";
import { decay } from "../../lib/decay/decay.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { record, T0 } from "./fixtures.js";

/**
 * M7 CASE 7 — "A degenerate decay policy fails closed — `forgetFloor >= 1`
 * makes every memory forgettable from creation; M3 rejects it."
 * `lib/decay/decay.ts`'s own `validateHalfLifePolicy`: a `forgetFloor` at
 * or above `1` "defeats the curve entirely: `Confidence` is capped at 1,
 * so EVERY memory classifies `'forgettable'` from the instant it is
 * created, at elapsed = 0" — found by probe during M3's own build, not a
 * hypothetical.
 *
 * FULL PIN, TWO LAYERS: (a) `decay()` itself, directly, at the exact
 * boundary (`forgetFloor: 1`, and — for completeness against a caller who
 * passes something even more obviously broken — `forgetFloor: 1.5`); (b)
 * end to end through the real domain, proving this is not merely a unit
 * fact about `decay()` in isolation: a memory recorded with this policy is
 * unqueryable as `"believed"` from the very first query, at elapsed time
 * zero, at the HIGHEST confidence this test constructs it with. This is
 * the regression guard M7's own brief asks for — "so a future corpus edit
 * that quietly makes the contrast vanish fails loudly" restated for decay
 * policy: if `validateHalfLifePolicy`'s own `>= 1` check were ever
 * accidentally loosened to `> 1`, this file's `forgetFloor: 1` case would
 * start reporting `"believed"` and fail loudly, here, not silently.
 */

const DEGENERATE_POLICY: DecayPolicy = {
  kind: "half-life",
  halfLifeMs: 3_600_000 as Milliseconds,
  doubtedThreshold: 1 as Confidence,
  forgetFloor: 1 as Confidence,
};

describe("Case 7a — decay() itself: forgetFloor >= 1 fails closed to forgettable, at elapsed = 0, regardless of recorded confidence", () => {
  it("forgetFloor exactly 1: forgettable immediately, confidence reported as zero, not the recorded 0.9", () => {
    const memory = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.9, T0, { decayPolicy: DEGENERATE_POLICY }).written;
    const result = decay(memory, T0); // elapsed = 0 -- the freshest possible moment.
    expect(result.status).toBe("forgettable");
    expect(result.confidence).toBe(0);
  });

  it("forgetFloor above 1 (1.5) — an even more obviously broken policy — also fails closed the same way, not merely the exact boundary", () => {
    const overFloorPolicy: DecayPolicy = { kind: "half-life", halfLifeMs: 3_600_000 as Milliseconds, doubtedThreshold: 1 as Confidence, forgetFloor: 1.5 as Confidence };
    const memory = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.99, T0, { decayPolicy: overFloorPolicy }).written;
    expect(decay(memory, T0).status).toBe("forgettable");
  });

  it("sanity: forgetFloor just BELOW 1 (0.999999) is accepted as a legitimate (if extreme) policy, not swept up by an overtightened check -- confirms the boundary is exactly >= 1, not a broader rejection of \"very high floors\"", () => {
    const legitExtremePolicy: DecayPolicy = { kind: "half-life", halfLifeMs: 3_600_000 as Milliseconds, doubtedThreshold: 0.9999995 as Confidence, forgetFloor: 0.999999 as Confidence };
    const memory = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.9999999, T0, { decayPolicy: legitExtremePolicy }).written;
    expect(decay(memory, T0).status).toBe("believed"); // 0.9999999 > forgetFloor 0.999999 -- barely, but legitimately, still believed at elapsed zero.
  });
});

describe("Case 7b — end to end through the real domain: a memory recorded under this policy is never queryable as believed, from its very first query", () => {
  it("query() at the exact moment of recording (elapsed = 0), highest confidence in this file: unknown, not believed", () => {
    const state = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.99, T0, { decayPolicy: DEGENERATE_POLICY }).state;
    const { result } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, T0);
    expect(result.answer.status).toBe("unknown");
    expect(result.answer.status === "unknown" && result.answer.reason).toBe("all-known-memories-tombstoned");
    expect(result.newlyForgotten).toHaveLength(1);
    expect(result.newlyForgotten[0]?.reason).toBe("age-exceeded");
  });
});

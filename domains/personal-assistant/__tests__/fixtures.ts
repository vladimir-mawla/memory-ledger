import type { CapturedAt, Milliseconds } from "../../../lib/contracts/captured-at.js";
import type { Confidence } from "../../../lib/contracts/confidence.js";
import type { DecayPolicy } from "../../../lib/contracts/decay-policy.js";

/**
 * Shared, minimal fixtures for `domains/personal-assistant/__tests__/**` —
 * mirrors `lib/store/__tests__/fixtures.ts`'s own convention (a plain
 * cast for branded test literals; not exported from the domain's own
 * public barrel, `index.ts`).
 */

export const T0 = "2026-01-01T00:00:00.000Z" as CapturedAt;

export function afterMs(base: CapturedAt, ms: number): CapturedAt {
  return new Date(Date.parse(base) + ms).toISOString() as CapturedAt;
}

export const ONE_DAY_MS = 86_400_000;

export const SHORT_HALF_LIFE_POLICY: DecayPolicy = {
  kind: "half-life",
  halfLifeMs: ONE_DAY_MS as Milliseconds,
  doubtedThreshold: 0.5 as Confidence,
  forgetFloor: 0.1 as Confidence,
};

import type { Memory } from "../memory.js";
import type { TombstonedMemory } from "../tombstoned-memory.js";
import type { Tombstone } from "../tombstone.js";
import { memoryId } from "../memory-id.js";
import { tombstoneId } from "../tombstone-id.js";
import type { CapturedAt } from "../captured-at.js";
import type { Provenance } from "../provenance.js";
import type { Json } from "../json.js";

/**
 * Shared, minimal fixtures for `lib/contracts/__tests__/**`. Not exported
 * from the public barrel (`index.ts`) — test-only, mirroring
 * decision-engine's own `__tests__/fixtures.ts` convention.
 */

export const FIXTURE_NOW = "2026-09-20T12:00:00.000Z" as CapturedAt;
export const FIXTURE_EARLIER = "2026-06-01T00:00:00.000Z" as CapturedAt;

export function fixtureProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    kind: "human",
    sourceId: "user:vlad",
    tier: "direct-avowal",
    revocable: false,
    ...overrides,
  };
}

export function fixtureMemory<TValue = string>(overrides: Partial<Memory<TValue & Json>> = {}): Memory<TValue & Json> {
  return {
    id: memoryId("mem-1"),
    subject: "user:vlad.shipping-address",
    predicate: "shipping-address",
    value: "42 Elm Street, Portland" as TValue & Json,
    source: fixtureProvenance(),
    believedAt: FIXTURE_EARLIER,
    lastAffirmedAt: FIXTURE_EARLIER,
    confidence: 0.9 as Memory<TValue & Json>["confidence"],
    decayPolicy: { kind: "never-decays" },
    scope: [{ dimension: "user", value: "vlad" }],
    status: "believed",
    ...overrides,
  };
}

export function fixtureTombstone(overrides: Partial<Tombstone> = {}): Tombstone {
  return {
    id: tombstoneId("tomb-1"),
    memoryId: memoryId("mem-1"),
    reason: "superseded",
    forgottenAt: FIXTURE_NOW,
    supersededBy: memoryId("mem-2"),
    ...overrides,
  } as Tombstone;
}

export function fixtureTombstonedMemory(
  overrides: Partial<TombstonedMemory<string>> = {},
): TombstonedMemory<string> {
  const { status: _status, ...liveFields } = fixtureMemory<string>();
  return {
    ...liveFields,
    status: "tombstoned",
    tombstone: fixtureTombstone(),
    ...overrides,
  };
}

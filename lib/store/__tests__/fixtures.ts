import type { Memory } from "../../contracts/memory.js";
import type { Provenance } from "../../contracts/provenance.js";
import type { Scope } from "../../contracts/scope.js";
import type { CapturedAt, Milliseconds } from "../../contracts/captured-at.js";
import type { DecayPolicy } from "../../contracts/decay-policy.js";
import type { Confidence } from "../../contracts/confidence.js";
import type { Json } from "../../contracts/json.js";
import type { UncausedTombstone } from "../../contracts/tombstone.js";
import type { TombstonedMemory } from "../../contracts/tombstoned-memory.js";
import { memoryId } from "../../contracts/memory-id.js";
import { tombstoneId } from "../../contracts/tombstone-id.js";

/**
 * Shared, minimal fixtures for `lib/store/__tests__/**` — independently
 * authored for this directory, same "no shared test-fixture package"
 * discipline `lib/contradiction/__tests__/fixtures.ts`'s own header
 * documents (`memory-plan.md` §1).
 *
 * `HALF_LIFE_POLICY`'s three numbers are chosen so the exponential curve
 * (`lib/decay/decay.ts`: `confidence(t) = recorded * 0.5^(t/halfLifeMs)`)
 * crosses both configured thresholds at EXACT, round millisecond offsets —
 * no floating-point-adjacent boundary test needed. With `recorded = 0.8`:
 *   - t = 0            → confidence 0.8   → "believed"
 *   - t = 1×halfLifeMs → confidence 0.4   → exactly `doubtedThreshold`  → "doubted"
 *   - t = 3×halfLifeMs → confidence 0.1   → exactly `forgetFloor`      → "forgettable"
 * (0.8 × 0.5¹ = 0.4; 0.8 × 0.5³ = 0.8 × 0.125 = 0.1.)
 */
export const FIXTURE_BELIEVED_AT = "2026-01-01T00:00:00.000Z" as CapturedAt;
export const HALF_LIFE_MS = 3_600_000 as Milliseconds; // one hour

export const HALF_LIFE_POLICY: DecayPolicy = {
  kind: "half-life",
  halfLifeMs: HALF_LIFE_MS,
  doubtedThreshold: 0.4 as Confidence,
  forgetFloor: 0.1 as Confidence,
};

export const DEFAULT_SCOPE: Scope = [{ dimension: "user", value: "vlad" }];

/** `believedAt` plus `hours` hours, still a valid `CapturedAt` (ISO-8601, UTC). */
export function afterHours(hours: number): CapturedAt {
  const ms = Date.parse(FIXTURE_BELIEVED_AT) + hours * HALF_LIFE_MS;
  return new Date(ms).toISOString() as CapturedAt;
}

export function humanProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    kind: "human",
    sourceId: "user:vlad",
    tier: "direct-avowal",
    revocable: false,
    ...overrides,
  };
}

export function derivedProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    kind: "derived",
    sourceId: "ocr-scanner:v2",
    tier: "derived-inference",
    revocable: true,
    ...overrides,
  };
}

let memoryCounter = 0;

/** A fresh `MemoryId` each call, so tests building several memories at once never accidentally collide on "mem-1". */
export function freshMemoryId(): Memory<Json>["id"] {
  memoryCounter += 1;
  return memoryId(`mem-${memoryCounter}`);
}

export function fixtureMemory<TValue extends Json = string>(overrides: Partial<Memory<TValue>> = {}): Memory<TValue> {
  return {
    id: freshMemoryId(),
    subject: "user:vlad.shipping-address",
    predicate: "shipping-address",
    value: "42 Elm Street, Portland" as unknown as TValue,
    source: humanProvenance(),
    believedAt: FIXTURE_BELIEVED_AT,
    lastAffirmedAt: FIXTURE_BELIEVED_AT,
    confidence: 0.8 as Memory<TValue>["confidence"],
    decayPolicy: HALF_LIFE_POLICY,
    scope: DEFAULT_SCOPE,
    status: "believed",
    ...overrides,
  };
}

/** A standalone `Tombstone`, for tests that need a caller-supplied tombstone log entry without going through `forget()` itself (e.g. proving `queryBelief`'s `"all-known-memories-tombstoned"` reporting of a PRE-EXISTING tombstone, as distinct from one it synthesizes lazily). */
export function fixtureTombstone(overrides: Partial<UncausedTombstone> = {}): UncausedTombstone {
  return {
    id: tombstoneId("tomb-1"),
    memoryId: memoryId("mem-already-gone"),
    reason: "age-exceeded",
    forgottenAt: FIXTURE_BELIEVED_AT,
    ...overrides,
  };
}

/** A `TombstonedMemory` — same live fields as `fixtureMemory()`, plus a real `Tombstone`. For tests proving the compile-time refusal only; never a value `forget()` itself is expected to construct this way (that is `forget()`'s own job, tested in `forget.test.ts`). */
export function fixtureTombstonedMemory<TValue extends Json = string>(
  overrides: Partial<TombstonedMemory<TValue>> = {},
): TombstonedMemory<TValue> {
  const { status: _status, ...liveFields } = fixtureMemory<TValue>();
  return {
    ...liveFields,
    status: "tombstoned",
    tombstone: fixtureTombstone({ memoryId: liveFields.id }),
    ...overrides,
  };
}

/**
 * Recursively `Object.freeze`s a value — same helper, same reasoning, as
 * `lib/contradiction/__tests__/fixtures.ts`'s `deepFreeze` (re-authored
 * here rather than imported cross-directory, per this project's own "no
 * shared test-fixture package" discipline).
 */
export function deepFreeze<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  if (Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const key of Object.getOwnPropertyNames(value)) {
    deepFreeze((value as Record<string, unknown>)[key]);
  }
  return value;
}

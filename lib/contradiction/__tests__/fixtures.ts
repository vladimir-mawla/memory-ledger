import type { Memory } from "../../contracts/memory.js";
import type { Provenance } from "../../contracts/provenance.js";
import type { Scope } from "../../contracts/scope.js";
import type { CapturedAt } from "../../contracts/captured-at.js";
import type { Json } from "../../contracts/json.js";
import { memoryId } from "../../contracts/memory-id.js";

/**
 * Shared, minimal fixtures for `lib/contradiction/__tests__/**` —
 * independently authored for this directory, not imported from
 * `lib/contracts/__tests__/fixtures.ts` (that file is test-only and not
 * part of the frozen `lib/contracts/**` public barrel, so nothing outside
 * that directory is meant to reach into it — same "no shared test-fixture
 * package" discipline `memory-plan.md` §1 applies to production code).
 */

export const FIXTURE_BELIEVED_AT = "2026-03-01T00:00:00.000Z" as CapturedAt;
export const FIXTURE_LATER = "2026-08-15T00:00:00.000Z" as CapturedAt;
export const FIXTURE_MUCH_LATER = "2026-09-01T00:00:00.000Z" as CapturedAt;

export const DEFAULT_SCOPE: Scope = [{ dimension: "user", value: "vlad" }];

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
    revocable: false,
    ...overrides,
  };
}

export function fixtureMemory<TValue extends Json = string>(overrides: Partial<Memory<TValue>> = {}): Memory<TValue> {
  return {
    id: memoryId("mem-older"),
    subject: "user:vlad.shipping-address",
    predicate: "shipping-address",
    value: "42 Elm Street, Portland" as unknown as TValue,
    source: humanProvenance(),
    believedAt: FIXTURE_BELIEVED_AT,
    lastAffirmedAt: FIXTURE_BELIEVED_AT,
    confidence: 0.9 as Memory<TValue>["confidence"],
    decayPolicy: { kind: "never-decays" },
    scope: DEFAULT_SCOPE,
    status: "believed",
    ...overrides,
  };
}

/**
 * Recursively `Object.freeze`s a value (and every nested object/array
 * reachable from it) — the fixture behind `__tests__/immutability.test.ts`'s
 * proof that `contradict()` cannot mutate its inputs even if it tried. A
 * bare `Object.freeze` is shallow (`Memory.source`, `.scope`, `.decayPolicy`
 * would all stay mutable one level down) — this walks every own enumerable
 * property of every plain object/array it finds. Safe to call on a `Memory`
 * specifically because `Memory.value` is constrained to `Json` (no
 * function, no class instance with internal state a deep-freeze could
 * break) — see `lib/contracts/json.ts`.
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

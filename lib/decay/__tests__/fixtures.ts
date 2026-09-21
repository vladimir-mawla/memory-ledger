import type { Memory } from "../../contracts/memory.js";
import type { TombstonedMemory } from "../../contracts/tombstoned-memory.js";
import type { Tombstone } from "../../contracts/tombstone.js";
import type { Provenance } from "../../contracts/provenance.js";
import type { CapturedAt, Milliseconds } from "../../contracts/captured-at.js";
import type { Confidence } from "../../contracts/confidence.js";
import type { DecayPolicy } from "../../contracts/decay-policy.js";
import { memoryId } from "../../contracts/memory-id.js";
import { tombstoneId } from "../../contracts/tombstone-id.js";
import type { Json } from "../../contracts/json.js";

/**
 * Local, minimal fixtures for `lib/decay/__tests__/**` — deliberately NOT
 * shared with `lib/contracts/__tests__/fixtures.ts`. Two independent
 * reasons, not one: (1) that file lives under a FROZEN directory and is
 * not exported from `lib/contracts`'s public barrel (`index.ts`) — it is
 * that milestone's own test-only seam, not a cross-milestone dependency
 * anyone is meant to import; (2) its `fixtureMemory` defaults
 * `decayPolicy` to `{ kind: "never-decays" }` (see
 * `.genesis/decisions/0002-decay.md` for why that default matters to this
 * milestone's own findings) — this file needs a DECAYING default instead,
 * since decay behavior is the entire point of every test that reads it.
 */

export const FIXTURE_BELIEVED_AT = "2026-01-01T00:00:00.000Z" as CapturedAt;

function fixtureProvenance(overrides: Partial<Provenance> = {}): Provenance {
  return {
    kind: "human",
    sourceId: "user:vlad",
    tier: "direct-avowal",
    revocable: false,
    ...overrides,
  };
}

/** A `half-life` policy with round, exact-at-the-tick numbers: confidence halves every 1000ms, `doubtedThreshold` sits exactly one half-life out, `forgetFloor` exactly two half-lives out — see `decay.test.ts`'s threshold-flip tests for why these particular numbers were chosen (verified exact under IEEE754, not merely "close enough"). */
export function fixtureDecayingPolicy(overrides: Partial<Extract<DecayPolicy, { kind: "half-life" }>> = {}): DecayPolicy {
  return {
    kind: "half-life",
    halfLifeMs: 1000 as Milliseconds,
    doubtedThreshold: 0.4 as Confidence,
    forgetFloor: 0.2 as Confidence,
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
    believedAt: FIXTURE_BELIEVED_AT,
    lastAffirmedAt: FIXTURE_BELIEVED_AT,
    confidence: 0.8 as Confidence,
    decayPolicy: fixtureDecayingPolicy(),
    scope: [{ dimension: "user", value: "vlad" }],
    status: "believed",
    ...overrides,
  };
}

export function atOffsetMs(ms: number): CapturedAt {
  return new Date(Date.parse(FIXTURE_BELIEVED_AT) + ms).toISOString() as CapturedAt;
}

function fixtureTombstone(overrides: Partial<Tombstone> = {}): Tombstone {
  return {
    id: tombstoneId("tomb-1"),
    memoryId: memoryId("mem-1"),
    reason: "age-exceeded",
    forgottenAt: FIXTURE_BELIEVED_AT,
    ...overrides,
  } as Tombstone;
}

/** Same live fields `fixtureMemory` produces (including its decaying default policy — see this file's own header for why that default matters), plus the `Tombstone` that killed it. Used by `query-confidence.test.ts` to prove `queryConfidence` never reads a tombstoned record's confidence at all, decaying or not. */
export function fixtureTombstonedMemory(overrides: Partial<TombstonedMemory<string>> = {}): TombstonedMemory<string> {
  const { status: _status, ...liveFields } = fixtureMemory<string>();
  return {
    ...liveFields,
    status: "tombstoned",
    tombstone: fixtureTombstone(),
    ...overrides,
  };
}

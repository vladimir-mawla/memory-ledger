import { describe, expect, it } from "vitest";
import { forget } from "../forget.js";
import type { CausedTombstone } from "../../contracts/tombstone.js";
import { memoryId } from "../../contracts/memory-id.js";
import type { CapturedAt } from "../../contracts/captured-at.js";
import { ALL_FORGET_REASONS } from "../../contracts/forget-reason.js";
import { deepFreeze, fixtureMemory, FIXTURE_BELIEVED_AT } from "./fixtures.js";

const FORGOTTEN_AT = "2026-03-01T00:00:00.000Z" as CapturedAt;

/**
 * `memory-plan.md` §4/PLAN.md's M5 row: "every `ForgetReason` variant is
 * proven to actually tombstone something (five passing tests, one per
 * reason — not asserted, run)." Five `it(...)` blocks below, one per
 * reason, each constructing a real `Memory`, calling the real `forget()`,
 * and asserting on the real returned `TombstonedMemory`/`Tombstone` — not
 * five assertions bundled into one test, so a future regression in any ONE
 * reason fails exactly the test that names it.
 */
describe("forget() tombstones for real, for every ForgetReason", () => {
  it("age-exceeded — an UncausedTombstone, no supersededBy field", () => {
    const memory = fixtureMemory();
    const result = forget(memory, "age-exceeded", FORGOTTEN_AT);
    expect(result.status).toBe("tombstoned");
    expect(result.tombstone.reason).toBe("age-exceeded");
    expect(result.tombstone.memoryId).toBe(memory.id);
    expect(result.tombstone.forgottenAt).toBe(FORGOTTEN_AT);
    expect("supersededBy" in result.tombstone).toBe(false);
  });

  it("scope-exited — an UncausedTombstone, no supersededBy field", () => {
    const memory = fixtureMemory();
    const result = forget(memory, "scope-exited", FORGOTTEN_AT);
    expect(result.tombstone.reason).toBe("scope-exited");
    expect("supersededBy" in result.tombstone).toBe(false);
  });

  it("source-revoked — an UncausedTombstone, no supersededBy field", () => {
    const memory = fixtureMemory({ source: { kind: "derived", sourceId: "ocr-scanner:v2", tier: "derived-inference", revocable: true } });
    const result = forget(memory, "source-revoked", FORGOTTEN_AT);
    expect(result.tombstone.reason).toBe("source-revoked");
    expect("supersededBy" in result.tombstone).toBe(false);
  });

  it("contradicted — a CausedTombstone naming exactly which memory won", () => {
    const memory = fixtureMemory();
    const winner = memoryId("mem-winner");
    const result = forget(memory, "contradicted", FORGOTTEN_AT, winner);
    expect(result.tombstone.reason).toBe("contradicted");
    expect((result.tombstone as CausedTombstone).supersededBy).toBe(winner);
  });

  it("superseded — a CausedTombstone naming exactly which memory won", () => {
    const memory = fixtureMemory();
    const winner = memoryId("mem-winner");
    const result = forget(memory, "superseded", FORGOTTEN_AT, winner);
    expect(result.tombstone.reason).toBe("superseded");
    expect((result.tombstone as CausedTombstone).supersededBy).toBe(winner);
  });

  it("sanity: the five reasons tested above really are ALL_FORGET_REASONS, exactly — no sixth reason exists to have been silently skipped, and none of the five above was accidentally duplicated", () => {
    const reasonsTested = ["age-exceeded", "scope-exited", "source-revoked", "contradicted", "superseded"];
    expect(new Set(reasonsTested)).toEqual(new Set(ALL_FORGET_REASONS));
    expect(reasonsTested.length).toBe(ALL_FORGET_REASONS.length);
  });
});

describe("forget() preserves every other field byte-for-byte — tombstoning changes what a query may report, never the memory's own recorded content", () => {
  it("subject/predicate/value/source/timestamps/confidence/decayPolicy/scope are all carried over unchanged", () => {
    const memory = fixtureMemory({ value: "118 Birch Avenue, Seattle" });
    const result = forget(memory, "age-exceeded", FORGOTTEN_AT);
    const { status: _status, tombstone: _tombstone, ...carried } = result;
    const { status: _origStatus, ...original } = memory;
    expect(carried).toEqual(original);
  });

  it("the returned value's own status is exactly \"tombstoned\", never anything else", () => {
    const result = forget(fixtureMemory(), "scope-exited", FORGOTTEN_AT);
    expect(result.status).toBe("tombstoned");
  });
});

describe("forget() never mutates its input — proven with a deep-frozen fixture, not merely typed readonly", () => {
  it("a deep-frozen mutation attempt on the fixture itself throws — confirms the freeze is real", () => {
    const frozen = deepFreeze(fixtureMemory());
    expect(() => {
      (frozen as { value: string }).value = "tampered";
    }).toThrow(TypeError);
  });

  it("forget() accepts a deep-frozen memory without throwing, and the memory is unchanged afterward", () => {
    const memory = deepFreeze(fixtureMemory());
    const snapshot = JSON.stringify(memory);
    expect(() => forget(memory, "age-exceeded", FORGOTTEN_AT)).not.toThrow();
    expect(JSON.stringify(memory)).toBe(snapshot);
  });
});

describe("TombstoneId minting", () => {
  it("two calls to forget(), same memory and reason and now, mint two DIFFERENT TombstoneIds — a tombstone is its own new identity, not derived deterministically from what it forgot", () => {
    const memory = fixtureMemory();
    const first = forget(memory, "age-exceeded", FORGOTTEN_AT);
    const second = forget(memory, "age-exceeded", FORGOTTEN_AT);
    expect(first.tombstone.id).not.toBe(second.tombstone.id);
  });
});

describe("TYPE-LEVEL: the overloaded signature enforces \"supersededBy iff a caused reason\" at the CALL SITE, not just on the Tombstone type it constructs", () => {
  it("a caused reason without supersededBy does not compile (and, since vitest transpiles rather than typechecks, this line ALSO really runs — landing on the same runtime backstop the dedicated test below proves directly, so it is wrapped in toThrow() rather than left to fail this test for an unrelated reason)", () => {
    const memory = fixtureMemory();
    expect(() => {
      // @ts-expect-error — "contradicted" is a caused reason; the overload for it requires a fourth (MemoryId) argument, and this call only supplies three, so no overload matches.
      forget(memory, "contradicted", FORGOTTEN_AT);
    }).toThrow(/requires a supersededBy/);
  });

  it("an uncaused reason with an (unwanted) supersededBy does not compile", () => {
    const memory = fixtureMemory();
    const someId = memoryId("mem-x");
    // @ts-expect-error — "age-exceeded" is an uncaused reason; its overload takes exactly three parameters, and this call's fourth argument matches no overload.
    forget(memory, "age-exceeded", FORGOTTEN_AT, someId);
  });

  it("RUNTIME BACKSTOP: a caller that defeats the overloads with a type cast still gets a thrown error, never a silently-malformed Tombstone", () => {
    const memory = fixtureMemory();
    const castReason = "contradicted" as "age-exceeded"; // lies to the compiler on purpose, simulating a defeated overload.
    expect(() => forget(memory, castReason, FORGOTTEN_AT)).toThrow(/requires a supersededBy/);
  });
});

// Kept as a plain reference so `FIXTURE_BELIEVED_AT`'s import above is exercised by at least one real assertion, not merely imported for its type.
describe("sanity", () => {
  it("fixtureMemory()'s own believedAt matches the shared fixture constant", () => {
    expect(fixtureMemory().believedAt).toBe(FIXTURE_BELIEVED_AT);
  });
});

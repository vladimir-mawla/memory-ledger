import { describe, expect, it } from "vitest";
import { contradict } from "../contradict.js";
import type { Memory } from "../../contracts/memory.js";
import { FIXTURE_BELIEVED_AT, FIXTURE_LATER, deepFreeze, derivedProvenance, fixtureMemory, humanProvenance } from "./fixtures.js";

/**
 * `contradict()` mutates neither argument — `memory-plan.md` §3: "Memories
 * are immutable, append-only records — never edited in place," restated as
 * one of `contradict`'s own "legal operations": "never mutates either
 * input; the *store* (not this function) decides what to do with the
 * result." PROVEN, not merely typed `readonly` and trusted: every fixture
 * below is deep-frozen (`fixtures.ts`'s `deepFreeze`, which walks `source`,
 * `scope`, and `decayPolicy` too — a shallow `Object.freeze` alone would
 * leave those nested objects mutable) BEFORE being handed to `contradict`,
 * across every one of the four outcomes, so any attempted write anywhere
 * inside this function throws immediately (assignment to a frozen object's
 * property throws a `TypeError` in strict mode, which every ES module is,
 * unconditionally) rather than silently succeeding.
 */
describe("contradict() mutates neither argument — proven with deep-frozen inputs", () => {
  it("a deep-frozen mutation attempt on the fixture itself throws — proves the fixture actually enforces immutability, not just that contradict happens not to write", () => {
    const frozen = deepFreeze(fixtureMemory());
    expect(() => {
      (frozen as { value: string }).value = "tampered";
    }).toThrow(TypeError);
    expect(() => {
      (frozen.source as { revocable: boolean }).revocable = true; // nested field, one level down — proves the freeze is deep, not shallow.
    }).toThrow(TypeError);
    expect(() => {
      (frozen.scope as unknown as { push: (e: unknown) => void }).push({ dimension: "x", value: "y" });
    }).toThrow(TypeError);
  });

  it("no-conflict: deep-frozen inputs pass through contradict without throwing, and are unchanged afterward", () => {
    const older = deepFreeze(fixtureMemory({ believedAt: FIXTURE_BELIEVED_AT }));
    const newer = deepFreeze(fixtureMemory({ believedAt: FIXTURE_LATER }));
    const olderSnapshot = JSON.stringify(older);
    const newerSnapshot = JSON.stringify(newer);
    expect(() => contradict(older, newer)).not.toThrow();
    expect(JSON.stringify(older)).toBe(olderSnapshot);
    expect(JSON.stringify(newer)).toBe(newerSnapshot);
  });

  it("superseded: deep-frozen inputs pass through without throwing, and are unchanged afterward", () => {
    const older = deepFreeze(
      fixtureMemory({ value: "A", source: humanProvenance(), confidence: 0.9 as Memory<string>["confidence"], believedAt: FIXTURE_BELIEVED_AT }),
    );
    const newer = deepFreeze(
      fixtureMemory({ value: "B", source: humanProvenance(), confidence: 0.9 as Memory<string>["confidence"], believedAt: FIXTURE_LATER }),
    );
    const olderSnapshot = JSON.stringify(older);
    const newerSnapshot = JSON.stringify(newer);
    const check = contradict(older, newer);
    expect(check.outcome).toBe("superseded");
    expect(JSON.stringify(older)).toBe(olderSnapshot);
    expect(JSON.stringify(newer)).toBe(newerSnapshot);
  });

  it("disputed: deep-frozen inputs pass through without throwing, and are unchanged afterward", () => {
    const older = deepFreeze(
      fixtureMemory({
        value: "A",
        source: derivedProvenance(),
        confidence: 0.6 as Memory<string>["confidence"],
        believedAt: FIXTURE_BELIEVED_AT,
      }),
    );
    const newer = deepFreeze(
      fixtureMemory({
        value: "B",
        source: derivedProvenance(),
        confidence: 0.5 as Memory<string>["confidence"],
        believedAt: FIXTURE_LATER,
      }),
    );
    const olderSnapshot = JSON.stringify(older);
    const newerSnapshot = JSON.stringify(newer);
    const check = contradict(older, newer);
    expect(check.outcome).toBe("disputed");
    expect(JSON.stringify(older)).toBe(olderSnapshot);
    expect(JSON.stringify(newer)).toBe(newerSnapshot);
  });

  it("not-comparable: deep-frozen inputs pass through without throwing, and are unchanged afterward", () => {
    const older = deepFreeze(fixtureMemory({ subject: "a", believedAt: FIXTURE_BELIEVED_AT }));
    const newer = deepFreeze(fixtureMemory({ subject: "b", believedAt: FIXTURE_LATER }));
    const olderSnapshot = JSON.stringify(older);
    const newerSnapshot = JSON.stringify(newer);
    const check = contradict(older, newer);
    expect(check.outcome).toBe("not-comparable");
    expect(JSON.stringify(older)).toBe(olderSnapshot);
    expect(JSON.stringify(newer)).toBe(newerSnapshot);
  });

  it("the result's own older/newer fields are the SAME object references as the inputs, never copies — contradict never clones-then-mutates a copy either", () => {
    const older = deepFreeze(fixtureMemory({ believedAt: FIXTURE_BELIEVED_AT }));
    const newer = deepFreeze(fixtureMemory({ believedAt: FIXTURE_LATER }));
    const check = contradict(older, newer);
    if (check.outcome === "no-conflict" || check.outcome === "superseded" || check.outcome === "not-comparable") {
      expect(check.older).toBe(older);
      expect(check.newer).toBe(newer);
    } else {
      throw new Error(`unexpected outcome for this fixture pair: ${check.outcome}`);
    }
  });
});

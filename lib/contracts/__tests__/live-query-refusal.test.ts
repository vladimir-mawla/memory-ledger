import { describe, expect, it } from "vitest";
import type { Memory } from "../memory.js";
import type { TombstonedMemory } from "../tombstoned-memory.js";
import type { Json } from "../json.js";
import type { BeliefAnswer } from "../belief-answer.js";
import { fixtureMemory, fixtureTombstonedMemory } from "./fixtures.js";

/**
 * M1's own success criterion: "The live-query function must be
 * structurally unable to accept a tombstoned memory... compile-time
 * refusal, not a runtime check. You are not building the query engine,
 * but you must define the types so that refusal is expressible, and prove
 * it compiles as intended."
 *
 * `RepresentativeLiveQuery` below is NOT exported from this milestone's
 * public barrel — it is a local stand-in for the real shape M5's
 * `BeliefQuery` will have, included here ONLY to prove the refusal
 * property is available given `Memory`/`TombstonedMemory`'s shapes as
 * frozen by this milestone. M5 owns the real function and its real
 * signature; this test does not pre-decide it.
 */
type RepresentativeLiveQuery<TValue extends Json> = (
  candidates: ReadonlyArray<Memory<TValue>>,
) => BeliefAnswer<TValue>;

const representativeLiveQuery: RepresentativeLiveQuery<string> = (candidates) => {
  const [first] = candidates;
  if (first === undefined) {
    return { status: "unknown", reason: "no-memory", tombstones: [] };
  }
  return { status: "believed", memory: first, confidence: first.confidence };
};

describe("live-query refusal — a TombstonedMemory is structurally unacceptable to a Memory-typed query", () => {
  it("a live Memory is accepted, as expected", () => {
    const answer = representativeLiveQuery([fixtureMemory<string>()]);
    expect(answer.status).toBe("believed");
  });

  it("TYPE-LEVEL: passing a TombstonedMemory where the query expects ReadonlyArray<Memory<TValue>> does not compile", () => {
    const tombstoned: TombstonedMemory<string> = fixtureTombstonedMemory();
    // @ts-expect-error — TombstonedMemory.status is "tombstoned", which is not a member of Memory.status's "believed"|"doubted"|"disputed" union, so TombstonedMemory<string> is not assignable to Memory<string>, and this array literal does not satisfy ReadonlyArray<Memory<string>>.
    representativeLiveQuery([tombstoned]);
  });

  it("TYPE-LEVEL: a MIXED array of one live memory and one tombstoned memory is also refused — the refusal is per-element, not merely 'the whole array happens to be tombstoned'", () => {
    const live = fixtureMemory<string>();
    const tombstoned = fixtureTombstonedMemory();
    // @ts-expect-error — the tombstoned element still fails Memory<string>, even though the array also contains a valid live memory.
    representativeLiveQuery([live, tombstoned]);
  });

  it("RUNTIME sanity: TombstonedMemory really is a different value shape at runtime too — status is the discriminant a hand-rolled runtime check would also have to key on, if one were ever added as defense-in-depth", () => {
    const live = fixtureMemory<string>();
    const tombstoned = fixtureTombstonedMemory();
    expect(live.status).not.toBe(tombstoned.status);
    expect("tombstone" in live).toBe(false);
    expect("tombstone" in tombstoned).toBe(true);
  });
});

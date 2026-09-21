import { describe, expect, it } from "vitest";
import { queryBelief } from "../belief-query.js";
import type { Memory } from "../../contracts/memory.js";
import type { TombstonedMemory } from "../../contracts/tombstoned-memory.js";
import { fixtureMemory, fixtureTombstonedMemory, FIXTURE_BELIEVED_AT } from "./fixtures.js";

/**
 * M1's own success criterion, restated for M5 (`memory-plan.md`'s M5 row):
 * "a `@ts-expect-error` proof that the real `BeliefQuery` function's
 * parameter type refuses a `TombstonedMemory` at compile time." M1's own
 * `lib/contracts/__tests__/live-query-refusal.test.ts` proved this
 * property against a LOCAL STAND-IN it explicitly said "M5 owns the real
 * one." This file re-proves the identical shape against `queryBelief`
 * ITSELF — the real function, not a representative.
 *
 * WHY AN UNUSED `@ts-expect-error` MAKES THIS PROOF REAL, NOT DECORATIVE:
 * TypeScript raises `TS2578` ("Unused '@ts-expect-error' directive") on any
 * `@ts-expect-error` comment placed above a line that does NOT actually
 * produce a compile error. So if `Memory.status`'s union were ever
 * accidentally widened to include `"tombstoned"` (undoing M1's own
 * Decision 2, `.genesis/decisions/0001-contracts.md`) — or if
 * `queryBelief`'s own parameter type were ever loosened to `ReadonlyArray<
 * Memory<TValue> | TombstonedMemory<TValue>>` — the assignment below would
 * stop erroring, and `tsc` would fail on the `@ts-expect-error` line
 * itself instead of staying silently green. A `@ts-expect-error` comment is
 * therefore not documentation of an error that happens to exist today; it
 * is itself a live, continuously-re-checked assertion that one still does.
 */
describe("belief-query refusal — a TombstonedMemory is structurally unacceptable to queryBelief's own real parameter type", () => {
  it("a live Memory[] is accepted, as expected", () => {
    const answer = queryBelief([fixtureMemory()], [], FIXTURE_BELIEVED_AT);
    expect(answer.status).toBe("believed");
  });

  it("TYPE-LEVEL: a TombstonedMemory[] does not satisfy queryBelief's ReadonlyArray<Memory<TValue>> candidates parameter", () => {
    const tombstoned: TombstonedMemory<string> = fixtureTombstonedMemory();
    // @ts-expect-error — TombstonedMemory.status is "tombstoned", not a member of Memory.status's "believed"|"doubted"|"disputed" union, so [tombstoned] does not satisfy ReadonlyArray<Memory<string>>.
    queryBelief([tombstoned], [], FIXTURE_BELIEVED_AT);
  });

  it("TYPE-LEVEL: a MIXED array of one live memory and one tombstoned memory is also refused — per-element, not merely \"the whole array happens to be tombstoned\"", () => {
    const live: Memory<string> = fixtureMemory();
    const tombstoned: TombstonedMemory<string> = fixtureTombstonedMemory();
    // @ts-expect-error — the tombstoned element still fails Memory<string>, even alongside a valid live memory.
    queryBelief([live, tombstoned], [], FIXTURE_BELIEVED_AT);
  });

  it("RUNTIME sanity: TombstonedMemory really is a different value shape at runtime too, the same discriminant a defense-in-depth runtime check would key on", () => {
    const live = fixtureMemory();
    const tombstoned = fixtureTombstonedMemory();
    expect(live.status).not.toBe(tombstoned.status);
    expect("tombstone" in live).toBe(false);
    expect("tombstone" in tombstoned).toBe(true);
  });
});

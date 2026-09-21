import { describe, expect, it } from "vitest";
import { queryBelief } from "../belief-query.js";
import type { Confidence } from "../../contracts/confidence.js";
import { afterHours, derivedProvenance, fixtureMemory, fixtureTombstone, FIXTURE_BELIEVED_AT, humanProvenance } from "./fixtures.js";

/**
 * `memory-plan.md` §2/§6: three of `BeliefAnswer`'s four variants
 * (`disputed`, `unknown`, a `doubted` carrying a reason) are "literally
 * impossible for a similarity ranker to produce." This file proves all
 * four are reachable from `queryBelief` given a REAL corpus — never
 * asserted, always a passing test constructing the actual `Memory`/
 * `Tombstone` values and reading the actual returned `BeliefAnswer`.
 */
describe("queryBelief — all four BeliefAnswer variants, each reached from a real corpus", () => {
  it("believed — one fresh candidate, zero elapsed time", () => {
    const memory = fixtureMemory();
    const answer = queryBelief([memory], [], FIXTURE_BELIEVED_AT);
    expect(answer).toEqual({ status: "believed", memory, confidence: 0.8 as Confidence });
  });

  it("doubted — one candidate, confidence decayed to exactly the doubtedThreshold, reason age-exceeded", () => {
    const memory = fixtureMemory();
    const now = afterHours(1); // confidence 0.8 * 0.5^1 = 0.4 == doubtedThreshold, per fixtures.ts's own worked arithmetic.
    const answer = queryBelief([memory], [], now);
    expect(answer).toEqual({ status: "doubted", memory, confidence: 0.4 as Confidence, reason: "age-exceeded" });
  });

  it("disputed — two live, same-tier derived-inference memories disagreeing in value; contradict() resolves to \"disputed\", and neither wins", () => {
    const older = fixtureMemory({ value: "A", source: derivedProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const now = afterHours(1);
    const newer = fixtureMemory({ value: "B", source: derivedProvenance(), believedAt: now, lastAffirmedAt: now });
    const answer = queryBelief([older, newer], [], now);
    expect(answer.status).toBe("disputed");
    expect(answer.status === "disputed" && answer.candidates).toEqual([older, newer]);
  });

  it("unknown/no-memory — nothing live, nothing tombstoned, nothing to point at", () => {
    const answer = queryBelief([], [], FIXTURE_BELIEVED_AT);
    expect(answer).toEqual({ status: "unknown", reason: "no-memory", tombstones: [] });
  });

  it("unknown/all-known-memories-tombstoned — the plan's own falsifiability test: a corpus with zero live memories and a real tombstone for the subject", () => {
    const tombstone = fixtureTombstone();
    const answer = queryBelief([], [tombstone], FIXTURE_BELIEVED_AT);
    expect(answer).toEqual({ status: "unknown", reason: "all-known-memories-tombstoned", tombstones: [tombstone] });
  });
});

describe("queryBelief composes decay — a live memory that has decayed past its own forgetFloor is never reported as \"believed\"/\"doubted\"", () => {
  it("a single candidate at exactly the forgetFloor is swept into a REAL, freshly-minted age-exceeded tombstone, and reported as all-known-memories-tombstoned, never as believed/doubted with a near-zero confidence", () => {
    const memory = fixtureMemory();
    const now = afterHours(3); // confidence 0.8 * 0.5^3 = 0.1 == forgetFloor, per fixtures.ts's own worked arithmetic.
    const answer = queryBelief([memory], [], now);
    expect(answer.status).toBe("unknown");
    if (answer.status !== "unknown") throw new Error("unreachable");
    expect(answer.reason).toBe("all-known-memories-tombstoned");
    expect(answer.tombstones).toHaveLength(1);
    expect(answer.tombstones[0]?.reason).toBe("age-exceeded");
    expect(answer.tombstones[0]?.memoryId).toBe(memory.id);
    expect(answer.tombstones[0]?.forgottenAt).toBe(now);
  });

  it("a PRE-EXISTING tombstone and a NEWLY-SWEPT one are both reported together, not one overwriting the other", () => {
    const preExisting = fixtureTombstone({ memoryId: fixtureMemory().id });
    const memory = fixtureMemory();
    const now = afterHours(3);
    const answer = queryBelief([memory], [preExisting], now);
    expect(answer.status).toBe("unknown");
    if (answer.status !== "unknown") throw new Error("unreachable");
    expect(answer.tombstones).toHaveLength(2);
    expect(answer.tombstones).toContainEqual(preExisting);
    expect(answer.tombstones.some((t) => t.memoryId === memory.id && t.reason === "age-exceeded")).toBe(true);
  });
});

describe("queryBelief composes contradict() live, rather than trusting a stored Memory.status — the disputed/superseded/not-comparable findings", () => {
  it("no-conflict (values genuinely agree) answers believed, on the NEWER of the two agreeing statements", () => {
    const now = afterHours(1);
    const older = fixtureMemory({ value: "same", source: humanProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory({ value: "same", source: humanProvenance(), believedAt: now, lastAffirmedAt: now });
    const answer = queryBelief([older, newer], [], now);
    expect(answer).toEqual({ status: "believed", memory: newer, confidence: 0.8 as Confidence });
  });

  it("FINDING: a \"superseded\" outcome discovered live at query time is answered as disputed, never as believed — see belief-query.ts's own header for why a believed answer here would have nowhere to carry the missing tombstone", () => {
    const now = afterHours(1);
    const older = fixtureMemory({ value: "42 Elm Street", source: humanProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory({ value: "118 Birch Avenue", source: humanProvenance(), believedAt: now, lastAffirmedAt: now });
    const answer = queryBelief([older, newer], [], now);
    expect(answer.status).toBe("disputed");
    expect(answer.status === "disputed" && answer.candidates).toEqual([older, newer]);
  });

  it("DEFENSIVE: not-comparable (e.g. mismatched subject — a caller violating this function's own grouping precondition) still fails closed to disputed, never silently picks a winner", () => {
    const now = afterHours(1);
    const older = fixtureMemory({ subject: "user:vlad.shipping-address", believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory({ subject: "user:vlad.billing-address", believedAt: now, lastAffirmedAt: now });
    const answer = queryBelief([older, newer], [], now);
    expect(answer.status).toBe("disputed");
  });

  it("a custom comparator is threaded through to contradict() — two numeric values within a declared tolerance agree, even though they are not exactly equal", () => {
    const now = afterHours(1);
    const older = fixtureMemory<number>({ value: 100, source: humanProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory<number>({ value: 101, source: humanProvenance(), believedAt: now, lastAffirmedAt: now });
    const answer = queryBelief([older, newer], [], now, { op: "tolerance", epsilon: 5 });
    expect(answer).toEqual({ status: "believed", memory: newer, confidence: 0.8 as Confidence });
  });

  it("DEFENSIVE: more than two fresh candidates for one query — the two most-recently-believed are used, the rest are excluded, and this does not crash", () => {
    const first = fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const secondAt = afterHours(1);
    const second = fixtureMemory({ value: "B", believedAt: secondAt, lastAffirmedAt: secondAt });
    const thirdAt = afterHours(2);
    const third = fixtureMemory({ value: "C", believedAt: thirdAt, lastAffirmedAt: thirdAt });
    const now = afterHours(2);
    const answer = queryBelief([first, second, third], [], now);
    expect(answer.status).toBe("disputed");
    expect(answer.status === "disputed" && answer.candidates).toEqual([second, third]);
    // `first`, the oldest, is excluded from the answer entirely — disclosed in belief-query.ts's own header.
    expect(answer.status === "disputed" && answer.candidates.includes(first)).toBe(false);
  });
});

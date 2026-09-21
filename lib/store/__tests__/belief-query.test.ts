import { describe, expect, it } from "vitest";
import { queryBelief } from "../belief-query.js";
import type { Confidence } from "../../contracts/confidence.js";
import { ZERO_CONFIDENCE } from "../../contracts/confidence.js";
import { queryConfidence } from "../../decay/query-confidence.js";
import { afterHours, derivedProvenance, fixtureMemory, fixtureTombstone, FIXTURE_BELIEVED_AT, humanProvenance } from "./fixtures.js";

/**
 * `memory-plan.md` §2/§6: three of `BeliefAnswer`'s four variants
 * (`disputed`, `unknown`, a `doubted` carrying a reason) are "literally
 * impossible for a similarity ranker to produce." This file proves all
 * four are reachable from `queryBelief` given a REAL corpus — never
 * asserted, always a passing test constructing the actual `Memory`/
 * `Tombstone` values and reading the actual returned `BeliefQueryResult`.
 */
describe("queryBelief — all four BeliefAnswer variants, each reached from a real corpus", () => {
  it("believed — one fresh candidate, zero elapsed time", () => {
    const memory = fixtureMemory();
    const result = queryBelief([memory], [], FIXTURE_BELIEVED_AT);
    expect(result.answer).toEqual({ status: "believed", memory, confidence: 0.8 as Confidence });
    expect(result.newlyForgotten).toEqual([]);
  });

  it("doubted — one candidate, confidence decayed to exactly the doubtedThreshold, reason age-exceeded", () => {
    const memory = fixtureMemory();
    const now = afterHours(1); // confidence 0.8 * 0.5^1 = 0.4 == doubtedThreshold, per fixtures.ts's own worked arithmetic.
    const result = queryBelief([memory], [], now);
    expect(result.answer).toEqual({ status: "doubted", memory, confidence: 0.4 as Confidence, reason: "age-exceeded" });
    expect(result.newlyForgotten).toEqual([]);
  });

  it("disputed — two live, same-tier derived-inference memories disagreeing in value; contradict() resolves to \"disputed\" (neither wins, nothing tombstoned)", () => {
    const older = fixtureMemory({ value: "A", source: derivedProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const now = afterHours(1);
    const newer = fixtureMemory({ value: "B", source: derivedProvenance(), believedAt: now, lastAffirmedAt: now });
    const result = queryBelief([older, newer], [], now);
    expect(result.answer.status).toBe("disputed");
    expect(result.answer.status === "disputed" && result.answer.candidates).toEqual([older, newer]);
    expect(result.newlyForgotten).toEqual([]);
  });

  it("unknown/no-memory — nothing live, nothing tombstoned, nothing to point at", () => {
    const result = queryBelief([], [], FIXTURE_BELIEVED_AT);
    expect(result.answer).toEqual({ status: "unknown", reason: "no-memory", tombstones: [] });
    expect(result.newlyForgotten).toEqual([]);
  });

  it("unknown/all-known-memories-tombstoned — the plan's own falsifiability test: a corpus with zero live memories and a real tombstone for the subject", () => {
    const tombstone = fixtureTombstone();
    const result = queryBelief([], [tombstone], FIXTURE_BELIEVED_AT);
    expect(result.answer).toEqual({ status: "unknown", reason: "all-known-memories-tombstoned", tombstones: [tombstone] });
    expect(result.newlyForgotten).toEqual([]); // pre-existing, not newly minted by this call.
  });
});

describe("queryBelief composes decay — a live memory that has decayed past its own forgetFloor is never reported as \"believed\"/\"doubted\"", () => {
  it("a single candidate at exactly the forgetFloor is swept into a REAL, freshly-minted age-exceeded tombstone, and reported as all-known-memories-tombstoned, never as believed/doubted with a near-zero confidence", () => {
    const memory = fixtureMemory();
    const now = afterHours(3); // confidence 0.8 * 0.5^3 = 0.1 == forgetFloor, per fixtures.ts's own worked arithmetic.
    const result = queryBelief([memory], [], now);
    expect(result.answer.status).toBe("unknown");
    if (result.answer.status !== "unknown") throw new Error("unreachable");
    expect(result.answer.reason).toBe("all-known-memories-tombstoned");
    expect(result.answer.tombstones).toHaveLength(1);
    expect(result.answer.tombstones[0]?.reason).toBe("age-exceeded");
    expect(result.answer.tombstones[0]?.memoryId).toBe(memory.id);
    expect(result.answer.tombstones[0]?.forgottenAt).toBe(now);
    // Reported through BOTH channels: answer.tombstones (because this is an "unknown" answer) AND newlyForgotten (uniformly, for every answer shape).
    expect(result.newlyForgotten).toEqual(result.answer.tombstones);
  });

  it("a PRE-EXISTING tombstone and a NEWLY-SWEPT one are both reported together in the answer, but only the swept one appears in newlyForgotten", () => {
    const preExisting = fixtureTombstone({ memoryId: fixtureMemory().id });
    const memory = fixtureMemory();
    const now = afterHours(3);
    const result = queryBelief([memory], [preExisting], now);
    expect(result.answer.status).toBe("unknown");
    if (result.answer.status !== "unknown") throw new Error("unreachable");
    expect(result.answer.tombstones).toHaveLength(2);
    expect(result.answer.tombstones).toContainEqual(preExisting);
    expect(result.newlyForgotten).toHaveLength(1);
    expect(result.newlyForgotten[0]?.memoryId).toBe(memory.id);
    expect(result.newlyForgotten[0]?.reason).toBe("age-exceeded");
    expect(result.newlyForgotten).not.toContainEqual(preExisting);
  });
});

describe("queryBelief composes contradict() live, rather than trusting a stored Memory.status", () => {
  it("no-conflict (values genuinely agree) answers believed, on the NEWER of the two agreeing statements, and forgets nothing", () => {
    const now = afterHours(1);
    const older = fixtureMemory({ value: "same", source: humanProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory({ value: "same", source: humanProvenance(), believedAt: now, lastAffirmedAt: now });
    const result = queryBelief([older, newer], [], now);
    expect(result.answer).toEqual({ status: "believed", memory: newer, confidence: 0.8 as Confidence });
    expect(result.newlyForgotten).toEqual([]);
  });

  it("DEFENSIVE: not-comparable (e.g. mismatched subject — a caller violating this function's own grouping precondition) fails closed to disputed, never silently picks a winner, and forgets nothing (contradict itself never committed to a verdict)", () => {
    const now = afterHours(1);
    const older = fixtureMemory({ subject: "user:vlad.shipping-address", believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory({ subject: "user:vlad.billing-address", believedAt: now, lastAffirmedAt: now });
    const result = queryBelief([older, newer], [], now);
    expect(result.answer.status).toBe("disputed");
    expect(result.newlyForgotten).toEqual([]);
  });

  it("a custom comparator is threaded through to contradict() — two numeric values within a declared tolerance agree, even though they are not exactly equal", () => {
    const now = afterHours(1);
    const older = fixtureMemory<number>({ value: 100, source: humanProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const newer = fixtureMemory<number>({ value: 101, source: humanProvenance(), believedAt: now, lastAffirmedAt: now });
    const result = queryBelief([older, newer], [], now, { op: "tolerance", epsilon: 5 });
    expect(result.answer).toEqual({ status: "believed", memory: newer, confidence: 0.8 as Confidence });
    expect(result.newlyForgotten).toEqual([]);
  });

  it("DEFENSIVE: more than two fresh candidates for one query — the two most-recently-believed are used, the rest are excluded, and this does not crash", () => {
    // All three same-tier derived-inference, so (second, third) resolves to
    // "disputed" (tier-split case 3) rather than "superseded" — keeping
    // this test about the >2-candidate exclusion behavior specifically,
    // not entangled with the superseded-tombstoning behavior proven below.
    const first = fixtureMemory({ value: "A", source: derivedProvenance(), believedAt: FIXTURE_BELIEVED_AT, lastAffirmedAt: FIXTURE_BELIEVED_AT });
    const secondAt = afterHours(1);
    const second = fixtureMemory({ value: "B", source: derivedProvenance(), believedAt: secondAt, lastAffirmedAt: secondAt });
    const thirdAt = afterHours(2);
    const third = fixtureMemory({ value: "C", source: derivedProvenance(), believedAt: thirdAt, lastAffirmedAt: thirdAt });
    const now = afterHours(2);
    const result = queryBelief([first, second, third], [], now);
    expect(result.answer.status).toBe("disputed");
    expect(result.answer.status === "disputed" && result.answer.candidates).toEqual([second, third]);
    // `first`, the oldest, is excluded from the answer entirely — disclosed in belief-query.ts's own header.
    expect(result.answer.status === "disputed" && result.answer.candidates.includes(first)).toBe(false);
  });
});

/**
 * `memory-plan.md` §8's own demo moment, proven exactly in its own shape:
 * two same-tier `direct-avowal` memories about the same `(subject,
 * predicate)`, the newer disagreeing. ADR 0003's own worked contrast
 * (Decision 6) puts this squarely in `contradict`'s `"superseded"`
 * outcome — and `.genesis/decisions/0004-store.md` (Decision 2, REVISED)
 * records why an earlier revision of `queryBelief` got this wrong
 * (answering "disputed" here would have shown a judge both addresses on
 * the one screen this project is built around).
 */
describe("§8's demo moment: a same-tier direct-avowal supersede answers with the NEW value, tombstones the OLD one, and the old one's confidence reads as zero — never a rewrite", () => {
  it("the query answers believed on the newer address, never disputed", () => {
    const now = afterHours(1);
    const oldAddress = fixtureMemory({
      value: "42 Elm Street, Portland",
      source: humanProvenance(),
      believedAt: FIXTURE_BELIEVED_AT,
      lastAffirmedAt: FIXTURE_BELIEVED_AT,
    });
    const newAddress = fixtureMemory({
      value: "118 Birch Avenue, Seattle",
      source: humanProvenance(),
      believedAt: now,
      lastAffirmedAt: now,
    });
    const result = queryBelief([oldAddress, newAddress], [], now);
    expect(result.answer).toEqual({ status: "believed", memory: newAddress, confidence: 0.8 as Confidence });
  });

  it("the same call ALSO produces a real tombstone naming the old memory and the new one that superseded it — \"produces the tombstone on request\"", () => {
    const now = afterHours(1);
    const oldAddress = fixtureMemory({
      value: "42 Elm Street, Portland",
      source: humanProvenance(),
      believedAt: FIXTURE_BELIEVED_AT,
      lastAffirmedAt: FIXTURE_BELIEVED_AT,
    });
    const newAddress = fixtureMemory({
      value: "118 Birch Avenue, Seattle",
      source: humanProvenance(),
      believedAt: now,
      lastAffirmedAt: now,
    });
    const result = queryBelief([oldAddress, newAddress], [], now);
    expect(result.newlyForgotten).toHaveLength(1);
    const tombstone = result.newlyForgotten[0];
    expect(tombstone?.reason).toBe("contradicted");
    expect(tombstone?.memoryId).toBe(oldAddress.id);
    expect(tombstone && "supersededBy" in tombstone && tombstone.supersededBy).toBe(newAddress.id);
  });

  it("the old memory's confidence reads as zero the instant the new one arrived — SURFACED via the fresh tombstone, never a rewrite of the recorded, immutable Memory.confidence field", () => {
    const now = afterHours(1);
    const oldAddress = fixtureMemory({
      value: "42 Elm Street, Portland",
      source: humanProvenance(),
      confidence: 0.9 as ReturnType<typeof fixtureMemory>["confidence"],
      believedAt: FIXTURE_BELIEVED_AT,
      lastAffirmedAt: FIXTURE_BELIEVED_AT,
    });
    const newAddress = fixtureMemory({
      value: "118 Birch Avenue, Seattle",
      source: humanProvenance(),
      believedAt: now,
      lastAffirmedAt: now,
    });
    const result = queryBelief([oldAddress, newAddress], [], now);
    const tombstone = result.newlyForgotten[0];
    if (!tombstone) throw new Error("expected a tombstone for the superseded old address");

    // The RECORD is untouched — this is the "never a rewrite" half of the claim.
    expect(oldAddress.confidence).toBe(0.9);

    // What a QUERY reports is zero, unconditionally, composing lib/decay's
    // own frozen queryConfidence — the same guarantee every other
    // TombstonedMemory already gets, not a special case invented here.
    const { status: _status, ...oldCore } = oldAddress;
    const oldAsTombstoned = { ...oldCore, status: "tombstoned" as const, tombstone };
    expect(queryConfidence(oldAsTombstoned, now)).toBe(ZERO_CONFIDENCE);
  });
});

import { describe, expect, it } from "vitest";
import type { Memory } from "../../lib/contracts/memory.js";
import { queryBelief } from "../../lib/store/belief-query.js";
import { contradict } from "../../lib/contradiction/contradict.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query, recordFact, type StoreState } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { T0 } from "./fixtures.js";

/**
 * M7 CASE 2 — `memory-plan.md` §10(b): "the fail-closed default — if the
 * store cannot establish which of two racing writes happened first (a
 * clock-inconsistent `capturedAt`... same as `decision-engine`'s
 * clock-inconsistency handling), the query must resolve to `disputed`,
 * never to whichever write happened to commit first."
 *
 * FULL PIN. Unlike Case 1, this is not a simulation of concurrency by
 * fixed ordering — it is a genuine, mechanical property of `contradict()`
 * (`lib/contradiction/contradict.ts`, frozen) that holds regardless of
 * which memory a caller happens to construct/insert first, proven below
 * by literally reversing that order and getting the identical outcome.
 * "The store cannot establish which of two racing writes happened first"
 * is modeled exactly as it would really occur: two memories sharing a
 * `believedAt` (two writers whose clocks agree to the recorded
 * resolution, or two writes the system's own clock cannot distinguish in
 * time) — `contradict.ts`'s own header: a tie fails closed to
 * `not-comparable` ("clock-order-violated") "because this function has no
 * principled way to decide which of two claims recorded at the identical
 * instant is 'the newer one.'"
 *
 * FOUND, NOT ASSUMED, WHILE BUILDING THIS CASE: `recordFact`'s own
 * eager-resolution loop (`store.ts`) filters candidate `older` memories by
 * `Date.parse(m.believedAt) < Date.parse(newMemory.believedAt)` — STRICT
 * inequality. Two memories sharing the identical `believedAt` therefore
 * never become `eligibleOlder` for each other at WRITE time — recording
 * both leaves them simply coexisting, live, with no contradiction check
 * ever attempted between them. The tie is caught ONLY at QUERY time, by
 * `queryBelief`'s own lazy two-or-more-candidates branch. This is
 * confirmed directly below (`describe("2a", ...)`'s own assertion that
 * `recordFact` produces zero tombstones for the tied pair) rather than
 * assumed from reading the source — it is also, incidentally, the reason
 * this exact race is real and not merely theoretical: a store that only
 * resolves contradictions eagerly at write time would let a same-tick tie
 * slip through with NEITHER side ever compared, until something queries.
 */

const OLD_TIER = humanAvowal("user:vlad");

function tiedMemories(): { readonly a: Memory<string>; readonly b: Memory<string> } {
  // Two same-tier, same-(subject,predicate,scope) direct avowals,
  // disagreeing on value, sharing the IDENTICAL believedAt -- the store
  // has no principled way to say which one is "newer".
  const state1 = recordFact(EMPTY_STORE, { predicate: "coffee-order", value: "oat milk latte", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "a" }, T0);
  if (!state1.ok) throw new Error("test setup failure");
  const state2 = recordFact(state1.result.state, { predicate: "coffee-order", value: "cold brew", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "b" }, T0);
  if (!state2.ok) throw new Error("test setup failure");
  return { a: state1.result.written, b: state2.result.written };
}

describe("Case 2a — contradict() itself: a believedAt tie fails closed to not-comparable/clock-order-violated, regardless of argument order", () => {
  it("contradict(a, b) and contradict(b, a) BOTH refuse to commit -- the tie is not resolved by whichever argument happens to be passed as \"newer\"", () => {
    const { a, b } = tiedMemories();
    const ab = contradict(a, b);
    const ba = contradict(b, a);
    expect(ab.outcome).toBe("not-comparable");
    expect(ab.outcome === "not-comparable" && ab.reason).toBe("clock-order-violated");
    expect(ba.outcome).toBe("not-comparable");
    expect(ba.outcome === "not-comparable" && ba.reason).toBe("clock-order-violated");
  });
});

describe("Case 2b — the real write path: recordFact does NOT resolve the tie eagerly (found, not assumed) -- both memories stay live after both are written", () => {
  it("two same-tick, disagreeing writes: zero tombstones produced, both memories live", () => {
    const state1Outcome = recordFact(EMPTY_STORE, { predicate: "coffee-order", value: "oat milk latte", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "a" }, T0);
    if (!state1Outcome.ok) throw new Error("test setup failure");
    expect(state1Outcome.result.newTombstones).toHaveLength(0);

    const state2Outcome = recordFact(state1Outcome.result.state, { predicate: "coffee-order", value: "cold brew", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "b" }, T0);
    if (!state2Outcome.ok) throw new Error("test setup failure");
    expect(state2Outcome.result.newTombstones).toHaveLength(0); // the strict-inequality eligibility filter skips the tied candidate -- confirmed here, not assumed.
    expect(state2Outcome.result.state.live).toHaveLength(2);
  });
});

describe("Case 2c — THE REQUIRED PROOF: the query resolves the tie to disputed, and this is independent of which write was recorded/inserted first, never \"whichever committed first\"", () => {
  it("insertion order A-then-B: disputed", () => {
    const { a, b } = tiedMemories();
    const result = queryBelief([a, b], [], T0);
    expect(result.answer.status).toBe("disputed");
  });

  it("insertion order B-then-A -- the EXACT SAME two memories, reversed array order -- STILL disputed, never \"believed\" on whichever happens to sort first", () => {
    const { a, b } = tiedMemories();
    const result = queryBelief([b, a], [], T0);
    expect(result.answer.status).toBe("disputed");
  });

  it("through the real domain query() path, not just the raw engine call: still disputed", () => {
    const outcome1 = recordFact(EMPTY_STORE, { predicate: "coffee-order", value: "oat milk latte", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "a" }, T0);
    if (!outcome1.ok) throw new Error("test setup failure");
    const outcome2 = recordFact(outcome1.result.state, { predicate: "coffee-order", value: "cold brew", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "b" }, T0);
    if (!outcome2.ok) throw new Error("test setup failure");

    const state: StoreState = outcome2.result.state;
    const { result } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, T0);
    expect(result.answer.status).toBe("disputed");
    // Never silently resolved to a decisive winner in either direction --
    // the candidates named are exactly the two racing writes, nothing
    // tombstoned by this query either (queryBelief's own "disputed"/
    // "not-comparable" branch tombstones nothing -- belief-query.ts's own
    // header).
    if (result.answer.status === "disputed") {
      const values = result.answer.candidates.map((m) => m.value).sort();
      expect(values).toEqual(["cold brew", "oat milk latte"]);
    }
    expect(result.newlyForgotten).toHaveLength(0);
  });
});

describe("Case 2d — sanity: a genuine, non-tied ordering is NOT affected by this fail-closed rule -- confirms the check is about the tie, not about disagreement in general", () => {
  it("the SAME two disagreeing values, with a real (non-tied) believedAt gap, resolve normally (superseded), never disputed", () => {
    const later = new Date(Date.parse(T0) + 1).toISOString() as typeof T0;
    const outcome1 = recordFact(EMPTY_STORE, { predicate: "coffee-order", value: "oat milk latte", source: OLD_TIER, believedAtRaw: T0, confidenceRaw: 0.8, utterance: "a" }, T0);
    if (!outcome1.ok) throw new Error("test setup failure");
    const outcome2 = recordFact(outcome1.result.state, { predicate: "coffee-order", value: "cold brew", source: OLD_TIER, believedAtRaw: later, confidenceRaw: 0.8, utterance: "b" }, later);
    if (!outcome2.ok) throw new Error("test setup failure");
    // A one-millisecond, genuinely-ordered gap is enough for contradict()
    // to commit to a verdict -- direct-avowal vs direct-avowal, same
    // tier, so it resolves superseded (§5.1), NOT disputed, confirming
    // Case 2's own disputed outcome above is specifically about the TIE,
    // not merely about two disagreeing coffee orders.
    expect(outcome2.result.newTombstones).toHaveLength(1);
    expect(outcome2.result.newTombstones[0]?.tombstone.reason).toBe("contradicted");
  });
});

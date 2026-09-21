import { describe, expect, it } from "vitest";
import type { CapturedAt, Milliseconds } from "../../lib/contracts/captured-at.js";
import type { Confidence } from "../../lib/contracts/confidence.js";
import type { Memory } from "../../lib/contracts/memory.js";
import type { TombstonedMemory } from "../../lib/contracts/tombstoned-memory.js";
import { forget } from "../../lib/store/forget.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query, type StoreState } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { record, T0 } from "./fixtures.js";

/**
 * M7 CASE 5 — "A tombstoned memory can never be queried." M5 made this a
 * COMPILE-TIME refusal (`Memory.status`'s three-member union excludes
 * `"tombstoned"`, which lives only on the structurally distinct
 * `TombstonedMemory` type — `lib/contracts/memory.ts`'s own header). A
 * RUNTIME test cannot prove a compile-time property, so this is pinned
 * with `@ts-expect-error`, and the note that matters is this: removing
 * the directive below is ITSELF a `tsc` error (`TS2578`, "Unused
 * '@ts-expect-error' directive"), which is what makes this proof real
 * rather than decorative — if `StoreState.live`'s element type, or
 * `Memory.status`'s union, were ever accidentally widened to admit a
 * `TombstonedMemory`, the assignment below would stop erroring and `tsc`
 * would fail on the `@ts-expect-error` comment itself, not silently stay
 * green.
 *
 * FULL PIN, AND ONE LAYER UP FROM THE EXISTING PROOFS. M1's own
 * `lib/contracts/__tests__/live-query-refusal.test.ts` proved this against
 * a representative stand-in; M5's own `lib/store/__tests__/
 * belief-query-refusal.test.ts` re-proved it against the real
 * `queryBelief`. This file proves the SAME property at the layer a real
 * caller actually touches: `domains/personal-assistant/store.ts`'s
 * `StoreState.live` — the field every real write/read in this whole
 * system (`recordFact`, `query`) actually reads and writes. Neither prior
 * proof establishes THIS one; `StoreState` did not exist until M6, and
 * `StoreState.live: readonly Memory<TValue>[]` is its own, independently
 * checked assignability boundary, not merely "the same fact restated."
 */

describe("Case 5 — a TombstonedMemory is structurally unacceptable wherever this codebase holds live memories", () => {
  it("TYPE-LEVEL: a TombstonedMemory does not satisfy StoreState.live's element type", () => {
    const memory: Memory<string> = record(EMPTY_STORE, "coffee-order", "cold brew", humanAvowal("user:vlad"), T0, 0.8, T0).written;
    const tombstoned: TombstonedMemory<string> = forget(memory, "age-exceeded", T0);

    // @ts-expect-error — TombstonedMemory.status is "tombstoned", not a member of Memory.status's "believed"|"doubted"|"disputed" union, so `live: [tombstoned]` does not satisfy `readonly Memory<string>[]`.
    const illegalState: StoreState<string> = { live: [tombstoned], tombstoned: [] };
    void illegalState;
  });

  it("TYPE-LEVEL: a MIXED live array -- one real live memory alongside one tombstoned one -- is refused per-element, not merely \"the whole array happens to be tombstoned\"", () => {
    const live: Memory<string> = record(EMPTY_STORE, "coffee-order", "cold brew", humanAvowal("user:vlad"), T0, 0.8, T0).written;
    const tombstoned: TombstonedMemory<string> = forget(live, "age-exceeded", T0);

    // @ts-expect-error — the tombstoned element still fails Memory<string>, even alongside a valid live memory in the same array.
    const illegalState: StoreState<string> = { live: [live, tombstoned], tombstoned: [] };
    void illegalState;
  });

  it("RUNTIME COROLLARY: once a memory is tombstoned via the real write/read paths, it is gone from state.live for good -- query() itself moves it, this file does not have to construct the illegal state above by hand to see the consequence", () => {
    let state: StoreState = EMPTY_STORE;
    const t1 = T0;
    state = record(state, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), t1, 0.8, t1, {
      decayPolicy: {
        kind: "half-life",
        halfLifeMs: 3_600_000 as Milliseconds,
        doubtedThreshold: 0.5 as Confidence,
        forgetFloor: 0.1 as Confidence,
      },
    }).state;

    // Force a real tombstone via the real lazy decay-sweep path (query(), not a hand-built TombstonedMemory).
    const t2 = new Date(Date.parse(t1) + 3_600_000 * 10).toISOString() as CapturedAt;
    const { result, state: nextState } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, t2);
    expect(result.answer.status).toBe("unknown");
    expect(nextState.live).toHaveLength(0);
    expect(nextState.tombstoned).toHaveLength(1);

    // A second query, at the exact same moment, over the resulting state: still nothing to find in `live` for this memory to be queried FROM at all -- it is not merely "reported as unknown", it structurally is not a candidate in the array queryBelief's own type would even accept.
    const { result: again } = query(nextState, SUBJECT, "coffee-order", DEFAULT_SCOPE, t2);
    expect(again.answer.status).toBe("unknown");
    expect(again.answer.status === "unknown" && again.answer.reason).toBe("all-known-memories-tombstoned");
  });
});

import { describe, expect, it } from "vitest";
import type { CapturedAt } from "../../../lib/contracts/captured-at.js";
import type { DecayPolicy } from "../../../lib/contracts/decay-policy.js";
import { EMPTY_STORE, closeScope, query, recordFact, revokeSource, type StoreState } from "../store.js";
import { derivedInference, humanAvowal } from "../provenance.js";
import { DEFAULT_SCOPE, SUBJECT, type Predicate, type PredicateValueMap } from "../vocabulary.js";
import { afterMs, ONE_DAY_MS, SHORT_HALF_LIFE_POLICY, T0 } from "./fixtures.js";

function record<P extends Predicate>(
  state: StoreState,
  predicate: P,
  value: PredicateValueMap[P],
  source: ReturnType<typeof humanAvowal>,
  believedAtRaw: string,
  confidenceRaw: number,
  now: CapturedAt,
  extra: { readonly decayPolicy?: DecayPolicy } = {},
) {
  const outcome = recordFact(
    state,
    {
      predicate,
      value,
      source,
      believedAtRaw,
      confidenceRaw,
      utterance: `utterance for ${predicate}`,
      ...extra,
    },
    now,
  );
  if (!outcome.ok) {
    throw new Error(`test setup failure: ${JSON.stringify(outcome.error)}`);
  }
  return outcome.result;
}

describe("recordFact — eager write-time resolution", () => {
  it("two same-tier direct-avowal memories disagreeing: contradicted, older tombstoned, newer live (the §8 case)", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "shipping-address", { line1: "42 Elm Street", city: "Portland", state: "OR" }, humanAvowal("user:vlad"), T0, 0.9, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "shipping-address", { line1: "118 Birch Avenue", city: "Seattle", state: "WA" }, humanAvowal("user:vlad"), t2, 0.9, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(1);
    const tombstone = r2.newTombstones[0]?.tombstone;
    expect(tombstone?.reason).toBe("contradicted");
    expect(tombstone?.reason === "contradicted" && tombstone.supersededBy).toBe(r2.written.id);
    expect(state.live).toHaveLength(1);
    expect(state.live[0]?.value).toEqual({ line1: "118 Birch Avenue", city: "Seattle", state: "WA" });
  });

  it("two same-tier derived-inference memories disagreeing: disputed, both stay live, nothing tombstoned", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Austin", derivedInference("integration:calendar"), T0, 0.6, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "current-city", "Denver", derivedInference("integration:contacts"), t2, 0.55, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(0);
    expect(state.live).toHaveLength(2);
    const { result } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, t2);
    expect(result.answer.status).toBe("disputed");
  });

  it("same value, newer source strictly outranks older: reason SUPERSEDED (the one real case for this ForgetReason)", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Denver", derivedInference("integration:contacts"), T0, 0.55, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "current-city", "Denver", humanAvowal("user:vlad"), t2, 0.95, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(1);
    const tombstone = r2.newTombstones[0]?.tombstone;
    expect(tombstone?.reason).toBe("superseded");
    expect(tombstone?.reason === "superseded" && tombstone.supersededBy).toBe(r2.written.id);
    expect(state.live).toHaveLength(1);
    expect(state.live[0]?.source.tier).toBe("direct-avowal");
  });

  it("same value, SAME tier restated: no reconfirm-supersede — both remain live (the disclosed affirm() gap)", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "timezone", "America/Los_Angeles", humanAvowal("user:vlad"), T0, 0.9, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "timezone", "America/Los_Angeles", humanAvowal("user:vlad"), t2, 0.9, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(0);
    expect(state.live).toHaveLength(2);
  });

  it("same value, newer source is OUTRANKED: no reconfirm-supersede — both remain live", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Denver", humanAvowal("user:vlad"), T0, 0.95, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "current-city", "Denver", derivedInference("integration:contacts"), t2, 0.55, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(0);
    expect(state.live).toHaveLength(2);
  });
});

describe("query — the read path over this domain's own filtered corpus", () => {
  it("unknown/no-memory for a predicate never recorded", () => {
    const { result } = query(EMPTY_STORE, SUBJECT, "shipping-address", DEFAULT_SCOPE, T0);
    expect(result.answer).toEqual({ status: "unknown", reason: "no-memory", tombstones: [] });
  });

  it("believed right after recording, doubted after one half-life, unknown/all-tombstoned after enough half-lives — and the lazy sweep is PERSISTED into the returned state", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.85, T0, { decayPolicy: SHORT_HALF_LIFE_POLICY });
    state = r1.state;

    const believedNow = T0;
    const believed = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, believedNow);
    expect(believed.result.answer.status).toBe("believed");
    state = believed.state;

    const doubtedNow = afterMs(T0, ONE_DAY_MS); // one half-life: 0.85 * 0.5 = 0.425 < doubtedThreshold 0.5
    const doubted = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, doubtedNow);
    expect(doubted.result.answer.status).toBe("doubted");
    state = doubted.state;
    expect(state.live).toHaveLength(1); // still live, just doubted

    const forgottenNow = afterMs(T0, ONE_DAY_MS * 10); // ten half-lives: far below forgetFloor 0.1
    const forgotten = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, forgottenNow);
    expect(forgotten.result.answer.status).toBe("unknown");
    expect(forgotten.result.answer.status === "unknown" && forgotten.result.answer.reason).toBe("all-known-memories-tombstoned");
    state = forgotten.state;

    // The lazy discovery is now part of this domain's own state, not just this call's return value.
    expect(state.live).toHaveLength(0);
    expect(state.tombstoned).toHaveLength(1);
    expect(state.tombstoned[0]?.tombstone.reason).toBe("age-exceeded");

    // Querying again at the same moment must not mint a SECOND tombstone for the same memory.
    const again = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, forgottenNow);
    expect(again.result.newlyForgotten).toHaveLength(0);
    expect(again.state.tombstoned).toHaveLength(1);
  });
});

describe("revokeSource — a plain, direct filter; no registry", () => {
  it("tombstones every live, revocable memory sharing sourceId, reason source-revoked", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Austin", derivedInference("integration:calendar"), T0, 0.6, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "linked-calendar-location", "Building 4", derivedInference("integration:calendar"), t2, 0.7, t2);
    state = r2.state;

    const t3 = afterMs(T0, ONE_DAY_MS * 2);
    state = revokeSource(state, "integration:calendar", t3);

    expect(state.live).toHaveLength(0);
    expect(state.tombstoned).toHaveLength(2);
    expect(state.tombstoned.every((t) => t.tombstone.reason === "source-revoked")).toBe(true);
  });

  it("leaves a non-revocable memory untouched even if sourceId matches", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Austin", derivedInference("integration:calendar", { revocable: false }), T0, 0.6, T0);
    state = r1.state;

    const t2 = afterMs(T0, ONE_DAY_MS);
    state = revokeSource(state, "integration:calendar", t2);

    expect(state.live).toHaveLength(1);
    expect(state.tombstoned).toHaveLength(0);
  });

  it("does not touch memories from a different sourceId", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "current-city", "Denver", derivedInference("integration:contacts"), T0, 0.55, T0);
    state = r1.state;

    const t2 = afterMs(T0, ONE_DAY_MS);
    state = revokeSource(state, "integration:calendar", t2);

    expect(state.live).toHaveLength(1);
  });
});

describe("closeScope — the real scope-exited trigger: account deletion", () => {
  it("tombstones every live memory scoped within the closing scope, reason scope-exited", () => {
    let state: StoreState = EMPTY_STORE;
    const r1 = record(state, "shipping-address", { line1: "118 Birch Avenue", city: "Seattle", state: "WA" }, humanAvowal("user:vlad"), T0, 0.9, T0);
    state = r1.state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "timezone", "America/Los_Angeles", humanAvowal("user:vlad"), t2, 0.9, t2);
    state = r2.state;

    const t3 = afterMs(T0, ONE_DAY_MS * 2);
    state = closeScope(state, DEFAULT_SCOPE, t3);

    expect(state.live).toHaveLength(0);
    expect(state.tombstoned).toHaveLength(2);
    expect(state.tombstoned.every((t) => t.tombstone.reason === "scope-exited")).toBe(true);
  });

  it("leaves a memory scoped OUTSIDE the closing scope untouched", () => {
    const outcome = recordFact(
      EMPTY_STORE,
      {
        predicate: "shipping-address",
        value: { line1: "1 Other Way", city: "Elsewhere", state: "CA" },
        source: humanAvowal("user:sam"),
        believedAtRaw: T0,
        confidenceRaw: 0.9,
        utterance: "irrelevant",
        scope: [{ dimension: "user", value: "sam" }],
      },
      T0,
    );
    if (!outcome.ok) throw new Error("test setup failure");
    let state: StoreState = outcome.result.state;

    const t2 = afterMs(T0, ONE_DAY_MS);
    state = closeScope(state, DEFAULT_SCOPE, t2);

    expect(state.live).toHaveLength(1);
    expect(state.tombstoned).toHaveLength(0);
  });
});

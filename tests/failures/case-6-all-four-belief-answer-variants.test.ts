import { describe, expect, it } from "vitest";
import type { BeliefAnswer } from "../../lib/contracts/belief-answer.js";
import type { Milliseconds } from "../../lib/contracts/captured-at.js";
import type { Confidence } from "../../lib/contracts/confidence.js";
import { rankBySimilarity } from "../../domains/personal-assistant/baseline.js";
import { derivedInference, humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query, type StoreState } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { afterMs, ONE_HOUR_MS, record, T0 } from "./fixtures.js";

/**
 * M7 CASE 6 — `memory-plan.md` §2: this system's read path is a "closed,
 * exhaustively-matched query outcome... three of whose four variants...
 * are literally impossible for a similarity ranker to produce, because
 * they require the store to have compared its own contents against each
 * other and against a forgetting policy *before* the query ever arrives,
 * and to be willing to hand back 'no current answer' instead of a ranked
 * one." This case pins BOTH halves of that sentence: that a real corpus,
 * run through the real engine, genuinely reaches all four `BeliefAnswer`
 * variants (not merely that the type permits four), AND that the fair
 * baseline, run against the SAME kind of corpus, has no representation for
 * three of them at all — it always returns a ranking.
 *
 * FULL PIN. `scripts/demo-memory.ts` already exercises all four variants
 * end to end (its own `assertVariant` calls, run via `npm run
 * demo:memory`) — but that is a script, not part of `npm test`, and its
 * assertions are `node:assert`, not a vitest-reported failure. This file
 * is the same claim, independently reconstructed as an actual test that
 * `npm test -- failures` runs and reports, with a trimmed corpus (three
 * predicates, not the demo's five) built only to reach each variant once.
 */

describe("Case 6 — all four BeliefAnswer variants, each reached from a real corpus via the real engine", () => {
  it("believed, doubted, disputed, and unknown (both reasons) all occur across one running store", () => {
    const seen = new Set<BeliefAnswer["status"]>();
    let state: StoreState = EMPTY_STORE;

    // ---- unknown / no-memory: nothing has ever been said about this subject/predicate. ----
    {
      const { result } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, T0);
      expect(result.answer.status).toBe("unknown");
      expect(result.answer.status === "unknown" && result.answer.reason).toBe("no-memory");
      seen.add(result.answer.status);
    }

    // ---- believed: a single fresh, uncontested direct avowal. ----
    const shortHalfLife = { kind: "half-life" as const, halfLifeMs: ONE_HOUR_MS as Milliseconds, doubtedThreshold: 0.5 as Confidence, forgetFloor: 0.15 as Confidence };
    {
      const r = record(state, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.85, T0, { decayPolicy: shortHalfLife });
      state = r.state;
      const { result } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, T0);
      expect(result.answer.status).toBe("believed");
      seen.add(result.answer.status);
    }

    // ---- doubted: the SAME memory, queried again after it has decayed past doubtedThreshold but not yet forgetFloor. ----
    {
      const tDoubted = afterMs(T0, ONE_HOUR_MS * 1.5); // 0.85 * 0.5^1.5 ~= 0.30 -- below 0.5, above 0.15.
      const { result, state: s } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, tDoubted);
      state = s;
      expect(result.answer.status).toBe("doubted");
      expect(result.answer.status === "doubted" && result.answer.reason).toBe("age-exceeded");
      seen.add(result.answer.status);
    }

    // ---- unknown / all-known-memories-tombstoned: the same memory, queried once it has fully decayed away. ----
    {
      const tGone = afterMs(T0, ONE_HOUR_MS * 6); // 0.85 * 0.5^6 ~= 0.013 -- below forgetFloor 0.15.
      const { result, state: s } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, tGone);
      state = s;
      expect(result.answer.status).toBe("unknown");
      expect(result.answer.status === "unknown" && result.answer.reason).toBe("all-known-memories-tombstoned");
      seen.add(result.answer.status);
    }

    // ---- disputed: two same-tier derived-inference memories disagreeing, both still fresh. ----
    {
      const t1 = afterMs(T0, ONE_HOUR_MS * 10);
      const r1 = record(state, "current-city", "Austin", derivedInference("integration:calendar"), t1, 0.6, t1);
      state = r1.state;
      const t2 = afterMs(t1, 1000);
      const r2 = record(state, "current-city", "Denver", derivedInference("integration:contacts"), t2, 0.55, t2);
      state = r2.state;
      expect(r2.newTombstones).toHaveLength(0); // both stay live -- confirms this is a genuine dispute, not eagerly resolved at write time.
      const { result } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, t2);
      expect(result.answer.status).toBe("disputed");
      seen.add(result.answer.status);
    }

    expect([...seen].sort()).toEqual(["believed", "disputed", "doubted", "unknown"]);
  });

  it("THE CONTRAST: the fair baseline, given a corpus shaped like the doubted/disputed/unknown cases above, has no representation for any of them -- it always returns a ranked list, never refuses", () => {
    // "unknown" case for the engine: an empty corpus. The baseline still ranks -- an empty statement list, not a refusal.
    const emptyRanking = rankBySimilarity("what do I usually order?", []);
    expect(emptyRanking).toEqual([]); // note: this is "nothing to rank", not "I don't currently believe anything" -- a populated-but-fully-tombstoned corpus (below) is the sharper case.

    // "disputed"-shaped case for the engine: two genuinely conflicting statements. The baseline does not detect the conflict at all -- it just ranks both, picks a top-1, and never surfaces that they disagree.
    const disputedRanking = rankBySimilarity("where do I currently live?", [
      { id: "austin", text: "My calendar says I'm in Austin right now." },
      { id: "denver", text: "My contacts sync says I'm currently in Denver." },
    ]);
    expect(disputedRanking).toHaveLength(2); // both ranked, neither refused, no "disputed" concept exists to reach for.
    expect(disputedRanking.every((r) => Number.isFinite(r.score))).toBe(true);

    // "all-known-memories-tombstoned"-shaped case: a statement the engine would have long since forgotten. The baseline has no forgetting policy at all -- an old, retracted statement ranks exactly as well as it always did, forever.
    const staleOnlyRanking = rankBySimilarity("what's my coffee order?", [{ id: "ancient", text: "My usual coffee order is an oat milk latte." }]);
    expect(staleOnlyRanking).toHaveLength(1);
    expect(staleOnlyRanking[0]?.score).toBeGreaterThan(0); // ranks it as a real, positive-scoring match -- no notion of "this is stale, refuse to answer" exists in this function at all.
  });
});

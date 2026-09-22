import { describe, expect, it } from "vitest";
import { effectiveConfidence } from "../../lib/contracts/effective-confidence.js";
import { queryConfidence } from "../../lib/decay/query-confidence.js";
import { rankBySimilarity } from "../../domains/personal-assistant/baseline.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { afterMs, ONE_DAY_MS, record, T0 } from "./fixtures.js";

/**
 * M7 CASE 4 — `PLAN.md`'s M7 criterion (4) and `memory-plan.md` §8's own
 * demo moment, run as a real, passing test against the unmodified
 * baseline, not demo narration: "the fair bag-of-words/cosine baseline...
 * given the two address memories and the query 'What's my shipping
 * address?', the baseline is asserted to rank the *old* statement higher
 * (it alone shares the token 'shipping' with the query), while
 * `BeliefQuery` is asserted to return the current address."
 *
 * FULL PIN. Reuses `scripts/demo-memory.ts`'s own exact corpus (the two
 * literal utterances from its steps 1 and 10, and the query from step 11)
 * rather than re-deriving new text, per `.genesis/decisions/
 * 0005-domain.md`'s own forward note for M7: "the failure suite's own
 * required baseline contrast can import `domains/personal-assistant/
 * baseline.ts`'s `rankBySimilarity` directly against the exact two
 * utterances `scripts/demo-memory.ts` uses... rather than re-deriving the
 * corpus." Neither the baseline's scoring (`baseline.ts`) nor the corpus
 * text is touched or tuned by this file — `git diff main -- domains`
 * (reported in this milestone's own build report) stays empty for exactly
 * this reason.
 *
 * THE EXACT NUMBERS ARE PINNED, NOT JUST THE ORDERING — so a future
 * corpus edit that quietly makes the contrast vanish (a rephrased
 * statement that happens to still rank OLD first, but for a different,
 * accidental reason) fails loudly rather than silently continuing to pass
 * on the ordering assertion alone. The two scores below
 * (0.53033.../0.31623...) are exactly what `domains/personal-assistant/
 * __tests__/baseline.test.ts`'s own "hand-worked arithmetic" test already
 * derives by hand for this identical corpus (`3 / (2*sqrt(8))` and
 * `2 / (2*sqrt(10))`) — cited here, not re-derived, and reproduced
 * independently below via the real `rankBySimilarity` call.
 */

const QUERY = "What's my shipping address?";
const OLD_UTTERANCE = "My shipping address is 42 Elm Street, Portland.";
const NEW_UTTERANCE = "I moved — my new address is 118 Birch Avenue, Seattle.";
const OLD_ADDRESS = { line1: "42 Elm Street", city: "Portland", state: "OR" };
const NEW_ADDRESS = { line1: "118 Birch Avenue", city: "Seattle", state: "WA" };

describe("Case 4 — the fair baseline genuinely loses, and this system genuinely wins, on the SAME two input facts", () => {
  it("THE REQUIRED CONTRAST: the unmodified baseline ranks the stale statement higher; the real engine answers with the current address and can prove why the old one no longer counts", () => {
    let state = EMPTY_STORE;
    const t1 = T0;
    state = record(state, "shipping-address", OLD_ADDRESS, humanAvowal("user:vlad"), t1, 0.9, t1).state;
    const t2 = afterMs(t1, ONE_DAY_MS * 200); // "months later" -- matches §8's own narrative gap.
    const writeResult = record(state, "shipping-address", NEW_ADDRESS, humanAvowal("user:vlad"), t2, 0.9, t2);
    state = writeResult.state;
    expect(writeResult.newTombstones).toHaveLength(1);
    const oldTombstoned = writeResult.newTombstones[0];
    expect(oldTombstoned?.tombstone.reason).toBe("contradicted");

    // ---- The fair baseline: real cosine similarity, exact same query and corpus, nothing tuned. ----
    const ranked = rankBySimilarity(QUERY, [
      { id: "old", text: OLD_UTTERANCE },
      { id: "new", text: NEW_UTTERANCE },
    ]);
    const oldScore = ranked.find((r) => r.id === "old")?.score;
    const newScore = ranked.find((r) => r.id === "new")?.score;
    expect(oldScore).toBeCloseTo(0.5303300858899106, 10); // 3 / (2*sqrt(8))
    expect(newScore).toBeCloseTo(0.31622776601683794, 10); // 2 / (2*sqrt(10))
    expect(oldScore).toBeGreaterThan(newScore ?? Number.POSITIVE_INFINITY);
    expect(ranked[0]?.id).toBe("old"); // the fair baseline's top-1 answer really is the STALE statement.

    // ---- This system, same two facts, same query moment: correctly answers current. ----
    const t3 = afterMs(t2, 1000);
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t3);
    expect(result.answer.status).toBe("believed");
    expect(result.answer.status === "believed" && result.answer.memory.value).toEqual(NEW_ADDRESS);

    // ---- And can prove why the old one no longer counts: effectiveConfidence/queryConfidence both zero, recorded confidence untouched, a real tombstone naming the exact successor. ----
    expect(oldTombstoned?.confidence).toBe(0.9); // recorded history, untouched.
    expect(oldTombstoned && effectiveConfidence(oldTombstoned, t3)).toBe(0);
    expect(oldTombstoned && queryConfidence(oldTombstoned, t3)).toBe(0);
    expect(oldTombstoned?.tombstone.reason === "contradicted" && oldTombstoned.tombstone.supersededBy).toBe(writeResult.written.id);
  });

  it("ROBUSTNESS: the contrast holds across five differently-phrased, natural follow-up questions, not one cherry-picked query -- each still shares more vocabulary with the stale statement", () => {
    const alternativePhrasings = [
      "Can you remind me of my shipping address?",
      "Where do you have my shipping address on file?",
      "Do you know my shipping address?",
      "Tell me my shipping address again.",
      "What's my address?",
    ];
    for (const phrasing of alternativePhrasings) {
      const ranked = rankBySimilarity(phrasing, [
        { id: "old", text: OLD_UTTERANCE },
        { id: "new", text: NEW_UTTERANCE },
      ]);
      const oldScore = ranked.find((r) => r.id === "old")?.score ?? -1;
      const newScore = ranked.find((r) => r.id === "new")?.score ?? Number.POSITIVE_INFINITY;
      expect(oldScore, `phrasing "${phrasing}" should still rank the stale statement higher`).toBeGreaterThan(newScore);
      expect(ranked[0]?.id).toBe("old");
    }
  });

  it("STRUCTURAL, NOT MERELY EMPIRICAL: the real engine's own read path never even receives the literal query text at all -- BeliefQuery is called with (subject, predicate, scope, now), no free-text phrasing parameter exists for wording to sway", () => {
    // query()'s own signature (store.ts) has no string-query parameter --
    // confirmed by construction: this call never passes QUERY or any of
    // the five alternative phrasings above, and produces the identical
    // "believed: NEW_ADDRESS" answer regardless of how a hypothetical
    // front end phrased the user's question. Only the BASELINE (above)
    // has a phrasing to be swayed by at all -- the structural asymmetry
    // memory-plan.md §2 argues for, made concrete rather than asserted.
    let state = EMPTY_STORE;
    state = record(state, "shipping-address", OLD_ADDRESS, humanAvowal("user:vlad"), T0, 0.9, T0).state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    state = record(state, "shipping-address", NEW_ADDRESS, humanAvowal("user:vlad"), t2, 0.9, t2).state;
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, afterMs(t2, 1000));
    expect(result.answer.status === "believed" && result.answer.memory.value).toEqual(NEW_ADDRESS);
  });
});

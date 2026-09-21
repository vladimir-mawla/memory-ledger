import { useMemo, type JSX } from "react";
import type { BeliefAnswer } from "../lib/contracts/belief-answer.js";
import { rankBySimilarity } from "../domains/personal-assistant/index.js";
import { card, mono, muted } from "./styles.js";

/**
 * `BaselinePanel` — the fair-baseline half of §8's side-by-side moment.
 * Calls the real, unmodified `rankBySimilarity` (`domains/personal-
 * assistant/baseline.ts`) directly, on whatever `oldText`/`newText`/
 * `queryText` this component is actually handed — never a pre-baked score.
 * `DemoAssistant` passes the utterances that were REALLY SENT (captured at
 * send time) and the question that was REALLY ASKED, not live textbox
 * state that could have drifted since — so the two numbers below are
 * always the real scores for the real two facts and the real query this
 * run of the page used, matching `memory-plan.md` §8's own requirement
 * ("the SAME two input facts and the SAME query").
 *
 * FAIRNESS, STATED ON SCREEN, NOT JUST IN THIS COMMENT — `memory-plan.md`
 * §8 was corrected once for calling an earlier draft of this contrast
 * "rigged"; the fix was making the baseline's own scoring legible to a
 * skeptical reader, not merely asserting it is fair. The paragraph
 * rendered below states exactly what `rankBySimilarity` computes (see
 * `baseline.ts`'s own header for the full argument) so a viewer can check
 * it themselves, and both scores are always shown — never just the
 * winner.
 *
 * This panel NEVER imports `queryBelief`, `Memory`, `Tombstone`, or
 * `Confidence` — the baseline has no notion of any of them, which is the
 * whole point being demonstrated: it always returns a ranking, on any
 * corpus, with no way to say "I don&rsquo;t currently believe either of
 * these."
 *
 * `ledgerStatus` — the ONE thing this panel reads from the real engine's
 * side, purely to decide which of two TRUE, pre-written sentences to show
 * underneath the table (never to alter the ranking, the scores, or which
 * row is marked "baseline's pick" — those come only from `rankBySimilarity`
 * above). When `DemoAssistant`'s second-message toggle produces `disputed`
 * instead of `believed`, the contrast sharpens: the real ledger just
 * reported it has NO mechanical basis to prefer either candidate, while
 * this baseline — on the exact same two statements — still confidently
 * returns one ranked "winner" regardless. A top-k ranker cannot represent
 * "I don&rsquo;t know which one," even when that is the honest answer.
 */
export function BaselinePanel({
  queryText,
  oldText,
  oldLabel,
  newText,
  newLabel,
  ledgerStatus,
}: {
  readonly queryText: string;
  readonly oldText: string;
  readonly oldLabel: string;
  readonly newText: string;
  readonly newLabel: string;
  readonly ledgerStatus: BeliefAnswer["status"];
}): JSX.Element {
  const ranked = useMemo(
    () =>
      rankBySimilarity(queryText, [
        { id: "old", text: oldText },
        { id: "new", text: newText },
      ]),
    [queryText, oldText, newText],
  );
  const top = ranked[0];

  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>Fair baseline&rsquo;s answer</h3>
      <p style={muted}>
        A plain bag-of-words / cosine-similarity ranker — <code style={mono}>rankBySimilarity()</code> in{" "}
        <code style={mono}>domains/personal-assistant/baseline.ts</code>, called just now on the same two
        statements and the same question. No stopword tuning, no field weighting, no synonym table, no
        recency signal of any kind: exactly the retrieval mechanism this whole project argues cannot know
        what it should have forgotten. Both scores are shown, not just the winner, so you can check this
        wasn&rsquo;t tuned.
      </p>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left" }}>
            <th style={{ paddingBottom: "0.4rem" }}>Statement</th>
            <th style={{ paddingBottom: "0.4rem" }}>Cosine similarity</th>
          </tr>
        </thead>
        <tbody>
          {ranked.map((r) => (
            <tr key={r.id} style={{ borderTop: "1px solid #8884" }}>
              <td style={{ padding: "0.4rem 0", maxWidth: 260 }}>
                <div>
                  <strong>{r.id === "old" ? oldLabel : newLabel}</strong>
                </div>
                <div style={muted}>&ldquo;{r.text}&rdquo;</div>
              </td>
              <td style={{ padding: "0.4rem 0" }}>
                <code style={mono}>{r.score.toFixed(4)}</code>
                {r.id === top?.id ? " ← baseline's pick" : ""}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {top ? (
        <p style={{ marginTop: "0.75rem" }}>
          <strong>Baseline&rsquo;s answer:</strong> {top.id === "old" ? oldLabel : newLabel} — ranked higher
          purely because its wording is textually closer to the question&rsquo;s own phrasing: a fact about the
          words, not about which statement the real engine currently treats as current. It has no mechanism
          for &ldquo;this was superseded&rdquo; at all — it only ever ranks, never refuses.
        </p>
      ) : null}
      {ledgerStatus === "disputed" ? (
        <p style={{ marginTop: "0.75rem" }}>
          <strong>Notice what this baseline just did:</strong> the real ledger, on this exact pair, just
          reported it has no mechanical basis to prefer either candidate — see the panel on the left. This
          baseline has no such option. It always ranks, and always hands back exactly one &ldquo;winner,&rdquo;
          even here, where the honest answer is that neither candidate should be preferred. That is not a
          missing feature this baseline forgot to add — a plain similarity ranking has no way to represent
          &ldquo;I don&rsquo;t know which one&rdquo; at all.
        </p>
      ) : null}
    </div>
  );
}

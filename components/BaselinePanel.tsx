import { useMemo, type JSX } from "react";
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
 */
export function BaselinePanel({
  queryText,
  oldText,
  oldLabel,
  newText,
  newLabel,
}: {
  readonly queryText: string;
  readonly oldText: string;
  readonly oldLabel: string;
  readonly newText: string;
  readonly newLabel: string;
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
          purely because its wording is textually closer to the question&rsquo;s own phrasing, regardless of
          which statement is actually still true. It has no mechanism for &ldquo;this was superseded&rdquo; at
          all — it only ever ranks, never refuses.
        </p>
      ) : null}
    </div>
  );
}

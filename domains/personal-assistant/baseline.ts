/**
 * `domains/personal-assistant/baseline.ts` — the fair, minimal,
 * DELIBERATELY NAIVE similarity-ranking baseline `memory-plan.md` §8
 * requires, spelled out exactly so a reader can check it is fair rather
 * than asserting it: "bag-of-words term-frequency vectors over lowercased,
 * punctuation-stripped tokens for the query and for each stored statement,
 * ranked by cosine similarity, returning the address associated with the
 * highest-scoring statement. No stopword tuning, no field weighting, no
 * synonym table, no recency signal of any kind."
 *
 * THIS IS NOT PART OF THIS PROJECT'S OWN READ PATH. It never calls
 * `queryBelief`, never sees a `Memory`, `Tombstone`, `Confidence`, or
 * `DecayPolicy` — it exists ONLY to be compared against `store.ts`'s
 * `query`, on the SAME two input facts (`scripts/demo-memory.ts`'s own
 * corpus), so a reader can see the structural difference §2 argues for
 * rather than take it on faith. Living in `domains/`, not `lib/`, is
 * itself part of that argument: this is domain-demo tooling, not a second
 * engine this project also happens to ship.
 *
 * DETERMINISTIC, NOT A REAL EMBEDDING CALL — §8's own settled reasoning,
 * restated here because this file is where it is honored: a real
 * embedding model would be this repo's first network/model dependency,
 * would break the client-side-only demo pattern, and would make the
 * on-screen ranking non-deterministic in front of a judge. Bag-of-words
 * term frequency and cosine similarity are both pure, closed-form
 * arithmetic over the input text alone — the SAME two inputs always
 * produce the SAME ranking, forever, on any machine, with no model
 * weights to version or network call to fail.
 *
 * NO STOPWORD LIST, NO STEMMING, NO SYNONYM TABLE — every one of those
 * would be a tuning knob this file's own credibility depends on NOT
 * having. `tokenize` below does exactly two things: lowercase, and strip
 * every character that is not a Unicode letter or digit (Unicode-aware —
 * `\p{L}`/`\p{N}` — so this is not silently English-only, even though
 * this domain's own corpus happens to be English). Nothing else.
 */

export interface ScoredStatement {
  readonly id: string;
  readonly text: string;
  readonly score: number;
}

/** Lowercase, then strip every non-letter/non-digit character (Unicode-aware), then split on whitespace, dropping empty tokens produced by stripped punctuation. No stopwords, no stemming — see file header. */
export function tokenize(text: string): readonly string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .split(/\s+/)
    .filter((token) => token.length > 0);
}

/** Plain term-frequency counts — how many times each token appears, nothing normalized, nothing weighted (no TF-IDF, no field boosting: §8's own "no field weighting" line). */
function termFrequencies(tokens: readonly string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}

/** Standard cosine similarity between two term-frequency vectors, each represented as a sparse `Map`. `0` if either vector is entirely empty (an all-punctuation or empty string) — division by a zero magnitude is undefined, not "maximally similar" or "maximally dissimilar"; treating it as `0` is the same "fails closed rather than fabricates a number" instinct the rest of this codebase applies everywhere else, even though this file is explicitly NOT part of the engine's own fail-closed guarantees (a baseline has no obligation to refuse an answer — that refusal capability is precisely what this project has and plain similarity ranking does not, per §2). */
export function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  for (const [token, countA] of a) {
    const countB = b.get(token);
    if (countB !== undefined) {
      dot += countA * countB;
    }
  }
  const magnitude = (v: Map<string, number>) => Math.sqrt([...v.values()].reduce((sum, c) => sum + c * c, 0));
  const magA = magnitude(a);
  const magB = magnitude(b);
  if (magA === 0 || magB === 0) {
    return 0;
  }
  return dot / (magA * magB);
}

/**
 * `rankBySimilarity` — the whole baseline. Scores every `statement`
 * against `query` by cosine similarity over bag-of-words term frequency,
 * returns ALL of them (not just the top-1) sorted highest-first, WITH
 * their scores — `memory-plan.md`'s M8 row requires both numbers visible
 * on screen, "so a viewer can check it wasn't tuned"; returning only a
 * winner would make that impossible for any caller of this function, not
 * only the UI.
 *
 * A plain retrieval baseline ALWAYS returns a ranking, even over a corpus
 * with nothing currently true to say — §2's own point, made structural
 * here too: this function has no "unknown" to return, no notion of
 * "nothing currently believed," just a list, always, regardless of
 * whether either statement is stale, retracted, or contradicted. That
 * absence is not a bug in this file — it is the exact thing this whole
 * project exists to contrast against `store.ts`'s `query`.
 */
export function rankBySimilarity(query: string, statements: ReadonlyArray<{ readonly id: string; readonly text: string }>): readonly ScoredStatement[] {
  const queryVector = termFrequencies(tokenize(query));
  return statements
    .map((statement) => ({
      id: statement.id,
      text: statement.text,
      score: cosineSimilarity(queryVector, termFrequencies(tokenize(statement.text))),
    }))
    .sort((a, b) => b.score - a.score);
}

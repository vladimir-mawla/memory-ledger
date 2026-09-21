import { describe, expect, it } from "vitest";
import { cosineSimilarity, rankBySimilarity, tokenize } from "../baseline.js";

describe("tokenize — lowercase, strip punctuation, split on whitespace; no stopwords, no stemming", () => {
  it("lowercases and strips punctuation", () => {
    expect(tokenize("My Shipping Address is 42 Elm Street, Portland.")).toEqual(["my", "shipping", "address", "is", "42", "elm", "street", "portland"]);
  });

  it("drops tokens produced entirely of stripped punctuation (an em dash between spaces)", () => {
    expect(tokenize("I moved — my new address is 118 Birch Avenue, Seattle.")).toEqual([
      "i",
      "moved",
      "my",
      "new",
      "address",
      "is",
      "118",
      "birch",
      "avenue",
      "seattle",
    ]);
  });

  it("strips an apostrophe without introducing a spurious token boundary", () => {
    expect(tokenize("What's my shipping address?")).toEqual(["whats", "my", "shipping", "address"]);
  });
});

describe("cosineSimilarity — plain cosine similarity over term-frequency vectors", () => {
  it("is 1 for identical bags of words", () => {
    const a = new Map([["x", 2]]);
    const b = new Map([["x", 2]]);
    expect(cosineSimilarity(a, b)).toBeCloseTo(1, 10);
  });

  it("is 0 for disjoint vocabularies", () => {
    const a = new Map([["x", 1]]);
    const b = new Map([["y", 1]]);
    expect(cosineSimilarity(a, b)).toBe(0);
  });

  it("is 0, not NaN, when either vector is empty", () => {
    expect(cosineSimilarity(new Map(), new Map([["x", 1]]))).toBe(0);
    expect(cosineSimilarity(new Map([["x", 1]]), new Map())).toBe(0);
    expect(cosineSimilarity(new Map(), new Map())).toBe(0);
  });
});

describe("rankBySimilarity — the exact §8 demo corpus: the fair baseline genuinely loses on real vocabulary overlap", () => {
  const QUERY = "What's my shipping address?";
  const OLD = "My shipping address is 42 Elm Street, Portland.";
  const NEW = "I moved — my new address is 118 Birch Avenue, Seattle.";

  it("ranks the OLD (stale) statement above the NEW one, because only OLD shares the word 'shipping' with the query", () => {
    const ranked = rankBySimilarity(QUERY, [
      { id: "old", text: OLD },
      { id: "new", text: NEW },
    ]);
    expect(ranked).toHaveLength(2);
    expect(ranked[0]?.id).toBe("old");
    expect(ranked[1]?.id).toBe("new");
    expect(ranked[0]?.score).toBeGreaterThan(ranked[1]?.score ?? Number.POSITIVE_INFINITY);
  });

  it("computes the exact scores by hand-worked arithmetic — a reader can check this is fair, not tuned", () => {
    // query tokens: whats, my, shipping, address (4 unique, each count 1) -> |q| = 2
    // OLD tokens: my, shipping, address, is, 42, elm, street, portland (8 unique) -> |old| = sqrt(8)
    //   dot(query, OLD) = my + shipping + address = 3 -> cos = 3 / (2*sqrt(8))
    // NEW tokens: i, moved, my, new, address, is, 118, birch, avenue, seattle (10 unique) -> |new| = sqrt(10)
    //   dot(query, NEW) = my + address = 2 -> cos = 2 / (2*sqrt(10))
    const ranked = rankBySimilarity(QUERY, [
      { id: "old", text: OLD },
      { id: "new", text: NEW },
    ]);
    const old = ranked.find((r) => r.id === "old");
    const fresh = ranked.find((r) => r.id === "new");
    expect(old?.score).toBeCloseTo(3 / (2 * Math.sqrt(8)), 10);
    expect(fresh?.score).toBeCloseTo(2 / (2 * Math.sqrt(10)), 10);
  });

  it("returns every statement's score, not just the winner — so the two numbers are both inspectable (PLAN.md's M8 requirement)", () => {
    const ranked = rankBySimilarity(QUERY, [
      { id: "old", text: OLD },
      { id: "new", text: NEW },
    ]);
    expect(ranked.every((r) => typeof r.score === "number" && Number.isFinite(r.score))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { compareValues, DEFAULT_VALUE_COMPARATOR, type ValueComparator } from "../value-comparator.js";

describe("compareValues — the closed value-comparison vocabulary", () => {
  describe("equals (the default)", () => {
    it("agrees on identical primitives of every Json shape", () => {
      expect(compareValues("a", "a", DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
      expect(compareValues(42, 42, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
      expect(compareValues(true, true, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
      expect(compareValues(null, null, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
    });

    it("agrees on deep-equal arrays (order-sensitive) and objects (key-order-insensitive)", () => {
      expect(compareValues([1, 2, "x"], [1, 2, "x"], DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
      expect(compareValues({ a: 1, b: 2 }, { b: 2, a: 1 }, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "agree" });
    });

    it("disagrees on same-shape, different-content values", () => {
      expect(compareValues("42 Elm Street", "118 Birch Avenue", DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "disagree" });
      expect(compareValues([1, 2], [2, 1], DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "disagree" }); // order-sensitive
      expect(compareValues({ a: 1 }, { a: 2 }, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "disagree" });
    });

    it("is inapplicable (value-type-mismatch), never 'disagree', when the top-level shapes differ", () => {
      expect(compareValues("42", 42, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "inapplicable", reason: "value-type-mismatch" });
      expect(compareValues([1, 2], "1,2", DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "inapplicable", reason: "value-type-mismatch" });
      expect(compareValues(null, false, DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "inapplicable", reason: "value-type-mismatch" });
      expect(compareValues({ a: 1 }, [1], DEFAULT_VALUE_COMPARATOR)).toEqual({ agreement: "inapplicable", reason: "value-type-mismatch" });
    });
  });

  describe("gte — a declared monotonic-non-decreasing invariant", () => {
    const gte: ValueComparator = { op: "gte" };

    it("agrees when the newer value did not go backward", () => {
      expect(compareValues(100, 150, gte)).toEqual({ agreement: "agree" });
      expect(compareValues(100, 100, gte)).toEqual({ agreement: "agree" }); // inclusive, matching decision-engine's own >= convention
    });

    it("disagrees when the newer value went backward — the invariant broke", () => {
      expect(compareValues(150, 100, gte)).toEqual({ agreement: "disagree" });
    });

    it("is inapplicable for any non-numeric value on either side", () => {
      expect(compareValues("100", 150, gte)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
      expect(compareValues(100, "150", gte)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
      expect(compareValues(NaN, 150, gte)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
    });
  });

  describe("lte — the mirror invariant", () => {
    const lte: ValueComparator = { op: "lte" };

    it("agrees when the newer value did not go up", () => {
      expect(compareValues(100, 50, lte)).toEqual({ agreement: "agree" });
      expect(compareValues(100, 100, lte)).toEqual({ agreement: "agree" });
    });

    it("disagrees when the newer value went up", () => {
      expect(compareValues(50, 100, lte)).toEqual({ agreement: "disagree" });
    });

    it("is inapplicable for non-numeric values", () => {
      expect(compareValues(true, false, lte)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
    });
  });

  describe("in — a declared synonym set for a categorical predicate", () => {
    const inSet: ValueComparator = { op: "in", values: ["active", "enabled"] };

    it("agrees when both values are in the declared set, even if not literally equal", () => {
      expect(compareValues("active", "enabled", inSet)).toEqual({ agreement: "agree" });
    });

    it("disagrees when exactly one side uses the declared vocabulary and the other plainly does not", () => {
      expect(compareValues("active", "disabled", inSet)).toEqual({ agreement: "disagree" });
      expect(compareValues("disabled", "enabled", inSet)).toEqual({ agreement: "disagree" });
    });

    it("is inapplicable when neither value is in the declared set — a comparator-configuration gap, not a conflict", () => {
      expect(compareValues("paused", "archived", inSet)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
    });

    it("is inapplicable for a non-primitive value on either side", () => {
      expect(compareValues(["active"], "enabled", inSet)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
    });

    it("is inapplicable for an empty declared set — a malformed comparator fails closed, never throws", () => {
      const empty: ValueComparator = { op: "in", values: [] };
      expect(compareValues("active", "active", empty)).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
    });
  });

  describe("tolerance — numeric epsilon, deliberately not extended to dates/strings/arrays", () => {
    it("agrees when the numeric difference is within epsilon, inclusive", () => {
      expect(compareValues(10.0, 10.04, { op: "tolerance", epsilon: 0.05 })).toEqual({ agreement: "agree" });
      expect(compareValues(10.0, 10.5, { op: "tolerance", epsilon: 0.5 })).toEqual({ agreement: "agree" }); // inclusive boundary — chosen to be exact in IEEE-754 binary, unlike 10.05 - 10.0.
    });

    it("disagrees when the numeric difference exceeds epsilon", () => {
      expect(compareValues(10.0, 10.06, { op: "tolerance", epsilon: 0.05 })).toEqual({ agreement: "disagree" });
    });

    it("is inapplicable for non-numeric values — dates, strings, and arrays get no tolerance metric in this milestone", () => {
      expect(compareValues("2026-01-01", "2026-01-02", { op: "tolerance", epsilon: 1 })).toEqual({
        agreement: "inapplicable",
        reason: "comparator-inapplicable",
      });
      expect(compareValues([1, 2], [1, 3], { op: "tolerance", epsilon: 1 })).toEqual({
        agreement: "inapplicable",
        reason: "comparator-inapplicable",
      });
    });

    it("is inapplicable for a malformed epsilon (negative or non-finite) — never throws", () => {
      expect(compareValues(1, 1, { op: "tolerance", epsilon: -1 })).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
      expect(compareValues(1, 1, { op: "tolerance", epsilon: Number.NaN })).toEqual({ agreement: "inapplicable", reason: "comparator-inapplicable" });
      expect(compareValues(1, 1, { op: "tolerance", epsilon: Number.POSITIVE_INFINITY })).toEqual({
        agreement: "inapplicable",
        reason: "comparator-inapplicable",
      });
    });

    it("zero epsilon behaves exactly like equals for numbers", () => {
      expect(compareValues(5, 5, { op: "tolerance", epsilon: 0 })).toEqual({ agreement: "agree" });
      expect(compareValues(5, 5.0001, { op: "tolerance", epsilon: 0 })).toEqual({ agreement: "disagree" });
    });
  });

  it("never throws for any of the five operators, even on hostile/malformed input", () => {
    const ops: ValueComparator[] = [
      { op: "equals" },
      { op: "gte" },
      { op: "lte" },
      { op: "in", values: [] },
      { op: "tolerance", epsilon: -5 },
    ];
    for (const comparator of ops) {
      expect(() => compareValues(undefined as never, undefined as never, comparator)).not.toThrow();
    }
  });
});

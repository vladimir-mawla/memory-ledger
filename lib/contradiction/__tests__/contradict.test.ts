import { describe, expect, it } from "vitest";
import { contradict } from "../contradict.js";
import type { Memory } from "../../contracts/memory.js";
import { FIXTURE_BELIEVED_AT, FIXTURE_LATER, FIXTURE_MUCH_LATER, derivedProvenance, fixtureMemory, humanProvenance } from "./fixtures.js";
import type { CapturedAt } from "../../contracts/captured-at.js";

describe("contradict(older, newer) — the four-outcome ContradictionCheck", () => {
  describe("no-conflict", () => {
    it("a same-value comparison is always no-conflict, regardless of source/confidence", () => {
      const older = fixtureMemory({
        source: humanProvenance(),
        confidence: 0.9 as Memory<string>["confidence"],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        source: derivedProvenance(), // deliberately a DIFFERENT source/tier — must not matter when the value agrees.
        confidence: 0.2 as Memory<string>["confidence"], // deliberately much LOWER — must not matter either.
        believedAt: FIXTURE_LATER,
      });
      const check = contradict(older, newer);
      expect(check.outcome).toBe("no-conflict");
    });
  });

  describe("§5.1's worked contrast, part 1 — superseded (same tier, both direct-avowal)", () => {
    it("two same-tier human avowals with disagreeing values resolve to superseded, naming both ids", () => {
      // "My shipping address is 42 Elm Street" ... months later ... "I moved — my new address is 118 Birch Avenue."
      const older = fixtureMemory({
        value: "42 Elm Street, Portland",
        source: humanProvenance(),
        confidence: 0.9 as Memory<string>["confidence"],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "118 Birch Avenue, Seattle",
        source: humanProvenance(),
        confidence: 0.9 as Memory<string>["confidence"],
        believedAt: FIXTURE_LATER,
      });
      const check = contradict(older, newer);
      expect(check.outcome).toBe("superseded");
      if (check.outcome === "superseded") {
        expect(check.older.id).toBe(older.id);
        expect(check.newer.id).toBe(newer.id);
      }
    });

    it("PROOF (the weakest point flagged in this milestone's own build report, now closed): two direct-avowal memories with WILDLY DIVERGENT recorded confidence (0.9 vs. 0.1) still resolve to superseded — the split is decided on tier, never on Memory.confidence", () => {
      const older = fixtureMemory({
        value: "A",
        source: humanProvenance(),
        confidence: 0.9 as Memory<string>["confidence"], // deliberately the HIGHER confidence, on the LOSING (older) side.
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "B",
        source: humanProvenance(),
        confidence: 0.1 as Memory<string>["confidence"], // deliberately the LOWER confidence, on the WINNING (newer) side.
        believedAt: FIXTURE_LATER,
      });
      const check = contradict(older, newer);
      expect(check.outcome).toBe("superseded"); // a confidence-number comparison would have said "disputed" here — that was this milestone's first-pass bug.
    });
  });

  describe("§5.1's worked contrast, part 2 — disputed (same tier, both derived-inference)", () => {
    it("two same-tier derived (OCR) inferences with disagreeing values resolve to disputed — never an automatic winner", () => {
      const older = fixtureMemory({
        value: "42 Elm Street, Portland",
        source: derivedProvenance({ sourceId: "ocr-scanner:v2" }),
        confidence: 0.6 as Memory<string>["confidence"],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "118 Birch Avenue, Seattle",
        source: derivedProvenance({ sourceId: "ocr-scanner:v2" }),
        confidence: 0.5 as Memory<string>["confidence"], // strictly lower, despite being the fresher scan.
        believedAt: FIXTURE_LATER,
      });
      const check = contradict(older, newer);
      expect(check.outcome).toBe("disputed");
      if (check.outcome === "disputed") {
        expect(check.candidates).toEqual([older, newer]);
      }
    });

    it("PROOF: same-tier derived-inference stays disputed even when the NEWER scan has the HIGHER recorded confidence — confidence is irrelevant to this branch too, not just the losing direction", () => {
      const older = fixtureMemory({
        value: "A",
        source: derivedProvenance(),
        confidence: 0.3 as Memory<string>["confidence"],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "B",
        source: derivedProvenance(),
        confidence: 0.95 as Memory<string>["confidence"], // much HIGHER than older, and still disputed.
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer).outcome).toBe("disputed");
    });
  });

  describe("§5.1's split, the other two cases — cross-tier disagreements", () => {
    it("a direct-avowal newer OUTRANKING a derived-inference older resolves to superseded, regardless of confidence — a person's own statement beats a mere inference about them", () => {
      const older = fixtureMemory({
        value: "A",
        source: derivedProvenance(),
        confidence: 0.95 as Memory<string>["confidence"], // deliberately HIGH confidence on the losing side.
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "B",
        source: humanProvenance(),
        confidence: 0.1 as Memory<string>["confidence"], // deliberately LOW confidence on the winning side.
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer).outcome).toBe("superseded");
    });

    it("a derived-inference newer, OUTRANKED by a direct-avowal older, resolves to disputed regardless of confidence — memory-plan.md §5.1's 'a fresher-but-lower-confidence value must not auto-win,' read as a tier statement: an inference arriving after a direct avowal does not overturn it", () => {
      const older = fixtureMemory({
        value: "A",
        source: humanProvenance(),
        confidence: 0.1 as Memory<string>["confidence"], // deliberately LOW confidence on the (still-not-overturned) older side.
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        value: "B",
        source: derivedProvenance(),
        confidence: 0.99 as Memory<string>["confidence"], // deliberately very HIGH confidence, and still does not win.
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer).outcome).toBe("disputed");
    });
  });

  describe("not-comparable — fails closed, never throws, never silently resolves either way", () => {
    it("a type-mismatched comparison (string vs. number) fails closed to not-comparable", () => {
      const older = fixtureMemory<string>({ value: "42", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<number>({ value: 42, believedAt: FIXTURE_LATER }) as unknown as Memory<string>;
      const check = contradict(older, newer);
      expect(check.outcome).toBe("not-comparable");
      if (check.outcome === "not-comparable") {
        expect(check.reason).toBe("value-type-mismatch");
      }
    });

    it("different subjects fail closed to not-comparable — contradiction never fires across different claims", () => {
      const older = fixtureMemory({ subject: "user:vlad.shipping-address", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ subject: "user:vlad.billing-address", believedAt: FIXTURE_LATER });
      const check = contradict(older, newer);
      expect(check).toMatchObject({ outcome: "not-comparable", reason: "different-subject-or-predicate" });
    });

    it("different predicates on the same subject also fail closed to not-comparable", () => {
      const older = fixtureMemory({ predicate: "shipping-address", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ predicate: "billing-address", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "different-subject-or-predicate" });
    });

    it("checked before value comparison: mismatched subject wins over a would-be value disagreement", () => {
      const older = fixtureMemory({ subject: "a", value: "X", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ subject: "b", value: "Y", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "different-subject-or-predicate" });
    });
  });

  describe("scope overlap — exact superset containment, checked before value comparison", () => {
    it("identical scopes overlap and proceed to value comparison", () => {
      const older = fixtureMemory({ scope: [{ dimension: "user", value: "vlad" }], believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ scope: [{ dimension: "user", value: "vlad" }], value: "B", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer).outcome).not.toBe("not-comparable");
    });

    it("a narrower newer scope contained by the older scope overlaps (older ⊇ newer)", () => {
      const older = fixtureMemory({ scope: [{ dimension: "account", value: "acme" }], believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({
        scope: [
          { dimension: "account", value: "acme" },
          { dimension: "user", value: "vlad" },
        ],
        value: "B",
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer).outcome).not.toBe("not-comparable");
    });

    it("a broader newer scope containing the older scope also overlaps (newer ⊇ older)", () => {
      const older = fixtureMemory({
        scope: [
          { dimension: "account", value: "acme" },
          { dimension: "user", value: "vlad" },
        ],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({ scope: [{ dimension: "account", value: "acme" }], value: "B", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer).outcome).not.toBe("not-comparable");
    });

    it("PARTIAL OVERLAP (ADR design question): scopes that genuinely intersect but where NEITHER contains the other are not-comparable, not silently treated as overlapping", () => {
      const older = fixtureMemory({
        scope: [
          { dimension: "account", value: "acme" },
          { dimension: "department", value: "sales" },
        ],
        believedAt: FIXTURE_BELIEVED_AT,
      });
      const newer = fixtureMemory({
        scope: [
          { dimension: "account", value: "acme" },
          { dimension: "department", value: "eng" },
        ],
        value: "B",
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "scope-not-overlapping" });
    });

    it("fully disjoint scopes are not-comparable", () => {
      const older = fixtureMemory({ scope: [{ dimension: "user", value: "vlad" }], believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ scope: [{ dimension: "user", value: "sam" }], value: "B", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "scope-not-overlapping" });
    });

    it("checked before value comparison: non-overlapping scope wins over a would-be value disagreement", () => {
      const older = fixtureMemory({ scope: [{ dimension: "user", value: "vlad" }], value: "X", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ scope: [{ dimension: "user", value: "sam" }], value: "Y", believedAt: FIXTURE_LATER });
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "scope-not-overlapping" });
    });
  });

  describe("clock ordering — believedAt, not comparison order, decides who is 'newer'", () => {
    it("a genuine tie (identical believedAt) fails closed to not-comparable", () => {
      const older = fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ value: "B", believedAt: FIXTURE_BELIEVED_AT }); // same instant, on purpose.
      expect(contradict(older, newer)).toMatchObject({ outcome: "not-comparable", reason: "clock-order-violated" });
    });

    it("the caller's own args passed out of order (first arg is actually the later claim) fails closed to not-comparable, rather than silently swapping them", () => {
      const actuallyOlder = fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT });
      const actuallyNewer = fixtureMemory({ value: "B", believedAt: FIXTURE_LATER });
      // Called backwards: (newer, older).
      expect(contradict(actuallyNewer, actuallyOlder)).toMatchObject({ outcome: "not-comparable", reason: "clock-order-violated" });
    });

    it("SYMMETRY (ADR design question): for two memories with different believedAt, at most one call order ever produces a non-not-comparable outcome", () => {
      const a = fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT });
      const b = fixtureMemory({ value: "B", believedAt: FIXTURE_LATER });

      const forward = contradict(a, b); // a is genuinely older.
      const backward = contradict(b, a); // b is genuinely newer — calling it as "older" is a misuse.

      expect(forward.outcome).not.toBe("not-comparable");
      expect(backward.outcome).toBe("not-comparable");
    });

    it("compares by real elapsed time (Date.parse), not by lexicographic string order, across differing UTC offsets", () => {
      // "03:00+02:00" and "01:30Z" are the SAME real instant class ordering
      // trap: lexicographically "01:30Z" < "03:00+02:00" as strings, but
      // 03:00+02:00 = 01:00Z, which is actually EARLIER than 01:30Z.
      const older = fixtureMemory({ value: "A", believedAt: "2026-06-01T03:00:00.000+02:00" as CapturedAt }); // = 01:00Z
      const newer = fixtureMemory({ value: "B", believedAt: "2026-06-01T01:30:00.000Z" as CapturedAt }); // = 01:30Z, genuinely later
      const check = contradict(older, newer);
      expect(check.outcome).not.toBe("not-comparable"); // a naive string compare would have called this clock-order-violated.
    });
  });

  describe("comparator vocabulary wired end-to-end through contradict", () => {
    it("gte: a newer value that did not go backward is no-conflict even though it is not exactly equal", () => {
      const older = fixtureMemory<number>({ value: 100, believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<number>({ value: 150, believedAt: FIXTURE_LATER });
      expect(contradict(older, newer, { op: "gte" }).outcome).toBe("no-conflict");
    });

    it("gte: a newer value that went backward is a real disagreement, resolved by the same tier split as any other", () => {
      const older = fixtureMemory<number>({ value: 150, confidence: 0.9 as Memory<number>["confidence"], believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<number>({ value: 100, confidence: 0.9 as Memory<number>["confidence"], believedAt: FIXTURE_LATER });
      expect(contradict(older, newer, { op: "gte" }).outcome).toBe("superseded");
    });

    it("tolerance: values within epsilon are no-conflict even though not exactly equal", () => {
      const older = fixtureMemory<number>({ value: 98.6, believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<number>({ value: 98.62, believedAt: FIXTURE_LATER });
      expect(contradict(older, newer, { op: "tolerance", epsilon: 0.05 }).outcome).toBe("no-conflict");
    });

    it("tolerance: values outside epsilon disagree", () => {
      const older = fixtureMemory<number>({ value: 98.6, believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<number>({
        value: 101.0,
        confidence: 0.9 as Memory<number>["confidence"],
        believedAt: FIXTURE_LATER,
      });
      expect(contradict(older, newer, { op: "tolerance", epsilon: 0.05 }).outcome).toBe("superseded");
    });

    it("a comparator inapplicable to the given value type fails closed to not-comparable", () => {
      const older = fixtureMemory<string>({ value: "42 Elm Street", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory<string>({ value: "118 Birch Avenue", believedAt: FIXTURE_LATER });
      const check = contradict(older, newer, { op: "gte" }); // strings under a numeric-only comparator.
      expect(check).toMatchObject({ outcome: "not-comparable", reason: "comparator-inapplicable" });
    });
  });

  describe("purity — same pair in, same answer out, no clock read", () => {
    it("calling contradict twice on the identical pair produces deep-equal results", () => {
      const older = fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT });
      const newer = fixtureMemory({ value: "B", believedAt: FIXTURE_LATER });
      const first = contradict(older, newer);
      const second = contradict(older, newer);
      expect(first).toEqual(second);
    });

    it("calling contradict on two separately-built-but-identical pairs (fresh object references each time) still produces deep-equal results — proves purity is over VALUE, not object identity", () => {
      const build = () => ({
        older: fixtureMemory({ value: "A", believedAt: FIXTURE_BELIEVED_AT }),
        newer: fixtureMemory({ value: "B", believedAt: FIXTURE_MUCH_LATER }),
      });
      const first = build();
      const second = build();
      expect(contradict(first.older, first.newer)).toEqual(contradict(second.older, second.newer));
    });
  });
});

import { describe, expect, it } from "vitest";
import { assertNeverContradictionCheck, type ContradictionCheck } from "../contradiction-check.js";
import { fixtureMemory } from "./fixtures.js";

describe("ContradictionCheck<TValue> — closed, exhaustively-matched four-outcome union", () => {
  it("no-conflict carries both compared memories", () => {
    const older = fixtureMemory();
    const newer = fixtureMemory({ believedAt: older.believedAt });
    const check: ContradictionCheck<string> = { outcome: "no-conflict", older, newer };
    expect(check.older.id).toBe(older.id);
    expect(check.newer.id).toBe(newer.id);
  });

  it("superseded names both ids — the winner (newer) and the loser (older)", () => {
    const older = fixtureMemory();
    const newer = fixtureMemory({ value: "118 Birch Avenue" });
    const check: ContradictionCheck<string> = { outcome: "superseded", older, newer };
    expect(check.older.id).toBe(older.id);
    expect(check.newer.id).toBe(newer.id);
  });

  it("disputed carries exactly two candidates, as a fixed [older, newer] tuple, never an arbitrary-length array", () => {
    const a = fixtureMemory();
    const b = fixtureMemory({ value: "118 Birch Avenue" });
    const check: ContradictionCheck<string> = { outcome: "disputed", candidates: [a, b] };
    expect(check.candidates).toHaveLength(2);
  });

  it("not-comparable carries a closed reason plus both memories", () => {
    const older = fixtureMemory();
    const newer = fixtureMemory({ subject: "user:vlad.phone-number" });
    const check: ContradictionCheck<string> = {
      outcome: "not-comparable",
      reason: "different-subject-or-predicate",
      older,
      newer,
    };
    expect(check.reason).toBe("different-subject-or-predicate");
  });

  it("TYPE-LEVEL: disputed with only one candidate does not compile", () => {
    const a = fixtureMemory();
    // @ts-expect-error — candidates is a [Memory, Memory] tuple; a one-element array does not satisfy it.
    const bad: ContradictionCheck<string> = { outcome: "disputed", candidates: [a] };
    void bad;
  });

  it("TYPE-LEVEL: not-comparable with a reason outside the closed set does not compile", () => {
    const older = fixtureMemory();
    const newer = fixtureMemory();
    const bad: ContradictionCheck<string> = {
      outcome: "not-comparable",
      // @ts-expect-error — reason is closed to NotComparableReason's five members.
      reason: "the-model-said-so",
      older,
      newer,
    };
    void bad;
  });

  it("is exhaustively matched via assertNeverContradictionCheck — every real outcome handled, no default needed", () => {
    function describeOutcome(check: ContradictionCheck<string>): string {
      switch (check.outcome) {
        case "no-conflict":
          return "no-conflict";
        case "superseded":
          return "superseded";
        case "disputed":
          return "disputed";
        case "not-comparable":
          return "not-comparable";
        default:
          return assertNeverContradictionCheck(check);
      }
    }
    const older = fixtureMemory();
    const newer = fixtureMemory();
    expect(describeOutcome({ outcome: "no-conflict", older, newer })).toBe("no-conflict");
  });

  it("PROOF (on a local, equivalent stand-in — ContradictionCheck itself stays frozen at four for this milestone): a fifth outcome fails to compile until every consumer handles it", () => {
    type HypotheticalFiveOutcomeCheck =
      | { readonly outcome: "no-conflict" }
      | { readonly outcome: "superseded" }
      | { readonly outcome: "disputed" }
      | { readonly outcome: "not-comparable" }
      | { readonly outcome: "inconclusive-retry-later" }; // the imagined fifth outcome.

    function handleFour(check: HypotheticalFiveOutcomeCheck): string {
      switch (check.outcome) {
        case "no-conflict":
          return "no-conflict";
        case "superseded":
          return "superseded";
        case "disputed":
          return "disputed";
        case "not-comparable":
          return "not-comparable";
        default: {
          // @ts-expect-error — `check` narrows to { outcome: "inconclusive-retry-later" } here, not `never`, because this switch does not handle the fifth outcome.
          const never: never = check;
          return assertNeverContradictionCheck(never);
        }
      }
    }
    expect(handleFour({ outcome: "no-conflict" })).toBe("no-conflict");
  });
});

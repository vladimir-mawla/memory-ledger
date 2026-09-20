import { describe, expect, it } from "vitest";
import { assertNeverBeliefAnswer, type BeliefAnswer } from "../belief-answer.js";
import { fixtureMemory, fixtureTombstone } from "./fixtures.js";

describe("BeliefAnswer<TValue> — closed, exhaustively-matched union", () => {
  it("believed carries the live memory and its (query-facing) confidence", () => {
    const answer: BeliefAnswer<string> = {
      status: "believed",
      memory: fixtureMemory<string>(),
      confidence: fixtureMemory<string>().confidence,
    };
    expect(answer.status).toBe("believed");
  });

  it("doubted carries a reason restricted to age-exceeded — the only doubt cause a query answer itself names", () => {
    const answer: BeliefAnswer<string> = {
      status: "doubted",
      memory: fixtureMemory<string>({ status: "doubted" }),
      confidence: fixtureMemory<string>().confidence,
      reason: "age-exceeded",
    };
    expect(answer.reason).toBe("age-exceeded");
  });

  it("disputed carries exactly two candidates, as a fixed tuple, never an arbitrary-length array", () => {
    const a = fixtureMemory<string>({ status: "disputed" });
    const b = fixtureMemory<string>({ status: "disputed", value: "118 Birch Avenue, Seattle" });
    const answer: BeliefAnswer<string> = { status: "disputed", candidates: [a, b] };
    expect(answer.candidates).toHaveLength(2);
  });

  it("unknown carries a reason plus tombstones — populated for all-known-memories-tombstoned, empty for no-memory", () => {
    const noMemory: BeliefAnswer<string> = { status: "unknown", reason: "no-memory", tombstones: [] };
    const allTombstoned: BeliefAnswer<string> = {
      status: "unknown",
      reason: "all-known-memories-tombstoned",
      tombstones: [fixtureTombstone()],
    };
    expect(noMemory.tombstones).toHaveLength(0);
    expect(allTombstoned.tombstones).toHaveLength(1);
  });

  it("TYPE-LEVEL: disputed with only one candidate does not compile — the tuple is fixed at exactly two", () => {
    const a = fixtureMemory<string>({ status: "disputed" });
    // @ts-expect-error — candidates is a [Memory, Memory] tuple; a one-element array does not satisfy it.
    const bad: BeliefAnswer<string> = { status: "disputed", candidates: [a] };
    void bad;
  });

  it("TYPE-LEVEL: doubted with a reason other than age-exceeded does not compile", () => {
    const bad: BeliefAnswer<string> = {
      status: "doubted",
      memory: fixtureMemory<string>({ status: "doubted" }),
      confidence: fixtureMemory<string>().confidence,
      // @ts-expect-error — doubted.reason only ever accepts the literal "age-exceeded".
      reason: "source-revoked",
    };
    void bad;
  });

  it("TYPE-LEVEL: unknown with a reason outside its two named causes does not compile", () => {
    // @ts-expect-error — unknown.reason is closed to "no-memory" | "all-known-memories-tombstoned".
    const bad: BeliefAnswer<string> = { status: "unknown", reason: "not-yet-queried", tombstones: [] };
    void bad;
  });

  it("is exhaustively matched via assertNeverBeliefAnswer — every real variant handled, no default needed", () => {
    function describe(answer: BeliefAnswer<string>): string {
      switch (answer.status) {
        case "believed":
          return "believed";
        case "doubted":
          return "doubted";
        case "disputed":
          return "disputed";
        case "unknown":
          return "unknown";
        default:
          return assertNeverBeliefAnswer(answer);
      }
    }
    expect(describe({ status: "unknown", reason: "no-memory", tombstones: [] })).toBe("unknown");
  });

  it("PROOF (on a local, equivalent stand-in — BeliefAnswer itself stays frozen at four for this milestone): a fifth variant fails to compile until every consumer handles it", () => {
    // Mirrors shadow-run's own reconciliation.test.ts precedent: the real
    // BeliefAnswer cannot be honestly widened just to demonstrate this
    // mechanism, so an equivalent hypothetical union stands in for it.
    type HypotheticalFiveVariantAnswer =
      | { readonly status: "believed" }
      | { readonly status: "doubted" }
      | { readonly status: "disputed" }
      | { readonly status: "unknown" }
      | { readonly status: "retracted-by-subject" }; // the imagined fifth variant.

    function handleFour(answer: HypotheticalFiveVariantAnswer): string {
      switch (answer.status) {
        case "believed":
          return "believed";
        case "doubted":
          return "doubted";
        case "disputed":
          return "disputed";
        case "unknown":
          return "unknown";
        default: {
          // @ts-expect-error — `answer` narrows to { status: "retracted-by-subject" } here, not `never`, because this switch does not handle the fifth variant — exactly the compile error a real sixth BeliefAnswer variant would produce at every un-updated consumer.
          const never: never = answer;
          return assertNeverBeliefAnswer(never);
        }
      }
    }
    expect(handleFour({ status: "believed" })).toBe("believed");
  });
});

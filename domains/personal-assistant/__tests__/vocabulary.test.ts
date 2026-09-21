import { describe, expect, it } from "vitest";
import { ALL_PREDICATES, DEFAULT_SCOPE, SUBJECT } from "../vocabulary.js";

describe("vocabulary — the closed subject/predicate vocabulary", () => {
  it("has exactly one fixed subject", () => {
    expect(SUBJECT).toBe("user:vlad");
  });

  it("has exactly five closed predicates, matching the demo corpus", () => {
    expect(ALL_PREDICATES).toEqual(["shipping-address", "coffee-order", "current-city", "linked-calendar-location", "timezone"]);
  });

  it("DEFAULT_SCOPE is a single, non-empty bounded context", () => {
    expect(DEFAULT_SCOPE).toEqual([{ dimension: "user", value: "vlad" }]);
  });
});

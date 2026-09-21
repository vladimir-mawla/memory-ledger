import { describe, expect, it } from "vitest";
import { memoryId } from "../../../lib/contracts/memory-id.js";
import { toMemory } from "../facts.js";
import { humanAvowal } from "../provenance.js";
import { SUBJECT } from "../vocabulary.js";
import { T0, afterMs } from "./fixtures.js";

describe("toMemory — fails closed, never trusts a FactInput's raw fields", () => {
  it("constructs a real, correctly-shaped Memory on valid input", () => {
    const result = toMemory(
      {
        predicate: "shipping-address",
        value: { line1: "42 Elm Street", city: "Portland", state: "OR" },
        source: humanAvowal("user:vlad"),
        believedAtRaw: T0,
        confidenceRaw: 0.9,
        utterance: "My shipping address is 42 Elm Street, Portland.",
      },
      memoryId("mem-1"),
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.subject).toBe(SUBJECT);
    expect(result.value.predicate).toBe("shipping-address");
    expect(result.value.value).toEqual({ line1: "42 Elm Street", city: "Portland", state: "OR" });
    expect(result.value.believedAt).toBe(T0);
    expect(result.value.lastAffirmedAt).toBe(T0);
    expect(result.value.confidence).toBe(0.9);
    expect(result.value.decayPolicy).toEqual({ kind: "never-decays" });
    expect(result.value.status).toBe("believed");
  });

  it("fails closed on an out-of-range confidence, never constructs a Memory", () => {
    const result = toMemory(
      {
        predicate: "timezone",
        value: "America/Los_Angeles",
        source: humanAvowal("user:vlad"),
        believedAtRaw: T0,
        confidenceRaw: 1.5,
        utterance: "My timezone is America/Los_Angeles.",
      },
      memoryId("mem-2"),
      T0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("confidenceRaw");
  });

  it("fails closed on a future-dated believedAt, never constructs a Memory", () => {
    const now = T0;
    const future = afterMs(T0, 1);
    const result = toMemory(
      {
        predicate: "timezone",
        value: "America/Los_Angeles",
        source: humanAvowal("user:vlad"),
        believedAtRaw: future,
        confidenceRaw: 0.9,
        utterance: "My timezone is America/Los_Angeles.",
      },
      memoryId("mem-3"),
      now,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("believedAtRaw");
  });

  it("fails closed on a malformed believedAt string, never constructs a Memory", () => {
    const result = toMemory(
      {
        predicate: "timezone",
        value: "America/Los_Angeles",
        source: humanAvowal("user:vlad"),
        believedAtRaw: "not-a-timestamp",
        confidenceRaw: 0.9,
        utterance: "My timezone is America/Los_Angeles.",
      },
      memoryId("mem-4"),
      T0,
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.field).toBe("believedAtRaw");
  });

  it("defaults scope and decayPolicy when not supplied", () => {
    const result = toMemory(
      {
        predicate: "coffee-order",
        value: "oat milk latte",
        source: humanAvowal("user:vlad"),
        believedAtRaw: T0,
        confidenceRaw: 0.85,
        utterance: "I usually get an oat milk latte.",
      },
      memoryId("mem-5"),
      T0,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.scope).toEqual([{ dimension: "user", value: "vlad" }]);
    expect(result.value.decayPolicy).toEqual({ kind: "never-decays" });
  });
});

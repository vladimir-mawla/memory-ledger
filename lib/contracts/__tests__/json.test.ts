import { describe, expect, it } from "vitest";
import { assertPlainData, isPlainData, NonPlainDataError, type Json } from "../json.js";

describe("isPlainData / assertPlainData", () => {
  it("accepts primitives, plain arrays, and plain nested objects", () => {
    const good: Json = { a: 1, b: ["x", "y", { c: null, d: true }] };
    expect(isPlainData(good)).toBe(true);
    expect(() => assertPlainData(good, "test")).not.toThrow();
  });

  it("rejects a function value, even nested", () => {
    expect(isPlainData({ onRecall: () => {} })).toBe(false);
    expect(() => assertPlainData({ onRecall: () => {} }, "test")).toThrow(NonPlainDataError);
  });

  it("rejects a symbol-keyed property", () => {
    const withSymbol: Record<string | symbol, unknown> = { a: 1 };
    withSymbol[Symbol("s")] = "hidden";
    expect(isPlainData(withSymbol)).toBe(false);
  });

  it("rejects Date/Map/Set and other non-plain prototypes", () => {
    expect(isPlainData(new Date())).toBe(false);
    expect(isPlainData(new Map())).toBe(false);
    expect(isPlainData(new Set())).toBe(false);
    class Foo {}
    expect(isPlainData(new Foo())).toBe(false);
  });

  it("rejects a circular reference", () => {
    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(isPlainData(circular)).toBe(false);
  });

  it("rejects an accessor property WITHOUT invoking it (no side effect from the check itself)", () => {
    let reads = 0;
    const withGetter = {
      get x() {
        reads++;
        return reads;
      },
    };
    expect(isPlainData(withGetter)).toBe(false);
    expect(reads).toBe(0); // the getter was never actually called by isPlainData.
  });

  it("TYPE-LEVEL: a value whose type includes a function does not satisfy Json", () => {
    // @ts-expect-error — a function-typed field is not assignable to Json's recursive union, so this object literal cannot be typed as Json.
    const bad: Json = { onRecall: () => {} };
    void bad;
  });

  it("does NOT allow the same acyclic value shared via two paths to be mistaken for a true cycle", () => {
    const shared = { n: 1 };
    const acyclicButShared = { left: shared, right: shared };
    expect(isPlainData(acyclicButShared)).toBe(true);
  });

  it("KNOWN LIMITATION: a Proxy can fabricate an accessor-free, function-free view of itself and defeat this check entirely — not a fix, a demonstration", () => {
    const hidden = { run: () => "side effect" };
    const proxy = new Proxy(
      { safe: 1 },
      {
        get(target, prop) {
          if (prop === "run") return hidden.run; // reachable by name, invisible to Object.values(target) below.
          return Reflect.get(target, prop);
        },
      },
    );
    // isPlainData walks Object.values/getOwnPropertyNames on the PROXY's
    // target-shaped reflection, which never surfaces "run" — this documents
    // the gap named in json.ts's own header, it does not close it.
    expect(isPlainData(proxy)).toBe(true);
    expect(typeof (proxy as unknown as { run: unknown }).run).toBe("function");
  });
});

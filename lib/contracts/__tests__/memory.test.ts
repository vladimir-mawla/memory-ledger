import { describe, expect, it } from "vitest";
import type { Memory } from "../memory.js";
import { assertPlainData, isPlainData } from "../json.js";
import { memoryId } from "../memory-id.js";
import { fixtureMemory } from "./fixtures.js";

describe("Memory<TValue> — shape and immutability", () => {
  it("a well-formed Memory is constructible with every required field", () => {
    const memory = fixtureMemory();
    expect(memory.status).toBe("believed");
    expect(memory.subject).toBe("user:vlad.shipping-address");
  });

  it("TYPE-LEVEL: a Memory literal missing `scope` does not compile", () => {
    const base = fixtureMemory();
    // @ts-expect-error — Memory requires `scope`; this object omits it via destructuring-free omission below.
    const bad: Memory<string> = {
      id: base.id,
      subject: base.subject,
      predicate: base.predicate,
      value: base.value,
      source: base.source,
      believedAt: base.believedAt,
      lastAffirmedAt: base.lastAffirmedAt,
      confidence: base.confidence,
      decayPolicy: base.decayPolicy,
      status: base.status,
    };
    void bad;
  });

  it("TYPE-LEVEL: a Memory literal missing `source` does not compile", () => {
    const base = fixtureMemory();
    // @ts-expect-error — Memory requires `source`; this object omits it.
    const bad: Memory<string> = {
      id: base.id,
      subject: base.subject,
      predicate: base.predicate,
      value: base.value,
      believedAt: base.believedAt,
      lastAffirmedAt: base.lastAffirmedAt,
      confidence: base.confidence,
      decayPolicy: base.decayPolicy,
      scope: base.scope,
      status: base.status,
    };
    void bad;
  });

  it("TYPE-LEVEL: status is closed to believed/doubted/disputed — 'tombstoned' does not compile here (see memory.ts's own header for why)", () => {
    const base = fixtureMemory();
    // @ts-expect-error — "tombstoned" is not a member of Memory.status; tombstoning moves a record to TombstonedMemory, a different type, never a fourth status value of this one.
    const bad: Memory<string> = { ...base, status: "tombstoned" };
    void bad;
  });

  it("TYPE-LEVEL: status rejects an arbitrary string entirely — never a free-text status", () => {
    const base = fixtureMemory();
    // @ts-expect-error — "archived" is not a member of Memory.status.
    const bad: Memory<string> = { ...base, status: "archived" };
    void bad;
  });

  it("IMMUTABLE — TYPE-LEVEL: assigning to `value` after construction does not compile", () => {
    const memory = fixtureMemory();
    // @ts-expect-error — `value` is readonly; Memory is immutable, append-only (see memory.ts's header).
    memory.value = "118 Birch Avenue, Seattle";
  });

  it("IMMUTABLE — TYPE-LEVEL: assigning to `status` after construction does not compile", () => {
    const memory = fixtureMemory();
    // @ts-expect-error — `status` is readonly.
    memory.status = "doubted";
  });

  it("IMMUTABLE — TYPE-LEVEL: assigning to `confidence` after construction does not compile", () => {
    const memory = fixtureMemory();
    // @ts-expect-error — `confidence` is readonly; only a brand-new Memory (via affirm(), M5) carries an updated confidence.
    memory.confidence = memory.confidence;
  });

  it("IMMUTABLE — TYPE-LEVEL: assigning to `id` after construction does not compile", () => {
    const memory = fixtureMemory();
    // @ts-expect-error — `id` is readonly and load-bearing identity (see the "id is load-bearing" test below).
    memory.id = memoryId("mem-2");
  });

  it("TYPE-LEVEL: TValue is constrained to Json — a function-valued Memory does not compile", () => {
    // @ts-expect-error — `{ onRecall: () => void }` is not assignable to Json, so this cannot satisfy Memory's type parameter.
    const bad: Memory<{ readonly onRecall: () => void }> = {
      ...fixtureMemory(),
      value: { onRecall: () => {} },
    };
    void bad;
  });

  it("RUNTIME companion to the type-level Json constraint: Memory.value defeats the type system via a cast (this line compiles with ZERO errors — that is the whole problem a cast creates), but the runtime plain-data guard still rejects it", () => {
    const smuggled = {
      ...fixtureMemory(),
      // No @ts-expect-error here on purpose: `as unknown as string` is a
      // legal double-cast that `tsc` cannot refuse, which is exactly why
      // json.ts's runtime guard (assertPlainData) has to exist at all —
      // see json.ts's own header, "enforced two ways."
      value: { onRecall: () => {} } as unknown as string,
    };
    expect(isPlainData(smuggled.value)).toBe(false);
    expect(() => assertPlainData(smuggled.value, "Memory.value")).toThrow();
  });

  it("id IS LOAD-BEARING: two memories differing ONLY in id are NOT the same memory — identity is nominal, never structural", () => {
    const a = fixtureMemory({ id: memoryId("mem-a") });
    const b = fixtureMemory({ id: memoryId("mem-b") });

    // Every field besides `id` is identical.
    const { id: idA, ...restA } = a;
    const { id: idB, ...restB } = b;
    expect(restA).toEqual(restB);

    // Yet `id` differs, and nothing in this module offers a "same content,
    // therefore same memory" equality — a store must treat these as two
    // independent affirmations, never merge/dedupe them by content alone.
    expect(idA).not.toBe(idB);
    expect(new Set([idA, idB]).size).toBe(2);
    // toEqual (deep structural equality) correctly reports these as
    // different overall values, precisely BECAUSE id is part of the
    // comparison and is never dropped or normalized away by this module.
    expect(a).not.toEqual(b);
  });

  it("Json's own recursive shape allows Memory<TValue> to be instantiated at a variety of plain-data value shapes", () => {
    const numeric = fixtureMemory<number>({ value: 42 });
    const nested = fixtureMemory<{ readonly street: string; readonly city: string }>({
      value: { street: "42 Elm Street", city: "Portland" },
    });
    expect(numeric.value).toBe(42);
    expect(nested.value.city).toBe("Portland");
  });
});

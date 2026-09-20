import { describe, expect, it } from "vitest";
import type { TombstonedMemory } from "../tombstoned-memory.js";
import { fixtureMemory, fixtureTombstone, fixtureTombstonedMemory } from "./fixtures.js";

describe("TombstonedMemory<TValue>", () => {
  it("carries every field a live Memory had, plus the Tombstone that killed it", () => {
    const live = fixtureMemory<string>();
    const tombstone = fixtureTombstone();
    const dead = fixtureTombstonedMemory({ tombstone });

    expect(dead.subject).toBe(live.subject);
    expect(dead.predicate).toBe(live.predicate);
    expect(dead.value).toBe(live.value);
    expect(dead.confidence).toBe(live.confidence);
    expect(dead.tombstone).toBe(tombstone);
    expect(dead.status).toBe("tombstoned");
  });

  it("TYPE-LEVEL: status is fixed to the single literal 'tombstoned' — no other value compiles", () => {
    const base = fixtureTombstonedMemory();
    // @ts-expect-error — TombstonedMemory.status only ever accepts "tombstoned".
    const bad: TombstonedMemory<string> = { ...base, status: "believed" };
    void bad;
  });

  it("TYPE-LEVEL: `tombstone` is required — a TombstonedMemory literal omitting it does not compile", () => {
    const base = fixtureMemory<string>();
    // @ts-expect-error — TombstonedMemory requires `tombstone`; this object omits it.
    const bad: TombstonedMemory<string> = {
      id: base.id,
      subject: base.subject,
      predicate: base.predicate,
      value: base.value,
      source: base.source,
      believedAt: base.believedAt,
      lastAffirmedAt: base.lastAffirmedAt,
      confidence: base.confidence,
      decayPolicy: base.decayPolicy,
      scope: base.scope,
      status: "tombstoned",
    };
    void bad;
  });

  it("IMMUTABLE — TYPE-LEVEL: assigning to `tombstone` after construction does not compile", () => {
    const dead = fixtureTombstonedMemory();
    // @ts-expect-error — `tombstone` is readonly.
    dead.tombstone = fixtureTombstone();
  });
});

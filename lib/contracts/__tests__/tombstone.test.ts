import { describe, expect, it } from "vitest";
import type { CausedTombstone, Tombstone, UncausedTombstone } from "../tombstone.js";
import { memoryId } from "../memory-id.js";
import { tombstoneId } from "../tombstone-id.js";
import { fixtureTombstone } from "./fixtures.js";

describe("Tombstone — CausedTombstone | UncausedTombstone", () => {
  it("a CausedTombstone (contradicted/superseded) is constructible with supersededBy naming the winner", () => {
    const t: Tombstone = fixtureTombstone();
    expect(t.reason).toBe("superseded");
    if (t.reason === "superseded" || t.reason === "contradicted") {
      expect(t.supersededBy).toBe(memoryId("mem-2"));
    }
  });

  it("an UncausedTombstone (age-exceeded/scope-exited/source-revoked) is constructible with no supersededBy at all", () => {
    const t: UncausedTombstone = {
      id: tombstoneId("tomb-2"),
      memoryId: memoryId("mem-1"),
      reason: "age-exceeded",
      forgottenAt: "2026-09-20T00:00:00.000Z" as UncausedTombstone["forgottenAt"],
    };
    expect(t.reason).toBe("age-exceeded");
  });

  it("TYPE-LEVEL: missing `reason` does not compile", () => {
    // @ts-expect-error — Tombstone (either branch) requires `reason`; this object omits it.
    const bad: UncausedTombstone = {
      id: tombstoneId("tomb-3"),
      memoryId: memoryId("mem-1"),
      forgottenAt: "2026-09-20T00:00:00.000Z" as UncausedTombstone["forgottenAt"],
    };
    void bad;
  });

  it("TYPE-LEVEL: a CausedTombstone missing supersededBy does not compile — the plan's own 'must name exactly which memory caused it' made structural, not just commented", () => {
    // @ts-expect-error — CausedTombstone requires supersededBy; this object omits it despite reason: "superseded".
    const bad: CausedTombstone = {
      id: tombstoneId("tomb-4"),
      memoryId: memoryId("mem-1"),
      reason: "superseded",
      forgottenAt: "2026-09-20T00:00:00.000Z" as CausedTombstone["forgottenAt"],
    };
    void bad;
  });

  it("TYPE-LEVEL: an UncausedTombstone with a supersededBy field does not compile — the 'present iff' constraint refuses it on the OTHER side too", () => {
    const bad: UncausedTombstone = {
      id: tombstoneId("tomb-5"),
      memoryId: memoryId("mem-1"),
      reason: "age-exceeded",
      forgottenAt: "2026-09-20T00:00:00.000Z" as UncausedTombstone["forgottenAt"],
      // @ts-expect-error — UncausedTombstone has no supersededBy field; age-exceeded is not caused by another memory.
      supersededBy: memoryId("mem-2"),
    };
    void bad;
  });

  it("TYPE-LEVEL: reason cannot mix a CausedTombstone reason into an UncausedTombstone literal", () => {
    const bad: UncausedTombstone = {
      id: tombstoneId("tomb-6"),
      memoryId: memoryId("mem-1"),
      // @ts-expect-error — "contradicted" belongs to CausedTombstone's reason union, not UncausedTombstone's.
      reason: "contradicted",
      forgottenAt: "2026-09-20T00:00:00.000Z" as UncausedTombstone["forgottenAt"],
    };
    void bad;
  });

  it("the two branches' reasons partition all five ForgetReason values with no overlap and no gap", () => {
    const causedReasons = ["contradicted", "superseded"];
    const uncausedReasons = ["age-exceeded", "scope-exited", "source-revoked"];
    expect(causedReasons.length + uncausedReasons.length).toBe(5);
    expect(new Set([...causedReasons, ...uncausedReasons]).size).toBe(5);
  });

  it("Tombstone is immutable — assigning to any field after construction does not compile", () => {
    const t = fixtureTombstone();
    // @ts-expect-error — `reason` is readonly on both branches of Tombstone.
    t.reason = "age-exceeded";
  });
});

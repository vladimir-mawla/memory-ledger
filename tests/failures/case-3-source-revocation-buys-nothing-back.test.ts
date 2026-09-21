import { describe, expect, it } from "vitest";
import { effectiveConfidence } from "../../lib/contracts/effective-confidence.js";
import { queryConfidence } from "../../lib/decay/query-confidence.js";
import { derivedInference, humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query, revokeSource } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { afterMs, ONE_HOUR_MS, record, T0 } from "./fixtures.js";

/**
 * M7 CASE 3 — `PLAN.md`'s M7 criterion (3): "a revoked-source test proves
 * `source-revoked` tombstoning happens even for a memory that is
 * otherwise still fresh and high-confidence — revocation buys nothing
 * back." `memory-plan.md` §5.3: "age and confidence cannot buy back a
 * revoked source, the same asymmetry `agent-trust-layer`'s policy layer
 * enforces between authority and history claims."
 *
 * FULL PIN. Built at the same layer the property is real at — the
 * domain's own `revokeSource` (`store.ts`), the one real caller of
 * `forget(..., "source-revoked", ...)` in this whole system
 * (`lib/contracts/provenance.ts`'s own corrected header: this domain "is
 * the first real caller with standing to build" the mechanism). The
 * memory this test revokes is deliberately constructed at the FRESHEST,
 * HIGHEST-CONFIDENCE point possible — elapsed time zero, confidence 0.95,
 * a `never-decays` policy so nothing about age or curve position could
 * accidentally be doing the work instead of revocation — so that if this
 * test ever passed for the wrong reason (e.g. a future change made
 * revocation conditional on freshness), degrading the fixture would not
 * be what caught it; the fixture is already maximally "should never be
 * forgettable on its own terms."
 */

describe("Case 3 — a fresh, high-confidence, never-decaying memory is tombstoned by source revocation regardless", () => {
  it("elapsed time zero, confidence 0.95, never-decays: still believed right up until the source is revoked", () => {
    const source = derivedInference("integration:google-calendar", { revocable: true });
    const state1 = record(EMPTY_STORE, "current-city", "Denver", source, T0, 0.95, T0);

    // Control: queried at the SAME instant it was recorded -- the most
    // favorable possible freshness/confidence position -- it is believed,
    // at its full recorded confidence, before anything revokes it.
    const { result: before } = query(state1.state, SUBJECT, "current-city", DEFAULT_SCOPE, T0);
    expect(before.answer.status).toBe("believed");
    expect(before.answer.status === "believed" && before.answer.confidence).toBe(0.95);

    // Revoke the source -- no age has passed, no contradiction was ever
    // raised, confidence never moved from its recorded 0.95.
    const revokedState = revokeSource(state1.state, "integration:google-calendar", T0);

    const { result: after } = query(revokedState, SUBJECT, "current-city", DEFAULT_SCOPE, T0);
    expect(after.answer.status).toBe("unknown");
    expect(after.answer.status === "unknown" && after.answer.reason).toBe("all-known-memories-tombstoned");

    const tombstone = revokedState.tombstoned.find((t) => t.predicate === "current-city");
    expect(tombstone).toBeDefined();
    expect(tombstone?.tombstone.reason).toBe("source-revoked");

    // Neither age nor recorded confidence bought anything back:
    // Memory.confidence (recorded) is untouched, but effectiveConfidence/
    // queryConfidence both report exactly zero -- the record's own
    // history is not rewritten, only what a query is willing to report.
    expect(tombstone?.confidence).toBe(0.95); // recorded field, unchanged.
    expect(tombstone && effectiveConfidence(tombstone, T0)).toBe(0);
    expect(tombstone && queryConfidence(tombstone, T0)).toBe(0);
  });

  it("revocation fires even LATER, after real elapsed time and a real re-affirmation window, when the memory is arguably at its strongest -- still tombstoned, not spared", () => {
    const source = derivedInference("integration:contacts-sync", { revocable: true });
    const state1 = record(EMPTY_STORE, "current-city", "Denver", source, T0, 0.99, T0);
    const muchLater = afterMs(T0, ONE_HOUR_MS * 5); // never-decays, so this changes nothing about freshness -- deliberately.

    const { result: before } = query(state1.state, SUBJECT, "current-city", DEFAULT_SCOPE, muchLater);
    expect(before.answer.status).toBe("believed");
    expect(before.answer.status === "believed" && before.answer.confidence).toBe(0.99); // never-decays: still full confidence hours later.

    const revokedState = revokeSource(state1.state, "integration:contacts-sync", muchLater);
    const { result: after } = query(revokedState, SUBJECT, "current-city", DEFAULT_SCOPE, muchLater);
    expect(after.answer.status).toBe("unknown");
  });

  it("a NON-revocable source's memory is correctly left alone by the exact same call -- confirms this is a real, discriminating filter (Provenance.revocable), not a blanket sweep of every memory sharing a sourceId", () => {
    // humanAvowal defaults revocable: false (provenance.ts's own header:
    // "a human telling the assistant something directly has no
    // 'integration' to disconnect").
    const source = humanAvowal("user:vlad", { revocable: false });
    const state1 = record(EMPTY_STORE, "timezone", "America/Los_Angeles", source, T0, 0.9, T0);

    const revokedState = revokeSource(state1.state, "user:vlad", T0);
    expect(revokedState.live).toHaveLength(1); // untouched -- revocable is false, so this sourceId's memory is correctly left alone even though the sourceId matches exactly.
    expect(revokedState.tombstoned).toHaveLength(0);
  });
});

import { describe, expect, it } from "vitest";
import type { Memory } from "../../lib/contracts/memory.js";
import { effectiveConfidence } from "../../lib/contracts/effective-confidence.js";
import { queryConfidence } from "../../lib/decay/query-confidence.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, revokeSource } from "../../domains/personal-assistant/store.js";
import { afterMs, ONE_DAY_MS, record, T0 } from "./fixtures.js";

/**
 * M7 CASE 9 — "Confidence is surfaced, never written — `Memory.confidence`
 * is immutable; zero comes from `queryConfidence`." `memory-plan.md` §3:
 * "'confidence dropped to zero' always means 'the store will no longer
 * surface this as belief,' never 'a historical record was rewritten.'"
 *
 * FULL PIN, TWO HALVES: (a) TYPE-LEVEL — `Memory.confidence` cannot be
 * assigned to, proven with `@ts-expect-error` against a REAL memory built
 * by the real domain's own `recordFact` (not merely a `lib/contracts`
 * fixture — `lib/contracts/__tests__/memory.test.ts` already proves this
 * at M1's own layer; this file re-proves it against production data,
 * which is a genuinely different assignability check now that a real
 * `TValue` — `string`, from `PredicateValueMap` — flows through);
 * (b) RUNTIME — once a memory is tombstoned by any real mechanism (here:
 * source revocation), its OWN recorded `.confidence` field is byte-for-
 * byte unchanged, while `effectiveConfidence`/`queryConfidence` — the two
 * functions a real query actually calls — both report exactly zero. The
 * zero is computed by a function, never written into the record.
 */

describe("Case 9a — TYPE-LEVEL: Memory.confidence cannot be assigned, even on a real, domain-constructed memory", () => {
  it("attempting to mutate a real memory's recorded confidence fails to compile", () => {
    const memory: Memory<string> = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.8, T0).written;
    // @ts-expect-error — Memory.confidence is `readonly` (memory-core.ts); no mutator is exported anywhere in this codebase's own public surface.
    memory.confidence = 0.99;
  });
});

describe("Case 9b — RUNTIME: after tombstoning, the recorded field never moves; the computed zero comes only from effectiveConfidence/queryConfidence", () => {
  it("source-revoked tombstoning leaves Memory.confidence exactly as recorded, while both query-facing functions report zero", () => {
    const RECORDED_CONFIDENCE = 0.93;
    const source = humanAvowal("user:vlad", { revocable: true });
    const written = record(EMPTY_STORE, "coffee-order", "oat milk latte", source, T0, RECORDED_CONFIDENCE, T0);

    const later = afterMs(T0, ONE_DAY_MS);
    const revokedState = revokeSource(written.state, "user:vlad", later);
    const tombstoned = revokedState.tombstoned.find((t) => t.predicate === "coffee-order");
    expect(tombstoned).toBeDefined();

    // The recorded field: unmoved.
    expect(tombstoned?.confidence).toBe(RECORDED_CONFIDENCE);

    // The computed, query-facing answer: zero, from two independent functions that agree.
    expect(tombstoned && effectiveConfidence(tombstoned, later)).toBe(0);
    expect(tombstoned && queryConfidence(tombstoned, later)).toBe(0);

    // And, for completeness: querying the recorded field DIRECTLY (bypassing effectiveConfidence/queryConfidence entirely) still shows the true, untouched, non-zero history -- "zero" only ever exists as a QUERY answer, never as a record.
    expect(tombstoned?.confidence).not.toBe(0);
    expect(tombstoned?.confidence).toBe(RECORDED_CONFIDENCE);
  });
});

import { describe, expect, it } from "vitest";
import { contradict } from "../../lib/contradiction/contradict.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { EMPTY_STORE, query } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT } from "../../domains/personal-assistant/vocabulary.js";
import { afterMs, ONE_DAY_MS, record, T0 } from "./fixtures.js";

/**
 * M7 CASE 8 — "The tier split ignores recorded confidence entirely — M4
 * was rejected for comparing `Memory.confidence` instead of
 * `Provenance.tier`. Two `direct-avowal` memories at 0.9 and 0.1 must
 * resolve `superseded`." `lib/contradiction/tier-split.ts`'s own header:
 * this milestone's FIRST PASS compared confidence and was corrected on
 * review — `resolveTierSplit`/`contradict()` now read `source.tier`
 * exclusively; `Memory.confidence` "plays NO ROLE in this decision at
 * all."
 *
 * FULL PIN, TWO LAYERS: (a) `contradict()` directly, with the exact
 * numbers named above; (b) end to end through the real domain's write
 * path (`recordFact`), so this is a regression guard on the SHIPPED
 * behavior, not only the isolated function — a future change that
 * reintroduced a confidence check ANYWHERE between `contradict()` and the
 * tombstone that actually gets written would be caught here even if it
 * slipped past `lib/contradiction/__tests__/contradict.test.ts` itself.
 */

describe("Case 8a — contradict() itself: confidence 0.9 (older) vs 0.1 (newer), both direct-avowal, disagreeing values -- superseded, not disputed", () => {
  it("the LOWER-confidence newer statement still wins, because tier (not confidence) decides", () => {
    const older = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.9, T0).written;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const newer = record(EMPTY_STORE, "coffee-order", "cold brew", humanAvowal("user:vlad"), t2, 0.1, t2).written;

    const check = contradict(older, newer);
    expect(check.outcome).toBe("superseded");
  });

  it("control, reported for contrast: reversing WHICH side carries the higher confidence changes nothing -- confirms it really is tier-only, not \"whichever happens to have lower confidence loses\"", () => {
    const older = record(EMPTY_STORE, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.1, T0).written;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const newer = record(EMPTY_STORE, "coffee-order", "cold brew", humanAvowal("user:vlad"), t2, 0.9, t2).written;

    const check = contradict(older, newer);
    expect(check.outcome).toBe("superseded"); // same outcome as 8a even with confidence direction flipped -- confidence is not the deciding fact either way.
  });
});

describe("Case 8b — end to end: the real write path tombstones the older, lower-tier-agnostic memory, regardless of which side is more confident", () => {
  it("recordFact resolves the SAME 0.9/0.1 case to a real \"contracted\" tombstone naming the newer memory as the cause", () => {
    let state = EMPTY_STORE;
    state = record(state, "coffee-order", "oat milk latte", humanAvowal("user:vlad"), T0, 0.9, T0).state;
    const t2 = afterMs(T0, ONE_DAY_MS);
    const r2 = record(state, "coffee-order", "cold brew", humanAvowal("user:vlad"), t2, 0.1, t2);
    state = r2.state;

    expect(r2.newTombstones).toHaveLength(1);
    expect(r2.newTombstones[0]?.tombstone.reason).toBe("contradicted");
    expect(r2.newTombstones[0]?.tombstone.reason === "contradicted" && r2.newTombstones[0].tombstone.supersededBy).toBe(r2.written.id);

    const { result } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, afterMs(t2, 1000));
    expect(result.answer.status).toBe("believed");
    expect(result.answer.status === "believed" && result.answer.memory.value).toBe("cold brew");
    expect(result.answer.status === "believed" && result.answer.confidence).toBe(0.1); // the WINNING memory's own low recorded confidence is still reported honestly -- winning the tier contest does not inflate it.
  });
});

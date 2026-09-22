import { describe, expect, it } from "vitest";
import { queryBelief } from "../../lib/store/belief-query.js";
import { humanAvowal } from "../../domains/personal-assistant/provenance.js";
import { query, type StoreState } from "../../domains/personal-assistant/store.js";
import { afterMs, DEFAULT_SCOPE, EMPTY_STORE, ONE_DAY_MS, record, SUBJECT, T0 } from "./fixtures.js";

/**
 * M7 CASE 1 — `memory-plan.md` §10(a): "a same-tick race between a
 * superseding memory arriving and a query being answered... a test that
 * deliberately interleaves an `affirm` call between a query's read of
 * candidates and its confidence computation, asserting the query result
 * is either `disputed` or reflects the new memory — never a `believed`
 * answer built from data already known stale at the moment the answer is
 * constructed."
 *
 * HONEST PARTIAL PIN — stated plainly, not decorated. This whole codebase
 * is single-threaded, synchronous, and has no yield point anywhere inside
 * `queryBelief`/`recordFact`/`query` (no `await`, no callback, no
 * generator) — a real interleaving, where a SECOND call actually executes
 * WHILE a first call is paused partway through its own body, cannot
 * literally happen here. There is nowhere for `recordFact` to run "in the
 * middle of" `queryBelief`'s own single, run-to-completion invocation. So
 * "interleaves an affirm between a query's read of candidates and its
 * confidence computation" cannot be built as two calls racing in real
 * time — it is built below as two calls made in a DELIBERATE, FIXED order
 * that reproduces the one thing a true interleaving would have caused: a
 * caller finishing a query computation using a `candidates` snapshot that
 * was captured BEFORE a since-committed, contending write. That is
 * simulation by fixed ordering, not concurrency, and per this milestone's
 * own brief, a test built that way is a partial pin, not a full one.
 *
 * WHAT THIS FILE ACTUALLY PROVES, IN TWO HALVES, BOTH REAL AND RUN:
 *
 *   (1a) THE VULNERABILITY IS REAL, NOT HYPOTHETICAL. `StoreState` is
 *   plain, versionless data (`{ live, tombstoned }` — `store.ts`'s own
 *   header: "plain, inspectable, serializable data"). Nothing in
 *   `queryBelief`'s or `query`'s own type signature refuses a `candidates`
 *   array (or a `StoreState`) captured before a later write. If a caller
 *   holds onto a snapshot taken BEFORE a contending `recordFact` commits,
 *   and only then finishes computing its own query against that stale
 *   snapshot, the result is exactly the failure mode §10 describes: a
 *   `"believed"` answer built from a memory that, by the time the answer
 *   is handed back, has ALREADY been superseded elsewhere in the same
 *   batch. This is demonstrated directly below (`describe("1a", ...)`),
 *   not argued from prose — the stale answer really is `"believed"` on
 *   the old address.
 *
 *   (1b) THE REAL CALL SITES IN THIS CODEBASE DO NOT DO THAT. Every real
 *   caller in this repository (`scripts/demo-memory.ts`, this milestone's
 *   own `store.test.ts`) threads `StoreState` monotonically: `state =
 *   recordFact(state, ...).result.state`, then the VERY NEXT operation
 *   reads that SAME, just-reassigned `state` — never a variable captured
 *   earlier and held onto. Followed correctly, in the exact fixed order
 *   §10(a) asks for (affirm completes, THEN the query reads current
 *   state), the query never sees stale data at all — there is no interval
 *   in which it COULD, because nothing yields control back to a second
 *   writer mid-computation. `describe("1b", ...)` proves this directly:
 *   the identical two facts, the identical two operations, correctly
 *   sequenced, produce `"believed"` on the NEW address, never the old one.
 *
 * WHAT THIS DOES NOT PROVE, STATED PLAINLY: it does not prove the
 * property holds under every possible caller discipline — only that (a)
 * violating the discipline reproducibly breaks it, and (b) the discipline
 * every real caller here already follows avoids it. Nothing under
 * `lib/store/**` or `domains/personal-assistant/**` is TYPE-LEVEL
 * protection against a future caller (a UI component holding a stale
 * `StoreState` in React state across a slow re-render, for instance — the
 * exact shape M8's own UI will have to get right) reintroducing case
 * (1a)'s exact shape. That gap is real and is not closed by this test —
 * only demonstrated and, in the one place this codebase actually calls
 * these functions today, shown not to be exercised.
 */

const OLD_ADDRESS = { line1: "42 Elm Street", city: "Portland", state: "OR" };
const NEW_ADDRESS = { line1: "118 Birch Avenue", city: "Seattle", state: "WA" };

describe("Case 1a — the race, reproduced: a query completed against a snapshot captured BEFORE a contending write commits returns a stale \"believed\" answer", () => {
  it("captures candidates before the affirm, lets the affirm commit, THEN finishes the query on the stale snapshot -- believed on the OLD address, even though the NEW one already exists in the same batch", () => {
    // Step 1: the first fact is written and becomes the only live candidate.
    const t1 = T0;
    const r1 = record(EMPTY_STORE, "shipping-address", OLD_ADDRESS, humanAvowal("user:vlad"), t1, 0.9, t1);
    const stateAfterFirstWrite: StoreState = r1.state;

    // Step 2: "a query's read of candidates" -- captured NOW, before the
    // contending write below ever happens. This is the stale snapshot a
    // caller who does not re-read state would be computing against.
    const staleCandidates = stateAfterFirstWrite.live;
    const staleTombstones = stateAfterFirstWrite.tombstoned.map((t) => t.tombstone);

    // Step 3: "an affirm interleaved... between the read of candidates and
    // the confidence computation" -- the concurrent write commits here,
    // strictly after t1, superseding the first fact for real, through the
    // real recordFact eager-resolution path (the SAME path Case 4/store.test.ts
    // already prove tombstones the older memory with reason "contradicted").
    const t2 = afterMs(t1, ONE_DAY_MS);
    const r2 = record(stateAfterFirstWrite, "shipping-address", NEW_ADDRESS, humanAvowal("user:vlad"), t2, 0.9, t2);
    expect(r2.newTombstones).toHaveLength(1); // confirms the affirm really did supersede the old memory, for real, in the real committed state.
    expect(r2.newTombstones[0]?.tombstone.reason).toBe("contradicted");

    // Step 4: "the query's own confidence computation" finishes now, but
    // against the STALE candidates captured in step 2 -- queryBelief has
    // no way to know a contending write has since committed, because
    // nothing handed it that information. now (t3) is strictly after the
    // affirm's own believedAt, so by wall-clock time the new address is
    // already the current belief -- structurally, in the same batch.
    const t3 = afterMs(t2, 1000);
    const result = queryBelief(staleCandidates, staleTombstones, t3);

    // THE FAILURE MODE, REPRODUCED: a "believed" answer built entirely
    // from data that was ALREADY superseded (r2, above) by the moment
    // this answer is constructed. This is not what §10 wants a caller to
    // see -- it is the demonstration that the race is real when a caller
    // violates the single-threaded discipline Case 1b proves is what
    // actually prevents it in this codebase's own real call sites.
    expect(result.answer.status).toBe("believed");
    expect(result.answer.status === "believed" && result.answer.memory.value).toEqual(OLD_ADDRESS);
  });
});

describe("Case 1b — the same two operations, correctly sequenced (the discipline every real caller in this codebase actually follows): no stale answer is possible", () => {
  it("recordFact THEN query, always reading the just-returned state, never a captured-earlier snapshot -- believed on the NEW address, never the old one", () => {
    const t1 = T0;
    let state: StoreState = EMPTY_STORE;
    state = record(state, "shipping-address", OLD_ADDRESS, humanAvowal("user:vlad"), t1, 0.9, t1).state;

    const t2 = afterMs(t1, ONE_DAY_MS);
    // The affirm completes FIRST, in this fixed ordering (matching §10(a)'s
    // own ordering: "a contradicting memory is affirmed... [then] the
    // query" reads it), and its own returned state is what the very next
    // step reads -- never a variable captured before this line.
    state = record(state, "shipping-address", NEW_ADDRESS, humanAvowal("user:vlad"), t2, 0.9, t2).state;

    const t3 = afterMs(t2, 1000);
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t3);

    expect(result.answer.status).toBe("believed");
    expect(result.answer.status === "believed" && result.answer.memory.value).toEqual(NEW_ADDRESS);
    // And, for completeness: the answer is never "disputed" either, in
    // this correctly-sequenced case -- recordFact's own eager resolution
    // already settled the contradiction at write time (store.ts's own
    // documented reason for existing at all), so there is nothing left
    // for the query to find in dispute.
    expect(result.answer.status).not.toBe("disputed");
  });
});

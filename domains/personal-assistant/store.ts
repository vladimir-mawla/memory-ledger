import type { Json } from "../../lib/contracts/json.js";
import type { Memory } from "../../lib/contracts/memory.js";
import type { TombstonedMemory } from "../../lib/contracts/tombstoned-memory.js";
import type { Tombstone } from "../../lib/contracts/tombstone.js";
import type { CapturedAt } from "../../lib/contracts/captured-at.js";
import type { Scope } from "../../lib/contracts/scope.js";
import { scopeIsSupersetOf } from "../../lib/contracts/scope.js";
import { contradict } from "../../lib/contradiction/contradict.js";
import { resolveTierSplit } from "../../lib/contradiction/tier-split.js";
import { type ValueComparator, DEFAULT_VALUE_COMPARATOR } from "../../lib/contradiction/value-comparator.js";
import { forget } from "../../lib/store/forget.js";
import { type BeliefQueryResult, queryBelief } from "../../lib/store/belief-query.js";
import { type FactInput, type FactConstructionResult, toMemory } from "./facts.js";
import { mintMemoryId } from "./ids.js";
import type { Predicate, PredicateValueMap } from "./vocabulary.js";

/**
 * `domains/personal-assistant/store.ts` — the write-time orchestration
 * `.genesis/decisions/0004-store.md`'s own forward note for M6 asks for:
 * "no `affirm`/write-path orchestration exists in `lib/store/**` — this
 * milestone's own success criteria ask for `forget` and the read path
 * only... in a well-formed store, M6's write-time `affirm` should call
 * `contradict()`+`forget()` synchronously when a new memory is written, so
 * a query rarely if ever needs to resolve a supersede lazily at all."
 * `recordFact` below is that orchestration. It COMPOSES `contradict`,
 * `forget`, `queryBelief`, and `resolveTierSplit` — every one of them
 * imported, called, never reimplemented. `git grep -n "0.5 \*\*\|Math.pow"`
 * and `git grep -n "tier ==="` under `domains/` both turn up nothing, the
 * same proof ADR 0004 ran for `lib/store/**` itself.
 *
 * WHERE THE CORPUS LIVES — the ADR's own design question, answered here:
 * `StoreState` is DATA the demo script (and, per M8's own PLAN.md row,
 * eventually a UI) MUTATES step by step — not a set of static fixtures
 * loaded once. `memory-plan.md` §8's own demo moment is explicitly a
 * LIVE interaction ("tell the assistant... months later, tell it...
 * ask it a third time") — a fixed, pre-baked fixture file could only ever
 * play back a canned transcript, never actually accept "the user's next
 * statement" the way M8's interactive UI will have to. Every function in
 * this file therefore takes a `StoreState` and returns a NEW one
 * (immutable, matching this whole codebase's own "never mutate in place"
 * discipline — `lib/contracts/memory.ts`'s own header: "immutable,
 * append-only, never edited in place") rather than holding hidden mutable
 * state in a closure (this account's own house rule: "every value is
 * data, never a closure" — a `StoreState` object is exactly that: plain,
 * inspectable, serializable data a caller can snapshot, diff, or hand to a
 * UI framework's own state management, not an opaque stateful class only
 * this file's own methods can read).
 *
 * WHY `tombstoned` HOLDS FULL `TombstonedMemory` RECORDS, NOT BARE
 * `Tombstone`S: `queryBelief`'s own read-path signature (`lib/store/
 * belief-query.ts`) takes `tombstones: ReadonlyArray<Tombstone>` — bare
 * records, with no `subject`/`predicate`/`scope` of their own (`Tombstone`,
 * lib/contracts/tombstone.ts, carries only `memoryId`/`reason`/
 * `forgottenAt`/`supersededBy`). A real store, though, needs to answer
 * "which tombstones are relevant to THIS (subject, predicate, scope)
 * query" — information a bare `Tombstone` cannot answer about itself.
 * Keeping the FULL `TombstonedMemory` (which, via `MemoryCore`, still
 * carries `subject`/`predicate`/`scope` — see tombstoned-memory.ts's own
 * header: "tombstoning changes what a QUERY may report about a memory,
 * never the memory's own recorded content") lets `query` below filter
 * tombstones the same way it filters live candidates, then hand
 * `queryBelief` exactly the `Tombstone`s (via `.tombstone`) it actually
 * asks for — composing the frozen read path, never re-deriving its
 * eligibility logic.
 */
export interface StoreState<TValue extends Json = Json> {
  readonly live: readonly Memory<TValue>[];
  readonly tombstoned: readonly TombstonedMemory<TValue>[];
}

export const EMPTY_STORE: StoreState = { live: [], tombstoned: [] };

function sameCoordinate(m: { readonly subject: string; readonly predicate: string }, subject: string, predicate: string): boolean {
  return m.subject === subject && m.predicate === predicate;
}

function scopeEligible(memoryScope: Scope, queryScope: Scope): boolean {
  return scopeIsSupersetOf(memoryScope, queryScope);
}

export interface RecordFactResult<TValue extends Json> {
  readonly state: StoreState<TValue>;
  readonly written: Memory<TValue>;
  /** Every tombstone this write produced, in the order it happened — zero, one (a supersede), or more (several pre-existing live candidates all losing to the same restatement). Not merely "the write succeeded" — the demo script prints these directly, per PLAN.md's M6 success criterion: "prints, per step, the memory written, its confidence, and the eventual tombstone." */
  readonly newTombstones: readonly TombstonedMemory<TValue>[];
}

export type RecordFactOutcome<TValue extends Json> =
  | { readonly ok: true; readonly result: RecordFactResult<TValue> }
  | { readonly ok: false; readonly error: FactConstructionResult<TValue> extends { readonly ok: false; readonly error: infer E } ? E : never };

/**
 * `recordFact` — the write path. Constructs the new `Memory` (`toMemory`,
 * facts.ts), finds every LIVE candidate that could possibly contend with
 * it (same subject/predicate, overlapping scope, strictly earlier
 * `believedAt` — `contradict`'s own anti-symmetry precondition, ADR 0003
 * Decision 3), and resolves each one EAGERLY, in `believedAt` order,
 * rather than leaving every resolution to `queryBelief`'s own lazy
 * fallback. This is a genuine design choice, not merely "the plan
 * suggested it": a demo whose "the tombstone" only appears the NEXT time
 * someone happens to query, rather than the moment the superseding fact
 * is written, would not honestly match §8's own narrative beat ("tell it
 * you moved... it answers with the new address... produces the
 * tombstone") — the tombstone is produced by the ACT of telling it, not
 * merely discovered later by asking.
 *
 * TWO outcomes tombstone the OLDER candidate; two leave both live:
 *
 *   - `contradict()` outcome `"superseded"` → `forget(older, "contradicted",
 *     now, newer.id)`. This is the ONLY path anywhere in this whole system
 *     (`lib/store/belief-query.ts`'s own lazy resolution uses the
 *     identical reason) that ever constructs a `Tombstone` with reason
 *     `"contradicted"` — matching `memory-plan.md` §5.1's own worked
 *     contrast (two same-tier `direct-avowal`s disagreeing).
 *
 *   - `contradict()` outcome `"no-conflict"` (the two values AGREE) AND
 *     the newer source's tier strictly OUTRANKS the older's
 *     (`resolveTierSplit` says `"superseded"` AND the two tiers actually
 *     differ) → `forget(older, "superseded", now, newer.id)`. THIS IS THE
 *     ONE REAL CASE, ANYWHERE IN THIS ENTIRE SYSTEM, FOR
 *     `ForgetReason: "superseded"` — and it is worth stating plainly that
 *     nothing built before this milestone can ever produce it:
 *     `contradict()` itself (lib/contradiction/contradict.ts) only ever
 *     returns the four `ContradictionCheck` outcomes, and NONE of them is
 *     named `"superseded"` in `Tombstone.reason`'s own vocabulary (the
 *     `ContradictionCheck` outcome literally spelled `"superseded"` maps,
 *     via `belief-query.ts`, to `Tombstone.reason: "contradicted"` — a
 *     genuinely different word for a genuinely different case).
 *     `memory-plan.md` §4's own definition of `ForgetReason:
 *     "superseded"` is "an explicit, NON-CONTRADICTING replacement (same
 *     value, refreshed source — e.g. re-confirmed by a more authoritative
 *     source)" — a case that, by definition, `contradict()` reports as
 *     `"no-conflict"` (the values AGREE), which is exactly why the
 *     tier-agnostic engine can never be the one to decide it: agreeing
 *     with the current belief is not evidence of anything from
 *     `contradict()`'s own point of view. Deciding "this agreement was
 *     also an upgrade worth recording" is a DOMAIN POLICY judgment, which
 *     is why it belongs here, not in `lib/`. This domain's own real case:
 *     `current-city` is first known only by `derived-inference` (an app
 *     guessing from calendar/contacts data); the user later directly
 *     confirms the SAME city. That confirmation deserves to become the
 *     live, better-sourced record — not to sit alongside the guess it
 *     confirms, indistinguishable from the guess in a future query's
 *     `"disputed"` collision. This reuses `resolveTierSplit`
 *     (lib/contradiction/tier-split.ts) — never reimplements tier
 *     comparison — for a question that function was not originally built
 *     to answer (it is normally only ever called after values are already
 *     known to DISAGREE) but whose ranking table is exactly the one this
 *     domain needs: "does the newer source outrank the older one."
 *     Deliberately requires the tiers to be UNEQUAL: two direct-avowals
 *     restating the identical value, or two derived-inferences agreeing,
 *     get no special treatment here (`resolveTierSplit` would say
 *     `"superseded"` for the equal-direct-avowal case too, case 2 of its
 *     own four — but that is the shape of this domain's absent `affirm()`
 *     equivalent, deliberately not built; see facts.ts's own header for
 *     why "re-confirm the same value" stays a disclosed gap rather than a
 *     guessed-at mechanism).
 *
 * `"disputed"` and `"not-comparable"` outcomes, and a `"no-conflict"`
 * outcome that does not clear the tier-upgrade bar above, leave BOTH
 * candidates live, untouched — matching exactly what `queryBelief`'s own
 * lazy fallback would do if this eager pass were skipped entirely.
 */
export function recordFact<P extends Predicate>(
  state: StoreState,
  input: FactInput<P>,
  now: CapturedAt,
  comparator: ValueComparator = DEFAULT_VALUE_COMPARATOR,
): RecordFactOutcome<PredicateValueMap[P]> {
  const id = mintMemoryId(input.predicate, now);
  const constructed = toMemory(input, id, now);
  if (!constructed.ok) {
    return { ok: false, error: constructed.error as never };
  }
  const newMemory = constructed.value as unknown as Memory<Json>;

  const eligibleOlder = (state.live as readonly Memory<Json>[])
    .filter((m) => sameCoordinate(m, newMemory.subject, newMemory.predicate))
    .filter((m) => scopeEligible(m.scope, newMemory.scope) || scopeEligible(newMemory.scope, m.scope))
    .filter((m) => Date.parse(m.believedAt) < Date.parse(newMemory.believedAt))
    .sort((a, b) => Date.parse(a.believedAt) - Date.parse(b.believedAt));

  let live = state.live as readonly Memory<Json>[];
  const newTombstones: TombstonedMemory<Json>[] = [];

  for (const older of eligibleOlder) {
    const check = contradict(older, newMemory, comparator);
    let reasonIfSuperseding: "contradicted" | "superseded" | null = null;
    if (check.outcome === "superseded") {
      reasonIfSuperseding = "contradicted";
    } else if (check.outcome === "no-conflict") {
      const split = resolveTierSplit(older.source.tier, newMemory.source.tier);
      if (split === "superseded" && older.source.tier !== newMemory.source.tier) {
        reasonIfSuperseding = "superseded";
      }
    }
    if (reasonIfSuperseding !== null) {
      const tombstoned = forget(older, reasonIfSuperseding, now, newMemory.id);
      live = live.filter((m) => m.id !== older.id);
      newTombstones.push(tombstoned);
    }
    // "disputed" / "not-comparable", or a "no-conflict" that does not
    // clear the tier-upgrade bar: leave both candidates live, untouched.
  }

  live = [...live, newMemory];
  const newState: StoreState<Json> = { live, tombstoned: [...state.tombstoned, ...newTombstones] };
  return {
    ok: true,
    result: {
      state: newState as StoreState<PredicateValueMap[P]>,
      written: newMemory as unknown as Memory<PredicateValueMap[P]>,
      newTombstones: newTombstones as unknown as TombstonedMemory<PredicateValueMap[P]>[],
    },
  };
}

export interface QueryOutcome<TValue extends Json> {
  readonly state: StoreState<TValue>;
  readonly result: BeliefQueryResult<TValue>;
}

/**
 * `query` — the read path. Filters `state.live`/`state.tombstoned` down to
 * exactly the `(subject, predicate, scope)` this call asks about (the
 * SAME two-step eligibility rule as `recordFact`'s own `eligibleOlder`:
 * exact subject/predicate equality, then `scopeIsSupersetOf` — the
 * cheapest, most-structural check first, `lib/contracts/scope.ts`'s own
 * header's ordering discipline, reused here rather than re-argued), then
 * calls the real `queryBelief` — never re-derives a `BeliefAnswer` itself.
 *
 * PERSISTS `queryBelief`'s OWN LAZY DISCOVERIES BACK INTO THE RETURNED
 * STATE — a real design choice, not implied by `queryBelief`'s own
 * contract. `queryBelief`'s `newlyForgotten` return field is a bare
 * `Tombstone[]` (lib/store/belief-query.ts) — it does not, and structurally
 * cannot (it never sees this domain's own `StoreState` shape), update a
 * caller's own bookkeeping. Without this step, a decay-forgettable memory
 * this domain's `query` discovers would be reported correctly ONCE, then
 * reported all over again as freshly "newly forgotten" on every SUBSEQUENT
 * query, and would never move out of `state.live` for `recordFact`'s own
 * `eligibleOlder` scan to stop considering it a contender. `reattachTombstone`
 * (below) rebuilds the full `TombstonedMemory` locally from data
 * `queryBelief` already computed and handed back (the original live
 * `Memory` this domain still has in hand, plus the `Tombstone` `forget()`
 * — called INSIDE `queryBelief`, not reimplemented here — already
 * produced) — it is bookkeeping, not a second decision about WHETHER to
 * forget something.
 */
export function query<P extends Predicate>(
  state: StoreState,
  subject: string,
  predicate: P,
  scope: Scope,
  now: CapturedAt,
  comparator: ValueComparator = DEFAULT_VALUE_COMPARATOR,
): QueryOutcome<PredicateValueMap[P]> {
  const live = state.live as readonly Memory<Json>[];
  const tombstoned = state.tombstoned as readonly TombstonedMemory<Json>[];

  const liveCandidates = live.filter((m) => sameCoordinate(m, subject, predicate) && scopeEligible(m.scope, scope));
  const relevantTombstoned = tombstoned.filter((t) => sameCoordinate(t, subject, predicate) && scopeEligible(t.scope, scope));

  const result = queryBelief(liveCandidates, relevantTombstoned.map((t) => t.tombstone), now, comparator);

  const newlyForgottenIds = new Set(result.newlyForgotten.map((t) => t.memoryId));
  const stillLive = live.filter((m) => !newlyForgottenIds.has(m.id));
  const newlyTombstonedRecords = liveCandidates
    .filter((m) => newlyForgottenIds.has(m.id))
    .map((m) => reattachTombstone(m, findTombstoneFor(result.newlyForgotten, m.id)));

  const newState: StoreState<Json> = {
    live: stillLive,
    tombstoned: [...tombstoned, ...newlyTombstonedRecords],
  };
  return { state: newState as StoreState<PredicateValueMap[P]>, result: result as unknown as BeliefQueryResult<PredicateValueMap[P]> };
}

function findTombstoneFor(tombstones: readonly Tombstone[], id: Memory<Json>["id"]): Tombstone {
  const found = tombstones.find((t) => t.memoryId === id);
  if (found === undefined) {
    // Unreachable given this file's own call site (findTombstoneFor is
    // only ever called with an id `query` already confirmed is a key of
    // `newlyForgottenIds`, which was itself built from this exact array).
    throw new Error(`findTombstoneFor: no tombstone found for memory ${id} — this is a bug in query()'s own bookkeeping, not a real runtime condition.`);
  }
  return found;
}

/** See `query`'s own header. Reassembles a `TombstonedMemory` from a `Memory` this domain already held plus a `Tombstone` `forget()` (called inside `queryBelief`, not here) already produced — never a second decision about whether/why to forget. */
function reattachTombstone<TValue extends Json>(memory: Memory<TValue>, tombstone: Tombstone): TombstonedMemory<TValue> {
  const { status: _status, ...core } = memory;
  return { ...core, status: "tombstoned", tombstone };
}

/**
 * `revokeSource` — the real, minimal revocation mechanism ADR 0001
 * (`provenance.ts`'s own header) and ADR 0004 (Decision 5's own sibling
 * discussion for `scope-exited`) both left to whoever has a real case:
 * "the actual revocation registry/check... is NOT this file's job... M5's
 * `lib/store/**` owns the actual revocation registry" — a forward note M5
 * itself did not act on (ADR 0004 builds `forget()`'s mechanism only, no
 * registry — confirmed directly, `git grep -n "revoke" lib/store` turns up
 * nothing outside `ForgetReason`'s own literal). This domain is the first
 * real caller, and — deliberately, matching M5's own precedent for
 * `scope-exited` ("this milestone does not invent a scope registry...
 * `forget(memory, "scope-exited", now)` is a plain, direct call") — builds
 * NO registry here either: `revokeSource` is a plain filter over
 * currently-tracked LIVE memories sharing `sourceId`, restricted to those
 * whose own `Provenance.revocable` is `true` (a source-kind that never
 * claimed to be revocable in the first place is correctly left untouched
 * even if the caller passes its `sourceId` by mistake — `revocable` is
 * exactly the field `provenance.ts`'s own header says exists "to record
 * that this source is the KIND of thing revocation applies to at all").
 * `forget`'s own `"source-revoked"` reason fires regardless of how fresh
 * or confident the memory still is — `memory-plan.md` §5.3's own asymmetry
 * ("age and confidence cannot buy back a revoked source") is enforced
 * simply by never checking either before calling `forget`.
 */
export function revokeSource<TValue extends Json>(state: StoreState<TValue>, sourceId: string, now: CapturedAt): StoreState<TValue> {
  const toRevoke = state.live.filter((m) => m.source.sourceId === sourceId && m.source.revocable);
  const revokedIds = new Set(toRevoke.map((m) => m.id));
  const tombstonedRecords = toRevoke.map((m) => forget(m, "source-revoked", now));
  return {
    live: state.live.filter((m) => !revokedIds.has(m.id)),
    tombstoned: [...state.tombstoned, ...tombstonedRecords],
  };
}

/**
 * `closeScope` — the real, concrete `scope-exited` trigger ADR 0004
 * (Decision 5) named as "the reason with the least specified trigger" and
 * explicitly handed to whoever next has a real case: "M6... is the first
 * milestone with a REAL scope-exit trigger to name (a user deleting their
 * account, MOST PLAUSIBLY)." That is the trigger this domain names: an
 * account deletion, modeled as "the bounded context this memory lived in
 * closed" (`memory-plan.md` §4's own informal description) — every LIVE
 * memory whose own `scope` is a superset of the scope being closed (i.e.
 * every memory that lived WITHIN that account, including one scoped even
 * more narrowly than the account itself) is forgotten with reason
 * `"scope-exited"`. Like `revokeSource`, NO registry is invented — this is
 * a plain, direct sweep over currently-tracked live memories, the exact
 * shape ADR 0004's own precedent established for the identical kind of
 * decision.
 */
export function closeScope<TValue extends Json>(state: StoreState<TValue>, closingScope: Scope, now: CapturedAt): StoreState<TValue> {
  const toClose = state.live.filter((m) => scopeIsSupersetOf(m.scope, closingScope));
  const closedIds = new Set(toClose.map((m) => m.id));
  const tombstonedRecords = toClose.map((m) => forget(m, "scope-exited", now));
  return {
    live: state.live.filter((m) => !closedIds.has(m.id)),
    tombstoned: [...state.tombstoned, ...tombstonedRecords],
  };
}

# ADR 0005 — The personal-assistant domain adapter: `tierForKind` with real cases, the closed vocabulary, `scope-exited`'s real trigger, where the corpus lives, and the one real case for `ForgetReason: "superseded"`

- **Date:** 2026-09-22
- **Status:** accepted
- **Phase / milestone:** M6 (INTEGRATE) — `domains/personal-assistant/`, `scripts/demo-memory.ts`

## Context

`memory-plan.md` §9 commits this project to the personal-assistant domain
and names three doubt-mechanisms it should demonstrate in one coherent
narrative (contradiction on restated preferences, decay on stale small
talk, revocation on a disconnected integration). `PLAN.md`'s M6 row
requires the domain wired end-to-end, driving `affirm`/`contradict`/
`decay`/`forget` and `BeliefQuery`, with all four `BeliefAnswer` variants
reached at least once by a real demo script (`npm run demo:memory`). All
four `lib/**` layers are frozen; this milestone builds `domains/**` and
`scripts/demo-memory.ts` only — `git diff main -- lib` is empty, verified
directly in this build's own report, not merely claimed. This ADR answers
the four design questions this milestone's own brief posed directly, plus
one implementation-level correction (a `Json`-compatibility fix to
`ShippingAddress`) found while making the frozen types actually compile
against this domain's own data.

## Decision 1 — `tierForKind`: two concrete, hardcoded constructors for the two `SourceKind`s this domain actually has real cases for; NO generic four-way mapping

ADR 0001 (`lib/contracts`, Decision 1) deferred this explicitly: "seeing a
real need for a `tierForKind` mapping is M4's or M6's problem to surface
with a real case, not M1's to guess at." M4 (ADR 0003, Decision 6) found
it never needed one — `contradict()` only ever reads `Provenance.tier`,
never `Provenance.kind`. This is the first milestone that actually
CONSTRUCTS `Provenance` values, so it is the first with real cases to
decide with.

**This domain's real corpus uses exactly two of `SourceKind`'s four
members**, and for both, the mapping is not a judgment call — it is
`memory-plan.md` §5.1's own worked contrast, applied directly:

- `human` (a first-person avowal — "my shipping address is...", "I can
  confirm — I'm in Denver") → always `"direct-avowal"`.
- `derived` (a value computed/parsed rather than stated — a calendar
  integration inferring a current city, a contacts sync inferring the
  same) → always `"derived-inference"`.

**Chosen:** `domains/personal-assistant/provenance.ts` exports
`humanAvowal(sourceId, opts?)` and `derivedInference(sourceId, opts?)` —
two concrete constructors, each hardcoding the one correct tier for the
one `SourceKind` it represents. **No generic `tierForKind(kind:
SourceKind): ConfidenceTier` function exists anywhere in this domain.**

**Alternative considered and rejected: a full four-member
`Record<SourceKind, ConfidenceTier>`.** This would force a guess for
`counterparty` and `system` — the two members this domain's real corpus
has NEVER needed to construct (there is no claim in this corpus from
someone OTHER than the subject, and no case that is a bare system
observation with no inference step — every automated fact here IS an
inference, hence `derived`, never a raw `system` reading). Writing that
mapping now would repeat exactly the mistake ADR 0001 already refused to
make, one milestone later, with no more real authority than M1 had. The
`counterparty`/`system` half of `tierForKind` stays exactly as
undecided as it was after M1 — not a gap this milestone forgot to close,
but the honest answer given what this domain's own corpus actually
contains.

**Two secondary defaults were also decided with real cases, not left
ambiguous:** `humanAvowal`'s `revocable` defaults to `false` (a human
telling the assistant something directly has no "integration" to
disconnect); `derivedInference`'s defaults to `true` (every real `derived`
case in this corpus — a calendar sync, a contacts sync — IS a
disconnectable integration). Both remain overridable, since a future case
without a default's usual shape is not forbidden, only not assumed.

## Decision 2 — The closed vocabulary: one subject, five predicates, each earning its place by driving a DIFFERENT real mechanism

**`SUBJECT`** is a single fixed constant (`"user:vlad"`), not a closed
union of subjects. A personal-assistant memory store is single-tenant by
its own nature — "your own assistant only ever holds your memories,"
`memory-plan.md` §9's own framing. A multi-user personal assistant is a
genuinely different, unbuilt feature with no real case in this corpus;
inventing a closed union with only one member ever populated would be
exactly the "speculative flexibility nobody asked for" this account's own
standing note warns cost a sibling project five bypasses.

**Five predicates, each the real case that decided it belongs:**
`shipping-address` (§8's own demo moment: two same-tier `direct-avowal`s
disagreeing → `superseded`/`contradicted`); `coffee-order` (small talk,
decay ALONE, no contradiction — `believed` → `doubted` →
`forgettable`/`unknown`); `current-city` (two same-tier
`derived-inference` sources disagreeing → `disputed`, THEN
`source-revoked` resolving the dispute as a side effect, THEN the one real
case for `ForgetReason: "superseded"` — Decision 4, below);
`linked-calendar-location` (a second, simpler `source-revoked` case: a
single live, fresh, confident memory tombstoned purely because its source
was revoked); `timezone` (kept only so the `scope-exited` finale has more
than one kind of live memory to prove it sweeps everything, not just
whatever the rest of the script happens to be watching). No predicate
exists "for completeness" or "in case a future milestone wants it" — each
one's own justification is in `vocabulary.ts`'s header, next to its
declaration.

## Decision 3 — `scope-exited`: a real, concrete trigger — account deletion — no registry invented

ADR 0004 (M5, Decision 5) named this "the reason with the least specified
trigger" and handed it to whoever next has a real case: "M6... is the
first milestone with a REAL scope-exit trigger to name (a user deleting
their account, MOST PLAUSIBLY)."

**Chosen: account deletion is the trigger.** `closeScope(state,
closingScope, now)` (`store.ts`) tombstones, with reason `"scope-exited"`,
every LIVE memory whose own `scope` is a superset of the scope being
closed — i.e. every memory that lived within that account, including one
scoped even more narrowly than the account itself. `scripts/demo-memory.ts`
demonstrates this as its own finale: "the user deletes their account" — a
real, unambiguous, universally-understood event for a personal assistant,
not a scenario invented to exercise an otherwise-idle code path.

**No registry is built** — matching ADR 0004's own precedent for exactly
this kind of decision ("this milestone does not invent a scope
registry... `forget(memory, "scope-exited", now)` is a plain, direct
call"). `closeScope` is a plain filter over currently-tracked live
memories, nothing more; detecting a REAL account-deletion event (a
webhook, a settings-page confirmation flow) is explicitly out of scope for
this milestone, the same way `revokeSource` (Decision 5's own sibling
mechanism) never invents a revocation registry either.

**Alternative considered and rejected: a project/trip-scoped context
("trip:hawaii-2026") as the trigger instead.** Considered because it is
also a plausible personal-assistant scope boundary. Rejected in favor of
account deletion specifically because ADR 0004 itself already named
account deletion as the "most plausible" real case — this milestone had no
reason to invent a second, less-obviously-real trigger when the more
obvious one was already sitting in the forward note it was answering.

## Decision 4 — `ForgetReason: "superseded"`: the one real case in this entire system, and why `contradict()` itself can never produce it

**Finding, stated plainly because it is easy to miss:** nothing built
before this milestone can ever construct a `Tombstone` with reason
`"superseded"`. `contradict()`'s own `ContradictionCheck` outcome literally
spelled `"superseded"` maps, via `lib/store/belief-query.ts`'s lazy
resolution, to `Tombstone.reason: "contradicted"` — a different word for a
different case (two DISAGREEING values, tier-resolved). `memory-plan.md`
§4's own definition of `ForgetReason: "superseded"` is "an explicit,
NON-CONTRADICTING replacement (same value, refreshed source — e.g.
re-confirmed by a more authoritative source)" — a case that, by
definition, `contradict()` reports as `"no-conflict"` (the values AGREE),
which is exactly why the tier-agnostic engine can never be the one to
decide it: agreement is not evidence, from `contradict()`'s own point of
view, that anything happened worth recording.

**This domain's real case:** `current-city` is first known only as a
`derived-inference` (an integration guessing from calendar/contacts data);
the user later directly confirms the SAME city. That confirmation deserves
to become the live, better-sourced record — not to sit alongside the guess
it confirms, indistinguishable from it in some future query's `"disputed"`
collision.

**Chosen:** `recordFact` (`store.ts`), on a `"no-conflict"` outcome from
`contradict()`, additionally checks `resolveTierSplit(older.tier,
newer.tier)` (`lib/contradiction/tier-split.ts` — REUSED, never
reimplemented, for a question that function was not originally built to
answer but whose ranking table is exactly the one needed: "does the newer
source outrank the older one"). If the split says `"superseded"` AND the
two tiers are actually UNEQUAL, the older memory is tombstoned with
`forget(older, "superseded", now, newer.id)`.

**Deliberately requires the tiers to differ, not merely that
`resolveTierSplit` says `"superseded"`.** `resolveTierSplit` also returns
`"superseded"` for two EQUAL-tier `direct-avowal`s (its own case 2) — but
that shape (restating the identical value from the SAME kind of source) is
this domain's disclosed `affirm()` gap, not this decision's concern: see
Decision 5.

## Decision 5 — What this domain deliberately does NOT build: an `affirm()`-equivalent for "restate the identical value from the same tier"

`memory-plan.md` §3 names `affirm(memory, newEvidence, now)` as a legal
operation — a NEW `Memory` with `lastAffirmedAt`/`confidence` updated,
same value re-confirmed. Nothing in `lib/store/**` builds it (ADR 0004's
own forward note: "no `affirm`/write-path orchestration exists in
`lib/store/**`"), and this milestone does not build one either, even
though it would have been a natural companion to Decision 4's
"same-value, different-tier" case.

**Why not:** the real value of `affirm()` is updating `lastAffirmedAt`
on the SAME memory record (extending its own freshness clock) without
creating a new `id` — a genuinely different operation from `recordFact`'s
own "write a new memory, let contradiction decide the old one's fate,"
which always mints a new `id`. Building a real `affirm()` correctly would
mean deciding how it interacts with `Memory`'s own immutability (§3: "an
`affirm()` ... produces a *new* `Memory`... old value stays retrievable")
and with this domain's own `StoreState` bookkeeping in ways `PLAN.md`'s M6
row does not ask for and no real case in this corpus currently needs (the
one real "restate the same fact" scenario in this corpus — Decision 4 — is
better served by the supersede-on-upgrade rule, which HAS a real case).
`domains/personal-assistant/__tests__/store.test.ts`'s own "same value,
SAME tier restated" test pins the disclosed behavior directly: both
memories stay live, untouched, rather than the domain silently guessing at
a mechanism it has no authority to design without a real case driving it.

## Decision 6 — Where the corpus lives: a mutable `StoreState`, not static fixtures

**The milestone's own question:** "fixtures in the domain, or a store the
demo mutates? M8 will drive this; think about what it needs."

**Chosen: a mutable `StoreState`** (`store.ts`) — `{ live, tombstoned }`,
plain, inspectable, serializable data every function in this file takes
and returns a NEW copy of (immutable, matching this whole codebase's own
"never mutate in place" discipline), not a set of static, pre-baked
fixtures loaded once. `memory-plan.md` §8's own demo moment is explicitly
a LIVE interaction ("tell the assistant... months later, tell it... ask it
a third time") — a fixed fixture file could only ever play back a canned
transcript, never accept "the user's next statement" the way M8's
interactive UI (PLAN.md's own next row) will have to. `scripts/demo-memory.ts`
threads one `StoreState` through its whole thirteen-step narrative,
exactly the shape M8 will need to hold state across a real user's typed
input.

**Why `state.tombstoned` holds FULL `TombstonedMemory` records, not bare
`Tombstone`s:** `queryBelief`'s own signature (`lib/store/belief-query.ts`)
takes `tombstones: ReadonlyArray<Tombstone>` — records with no
`subject`/`predicate`/`scope` of their own. A real store needs to answer
"which tombstones are relevant to THIS query," which a bare `Tombstone`
cannot answer about itself. Keeping the full `TombstonedMemory` (which,
via `MemoryCore`, still carries `subject`/`predicate`/`scope`) lets
`query` filter tombstones the same eligibility-checking way it filters
live candidates, then hand `queryBelief` exactly the `Tombstone`s it asks
for.

**A design choice worth naming explicitly: `query` PERSISTS `queryBelief`'s
own lazy discoveries back into the returned state**, rather than treating
`newlyForgotten` as a one-off return value the caller may or may not act
on. Without this, a decay-forgettable memory this domain's `query`
discovers would be reported correctly once, then reported all over again
as freshly "newly forgotten" on every subsequent query, and would never
stop being considered a live contender by `recordFact`'s own eligibility
scan. `store.test.ts`'s own "the lazy sweep is PERSISTED" test proves both
halves directly: the tombstone survives into `state.tombstoned`, AND a
second query at the same moment does not mint a duplicate one.

## Correction — `ShippingAddress` needed to be a `Record`, not a plain `interface`, to satisfy `Json`

Found while making this milestone's own types compile against
`lib/contracts/memory-core.ts`'s frozen `TValue extends Json` constraint,
the same category of correction M1's own ADR made for `Memory.status`/
`Tombstone.supersededBy`: a hand-written `interface` with named fields and
no index signature of its own is NOT structurally assignable to `Json`'s
object arm (`{ readonly [key: string]: Json }`) — a real TypeScript rule,
not a bug in this domain's first draft, but one that does not surface
until the type is actually used as a `Memory<TValue>`'s value. `Readonly<
Record<"line1" | "city" | "state", string>>` (a mapped type, which
TypeScript treats as already carrying that index signature) fixes it with
no change to the address's own shape or the demo's own data. This never
touched `lib/contracts` — `Json`'s own definition is unchanged and frozen;
only this domain's own type needed to be expressed differently to satisfy
it.

## Consequences

- Positive: every one of this milestone's own real cases (`tierForKind`,
  `scope-exited`, `ForgetReason: "superseded"`) is answered by a
  demonstrated mechanism in `scripts/demo-memory.ts`, not merely argued for
  in this ADR's prose — the demo script asserts (`node:assert`) that each
  step reaches the `BeliefAnswer`/`ForgetReason` it claims to, and fails
  loudly (non-zero exit) if the engine ever disagreed with this file's own
  narrative.
- Positive: `git grep -n --untracked "0.5 \*\*\|Math.pow(0.5)" -- domains/`
  returns nothing at all, and `git grep -n --untracked "tier ===" --
  domains/` returns exactly one line — `store.ts`'s own header comment
  QUOTING this very check, not a real comparison (`grep -rn "tier ===" |
  grep -v "^\s*\*" | grep -v "grep -n"` — i.e. real code outside comments —
  returns nothing) — no decay arithmetic, no raw tier comparison, is
  reimplemented anywhere in `domains/**`; every doubt-mechanism is a real
  call into the frozen engine that owns it.
- Positive: the fair bag-of-words/cosine baseline (`baseline.ts`) genuinely
  loses on this corpus, exactly as `memory-plan.md` §8 predicts — verified
  by both a hand-worked arithmetic test (`baseline.test.ts`) and the live
  demo run, not merely asserted. See this milestone's own build report for
  the exact numbers.
- Negative / cost, disclosed: `Provenance.tier`'s mapping for
  `counterparty`/`system` is still undecided after this milestone —
  correctly so, per Decision 1, but a future domain that DOES have a real
  `counterparty` or `system` case will need its own ADR to decide it, not
  inherit one from here.
- Negative / cost, disclosed: this domain has no `affirm()`-equivalent for
  "restate the identical value from the same tier" (Decision 5) — a real,
  intentional gap, not an oversight, pinned directly by a test rather than
  left to be discovered by a future caller expecting different behavior.
- Forward note for M7: the failure suite's own required baseline contrast
  (`memory-plan.md` §8, restated in `PLAN.md`'s M7 row) can import
  `domains/personal-assistant/baseline.ts`'s `rankBySimilarity` directly
  against the exact two utterances `scripts/demo-memory.ts` uses (steps 2
  and 12) rather than re-deriving the corpus — `baseline.test.ts`'s own
  "hand-worked arithmetic" test already pins the exact numbers M7 can cite.
- Forward note for M8: `domains/personal-assistant/store.ts`'s `StoreState`,
  `recordFact`, and `query` are designed to be driven by a UI directly —
  `EMPTY_STORE` as the initial React state, `recordFact`/`query`/
  `revokeSource`/`closeScope` as the state-transition functions a UI's own
  event handlers call, each returning a new `StoreState` a `useState`
  setter can accept unchanged.

## Alternatives rejected (summary, cross-referenced above)

- A generic four-member `tierForKind(kind): ConfidenceTier` mapping
  (Decision 1) — would force a guess for `counterparty`/`system`, the
  exact mistake ADR 0001 already refused to make.
- A closed union of subjects, for a domain with only ever one real subject
  (Decision 2) — speculative flexibility with no real case.
- A project/trip-scoped `scope-exited` trigger instead of account deletion
  (Decision 3) — account deletion was already the more obviously real case
  ADR 0004 itself named.
- Inventing a scope-exit or source-revocation REGISTRY (Decisions 3 and
  the sibling discussion for `revokeSource`) — no concrete caller for one;
  matches M5's own precedent for the identical kind of decision.
- Treating EQUAL-tier same-value restatement the same as the real
  unequal-tier upgrade case for `ForgetReason: "superseded"` (Decision 4)
  — `resolveTierSplit` alone would conflate them; this domain deliberately
  requires the tiers to differ.
- Building a general `affirm()` mechanism ahead of a real case that needs
  its own new-`id`-free semantics (Decision 5) — no real case in this
  corpus asks for it; the one real "restate the same fact" scenario is
  better served by Decision 4's supersede-on-upgrade rule.
- Static, pre-baked corpus fixtures instead of a mutable `StoreState`
  (Decision 6) — could not honestly support §8's own live-interaction
  demo moment, and would not give M8 the state-transition shape it needs.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

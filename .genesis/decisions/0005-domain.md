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
`scripts/demo-memory.ts` only, with ONE narrow, EXPLICITLY AUTHORIZED
exception — a comment-only correction to `lib/contracts/provenance.ts`
(the "Correction — `provenance.ts`" section below) — reported directly
with `git diff main -- lib`, not claimed empty when it is not. This ADR
answers the four design questions
this milestone's own brief posed directly, plus that authorized
correction, plus one implementation-level fix (a `Json`-compatibility
correction to `ShippingAddress`) found while making the frozen types
actually compile against this domain's own data, plus two findings this
milestone surfaced and is required to record rather than merely act on.

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

## Decision 4 — `ForgetReason: "superseded"`: an enum member the frozen contracts already carried, that nothing before this milestone could reach — and a domain-owned tier table, not a reuse of `resolveTierSplit`

**This is not this domain inventing a case the frozen contracts never
asked for.** `lib/contracts/forget-reason.ts`'s `ForgetReason` union has
carried the literal `"superseded"` since M1, and `memory-plan.md` §4's own
definition is exactly this shape: "an explicit, NON-CONTRADICTING
replacement (same value, refreshed source — e.g. re-confirmed by a more
authoritative source)." The enum member existed from the start; what
didn't exist, before this milestone, was any caller that could reach it.

**Finding, stated plainly because it is easy to miss:** nothing built
before this milestone can ever construct a `Tombstone` with reason
`"superseded"`. `contradict()`'s own `ContradictionCheck` outcome literally
spelled `"superseded"` maps, via `lib/store/belief-query.ts`'s lazy
resolution, to `Tombstone.reason: "contradicted"` — a different word for a
different case (two DISAGREEING values, tier-resolved). A
`ForgetReason: "superseded"` tombstone requires the two values to AGREE,
which `contradict()` reports as `"no-conflict"` — a verdict from which the
tier-agnostic engine correctly derives nothing further, since agreement
carries no disagreement to adjudicate. This milestone is the first with
standing to reach that enum member, not the first to invent a reason for
one to exist — `main` at M5 (`chore(genesis): mark M5 done`, #10) already
recorded, independently, the same reading: "`ForgetReason.superseded` is
reserved for a different scenario" from `"contradicted"`.

**This domain's real case:** `current-city` is first known only as a
`derived-inference` (an integration guessing from calendar/contacts data);
the user later directly confirms the SAME city. That confirmation deserves
to become the live, better-sourced record — not to sit alongside the guess
it confirms, indistinguishable from it in some future query's `"disputed"`
collision.

**Chosen:** `recordFact` (`store.ts`), on a `"no-conflict"` outcome from
`contradict()`, additionally checks whether the newer source's tier
strictly outranks the older's. If so, the older memory is tombstoned with
`forget(older, "superseded", now, newer.id)`.

**REVISED after independent review: the tier check is a SEPARATE,
domain-owned table (`newerSourceOutranks`/`TIER_RANK`, `store.ts`), not a
reuse of `lib/contradiction/tier-split.ts`'s `resolveTierSplit`.** The
first pass of this decision called `resolveTierSplit(older.tier,
newer.tier)` directly, reasoning that reuse-over-reimplementation was the
right instinct and that the function's own ranking table was exactly what
this domain needed. **That reasoning was sound about reuse in general and
wrong about THIS reuse specifically**, caught on independent review:
`resolveTierSplit` was built by ADR 0003 to decide `superseded` vs.
`disputed` for two DISAGREEING values — calling it here, where the two
values AGREE, borrowed its tier-ordering arithmetic while silently
depending on its DISAGREEMENT semantics never changing either. The two
questions happen to share an input (`ConfidenceTier` ordering) but are not
the same question, and nothing enforced that they stay in sync: if a
future milestone ever revised `resolveTierSplit`'s disagreement-side rule
(e.g. to weigh a third signal alongside tier), this domain's
reconfirmation path would change behavior silently, with no compile error
and no test anywhere pointing at the actual cause.

**Fix chosen: implement the tier comparison directly in the domain, not
document the coupling and keep it.** `ConfidenceTier` is a closed,
two-member union (`lib/contracts/provenance.ts`) — "which of two closed
literals outranks the other" is a two-line table, not a curve or a
comparator vocabulary this domain would otherwise have to guess at
duplicating. `store.ts` now owns its own `TIER_RANK`/`newerSourceOutranks`,
used for exactly this one decision. This is NOT the "tier resolution" this
milestone's own scope brief says a domain must not reimplement — that
phrase means `lib/contradiction`'s actual job (deciding `superseded`/
`disputed` for two DISAGREEING values), which this domain still never
touches: every disagreeing-value case still goes through the real,
unmodified `contradict()`. The two-line table answers a narrower,
domain-owned question `lib/contradiction` was never asked to answer at
all — whether an AGREEING restatement counts as an explicit upgrade — and
owning it locally costs two lines against a coupling whose real dependency
(tier order only) was not what the borrowed function's name or purpose
advertised.

**Deliberately requires the tiers to differ, not merely that the newer
tier is not outranked.** Two EQUAL-tier `direct-avowal`s restating the
identical value get no special treatment here — that shape (restating the
identical value from the SAME kind of source) is this domain's disclosed
`affirm()` gap, not this decision's concern: see Decision 5.

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

## Correction — `provenance.ts`: an authorized, comment-only reopening of `lib/contracts`, to fix a false claim rather than merely note it

**Finding:** `lib/contracts/provenance.ts`'s own header, since M1, asserted
as settled fact that "M5's `lib/store/**` owns the actual revocation
registry and the `forget(..., "source-revoked", now)` mechanism that
reads it." **This is false.** M5 (`.genesis/decisions/0004-store.md`)
built `forget()`'s own mechanism only — no registry exists anywhere in
`lib/store/**`, confirmed directly (`git grep -n "revoke" lib/store` turns
up nothing outside `ForgetReason`'s own literal). M1 could not have
foreseen this — no store existed yet, at M1, to check the claim against —
but a frozen contract stating as fact that a component exists when
nothing ever built it is the exact failure category a sibling project's
own M1 was rejected for (a comment describing a function nothing had
built).

**Authorized: a narrow, comment-only reopening of
`lib/contracts/provenance.ts`** — the same shape M3's own exception was
granted, and the same shape M3's own decay-policy rename (ADR 0002,
Decision 1) already used for a prose-only fix inside a frozen file.
**No executable line changes.** `git diff main -- lib` (reported in this
build's own report) shows exactly one file, comment lines only: the false
sentence is replaced with an `AMENDMENT (M6, ...)` paragraph stating what
is actually true (no registry exists at any layer; `revokeSource`,
`domains/personal-assistant/store.ts`, is a plain filter over
currently-tracked live memories — the identical no-registry shape M5
itself already established for `scope-exited`) and pointing at this ADR
for the full record. This is corrected, not merely disclosed, for the
same reason ADR 0002 gave for renaming `"linear-to-floor"` rather than
just documenting the mismatch: "a shipped [file] carrying a permanently
wrong [claim] is worse than a one-line reopening, and later milestones
will all read it."

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

## Finding — `Memory.status` is never read by any engine function; forward note for M8/M9

**Finding, worth more than a footnote because a frozen field that looks
load-bearing and is not will mislead a future reader — in particular
M8's own UI author, who will see the field on every `Memory` value and
may reasonably assume reading it is meaningful.** `Memory.status`
(`"believed" | "doubted" | "disputed"`, `lib/contracts/memory.ts`, frozen
since M1) is never read by `decay()` (`lib/decay/decay.ts`), never read
by `contradict()` (`lib/contradiction/contradict.ts`), and never read by
`queryBelief()` (`lib/store/belief-query.ts`) — confirmed directly, `git
grep -n "\.status" -- lib/decay lib/contradiction lib/store` (excluding
`__tests__/`) turns up zero matches in `lib/contradiction`, and in
`lib/decay`/`lib/store` only the `record.status === "tombstoned"`
type-discriminant check (`query-confidence.ts` — the structural refusal
itself, not a business-logic read) and `DecayResult.status` (`decay()`'s
OWN computed classification, a different type from `Memory.status`,
per `decay.ts`'s own header) — never a read of a LIVE `Memory`'s own
`status` field to decide `believed`/`doubted`/`disputed`. Every one of
those three functions RECOMPUTES its own answer fresh, every
call, from `(confidence, decayPolicy, believedAt, value, source.tier,
now)` — never from a memory's own stored `status` label.

**This domain's own `toMemory` (`facts.ts`) always sets `status:
"believed"` at construction**, for exactly this reason: it is the only
honest label a memory can carry the instant it is created, before
anything has had a chance to contradict or decay it, and since nothing
downstream trusts the field for a real decision, there is no more
accurate value this domain could assign instead.

**Not a bug to fix — recorded as a disclosed limitation, and the field is
NOT removed.** `Memory.status`'s three-member narrowing is load-bearing
for a DIFFERENT, real reason (M1's own ADR, Decision 2): it is what makes
`TombstonedMemory` structurally distinct from `Memory`, which is what
makes the compile-time tombstone refusal possible at all. Removing or
reinterpreting the field would touch that frozen property for a
milestone (M6) with no authority to reopen `lib/contracts` beyond the one
narrow, authorized correction above. **Forward note for M8 and M9,** in
the same explicit style ADR 0001 used to hand this milestone its own
`tierForKind` question: a UI or documentation author reading a `Memory`
value should not infer current belief status from its own `.status`
field — the real, current answer is always whatever `queryBelief()` (or
this domain's own `query()`) returns for that memory's coordinate at the
moment asked, never a label sitting on the record itself.

## Consequences

- Positive: every one of this milestone's own real cases (`tierForKind`,
  `scope-exited`, `ForgetReason: "superseded"`) is answered by a
  demonstrated mechanism in `scripts/demo-memory.ts`, not merely argued for
  in this ADR's prose — the demo script asserts (`node:assert`) that each
  step reaches the `BeliefAnswer`/`ForgetReason` it claims to, and fails
  loudly (non-zero exit) if the engine ever disagreed with this file's own
  narrative.
- Positive: `git grep -n --untracked "0.5 \*\*\|Math.pow(0.5)" -- domains/`
  and `git grep -n --untracked "tier ===" -- domains/` both return nothing
  at all — no decay arithmetic, no raw disagreement-tier comparison, is
  reimplemented anywhere in `domains/**`; every DISAGREEING-value judgment
  is a real, unmodified call into `contradict()`. The one tier-ORDERING
  fact this domain does own locally (`TIER_RANK`/`newerSourceOutranks`,
  Decision 4) is a two-line table for a question `lib/contradiction` was
  never asked to answer, not a reimplementation of anything it already
  computes — see Decision 4 for the full argument, including the
  independent-review correction that put it here instead of coupling to
  `resolveTierSplit`.
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
- Positive: `lib/contracts/provenance.ts`'s false claim about M5 owning a
  revocation registry is now corrected, not merely disclosed in this ADR —
  a future reader of that frozen file will read the true architecture
  directly at the source, not only here.
- Negative / cost, disclosed: `lib/**` is no longer byte-identical to
  `main` — one file, comment lines only, in one authorized, narrow
  reopening. `git diff main -- lib` (reported in this build's own report)
  shows the full, exact scope.
- Positive, and worth stating for whoever verifies this milestone next:
  `Memory.status`'s "never read by any engine function" finding is now a
  named, permanent forward note (see the Finding section above), not a
  fact a future M8/M9 author would have to rediscover independently by
  reading `lib/decay`/`lib/contradiction`/`lib/store` line by line.
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
  — this domain deliberately requires the tiers to differ.
- REVISED, not merely considered: this decision's OWN first pass, reusing
  `resolveTierSplit(older.tier, newer.tier)` for the reconfirmation check
  (Decision 4) — internally reasonable (reuse over reimplementation) but
  wrong specifically because it coupled this domain's AGREEING-value
  policy to a function's DISAGREEING-value semantics with nothing
  enforcing the two stay in sync; independent review caught it and this
  domain now owns a small, local, two-line tier table instead.
- Leaving `lib/contracts/provenance.ts`'s false "M5 owns the revocation
  registry" claim disclosed only in this ADR, rather than correcting the
  frozen file itself (the "Correction — `provenance.ts`" section) —
  rejected once authorized: a frozen contract stating a false fact as true
  is worse than a narrow, reported reopening to fix it.
- Building a general `affirm()` mechanism ahead of a real case that needs
  its own new-`id`-free semantics (Decision 5) — no real case in this
  corpus asks for it; the one real "restate the same fact" scenario is
  better served by Decision 4's supersede-on-upgrade rule.
- Static, pre-baked corpus fixtures instead of a mutable `StoreState`
  (Decision 6) — could not honestly support §8's own live-interaction
  demo moment, and would not give M8 the state-transition shape it needs.

<!-- Copy this file to NNNN-<slug>.md for each irreversible decision. -->

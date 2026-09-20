# PLAN — memory-ledger

The machine-parseable implementation plan. Mirrors the milestone table in `DONE.html` (DONE.html is the
human/visual view; this is the one loops read). Sliced so each milestone ships in one L1 BUILD pass.

> Slicing rule: a milestone must have (a) a single clear outcome, (b) an exact **demo command** that
> proves it, and (c) a freeze boundary of files it may touch. If you can't write the demo command, the
> milestone is too vague — split it.

This plan is scoped from `memory-plan.md` (the full scoping document produced before any code was
written, copied into this directory so every cross-reference below resolves to a real file in this repo).
Section references below (§2, §3, §5, §8, etc.) point into that document.

---

## Brainstorm (G0.5 — the make-or-break question, filled before slicing milestones)

> The hardest objection this project has to survive: "you put confidence and a timestamp column next to
> the embedding — that's RAG with metadata." See `memory-plan.md` §2 for the full argument; summarized
> here for the plan to be self-contained.

### Why this is not RAG with extra fields

A judge's objection has to be answered about what the mechanism **structurally cannot do**, not about a
promise to use metadata responsibly. Plain retrieval:

1. **Always answers.** A populated vector index returns a top-k ranking for any query, even when nothing
   currently true exists to say — there is no representation of "I have no current belief" distinct from
   "I found a weak match."
2. **Cannot retract.** Removing a vector and never having inserted it look identical from the query side —
   no typed state between "present" and "actively disbelieved."
3. **Cannot detect that two of its own answers disagree.** Similarity is defined pairwise between query
   and chunk, never chunk-to-chunk — contradiction resolution, if any, happens in an LLM's unaudited prose.
4. **Treats textual similarity as a proxy for currency**, which it structurally is not.

### Chosen: a closed, exhaustively-matched query outcome (`BeliefAnswer`, §6), not a ranking

Three of `BeliefAnswer`'s four variants (`disputed`, `unknown`, and a `doubted` carrying a *reason*) are
literally impossible for a similarity ranker to produce — they require the store to have compared its own
contents against each other and against a forgetting policy **before** the query arrives, and to be
willing to hand back "no current answer" instead of a ranked one. `Tombstone` (§4) exists specifically to
make "what did you used to believe, and why don't you any more" answerable on the record — a question
plain retrieval has no representation for at all.

---

## Milestones

### M1 — Contracts: Memory, ForgetReason, Tombstone, BeliefAnswer
- **Outcome:** The four irreducible types (§6) — `Memory<TValue>`, `ForgetReason`, `Tombstone`,
  `BeliefAnswer` — plus the supporting `Provenance`, `Scope`, `Confidence`, and `DecayPolicy` the plan
  names, independently authored (not imported from decision-engine or shadow-run). Nothing here decays,
  contradicts, or forgets anything for real.
- **Phase:** BUILD
- **Files / freeze boundary:** `lib/contracts/**`. Frozen after this milestone.
- **Demo command:** `npm test -- contracts`
- **Success criteria:**
  - `@ts-expect-error` proofs that a `Memory` literal missing `scope`, or a `Tombstone` missing `reason`,
    does not compile.
  - `BeliefAnswer` exhaustively matched via `assertNeverBeliefAnswer`; a test proves a fifth variant fails
    to compile until every consumer handles it.
  - `Memory.value` must be plain, serializable data — no functions — enforced at the type level as far as
    TypeScript allows, and at runtime against a cast that defeats the type system.
  - A test constructing two `Memory` values that differ only in `id` proves equality is never structural.
  - `ForgetReason` is a closed enum — `age-exceeded | contradicted | superseded | scope-exited |
    source-revoked`. No free-text escape hatch.
  - The live-query function must be structurally unable to accept a tombstoned memory — compile-time
    refusal, proven against a representative stand-in signature (M5 owns the real one).
  - `effectiveConfidence` (computed, query-facing) is distinct from `Memory.confidence` (recorded,
    immutable) in the types, not just in prose.
- **Loops:** L1, L4
- **Token budget:** 150000

### M2 — Deploy a live skeleton to Vercel
- **Outcome:** A minimal Next.js app with a health endpoint, deployed, with a real public URL —
  deliberately second, not last (a live URL left to the end is how it fails to happen; see this account's
  own standing note on this).
- **Phase:** DEPLOY
- **Files:** `app/api/health/**`, `vercel.json`, `next.config.*`, `package.json`
- **Demo command:** `curl -sf $DEPLOY_URL/api/health`
- **Success criteria:** HTTP 200, JSON body naming the deployed commit SHA. Uses `next build --webpack` +
  `experimental.extensionAlias` for the `.js`-suffixed NodeNext imports (Turbopack cannot resolve them) —
  `next.config.ts`'s reconciliation comment is copied from decision-engine/shadow-run, not rediscovered.
  **Needs a Vercel account.**
- **Loops:** L1, L4
- **Token budget:** 150000

### M3 — The decay engine
- **Outcome:** `decay(memory, now)` and the typed `DecayPolicy` interpreter (§5, cause 2) — confidence
  degrading toward a `doubted` threshold and then a `forget` floor, as a pure, declared function
  evaluating the DATA `DecayPolicy` already fixes at M1, never an ad hoc `if age > X`.
- **Phase:** BUILD
- **Files:** `lib/decay/**`. Frozen after this milestone.
- **Demo command:** `npm test -- decay`
- **Success criteria:** `decay()` is proven pure; a threshold-flip test proves confidence at age N-1 stays
  `believed` and at age N flips to `doubted`, and a second, lower floor flips to a forgettable state — no
  EMA, no smoothing that would hide the exact boundary; a clock-inconsistent `now` fails closed to "cannot
  compute, treat as most doubted," never to a fabricated `confidence: 1`. Replaces
  `effective-confidence.ts`'s live branch with a real call to this function (see that file's own header).
- **Loops:** L1, L4
- **Token budget:** 150000

### M4 — The contradiction engine
- **Outcome:** `contradict(older, newer)` (§5, cause 1) — the four-outcome `ContradictionCheck`
  (`no-conflict / superseded / disputed / not-comparable`), built on a locally-authored, closed, typed
  value-comparison vocabulary (equals / gte / lte / in / within-tolerance).
- **Phase:** BUILD
- **Files:** `lib/contradiction/**`. Frozen after this milestone.
- **Demo command:** `npm test -- contradiction`
- **Success criteria:** a same-value comparison is always `no-conflict` regardless of source/confidence;
  two same-tier `human` avowals with disagreeing values resolve to `superseded` (naming both ids), proving
  §5.1's worked contrast in code; two same-tier `derived` inferences with disagreeing values, both still
  fresh, resolve to `disputed`, never an automatic winner; a type-mismatched comparison fails closed to
  `not-comparable`, never throws and never silently resolves either way; a grep-based architecture test
  asserts zero LLM-client/network imports anywhere under `lib/contradiction/**`.
- **Loops:** L1, L4
- **Token budget:** 150000

### M5 — The forgetting engine (tombstoning)
- **Outcome:** `forget(memory, reason, now)`, producing a real `TombstonedMemory` + `Tombstone` pair, and
  `BeliefQuery` — the read path that structurally cannot construct a `believed`/`doubted` answer from a
  tombstoned record (M1 already proves this refusal is *expressible*; M5 is the first real consumer).
- **Phase:** BUILD
- **Files:** `lib/store/**`. Frozen after this milestone.
- **Demo command:** `npm test -- store`
- **Success criteria:** every `ForgetReason` variant is proven to actually tombstone something (five
  passing tests, one per reason); a query over a corpus where every candidate is tombstoned returns
  `{status: "unknown", reason: "all-known-memories-tombstoned", tombstones: [...]}`, proven directly; a
  `@ts-expect-error` proof that the real `BeliefQuery` function's parameter type refuses a
  `TombstonedMemory` at compile time.
- **Loops:** L1, L4
- **Token budget:** 150000

### M6 — Domain: the personal-assistant memory adapter
- **Outcome:** The committed domain (§9) wired end-to-end: natural-language-ish facts in (already parsed
  to typed `Memory` candidates — no LLM inside `lib/`), `affirm`/`contradict`/`decay`/`forget` driving the
  §8 running scenario, `BeliefQuery` answering.
- **Phase:** INTEGRATE
- **Files:** `domains/personal-assistant/**`, `scripts/demo-memory.ts`. Frozen after this milestone.
- **Demo command:** `npm run demo:memory`
- **Success criteria:** the script runs the §8 address scenario end-to-end and prints, per step, the
  memory written, its confidence, and the eventual tombstone; all four `BeliefAnswer` variants each appear
  at least once across the run.
- **Loops:** L1, L4
- **Token budget:** 150000

### M7 — The failure suite (the one deliberate-failure milestone)
- **Outcome:** The §10 same-tick race, plus the required shared-deliverable deliberate-failure test and
  the §8 fair-baseline-vs-tombstone contrast, run as a real, passing test against the unmodified baseline.
- **Phase:** VERIFY
- **Files:** `tests/failures/**`. Frozen after this milestone.
- **Demo command:** `npm test -- failures`
- **Success criteria:** (1) an interleaved `affirm`-during-query test proves the query never returns
  `believed` from data already superseded within the same batch; (2) a clock-inconsistent race proves the
  store fails closed to `disputed`, never to whichever write happened to commit first; (3) a
  revoked-source test proves `source-revoked` tombstoning happens even for an otherwise fresh,
  high-confidence memory; (4) the fair bag-of-words/cosine baseline from §8 is run as an actual test with
  its scoring exactly as specified there — the baseline is asserted to rank the *old* address higher (it
  alone shares "shipping" with the query), while `BeliefQuery` returns the current one. If this assertion
  cannot be made to pass without changing the baseline's scoring, that is logged as a finding requiring
  the §8 scenario to be revisited, not worked around.
- **Loops:** L1, L4
- **Token budget:** 150000

### M8 — The interactive demo
- **Outcome:** The §8 scenario, live: enter the first address, enter the change months-later-phrased-
  differently, ask "What's my shipping address?", see the old memory's `effectiveConfidence` at `0` and
  its tombstone, see the fair baseline rank the old address higher on the same two facts and query.
- **Phase:** BUILD
- **Files:** `app/**`, `components/**`. Frozen after this milestone.
- **Demo command:** the deployed URL runs the §8 scenario end-to-end from input, driving the real engine.
- **Success criteria:** on the deployed URL, the tombstone record (reason, timestamp, superseding memory
  id) is rendered on screen, not merely logged; the fair baseline's real ranking and this system's answer
  are shown side by side from the same two input facts and the same query, with both cosine-similarity
  numbers visible; a stranger with no narration can see which one is right and why. **Needs a Vercel
  account** (reuses M2's deployment).
- **Loops:** L1, L4
- **Token budget:** 150000

### M9 — Deliverables
- **Outcome:** Architecture snapshot (contracts → decay → contradiction → forgetting → domain, each
  stage's "what does it refuse, and why"), the ≤300-word two-year thesis, and a verified clean-clone run.
- **Phase:** RELEASE
- **Files:** `docs/**`, `README.md`. Frozen after this milestone.
- **Demo command:** `cd "$(mktemp -d)" && git clone https://github.com/vladimir-mawla/memory-ledger . && npm ci && npm run typecheck && npm test`
- **Success criteria:** fresh clone, install, typecheck, and full test run all pass with zero credentials
  configured; the architecture doc and thesis are checked against actual code/test output before being
  committed; the README states plainly which of §9's other two candidate domains were *not* built.
- **Loops:** L1, L4
- **Token budget:** 150000

# Project plan: "Memory That Knows It Might Be Wrong"

Repo name: **`memory-ledger`**, settled.

## 0. What's quoted vs. inferred

The verbatim brief is gone. Only this survives, in the author's own words:

> Source, confidence, freshness, scope, and an explicit forgetting policy. Reuses freshness and revocation
> thinking; plain vector RAG is a disqualifier.

Treat **only that sentence** as quoted. Everything else below — the specific irreducible types, the
contradiction mechanism, the domain choice, the demo scenario, the failure test, the milestone slicing — is
this plan's inference from that sentence plus the sibling precedent, not a memory of the original text.
**Check these against the original brief if it resurfaces:**

- That "confidence" and "source" are meant as per-memory typed fields (inferred from decision-engine's
  `Signal` precedent), not e.g. a single system-wide trust score.
- That "explicit forgetting policy" means the system must actually delete/tombstone something and prove it
  did, rather than just documenting a retention policy in prose.
- That "reuses freshness and revocation thinking" is permission to reuse *concepts* from decision-engine
  (freshness/confidence) and agent-trust-layer (revocation), not an instruction to literally import their
  code — the hard constraint below (share infra only, never the conceptual core) is this plan's reading of
  that line, and is worth the author double-checking.
- That "plain vector RAG is a disqualifier" means *the mechanism* must not be vector-similarity retrieval
  with metadata bolted on — not merely that the demo must avoid the word "RAG."
- The domain (personal-assistant memory, committed to below in §9, not left open) and the specific demo
  moment (address change) are this plan's choice among several that fit the brief, not something the brief
  specified.
- The rule that decides `superseded` vs. `disputed` (§5) — based on comparing each memory's *recorded*
  confidence tier at creation time — is this plan's mechanism for making that split typed rather than
  judged; the brief's own text doesn't specify one.

## 1. What the three siblings already answered — and where the line is

Read directly (`docs/ARCHITECTURE.md`, `.genesis/decisions/*`, `lib/signals/` for decision-engine;
`docs/WALKTHROUGH.md`, `.genesis/PLAN.md` for shadow-run; `docs/ARCHITECTURE.md` for agent-trust-layer):

| Project | Question | Core mechanism |
|---|---|---|
| `decision-engine` | *May I act?* | `Signal` (provenance/freshness/confidence, evaluated fresh per call) → `Gap` analysis → five-outcome `decide()` → replayable audit |
| `shadow-run` | *What would happen if I did?* | Pure `simulate()` projection vs. real execution, mechanically `reconcile()`d, with a `SimulatorTrust` counter and provable `rollback` |
| `agent-trust-layer` | *Who is asking?* | `did:key` identity → typed VC claims (authority vs. history) → ordered fail-closed verification chain (incl. revocation) → policy that narrows, never grants |

This project's question is different in kind from all three: **not** "is there enough evidence to act,"
**not** "did the world match the prediction," **not** "is the claimant who they say," but **"what does the
system currently believe, and has anything happened that should make it believe that less?"** — a question
about the *persisted state of belief itself*, evaluated over time, not about a single decision, a single
prediction, or a single credential presentation.

**Hard constraint respected throughout this plan:** nothing below imports `decision-engine`'s `Signal`,
`Gap`, or cost-model types, nor `agent-trust-layer`'s credential/policy types. Where a *concept* (freshness
arithmetic, fail-closed comparison, revocation-as-a-typed-check) is reused, it is re-derived and
independently authored in this repo — same discipline `decision-engine`'s own `lib/signals/validation.ts`
already uses when it reproduces a helper from `lib/contracts` locally rather than importing it, because the
imported module is frozen and reuse would smuggle the wrong dependency direction in. `memory-ledger` runs
standalone from a clean clone; only deploy skeleton, CI shape, README/thesis shape, and verification
discipline (grep-based architecture guards, `@ts-expect-error` proofs, fail-closed tests) are shared
*patterns*, never a shared package.

---

## 2. Why this is not RAG with extra fields (the hardest part)

A judge's objection will be: "you put confidence and a timestamp column next to the embedding — that's
RAG with metadata." The answer has to be about what the *mechanism structurally cannot do*, not about
promising to use the metadata responsibly.

**What retrieval does happily that this system must structurally refuse:**

1. **Retrieval always answers.** Given any embeddable query, a vector index returns its top-k nearest
   neighbors — there is no query for which "nothing" is a valid return value; an empty corpus returns an
   empty list, but a *populated* corpus with nothing currently true to say about the subject still returns
   *something*, ranked by distance, because distance is defined for every pair of vectors. There is no
   representation of "I have no current belief about this" as distinct from "I found a weak match."
2. **Retrieval cannot retract.** A vector index has an `insert` and, as an operations concern, a `delete` —
   but nothing in the retrieval *mechanic itself* represents "this used to be true and is now actively
   disbelieved." Removing a vector and never having inserted it look identical from the query side. There is
   no typed state between "present" and "absent" for something that was once believed and is now known
   wrong.
3. **Retrieval cannot detect that two of its own answers disagree.** Similarity is defined pairwise between
   query and chunk, never between chunk and chunk. Two chunks asserting incompatible facts about the same
   subject both retrieve fine, both rank independently, and nothing forces them into contact with each
   other. A RAG system's "resolution" of contradiction, if it has any at all, happens downstream in an LLM's
   prose synthesis — which is exactly the "prompt wrapper with no system behind it" pattern the shared
   disqualifiers name, and is unauditable and non-mechanical by construction.
4. **Similarity is not a proxy for currency.** A chunk phrased closer to the query wording wins, regardless
   of which one is older, superseded, or from a revoked source. There is no mechanism by which "newer" or
   "still trusted" outranks "textually closer."

**The structural (not promised) difference:** this system's read path is not "rank everything and return the
top result." It is a **closed, exhaustively-matched query outcome** — `BeliefAnswer` (§5) — three of whose
four variants (`disputed`, `unknown`, and a `doubted` result carrying a *reason* the confidence dropped) are
literally impossible for a similarity ranker to produce, because they require the store to have compared its
own contents against each other and against a forgetting policy *before* the query ever arrives, and to be
willing to hand back "no current answer" instead of a ranked one. A retrieval system, however metadata is
bolted onto it, always has a top-1; this system sometimes structurally has none, and that "none" is the part
that has to be built, tested, and demoed — not asserted.

**The one question RAG cannot answer at all, stated plainly:** *"What did you used to believe about X, and
why don't you any more?"* A vector store has no notion of previously-held-versus-currently-held; it has only
present chunks and absent ones, with no causal record connecting an absence to the reason it became absent.
This system's `Tombstone` (§4) exists specifically to make that question answerable, on the record, every
time.

---

## 3. What is a memory, mechanically? (types, not prose)

A memory is not a chunk of text with fields attached. It is a typed, comparable claim:

```
Memory<TValue> {
  id: MemoryId
  subject: string        // the entity this is about — "user:vlad.shipping-address"
  predicate: string       // the closed vocabulary of what's being asserted — matched by
                          // exact string equality, same discipline as Signal.kind
  value: TValue           // plain, serializable data only — never a function/closure
  source: Provenance      // where this claim came from — see §6
  believedAt: CapturedAt  // when this specific claim was first accepted
  lastAffirmedAt: CapturedAt // last time evidence re-confirmed it (may equal believedAt)
  confidence: Confidence  // [0,1], see §5 for how it moves
  decayPolicy: DecayPolicy // how confidence degrades with age — a declared function, not
                          // a bare number (see §4)
  scope: Scope             // the bounded context this claim applies within — see below
  status: "believed" | "doubted" | "disputed" | "tombstoned"
}
```

**Legal operations** — and no others:

- `affirm(memory, newEvidence, now)` → a *new* `Memory` (immutable `id`; memories are never mutated in
  place — see below), with `lastAffirmedAt` and `confidence` updated. Old value stays retrievable through
  the audit path, never overwritten.
- `decay(memory, now)` → recomputed `confidence` per `decayPolicy`; pure function of `(memory, now)`, no
  side effect, same purity discipline as `decision-engine`'s `analyzeGaps`.
- `contradict(older, newer)` → `ContradictionCheck` (§5) — never mutates either input; the *store* (not this
  function) decides what to do with the result.
- `forget(memory, reason, now)` → `Tombstone` (§4) — the only operation that changes retrievability.

**Scope, as a type, not a string tag:** `Scope = { readonly dimension: string; readonly value: string }[]` —
an ordered set of bounded contexts ("account:acme-corp", "user:vlad"), compared by exact set containment,
never by substring or fuzzy match. A query's scope must be a superset match against a memory's scope for the
memory to be eligible at all — this is checked *before* freshness, confidence, or contradiction, mirroring
`agent-trust-layer`'s ordering discipline of cheapest/most-structural check first. A memory whose only scope
entry is `"user:vlad"` is not a candidate for a query scoped to `"user:sam"` — full stop, not a
low-similarity match that could still surface.

**Memories are immutable, append-only records — never edited in place.** This is the one place this plan
insists on a design choice up front rather than leaving it to M1's brainstorm: an editable `Memory.value`
would make "prove what you believed at time T" impossible to answer honestly (the record itself would have
moved), which is exactly the failure mode the forgetting policy (§4) exists to avoid. Every belief change is
a *new* memory (via `affirm`) or a `Tombstone` (via `forget`) pointing at the old one — never a write to the
old one's own fields.

**`confidence` (recorded) vs. `effectiveConfidence` (computed) — kept as two different things, on purpose.**
`Memory.confidence` is the value recorded at creation/affirmation time and is never rewritten afterward —
consistent with immutability above. What decay (§5.2), contradiction (§5.1), and tombstoning (§4/§5.3)
change is not that field; they change what a *query* is willing to report. `effectiveConfidence(memory,
now)` is a separate, computed, non-stored function: `0` for any `TombstonedMemory` (structurally — see §4),
otherwise `decay(memory, now).confidence`. `BeliefQuery` (§6) only ever reports `effectiveConfidence`, never
the raw stored field, so "confidence dropped to zero" always means "the store will no longer surface this
as belief," never "a historical record was rewritten."

---

## 4. The forgetting policy (the centre of the brief)

**Forgetting is tombstoning, never physical deletion.** A system that deletes rows cannot answer "what did
you forget and why" — there is nothing left to point at. `Tombstone` is the record:

```
Tombstone {
  id: TombstoneId
  memoryId: MemoryId          // what was forgotten
  reason: ForgetReason        // closed enum, never free text
  forgottenAt: CapturedAt
  supersededBy?: MemoryId     // present iff reason is "contradicted" or "superseded"
}

ForgetReason =
  | "age-exceeded"     // decay() crossed the store's configured floor
  | "contradicted"     // a newer memory of the same (subject, predicate, scope) disagreed
  | "superseded"       // an explicit, non-contradicting replacement (same value, refreshed
                        //   source — e.g. re-confirmed by a more authoritative source)
  | "scope-exited"     // the bounded context this memory lived in closed (account deleted,
                        //   session ended) — independent of confidence or age
  | "source-revoked"   // the issuing source was later revoked — reuses revocation *thinking*
                        //   from agent-trust-layer, re-derived independently (§7)
```

**A memory that never gets tombstoned has no mechanic to demo — this plan makes tombstoning mandatory, not
optional.** Concretely: `M5`'s success criteria (§11) require the failure suite to prove tombstoning
actually fires for *every* `ForgetReason` variant, not just the easy ones.

**What proof-of-forgetting means, precisely — two parts, both required:**

1. **The record.** The `Tombstone` itself: immutable, timestamped, reason-coded, and — for
   `contradicted`/`superseded` — naming exactly which memory caused it. This is the "here is the receipt"
   half.
2. **The query-time guarantee.** A "current belief" query (`BeliefQuery`, §5) over a corpus where every
   candidate memory for `(subject, predicate, scope)` is tombstoned must return `{status: "unknown", reason:
   "all-known-memories-tombstoned", tombstones: [...]}` — **never** silently fall back to the highest-
   confidence tombstoned value. This is the exact test that makes the brief's own warning falsifiable: *"a
   system that never actually forgets anything has no mechanic to demo."* The test constructs a corpus with
   zero live memories and N tombstones for the same subject, and asserts the live query path cannot
   construct a `believed`/`doubted` answer from any of them — proven directly (the tombstoned records are
   structurally a different type, `TombstonedMemory`, that the live query function's parameter type does not
   accept at all — a compile-time refusal, the same discipline as `agent-trust-layer`'s `replay()` refusing a
   `RejectedAuditRecord` at the type level, not a runtime `if`).

**Deletion is deliberately not offered as an option in this design**, even as a maintenance/GDPR path,
without a separate, explicitly-named "purge" operation kept out of the demoed mechanic entirely — the brief
asks for a system that *knows* it might be wrong, which requires it to remember *that* it forgot something.
(If real-world right-to-erasure ever required physical deletion of a tombstone's payload, that would be a
narrow, separately-logged exception — out of scope for this hackathon build, and named as a limit in `docs/`
rather than silently handled.)

---

## 5. How a memory becomes known-wrong (contradiction, mechanically)

Three independent, mechanically-triggered causes of increasing doubt — each testable in isolation:

1. **Contradiction.** Two *live* memories share `(subject, predicate)` and overlapping `scope`, but their
   `value`s disagree under a closed, typed comparison — reusing the *shape* of
   `decision-engine`'s `ValueConstraint` (equals / gte / lte / in, evaluated fail-closed: a type mismatch is
   `not-comparable`, never silently "equal" or silently "different"), but applied **between two memories**,
   not between a requirement and a signal. `contradict(older, newer)` returns one of:
   - `no-conflict` — values agree (exact-equal, or within a declared numeric tolerance for `predicate`s that
     define one).
   - `superseded` — values disagree, `newer` is strictly fresher **and** `newer.confidence` is at or above
     `older`'s confidence at the time of comparison → `older` is tombstoned (`reason: "contradicted"`,
     `supersededBy: newer.id`), `newer` becomes the live belief.
   - `disputed` — values disagree, but `newer.confidence` is *lower* than `older`'s **and** `older` is still
     inside its own freshness window → **neither wins automatically.** Both remain live, `status: "disputed"`
     on both, and `BeliefQuery` must surface a `disputed` answer naming both candidates rather than silently
     picking one. This is the deliberately non-boolean outcome — mirroring `decision-engine`'s "never a bare
     score" and `agent-trust-layer`'s "never a bare boolean" ethos: contradiction is not resolved by whichever
     side happens to run the comparison first.
   - `not-comparable` — the values are not the same comparable shape (e.g., a `predicate` whose value type
     changed) → fails closed to `disputed` as well, never silently "no conflict."

   **The `superseded`/`disputed` split is decided by comparing recorded confidence tiers fixed at creation
   time — never by a judgement call about whether the change "feels like" a real update.** `Provenance`
   (§6) fixes a base-confidence tier per source kind and directness: a direct, first-person, current-state
   avowal from a `human` source is assigned the same tier regardless of when it's given; a `derived`
   inference (parsed from unstructured text, computed from other memories) is assigned a lower tier. Because
   the tier is fixed by the source kind at the moment a memory is created, "is the newer memory's confidence
   at or above the older one's" is a plain numeric comparison decided once, not argued about later.
   **Worked contrast:** "My shipping address is 42 Elm Street" and, months later, "I moved — my new address
   is 118 Birch Avenue" are both direct `human` avowals of current state, same tier, so the newer one's
   recorded confidence is not lower than the older one's → mechanically `superseded`. Contrast a `derived`
   source (an address auto-parsed from a shipping-label OCR scan) contradicted six weeks later by a
   *different*, also-`derived` OCR scan at the same low tier: neither clears the other decisively, and if
   the older is still inside its freshness window, the same rule mechanically produces `disputed` — both
   stay live, and a query must surface both rather than silently trusting whichever scan ran more recently.

2. **Freshness decay.** `decay(memory, now)` recomputes `confidence` via the memory's own `decayPolicy` — a
   declared, typed function (e.g., linear-to-floor over a configured half-life), never an ad hoc `if age >
   X`. Confidence crossing a configured `doubted` threshold flips `status` to `"doubted"` without any
   contradiction being involved at all — the memory is still the only candidate, still technically "held,"
   but the system now says so with visibly lower confidence and a `reason: "age-exceeded"` available to a
   caller who asks why. Crossing a second, lower `forget` floor triggers `forget(memory, "age-exceeded", now)`
   — tombstoned, not merely doubted, once confidence bottoms out.

3. **Source revocation.** Reusing *the thinking*, not the code, from `agent-trust-layer`'s revocation-as-a-
   typed-check: a memory's `source` carries a `revocable: boolean` and, if so, a way to check current
   revocation status. When a source is revoked, every live memory it produced is immediately
   `forget(..., "source-revoked", now)`'d **regardless of freshness** — age and confidence cannot buy back
   a revoked source, the same asymmetry `agent-trust-layer`'s policy layer enforces between authority and
   history claims. As with contradiction and decay, this never rewrites the memory's own recorded
   `confidence` — it tombstones the memory, and tombstoning is what drives `effectiveConfidence` to `0`
   (see §3).

**Contradiction detection is never judged by a model.** Every branch above is a total, typed function over
`(subject, predicate, scope, value, confidence, freshness)` — no LLM call sits anywhere in `lib/contradiction/**`
or `lib/decay/**`, enforced the same way `shadow-run` enforces it for `lib/simulate/**`: a grep-based
architecture test asserting zero LLM-client/network imports under those paths.

---

## 6. The irreducible types

Four, matching the brief's own field list almost exactly once made concrete:

1. **`Memory<TValue>`** (§3) — the belief record: subject, predicate, value, source, confidence, freshness
   timestamps, decay policy, scope, status. Immutable once created.
2. **`ForgetReason`** (§4) — the closed enum naming *why* something stopped being believed. Never free text;
   every tombstone must carry exactly one.
3. **`Tombstone`** (§4) — the forgetting record. Immutable, append-only, the thing that makes "prove you
   forgot" answerable.
4. **`BeliefAnswer`** — the read-time contract, the type that makes §2's structural argument real:
   ```
   BeliefAnswer<TValue> =
     | { status: "believed";  memory: Memory<TValue>; confidence: Confidence }
     | { status: "doubted";   memory: Memory<TValue>; confidence: Confidence; reason: "age-exceeded" }
     | { status: "disputed";  candidates: readonly [Memory<TValue>, Memory<TValue>] }
     | { status: "unknown";   reason: "no-memory" | "all-known-memories-tombstoned";
         tombstones: readonly Tombstone[] }
   ```
   Exhaustively matched everywhere it's consumed (an `assertNeverBeliefAnswer` helper, same convention as
   `shadow-run`'s `assertNeverReconciliation`) — a fifth variant added later must fail to compile until every
   consumer handles it.

`Provenance` (source kind: counterparty / system / human / derived, plus `revocable`) is a supporting type
reused *conceptually* from `decision-engine`, re-derived here rather than imported — see §7.

---

## 7. `Signal` vs. `Memory` — what genuinely applies, what would be cargo-culting

**Genuinely applies (re-derive, don't import):**

- The closed `Provenance` vocabulary and the trust-boundary discipline around it (never trust a raw string
  for "where did this come from").
- The fail-closed comparison discipline from `ValueConstraint` — type mismatch is its own outcome, never
  silently true or false.
- `CapturedAt`/`Age`/clock-inconsistency handling — a signal (or memory) whose own timestamp is in the future
  relative to `now` must never be treated as fresh just because it happens to compare true today.
- "Never a bare score/boolean" — `BeliefAnswer` and `ContradictionCheck` both name the deciding fact,
  not just a verdict.

**Would be cargo-culting if copied wholesale:**

- **`Signal.read(maxAge, now)`'s statelessness.** A `Signal` is deliberately ephemeral — evaluated fresh at
  one decision's call time, carrying no memory of prior reads, no lifecycle. A `Memory` is the opposite on
  purpose: it *persists* across many reads, and its `status` transition (believed → doubted/disputed →
  tombstoned) is the entire point of this brief. Reusing `Signal`'s pure-per-call shape for `Memory` would
  throw away the one thing that makes "explicit forgetting" possible to build at all — there would be
  nothing to hold a `status` between calls.
- **`Gap`.** `Gap` answers "is there usable evidence for *this one decision*" — a narrower, decision-scoped
  question. Repackaging `BeliefAnswer.unknown` as a `Gap` would conflate "we never had this" with "we used to
  believe this and explicitly revoked it," which is precisely the distinction the forgetting policy exists to
  keep separate. `unknown` in this system always carries a reason and, where relevant, the tombstones that
  produced it — a `Gap` carries neither, by design, because it was never meant to.
- **`requiredConfidence(reversibility, cost)`.** That function sizes the evidence bar for *one prospective
  action*. There is no analogous "action" here — this project is a store of beliefs, not a decision-maker
  that consumes them. If a downstream consumer wanted to feed `memory-ledger` beliefs into a
  `decision-engine`-style decision, that integration is explicitly out of scope for this build (and would be
  its own, later project) — building it in now would be exactly the "speculative flexibility nobody asked
  for" the house rules warn against.

---

## 8. The one demo moment

> *Tell the assistant your shipping address. Months later, tell it you moved, phrased completely differently.
> Ask it a third time using the same words you used the first time: it answers with the new address, reports
> that the old one is no longer surfaced as belief (its `effectiveConfidence` is `0` — the recorded history
> is untouched, only its status changed), and — asked to prove it forgot — produces the tombstone naming
> the exact memory that superseded it. A fair, minimal similarity-ranking baseline, given the same two
> facts, keeps both forever and returns the address whose wording is closer to how you phrased the
> question — which, because you asked in the old phrasing, is the stale one.*

**This is the `superseded` case from §5.1, not `disputed`** — both statements are direct, first-person
`human` avowals of current state, same confidence tier, and the newer one's recorded confidence is not
below the older one's, so §5's mechanical rule resolves it to `superseded` on its own, without any special-
casing for "address" as a predicate.

**The baseline must be fair, not rigged — this is the part that needed rethinking, and it changed the
scenario.** The original draft of this scenario described the comparison baseline as "rigged" to return the
stale address, which is a strawman: a contrast that only works because the loser was configured to lose
proves nothing about retrieval, and reads to a judge as beating a system this project itself sabotaged. The
fix is to make the baseline a **fair, minimal, checkable implementation of similarity ranking**, and to
choose a query where a fair ranker fails *on its own merits*:

- **What the baseline computes, precisely, so a reader can check it's fair:** bag-of-words term-frequency
  vectors over lowercased, punctuation-stripped tokens for the query and for each stored statement, ranked
  by cosine similarity, returning the address associated with the highest-scoring statement. No stopword
  tuning, no field weighting, no synonym table, no recency signal of any kind — exactly the mechanism the
  brief disqualifies (similarity ranking with no notion of currency), implemented as plainly as that
  mechanism can be implemented. Anyone can re-run the same 20 lines of code and get the same ranking.
- **Why it's deterministic, not a real embedding call:** a real embedding model would be this repo's first
  network and model dependency, would break the client-side-only demo pattern the siblings established
  (`shadow-run`'s whole pipeline runs client-side with no network state — see `docs/WALKTHROUGH.md`), and
  would make the on-screen ranking non-deterministic in front of a judge — a single re-run could rank
  differently. A bag-of-words/cosine stand-in has none of those three problems, and — because its scoring
  is fully specified above — its fairness is inspectable rather than asserted. This resolves this plan's own
  earlier open question about embeddings vs. a stand-in.
- **The query that makes a fair ranker fail for real, not by construction:** the user's *first* statement is
  phrased "My **shipping address** is 42 Elm Street, Portland." The correction, months later, is phrased
  "I moved — my new address is 118 Birch Avenue, Seattle." The demo asks the natural follow-up question a
  real user would ask, reusing their own earlier phrase: "What's my **shipping address**?" The token
  `"shipping"` appears in the query and in the *old* statement only — the correction never uses that word.
  Under plain bag-of-words cosine similarity, the old statement scores higher purely because it echoes the
  query's own wording back, and this is a real, reproducible, well-documented property of similarity
  retrieval (queries that reuse a source document's vocabulary rank that document higher), not a property
  tuned into this specific example. **If this project ever cannot reproduce that ranking with the baseline
  exactly as specified above, that is a finding to report, not a scenario to keep forcing** — it would mean
  this demo's premise needs rethinking before M7, not a rephrasing of the query until something wins.
- **What this does and doesn't claim:** a more sophisticated retrieval stack (real embeddings, a reranker,
  recency-boosted scoring) might get this *particular* query right — that is a separate claim from the
  brief's actual target, which is that similarity ranking has no structural mechanism for "this was
  superseded," only ever a mechanism for "this reads similar to what you asked." A recency-boosted RAG
  variant is RAG with an extra field, exactly the pattern the brief disqualifies — bolting a timestamp bias
  onto ranking doesn't give the system a `Tombstone` it can produce on request, or a query outcome that can
  honestly say `unknown`.

One screen: the fair baseline's real ranking failure, and this system's tombstone, side by side, from the
same two input facts.

---

## 9. Domain — committed

**Personal AI assistant / long-term memory. Settled, not left open** — a swap after M6 would touch a frozen
milestone, so this is fixed now rather than revisited later. The other two candidates are named below only
to record why they were considered and what they'd have stressed differently; they are not built.

1. **Personal AI assistant / long-term memory — the domain this plan builds.** "What do
   you remember about me, and did anything make that wrong." Stresses **forgetting-as-proof** hardest — the
   GDPR-shaped "prove you forgot my old address" ask is immediately legible to a judge with no domain
   context needed, and cleanly demonstrates all three doubt-mechanisms (contradiction on re-stated
   preferences, decay on stale small-talk facts, revocation if a linked account is disconnected) inside one
   coherent, sympathetic narrative. It's also the domain furthest in *feel* from the other three siblings
   (enterprise ops/negotiation/inventory), which matters given all eight hackathon projects share a rubric
   and a judging pass across all of them.
2. **CRM / customer-support memory.** "What do we know about this account." Stresses **contradiction** and
   **scope** hardest — a customer restates something differently to two different support reps, and a
   contact leaving a company is a clean `scope-exited` case distinct from either decay or contradiction.
   Good second choice if the personal-assistant framing reads as too consumer-facing for the hackathon's
   audience.
3. **Threat-intel / fraud-signal memory.** "Is this indicator still bad." Stresses **revocation** and
   **decay** hardest — a blocklist retracting an entry is a clean `source-revoked` case, and an indicator
   unseen for 180 days decaying out of `believed` without any contradiction at all is the purest possible
   demonstration of freshness-only doubt. Best choice if the judging panel is more security/infra-literate
   than consumer-product-literate.

Domain (1) is committed for the reasons already argued: most demoable in 90 seconds, requires no invented
domain jargon, and its failure mode (stale personal data surviving in an AI's memory) is a live, real
concern a judge does not need briefing on. The README (M9) will state plainly that (2) and (3) were
considered and not built, rather than implying breadth that doesn't exist.

---

## 10. The deliberate failure this project should pin

**Not** a fuzzy "sometimes contradictions are missed" — a specific, mechanical race, the same species of bug
`shadow-run` pins with its TOCTOU case and `decision-engine` pins with its ordering proofs:

> **A same-tick race between a superseding memory arriving and a query being answered.** If contradiction
> detection and query-answering are allowed to run against different snapshots of the store — e.g., a query
> reads the store, a contradicting memory is `affirm`ed concurrently, contradiction detection hasn't run yet
> — the query must not be able to return a `believed` answer built from a memory that has *already* been
> superseded in the same processing batch, on a technicality of ordering.

The failure suite (M7) proves this two ways: (a) a test that deliberately interleaves an `affirm` call
between a query's read of candidates and its confidence computation, asserting the query result is either
`disputed` or reflects the new memory — never a `believed` answer built from data already known stale at
the moment the answer is constructed; (b) the fail-closed default — if the store cannot establish which of
two racing writes happened first (a clock-inconsistent `capturedAt`, same as `decision-engine`'s
clock-inconsistency handling), the query must resolve to `disputed`, never to whichever write happened to
commit first. This is the exact case the brief's "reuses freshness and revocation thinking" line points at:
freshness/ordering discipline lifted conceptually from `decision-engine`, applied to a problem
`decision-engine` never had to solve (it evaluates one decision at one moment; this store must stay correct
under concurrent belief revision).

---

## 11. Milestones M1–M9

House rules applied throughout: TypeScript strict under NodeNext; Next.js + React on Vercel; vitest;
`next build --webpack` + `experimental.extensionAlias` (Turbopack cannot resolve NodeNext `.js`-suffixed
imports); `npm ci` only, never `npm install`; Node v24.7.0; every value is data, never a closure; canonical
form over a flexible parser; no speculative flexibility; every claim traceable to a test; guards fail
closed.

### M1 — Contracts: `Memory`, `ForgetReason`, `Tombstone`, `BeliefAnswer`
- **Outcome:** The four irreducible types (§6), plus `Provenance` and `Scope`, independently authored (not
  imported from `decision-engine`). Nothing here decays, contradicts, or forgets anything for real.
- **Phase:** BUILD
- **Files / freeze boundary:** `lib/contracts/**`. Frozen after this milestone.
- **Demo command:** `npm test -- contracts`
- **Success criteria:**
  - `@ts-expect-error` proofs that a `Memory` literal missing `scope`, or a `Tombstone` missing `reason`,
    does not compile.
  - `BeliefAnswer` exhaustively matched via `assertNeverBeliefAnswer`; a test proves a fifth variant fails to
    compile until every consumer handles it.
  - `Memory.value` must be plain, serializable data — no functions — enforced at the type level as far as
    TypeScript allows, and at runtime against a cast that defeats the type system.
  - A test constructing two `Memory` values that differ only in `id` proves equality is never structural —
    `id` is load-bearing, matching the "immutable, append-only" design decision in §3.
- **Loops:** L1, L4
- **Token budget:** 150000

### M2 — Deploy a live skeleton to Vercel
- **Outcome:** Minimal Next.js app, health endpoint, real public URL. Second milestone, deliberately —
  matches the standing note that a live URL left to the end is how it fails to happen.
- **Phase:** DEPLOY
- **Files:** `app/api/health/**`, `vercel.json`, `next.config.*`, `package.json`
- **Demo command:** `curl -sf $DEPLOY_URL/api/health`
- **Success criteria:** HTTP 200, JSON body naming the deployed commit SHA; `next build --webpack` +
  `experimental.extensionAlias` configured. **Needs a Vercel account.**
- **Loops:** L1, L4
- **Token budget:** 150000

### M3 — The decay engine
- **Outcome:** `decay(memory, now)` and the typed `DecayPolicy` (§5, cause 2) — confidence degrading toward
  a `doubted` threshold and then a `forget` floor, as a pure, declared function, never an ad hoc comparison.
- **Phase:** BUILD
- **Files:** `lib/decay/**`. Frozen after this milestone.
- **Demo command:** `npm test -- decay`
- **Success criteria:** `decay()` is proven pure (identical input → deep-equal output, repeat calls); a
  threshold-flip test proves confidence at age N-1 stays `believed` and at age N flips to `doubted`, and a
  second, lower floor flips to a forgettable state — no EMA, no smoothing that would hide the exact
  boundary; a clock-inconsistent `now` (before `believedAt`) fails closed to "cannot compute, treat as most
  doubted," never to a fabricated `confidence: 1`.
- **Loops:** L1, L4
- **Token budget:** 150000

### M4 — The contradiction engine
- **Outcome:** `contradict(older, newer)` (§5, cause 1) — the four-outcome `ContradictionCheck`
  (`no-conflict` / `superseded` / `disputed` / `not-comparable`), built on a locally-authored, closed,
  typed value-comparison vocabulary (equals / gte / lte / in / within-tolerance).
- **Phase:** BUILD
- **Files:** `lib/contradiction/**`. Frozen after this milestone.
- **Demo command:** `npm test -- contradiction`
- **Success criteria:** a same-value comparison is always `no-conflict` regardless of source/confidence; two
  same-tier `human` avowals with disagreeing values resolve to `superseded` (naming both ids), proving §5.1's
  worked contrast in code; two same-tier `derived` inferences with disagreeing values, both still fresh,
  resolve to `disputed`, never an automatic winner, proving the other half of that same contrast;
  a type-mismatched comparison (string vs. number) fails closed to `not-comparable`, never throws and never
  silently resolves either way; a grep-based architecture test asserts zero LLM-client/network imports
  anywhere under `lib/contradiction/**`.
- **Loops:** L1, L4
- **Token budget:** 150000

### M5 — The forgetting engine (tombstoning)
- **Outcome:** `forget(memory, reason, now)`, the `TombstonedMemory` type distinct from `Memory`, and
  `BeliefQuery` — the read path that structurally cannot construct a `believed`/`doubted` answer from a
  tombstoned record.
- **Phase:** BUILD
- **Files:** `lib/store/**`. Frozen after this milestone.
- **Demo command:** `npm test -- store`
- **Success criteria:** every `ForgetReason` variant is proven to actually tombstone something (five
  passing tests, one per reason — not asserted, run); a query over a corpus with only tombstoned candidates
  for a subject returns `{status: "unknown", reason: "all-known-memories-tombstoned", tombstones: [...]}`,
  proven directly, never inferred from absence of a crash; a `@ts-expect-error` proof that the live-query
  function's parameter type refuses a `TombstonedMemory` at compile time, mirroring
  `agent-trust-layer`'s `replay()`/`RejectedAuditRecord` refusal.
- **Loops:** L1, L4
- **Token budget:** 150000

### M6 — Domain: the personal-assistant memory adapter
- **Outcome:** The committed domain from §9 wired end-to-end: natural-language-ish facts in
  (already parsed to typed `Memory` candidates — no LLM inside `lib/`, see §5's grep guard), `affirm` /
  `contradict` / `decay` / `forget` driving a running scenario, `BeliefQuery` answering.
- **Phase:** INTEGRATE
- **Files:** `domains/personal-assistant/**`, `scripts/demo-memory.ts`. Frozen after this milestone.
- **Demo command:** `npm run demo:memory`
- **Success criteria:** the script runs the §8 address scenario end-to-end and prints, per step, the memory
  written, its confidence, and the eventual tombstone; all four `BeliefAnswer` variants (`believed`,
  `doubted`, `disputed`, `unknown`) each appear at least once across the run.
- **Loops:** L1, L4
- **Token budget:** 150000

### M7 — The failure suite (the one deliberate-failure milestone)
- **Outcome:** The §10 same-tick race, plus the required shared-deliverable deliberate-failure test.
- **Phase:** VERIFY
- **Files:** `tests/failures/**`. Frozen after this milestone.
- **Demo command:** `npm test -- failures`
- **Success criteria:** (1) an interleaved `affirm`-during-query test proves the query never returns
  `believed` from data already superseded within the same batch; (2) a clock-inconsistent race (both writes
  claim the same `capturedAt`, or one is in the future relative to `now`) proves the store fails closed to
  `disputed`, never to whichever write happened to commit first; (3) a revoked-source test proves
  `source-revoked` tombstoning happens even for a memory that is otherwise still fresh and high-confidence —
  revocation buys nothing back; (4) the fair bag-of-words/cosine baseline from §8, run as an actual test with
  its scoring exactly as specified there (no tuning to lose): given the two address memories and the query
  "What's my shipping address?", the baseline is asserted to rank the *old* statement higher (it alone
  shares the token "shipping" with the query), while `BeliefQuery` is asserted to return the current address
  — the contrast is a passing test against the real, unmodified baseline implementation, not demo narration.
  If this assertion cannot be made to pass without changing the baseline's scoring, that is logged as a
  finding requiring the §8 scenario to be revisited, not worked around.
- **Loops:** L1, L4
- **Token budget:** 150000

### M8 — The interactive demo
- **Outcome:** The §8 scenario, live: enter the first address, enter the change months-later-phrased-
  differently, ask "What's my shipping address?", see the old memory's `effectiveConfidence` at `0` and its
  tombstone, see the fair baseline (§8) rank the old address higher on the same two facts and the same
  query.
- **Phase:** BUILD
- **Files:** `app/**`, `components/**`. Frozen after this milestone.
- **Demo command:** the deployed URL runs the §8 scenario end-to-end from input, driving the real engine.
- **Success criteria:** on the deployed URL, the tombstone record (reason, timestamp, superseding memory
  id) is rendered on screen, not merely logged; the fair baseline's real ranking and this system's answer
  are shown side by side from the same two input facts and the same query, with the baseline's scoring
  visible (the two cosine-similarity numbers, not just its final pick) so a viewer can check it wasn't
  tuned; a stranger with no narration can see which one is right and why. **Needs a Vercel account** (reuses
  M2's deployment).
- **Loops:** L1, L4
- **Token budget:** 150000

### M9 — Deliverables
- **Outcome:** Architecture snapshot (contracts → decay → contradiction → forgetting → domain, each stage's
  "what does it refuse, and why," matching the sibling docs' structure), the ≤300-word two-year thesis, and
  a verified clean-clone run.
- **Phase:** RELEASE
- **Files:** `docs/**`, `README.md`. Frozen after this milestone.
- **Demo command:** `cd "$(mktemp -d)" && git clone https://github.com/<account>/memory-ledger . && npm ci && npm run typecheck && npm test`
- **Success criteria:** fresh clone, install, typecheck, and full test run all pass with zero credentials
  configured; the architecture doc and thesis are checked against actual code/test output before being
  committed, not asserted uncritically — same "don't restate limits more strongly than they're true"
  discipline already standing on this account; the README states plainly which parts of §9's other two
  domains were *not* built, rather than implying breadth that doesn't exist.
- **Loops:** L1, L4
- **Token budget:** 150000

---

## 12. Decisions settled in this revision

- **Repo name:** `memory-ledger`, fixed — no longer a placeholder.
- **Domain:** personal-assistant memory, committed in §9 — not left open for a later swap.
- **Baseline implementation:** a deterministic bag-of-words/cosine-similarity stand-in, not a real embedding
  call — reasoning and exact scoring spelled out in §8, chosen specifically because a real embedding call
  would add this repo's first network/model dependency, break the client-side-only demo pattern, and make
  the on-screen ranking non-deterministic.
- **`superseded` vs. `disputed`:** decided mechanically by comparing recorded confidence tiers fixed by
  `Provenance` at creation time (§5.1), never by a post-hoc judgement call — and the §8 address scenario is
  now explicitly identified as the `superseded` case this rule produces, not asserted to behave a way the
  engine doesn't support.
- **The demo baseline is fair, not rigged:** §8 now specifies the baseline's exact scoring and a query
  ("What's my shipping address?") that a fair ranker fails on its own merits, because the query happens to
  reuse the stale statement's own vocabulary — a real, checkable property of similarity retrieval, not a
  configured loss.
- **No signing.** The tombstone is an immutable, reason-coded, append-only record — sufficient proof on its
  own. "Signed" was dropped from §8: cryptographic signing (`did:key`/Ed25519/verifiable credentials) is
  `agent-trust-layer`'s conceptual core, and this project has no counterparty-verification problem that
  would justify importing it.

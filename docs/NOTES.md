# Process notes

Reconstructed from primary sources only — `git log`, `gh pr list --state all`, `gh pr view N --json
number,title,headRefName,createdAt,mergedAt,body,comments,reviews`, and the six ADRs under
`.genesis/decisions/` — not from any prior summary, including whatever accompanied this milestone's own
assignment. Where a figure below is a test count or a date, it is either the literal number a cited PR body
reports, or a number this session produced itself by running the command named next to it; the two are not
silently merged into one running tally, because reconciling several self-reported deltas after the fact is
exactly the kind of arithmetic that produces a stale count in one place and a corrected one in another. `git
show HEAD:` and `git log --all` were the sources of record for this document's own claims about the
repository's own commit graph.

**A note on this revision, and the one before it.** The first version of this document built its timeline from
`createdAt` mislabeled as "Merged (UTC)," which put several PRs in the wrong relative order and made at least
one causal claim backwards. The fix for that round introduced two new defects of its own, both now corrected
again, in this revision, against commands run fresh for this pass specifically: a citation of two commit
hashes as evidence for why PR #15 merged before PR #14, which — checked again just now with `git fetch
--prune origin` and `gh api repos/vladimir-mawla/memory-ledger/branches/m7-failures` (`404 Branch not
found`) — describe history on a branch since deleted from the remote and are no longer independently
checkable from this repository, so the citation is withdrawn rather than repeated; and a comment-count claim
("sixteen of seventeen") that was arithmetic backed into from "everything except #13," not an actual count —
the real split, counted just now with `gh pr view N --json comments` run against all 17 PRs individually, is
three PRs with zero comments, thirteen with exactly one (the Vercel bot), and one (#13) with two. Every date,
count, and ordering claim below has been re-derived against a command run in this session, for this revision —
not carried forward from either earlier pass.

**A methodological note on "independent verification," stated plainly rather than implied.** Every PR in
this history was authored and merged from the same GitHub account (`vladimir-mawla`); `gh pr view N --json
reviews` returns zero formal review objects for every one of the 17 PRs, checked directly for all of them,
not a sample. The "independent (L4) verification" this project's own PR bodies and ADRs describe — attacking
a milestone's claims by reversing arguments, injecting offending code, removing `@ts-expect-error` directives,
hand-recomputing numbers — is *almost always* narrated inside the *next* PR's own body (typically a
`mark-MN-done` PR), never as a separately-attributed GitHub review or approval. **PR #13 is the one exception,
and it matters enough to have its own bullet below rather than being smoothed into "always the next PR":** it
carries a real, substantive, non-bot *comment*, posted by the same account before the PR merged, narrating a
revision made in response to "reviewer feedback." This document reports what PR bodies and this one comment
claim about that process; it cannot independently confirm that a different actor, human or otherwise, ever
reviewed anything — only that the repository's own record consistently describes a verification or feedback
pass happening before each `mark-*-done` merge, and, once, inside the PR it revised.

## Timeline, by real merge time (`gh pr list --json number,title,headRefName,createdAt,mergedAt`, sorted on
`mergedAt` — not `createdAt`, and not PR number)

| # | Merged (UTC) | Branch | What it did |
|---|---|---|---|
| #1 | 2026-09-20 17:20:27 | `m1-contracts` | M1 build: the four irreducible types, independently authored |
| #2 | 2026-09-20 17:31:59 | `mark-m1-done` | M1 marked done after independent verification — 14 files / 99 tests |
| #3 | 2026-09-21 17:30:13 | `m2-deploy` | M2 build: health endpoint, milestone-drift guard — 15 files / 124 tests |
| #4 | 2026-09-21 21:42:36 | `mark-m2-done` | M2 marked done — real `curl` against the deployed URL, not the code alone |
| #5 | 2026-09-21 21:57:53 | `m3-decay` | M3 build: the decay engine — 18 files / 201 tests |
| #7 | 2026-09-21 22:02:45 | `fix-post-m3-stale-comments` | M3 marked done; two findings closed: a degenerate policy, a stale comment |
| #6 | 2026-09-21 22:04:19 | `m4-contradiction` | M4 build (first pass rejected and reworked pre-merge — see below) |
| #8 | 2026-09-21 22:26:39 | `mark-m4-done` | M4 marked done — 24 files / 316 tests |
| #9 | 2026-09-21 22:42:39 | `m5-store` | M5 build: `forget()` + `queryBelief()` — 28 files / 395 tests |
| #10 | 2026-09-21 23:14:02 | `mark-m5-done` | M5 marked done, **after one rejection over an uncommitted ADR** (below) |
| #11 | 2026-09-21 23:25:57 | `m6-domain` | M6 build: personal-assistant domain — 34 files / 430 tests |
| #12 | 2026-09-21 23:40:38 | `mark-m6-done` | M6 marked done; adds the tier-rank-agreement guard — 35 files / 434 tests |
| #13 | 2026-09-21 23:56:43 | `m8-demo` | M8 build: the interactive demo — 35 files / 434 tests; revised via a same-PR comment (below) |
| #15 | 2026-09-22 00:03:35 | `fix-guard-vacuity` | Closes a vacuity hole in PR #12's own tier-rank-agreement guard |
| #14 | 2026-09-22 00:18:44 | `m7-failures` | M7 build: ten failure cases — 45 files / 467 tests |
| #16 | 2026-09-22 00:18:49 | `mark-m8-done` | M8 marked done — driven by hand against the deployed URL |
| #17 | 2026-09-22 00:20:32 | `mark-m7-done` | M7 marked done — 45 files / 470 tests |

**Two real orderings only `mergedAt` reveals, both worth naming rather than smoothing over.**

**M3 was marked done (#7, 22:02:45) before M4's build (#6, 22:04:19) finished merging — 94 seconds apart.**
This is not a contradiction: M4's own ADR (`.genesis/decisions/0003-contradiction.md`, Finding 2) is explicit
that `lib/contradiction/**` depends only on `lib/contracts/**` (frozen at M1) and must not import
`lib/decay/**` at all, so M4's build never needed M3 to be "done" — only for `lib/contracts` to stay frozen,
which it already was. The two branches were simply in flight at the same time, and #7 happened to land first
by a little over a minute.

**M8 was built, merged, and marked done before M7 was marked done — but not in the shape "M8 finished, then
M7 happened," and the order among the last five merges is its own small story.** By real `mergedAt`: M8's
build (#13, 23:56:43) merged first; then a guard fix unrelated to M8 (#15, `fix-guard-vacuity`, 00:03:35);
then M7's own build (#14, 00:18:44); then M8 marked done (#16), five seconds later at 00:18:49; then M7 marked
done (#17) last, at 00:20:32.

**On *why* `#15` merged before `#14`, stated at the strength the evidence actually supports, not more.** The
two PRs' file scopes do not overlap — checked directly, just now: `gh pr diff 14 --name-only` touches twelve
files — eleven under `tests/failures/**` plus its ADR, `.genesis/decisions/0006-failure-suite.md`; `gh pr diff
15 --name-only` touches exactly one file, `domains/personal-assistant/__tests__/tier-rank-agreement.test.ts`.
So
`#15`'s fix could not have been carried inside `#14`'s own PR even if the intent was to bundle them — it lives
outside the one directory `m7-failures` was scoped to touch. **That is the complete evidence this document can
actually stand behind.** An earlier revision of this section additionally claimed `git log --oneline --merges`
showed two specific merge commits (cited by short hash) recording `m7-failures` catching up to a `main` that
had moved while it was open, as the mechanism connecting the two PRs. Checked again, freshly, for this
revision: `git fetch --prune origin` shows `origin/m7-failures` (along with several other now-merged branches)
has since been deleted from the remote, and `gh api repos/vladimir-mawla/memory-ledger/branches/m7-failures`
returns `404 Branch not found`. The two commits in question were real objects in this session's own local
clone at the time — reachable then, because a stale local tracking ref for the now-deleted branch was still
present — but they described history on a branch this repository no longer exposes, which makes citing them
here worse than not citing them: a reader checking this document against the live repository, the way this
document asks every other claim to be checked, would find nothing. **Withdrawn.** What actually caused `#15`
to land first — a deliberate sequencing choice, a merge-conflict resolution order, or simple happenstance in
which PR a human or agent clicked "merge" on first — is not recoverable from the repository as it stands today,
and this document says so rather than reconstructing a plausible mechanism from history that has been deleted.

So: M7 precedes M8 in the plan's own milestone numbering (a dependency order reasoned about in advance — M7
needs `domains/**` frozen, which M6 provides, and does not itself depend on M8); in real merge order, M8's
build predates every M7-labeled merge in this cluster, M8 was marked done (`#16`) five seconds *after* M7's own
build (`#14`) merged, and M7 was not marked done until after M8 was. Nothing in `DONE.html`/`app/milestones.ts` claims an order
beyond milestone identity — but a reader going by PR *number* alone (`#14` before `#15`, `#16` before `#17`)
would get both of these orderings backwards.

Every PR's own stated file/test counts above are quoted from that PR's own body, not recomputed — see the
methodological note above for why. The one number this session independently reproduced by running the
command is the final state: **`npm test` on this worktree (`m9-deliverables`, cut from `main` at `b0ad336`)
prints `Test Files 45 passed (45)` / `Tests 470 passed (470)`**, matching PR #17's own final figure.

## What was rejected, and what was merely revised

Two real distinctions matter here, and this project's own PR bodies are careful about which is which:

- **Rejected and reworked (M4, first pass, before PR #6 landed on `main`):** the `superseded`/`disputed`
  split was implemented by comparing recorded `Memory.confidence` directly, where the plan's own success
  criteria specify a comparison of `Provenance.tier`. Two `direct-avowal` memories at confidence `0.9` and
  `0.1` returned `disputed`; the plan's own worked contrast requires `superseded`. Its own tests had passed
  only because the fixtures assigned confidence consistently with tier — an accident, not a proof. PR #8's own
  words: *"a well-tested, convincingly-argued mechanism that did not match the spec."* Reworked onto
  `resolveTierSplit(older.tier, newer.tier)`; `Memory.confidence` plays no role in that decision from that
  point forward. Recorded as a revision, not silently corrected, in `.genesis/decisions/0003-contradiction.md`,
  Decision 6.
- **Rejected over the record, not the code (M5, PR #9 → #10):** every functional claim in PR #9 survived
  direct attack (removing `@ts-expect-error` guards, reconstructing the §8 corpus independently, showing
  ADR 0003's own left-open precondition was unsound by counterexample). What failed was that the ADR revision
  documenting the `"superseded"`-vs-`"disputed"` fix existed **only in an uncommitted working tree** — the
  version actually committed in the PR still described the pre-fix design, while the PR body claimed it
  recorded the correction. PR #10's own diagnosis: *"a claim made about work rather than from it."* This is
  the exact failure category this milestone (M9) was warned about by name — a document making a claim its own
  repository state did not support at the moment the claim was made.
- **Not a rejection, a within-milestone escalation (M3):** the build's first pass recommended wiring `decay()`
  directly into `lib/contracts/effective-confidence.ts`, exactly as M1's own ADR had instructed — and this
  would have created a real circular import (`lib/decay` already imports `lib/contracts`). Escalated rather
  than applied unilaterally; the ruling kept `effectiveConfidence` byte-identical and introduced
  `queryConfidence` (`lib/decay/`) as the composed answer at the layer that can see both. `.genesis/decisions/
  0002-decay.md`, Decision 5.
- **Not a rejection, a post-approval falsification pass (M7, PR #14 → #17):** M7 was approved, then — per
  PR #17's own account — independently attacked with reversal, boundary probes, `@ts-expect-error` removal,
  and source injection. Two real findings came out of that pass: an ADR sentence crediting Case 8 with test
  coverage it did not have (Case 8 is same-tier only; the cross-tier ordering it was credited with covering is
  actually pinned, and predates M7, in `lib/contradiction/__tests__/contradict.test.ts`), and a destructuring
  gap in Case 10's absence scan (`const { status } = memory` walked straight through the original `\.status`-
  anchored pattern). Both are corrected in `.genesis/decisions/0006-failure-suite.md` itself, in place, not
  only noted in this document.
- **Found in connection with M7's build, shipped as its own PR because the fix lived outside M7's own freeze
  boundary (PR #15, `fix-guard-vacuity`, merged *before* `m7-failures` itself — see the timeline note above
  for exactly what evidence this document can and cannot stand behind for *why*):** chasing the Case 8
  overclaim above found a real hole in a guard added one milestone earlier, at M6 — PR #12's
  `tier-rank-agreement.test.ts`. Its two original assertions were both implications ("if the domain says X,
  then `lib/contradiction` says Y"), which a domain table reporting `false` for every input would satisfy
  vacuously. The fix touches `domains/personal-assistant/__tests__/tier-rank-agreement.test.ts` — confirmed
  just now with `gh pr diff 15 --name-only`, which lists that one file only — a path `gh pr diff 14
  --name-only` confirms `m7-failures` (scoped to `.genesis/decisions/0006-failure-suite.md` and
  `tests/failures/**`) never touches. It shipped as a separate PR straight against `main`, adding two positive
  assertions plus a direct falsifiability check (inverting the domain's own answer and confirming the guard
  then fails). PR #15's own line: *"A guard that cannot fail is not a guard."*
- **Revised inside its own PR, visible as a comment rather than a rewritten body (M8, PR #13) — the one real
  exception to "verification lives in the next PR," and worth reading for what it actually records, not just
  that it exists.** On 2026-09-21T23:47:47Z, nine minutes before PR #13 merged, the same account posted a
  comment opening *"Addressed reviewer feedback: added a control that lets a viewer reach `disputed`, not
  just `superseded`."* It describes a real, checked design change: a toggle on the demo's second message
  ("You told it directly" / "It was inferred") that swaps exactly one field of the real `FactInput`
  (`humanAvowal()` → `derivedInference()`), with `resolveTierSplit()` — untouched — deciding the rest; a
  worked example (0.9 vs. 0.6 confidence, matching `scripts/demo-memory.ts`'s own corpus) producing a real
  `"disputed"` answer with neither candidate tombstoned; `AnswerPanel` disclosing ADR 0004 Decision 2a's real
  limit (`disputed` and not-comparable are indistinguishable in general, though unreachable from this demo's
  own construction); and a genuine overclaim fixed in the same pass — step 2's copy previously read "no
  contradiction was detected" whenever nothing was tombstoned yet, which is false on the disputed path, where
  a real contradiction exists and simply resolves lazily at query time. This is the one place in this
  repository's history where a feedback-driven revision is recorded as a comment distinct from the PR body it
  revised, rather than folded silently into a rewritten body or deferred to the next `mark-*-done` PR — which
  is itself evidence about how this project actually worked, not only about what `DemoAssistant.tsx` renders.

## The `Co-Authored-By` trailer, and why it is not read as evidence here

Every commit in this history ends with a `Co-Authored-By: Claude <...>` line. **This is a fixed string the
harness that runs these BUILD/VERIFY loops writes on every commit it produces, regardless of which model
actually did the work for that commit** — `.genesis/checkpoints/CURRENT.md`'s own "Known gaps in this
repository's own record" section states this directly, as of the single commit (`e3808fb`, M1's own PR) that
introduced that file: *"The `Co-Authored-By` trailer on every commit is a fixed string the harness writes
regardless of which model did the work, and must not be read as authorship evidence."* This document does not
attribute any commit, ADR, or fix above to a specific model on the strength of that trailer, and neither
should a reader of `git log` alone.

## `.genesis/checkpoints/`: checked directly, not assumed

**`.genesis/checkpoints/CURRENT.md` has never carried a `model:` field.** `git log --all --oneline --
.genesis/checkpoints/` shows exactly one commit touching this path in this repository's entire history —
`e3808fb`, M1's own build — and the file has not been revised since (the checkpoint the plan calls for
updating at each milestone boundary was, in practice, never rewritten past its first, M1-era entry, which
itself still describes M1 as `"todo (built, unverified)"` and M2–M9 as `"todo"`/`"designed only"`, stale
against every milestone this document otherwise reconstructs). Since no version of this file, at any point in
this repository's history, has ever carried a `model:` field or any other per-commit attribution key, **build
attribution — which model produced which milestone's code — is not recoverable from this repository**, and
this document does not attempt to infer one from indirect signals (commit timing, prose style, or the fixed
`Co-Authored-By` trailer above).

## What this document did and did not have a primary source for

`gh pr view N --json comments` was run and counted, for all 17 PRs, not inferred from a pattern. The real
split: **PRs #1–#3 carry zero comments** (three PRs); **#4–#12 and #14–#17 carry exactly one comment each, and
every one of those thirteen is the Vercel deployment bot's own automated status comment** (thirteen PRs); **PR
#13 alone carries two comments** — the same Vercel bot comment every other PR gets, plus a second, substantive,
non-bot comment from the same account (`vladimir-mawla`), quoted and used above in "What was rejected, and
what was merely revised." An earlier revision of this document claimed "sixteen of the seventeen carry exactly
one comment each," which was arithmetic backed into from "not #13" rather than a real count — three PRs (not
sixteen) carry zero comments, and the sixteen that carry at least one are not one uniform bucket, since #13
carries two. Corrected here to the actually-counted split, and the one substantive comment remains
incorporated where it belongs rather than only disclosed as a gap.

What remains genuinely true, checked the same way: `gh pr view N --json reviews` returns zero formal GitHub
review objects (approvals, requested-changes, or review-level comments) for all 17 PRs. So the record this
repository kept is PR bodies, one real PR comment (#13), and Vercel's own bot noise — never a separately-
attributed reviewer identity, and never a formal review object. This document's account of "what was rejected"
and "what was revised" is built from all of that, not from PR bodies alone.

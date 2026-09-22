# Process notes

Reconstructed from primary sources only — `git log`, `gh pr list --state all`, `gh pr view N --json
body,comments,reviews`, and the six ADRs under `.genesis/decisions/` — not from any prior summary, including
whatever accompanied this milestone's own assignment. Where a figure below is a test count or a date, it is
either the literal number a cited PR body reports, or a number this session produced itself by running the
command named next to it; the two are not silently merged into one running tally, because reconciling
several self-reported deltas after the fact is exactly the kind of arithmetic that produces a stale count in
one place and a corrected one in another. `git show HEAD:` and `git log --all` were the sources of record for
this document's own claims about the repository's own commit graph.

**A methodological note on "independent verification," stated plainly rather than implied.** Every PR in
this history was authored and merged from the same GitHub account (`vladimir-mawla`); `gh pr view N --json
reviews` returns zero formal review objects for every PR checked (`2`, `8`, `10`, `12`, `16`, `17`). The
"independent (L4) verification" this project's own PR bodies and ADRs describe — attacking a milestone's
claims by reversing arguments, injecting offending code, removing `@ts-expect-error` directives, hand-
recomputing numbers — happened as a distinct pass narrated inside the *next* PR's own body (typically a
`mark-MN-done` PR), never as a separately-attributed GitHub review comment or approval. This document reports
what those PR bodies claim about that process; it cannot independently confirm that a different actor, human
or otherwise, actually ran it, only that the repository's own record consistently describes doing so before
each `mark-*-done` merge.

## Timeline, by merged PR (`gh pr list --state all`, 17 of 17 merged)

| PR | Merged (UTC) | Branch | What it did |
|---|---|---|---|
| #1 | 2026-09-20 17:11 | `m1-contracts` | M1 build: the four irreducible types, independently authored |
| #2 | 2026-09-20 17:21 | `mark-m1-done` | M1 marked done after independent verification — 14 files / 99 tests |
| #3 | 2026-09-20 17:31 | `m2-deploy` | M2 build: health endpoint, milestone-drift guard — 15 files / 124 tests |
| #4 | 2026-09-21 21:34 | `mark-m2-done` | M2 marked done — real `curl` against the deployed URL, not the code alone |
| #5 | 2026-09-21 21:40 | `m3-decay` | M3 build: the decay engine — 18 files / 201 tests |
| #6 | 2026-09-21 21:46 | `m4-contradiction` | M4 build (first pass — see "What was rejected," below) |
| #7 | 2026-09-21 22:01 | `fix-post-m3-stale-comments` | Two M3 findings closed: a degenerate policy, a stale comment |
| #8 | 2026-09-21 22:05 | `mark-m4-done` | M4 marked done, **after being reworked following rejection** — 24 files / 316 tests |
| #9 | 2026-09-21 22:25 | `m5-store` | M5 build: `forget()` + `queryBelief()` — 28 files / 395 tests |
| #10 | 2026-09-21 22:43 | `mark-m5-done` | M5 marked done, **after one rejection over an uncommitted ADR** (below) |
| #11 | 2026-09-21 23:11 | `m6-domain` | M6 build: personal-assistant domain — 34 files / 430 tests |
| #12 | 2026-09-21 23:27 | `mark-m6-done` | M6 marked done; adds the tier-rank-agreement guard — 35 files / 434 tests |
| #13 | 2026-09-21 23:39 | `m8-demo` | M8 build: the interactive demo — 35 files / 434 tests |
| #14 | 2026-09-21 23:49 | `m7-failures` | M7 build: ten failure cases — 45 files / 467 tests |
| #15 | 2026-09-21 23:58 | `fix-guard-vacuity` | Closes a vacuity hole in PR #12's own tier-rank-agreement guard |
| #16 | 2026-09-22 00:08 | `mark-m8-done` | M8 marked done — driven by hand against the deployed URL |
| #17 | 2026-09-22 00:19 | `mark-m7-done` | M7 marked done — 45 files / 470 tests |

**Worth naming plainly rather than smoothing over: M8 was built, merged, and marked done (#13, #16) before M7
was marked done (#17), even though M7 precedes M8 in the plan's own milestone numbering.** M7's own build
(#14) merged after M8's build (#13) but before M8 was marked done; #15's guard fix and #17's mark-M7-done then
landed last. The milestone *numbers* describe a dependency order the plan reasoned about in advance (M7's
failure suite needs `domains/**` frozen, which M6 provides — it does not itself depend on M8); the merge
timestamps describe the order work actually happened in, and the two are not the same thing. Nothing in this
repository's own `DONE.html`/`app/milestones.ts` claims otherwise — both are keyed on milestone identity, not
merge order — but a reader reconstructing history from PR numbers alone (`#13` before `#14`) rather than the
table above would get M7/M8's relative build order backwards.

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
- **Found and fixed same-day, cross-milestone (PR #15, `fix-guard-vacuity`):** chasing the Case 8 overclaim
  above led M7's own build to find a real hole in a guard *it itself had added at M6* — PR #12's
  `tier-rank-agreement.test.ts`. Its two original assertions were both implications ("if the domain says X,
  then `lib/contradiction` says Y"), which a domain table reporting `false` for every input would satisfy
  vacuously. Fixed by adding two positive assertions plus a direct falsifiability check (inverting the
  domain's own answer and confirming the guard then fails). PR #15's own line: *"A guard that cannot fail is
  not a guard."*

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

## What this document did not have a primary source for

`gh pr view N --json comments` returned an empty comment list for every PR checked (Vercel's own deployment
bot aside) — there is no separate PR-comment thread recording back-and-forth review discussion distinct from
the PR bodies quoted above. This document's account of "what was rejected" and "what was revised" is
therefore built entirely from what each PR's own body says about the PR before it, which is the only record
this repository actually kept.

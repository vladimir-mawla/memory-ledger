# CURRENT

- **active_loop:** M1 (`lib/contracts/**`) built on branch `m1-contracts`, PR open against `main`,
  awaiting independent (L4) verification. M2–M9 are designed (`.genesis/PLAN.md`, from
  `memory-plan.md`) but unbuilt — every one of them depends on M1's four irreducible types landing first.

- **last updated:** 2026-09-20, immediately after M1's own build pass, before any independent
  verification has run. Recorded now, honestly, rather than waiting for verification to close the loop —
  the sibling project `shadow-run`'s own checkpoint history notes that a checkpoint left stale for eleven
  hours across two merged milestones was found "worse than no checkpoint: it is a stated claim that
  happens to be false." This entry is deliberately conservative about what it claims: "built, unverified,"
  not "done."

## Milestone state, as of this revision

| | Status | Where |
|---|---|---|
| M1 contracts | `todo` (built, unverified) | `m1-contracts` branch, PR open against `main` |
| M2 deploy | `todo` | designed only (`memory-plan.md` §11) — no branch, no code |
| M3 decay | `todo` | designed only |
| M4 contradiction | `todo` | designed only |
| M5 forgetting engine | `todo` | designed only |
| M6 domain adapter | `todo` | designed only |
| M7 failure suite | `todo` | designed only |
| M8 demo | `todo` | designed only |
| M9 deliverables | `todo` | designed only |

`m1-contracts` carries `lib/contracts/**` at **14 test files / 99 tests**. `main` is still the single
empty base commit until this PR merges.

## What this build pass found in the plan, worth carrying forward

Recorded now, at build time, rather than left for a verifier to reconstruct later — see
`.genesis/decisions/0001-contracts.md` for the full reasoning behind each:

- `memory-plan.md` §3's own literal sketch of `Memory.status` (a four-member union including
  `"tombstoned"`) cannot satisfy M1's own success criterion — a compile-time-refused `TombstonedMemory`.
  Corrected to a three-member `Memory.status` plus a structurally distinct `TombstonedMemory` type. Full
  reasoning in ADR 0001, Decision 2.
- `memory-plan.md` §4's `Tombstone.supersededBy?: MemoryId // present iff reason is "contradicted" or
  "superseded"` cannot be enforced by an optional field — corrected to a two-branch discriminated union
  (`CausedTombstone` / `UncausedTombstone`). ADR 0001, Decision 3.
- `Provenance`'s tier-from-kind mapping (§5.1) is deliberately NOT auto-derived by a function in this
  milestone — `tier` stays a caller-supplied field. ADR 0001, Decision 1, and provenance.ts's own header,
  explain why guessing that mapping now would be unauthorized speculation.
- `effectiveConfidence` (§3) is implemented for real, but only as far as this milestone can honestly
  compute without M3's decay engine — the live, clock-consistent branch returns the recorded confidence
  unmodified. Flagged in this build's own report as the weakest point to attack first.

## Known gaps in this repository's own record, stated up front rather than discovered later

- This checkpoint has no `model:` field, matching the sibling projects' own noted gap: which model built
  which milestone is not recoverable from the repository alone. The `Co-Authored-By` trailer on every
  commit is a fixed string the harness writes regardless of which model did the work, and must not be read
  as authorship evidence.
- No independent verification has run yet against this branch — every claim in this checkpoint and in the
  build report is the building agent's own, unverified. That is exactly what "todo (built, unverified)"
  in the table above is trying to say plainly, not overstate.

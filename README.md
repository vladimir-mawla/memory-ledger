# memory-ledger

Memory that knows it might be wrong: a typed, append-only store of beliefs with source, confidence,
freshness, scope, and an explicit, provable forgetting policy — not vector retrieval with extra columns.
`docs/ARCHITECTURE.md` argues the structural difference stage by stage; `docs/THESIS.md` is the two-year bet
this project is making; `docs/WALKTHROUGH.md` is a 90-second, beat-by-beat script for the live demo below.

**Live:** **https://memory-ledger-rosy.vercel.app** — this is the real, deployed URL. No
`decision-engine.vercel.app`-style guessing is needed for this project; if a link elsewhere in this account's
history suggests otherwise, this one is authoritative.

## What this is

Nine milestones, each frozen on merge, each composing only the layers before it:

1. **Contracts** (`lib/contracts/`) — `Memory`, `Tombstone`/`TombstonedMemory`, `ForgetReason`, `BeliefAnswer`.
2. **Deploy skeleton** (`app/api/health/`) — the health endpoint above.
3. **Decay** (`lib/decay/`) — a pure freshness interpreter over a declared `DecayPolicy`.
4. **Contradiction** (`lib/contradiction/`) — a pure four-outcome comparison over `Provenance.tier`.
5. **Forgetting** (`lib/store/forget.ts`) — tombstoning, never deletion.
6. **Personal-assistant domain** (`domains/personal-assistant/`) — the one committed domain; see below for
   the two considered and not built.
7. **Failure suite** (`tests/failures/`) — the required same-tick race, plus regression pins.
8. **Interactive demo** (`app/`, `components/`) — the live page at the URL above.
9. **Deliverables** (this document, `docs/`) — you are here.

`docs/ARCHITECTURE.md` is the real per-stage account of what each layer refuses to do and why, each refusal
tied to a currently-passing test. This section only orients; it does not re-argue that document.

### Domain: what was built, and what deliberately was not

The personal-assistant domain (`domains/personal-assistant/`) is the one committed domain — "what do you
remember about me, and did anything make that wrong" stresses all three doubt-mechanisms (contradiction,
decay, revocation) in one narrative a judge needs no domain briefing to follow. Two other candidates were
scoped in `.genesis/memory-plan.md` §9 and **not built**, named here rather than left implied:

- **CRM / customer-support memory** ("what do we know about this account") — would have stressed
  contradiction and scope hardest (a customer restating something to two reps; a contact leaving a company as
  a clean `scope-exited` case).
- **Threat-intel / fraud-signal memory** ("is this indicator still bad") — would have stressed revocation and
  decay hardest (a blocklist retraction; an indicator decaying out of belief with no contradiction at all).

Neither has any code in this repository.

## How to run it

Requires Node `24.x` (this repo was built and verified on `24.7.0`) and npm. **Use `npm ci`, never `npm
install`** — the pinned npm on this account (11.5.1) drops the `@rolldown/binding-*` optional dependency on
install, and vitest then fails to start.

```bash
git clone https://github.com/vladimir-mawla/memory-ledger.git
cd memory-ledger
npm ci
npm run typecheck   # tsc -p tsconfig.lib.json --noEmit && tsc -p tsconfig.json --noEmit
npm test            # vitest run
npm run build       # next build --webpack
```

Every command above was run against this exact tree before being written down here. `npm test` prints
**45 test files / 470 tests**, all passing; `npm run typecheck` and `npm run build` both exit clean.

### The demo scripts

```bash
npm run demo:memory   # scripts/demo-memory.ts — the §8 scenario end to end, node:assert-checked, no UI
npm run dev            # then open http://localhost:3000 for the interactive version
```

`npm run demo:memory` runs the full thirteen-step personal-assistant narrative from the command line: the
shipping-address contradiction, small-talk decay to `unknown`, two integrations disputing a city, source
revocation resolving that dispute as a side effect, the one real case in this system for `ForgetReason:
"superseded"`, and a final account-deletion sweep — printing, at the end, `BeliefAnswer variants observed:
believed, disputed, doubted, unknown` and exiting `0`. Every claim it prints is checked with `node:assert`
against the real engine as it runs, not narrated.

```bash
curl -sf https://memory-ledger-rosy.vercel.app/api/health
```

returns HTTP 200 and a JSON body naming the deployed commit SHA plus a live `effectiveConfidence` check run
inside that deployed process — confirmed just now:

```json
{"status":"ok","commit":"b0ad336285adf9ecaf151d4a8e9fdedb121cb3b4","checks":{"contracts":{"pass":true,"elapsedMs":2.595,"detail":"effectiveConfidence: live->recorded (0.9), tombstoned->0 despite a 0.9 stored value, clock-inconsistent->0"}}}
```

### The interactive demo, live

Open the URL above (or `npm run dev` locally) and follow `docs/WALKTHROUGH.md` — an 8-beat, 90-second script,
verified line by line against a real run of this branch. In short: tell the assistant a shipping address,
tell it — in different words — that you moved, ask it back in your original phrasing, and watch the real
engine answer with the current address while a fair bag-of-words baseline, run on the same two facts, ranks
the stale one higher because it alone shares your original wording. A toggle on the second message lets you
route the same scenario through `disputed` instead of `contradicted`, showing the one `BeliefAnswer` variant a
similarity ranker cannot produce even once, let alone honestly.

## What this deliberately does not do

- No LLM, no network call, anywhere in `lib/**` or `domains/**` — enforced by an architecture test in each of
  `lib/decay`, `lib/contradiction`, and `lib/store` that parses every source file with the real TypeScript
  compiler and fails closed on anything it cannot parse, and greps for `fetch(...)` under every disguise its
  own regression history has found.
- No `affirm()`/reconfirm-the-identical-value mechanism — a disclosed, intentional gap; see
  `docs/ARCHITECTURE.md`'s Stage 4/domain sections.
- No un-forgetting. A tombstoned belief never comes back; a later confirmation is always a brand-new `Memory`.

## Repository layout

```
lib/contracts/      Stage 1 — Memory, Tombstone, ForgetReason, BeliefAnswer (frozen after M1)
lib/decay/           Stage 2 — the freshness interpreter (frozen after M3)
lib/contradiction/   Stage 3 — the four-outcome comparison (frozen after M4)
lib/store/           Stage 4/5 — forget() and queryBelief() (frozen after M5)
domains/personal-assistant/   the one committed domain (frozen after M6)
tests/failures/      the required deliberate-failure suite (frozen after M7)
app/, components/    the interactive demo (frozen after M8)
docs/, README.md     this milestone (M9)
.genesis/            the plan, the ADRs, and the process record this project ran on
```

## Further reading

- `docs/ARCHITECTURE.md` — every stage's refusals, each tied to a real test.
- `docs/THESIS.md` — the two-year bet, ≤300 words.
- `docs/NOTES.md` — the process record: what was rejected, what was revised, and by whom.
- `docs/WALKTHROUGH.md` — the 90-second live-demo script.
- `.genesis/memory-plan.md` — the original scoping document every `§N` reference in this repo points at.
- `.genesis/decisions/000N-*.md` — the six ADRs, one per BUILD/VERIFY/INTEGRATE milestone (M1, M3, M4, M5, M6,
  M7 — M2's deploy skeleton and M8's demo did not warrant one, and M9 is this document set).

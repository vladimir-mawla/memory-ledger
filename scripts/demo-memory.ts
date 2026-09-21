import assert from "node:assert/strict";
import type { Json } from "../lib/contracts/json.js";
import { queryConfidence } from "../lib/decay/query-confidence.js";
import { effectiveConfidence } from "../lib/contracts/effective-confidence.js";
import type { CapturedAt, Milliseconds } from "../lib/contracts/captured-at.js";
import type { Confidence } from "../lib/contracts/confidence.js";
import type { BeliefAnswer } from "../lib/contracts/belief-answer.js";
import { assertNeverBeliefAnswer } from "../lib/contracts/belief-answer.js";
import {
  DEFAULT_SCOPE,
  EMPTY_STORE,
  type FactInput,
  type Predicate,
  type StoreState,
  SUBJECT,
  closeScope,
  derivedInference,
  humanAvowal,
  mustCapturedAt,
  query,
  rankBySimilarity,
  recordFact,
  revokeSource,
} from "../domains/personal-assistant/index.js";

/** Local helper — see baseline.ts and confidence.ts for why casting a hardcoded, known-good literal into a branded type is the accepted pattern outside `lib/` (this script is not scanned by `lib/contracts/__tests__/brand-casts.test.ts`, which covers `lib/` only, but the same "only ever on a value this codebase itself hardcodes, never on external input" discipline applies here too). */
function ms(n: number): Milliseconds {
  return n as Milliseconds;
}
function confidenceLiteral(n: number): Confidence {
  return n as Confidence;
}

/**
 * `scripts/demo-memory.ts` — `PLAN.md`'s own M6 demo command
 * (`npm run demo:memory`). Runs `memory-plan.md` §8's own scenario
 * end-to-end over a realistic corpus, PLUS the two other doubt-mechanisms
 * §9 names (decay on stale small talk, revocation on a disconnected
 * integration) and the real, concrete `scope-exited` trigger this
 * milestone was the first with standing to name (account deletion) — see
 * `domains/personal-assistant/store.ts`'s own header for why. Every step
 * prints the memory written, its confidence, and any tombstone it
 * produced — this milestone's own success criterion, verified by
 * `node:assert`, not merely narrated: if the engine ever disagreed with
 * this file's own narrative claim about what should happen next, this
 * script would throw, not print a wrong story convincingly.
 *
 * ALL FOUR `BeliefAnswer` VARIANTS, EACH REACHED FROM A REAL QUERY, NOT
 * ASSERTED: `unknown/no-memory` (step 0, before anything is ever told to
 * the assistant), `believed` (repeatedly), `doubted` (the coffee order,
 * mid-decay), `disputed` (two calendar/contacts integrations disagreeing
 * about the user's current city), and `unknown/all-known-memories-
 * tombstoned` (the coffee order once it fully decays away, and the final
 * account-deletion sweep). `assertVariant` below fails the whole run if a
 * step's real answer doesn't match what the step claims to demonstrate.
 *
 * ALL FIVE `ForgetReason`S FIRE FOR REAL, NOT JUST M5's OWN FROZEN SUITE:
 * `age-exceeded` (coffee order), `contradicted` (the §8 address change),
 * `source-revoked` (a disconnected calendar integration, twice),
 * `superseded` (a derived-inference guess about the user's city, later
 * confirmed directly by the user themselves — the one case in this whole
 * system `contradict()` itself cannot produce; see store.ts's own header),
 * and `scope-exited` (account deletion, the finale).
 */

const NARRATIVE_END: CapturedAt = mustCapturedAt("2026-09-22T09:30:00.000Z");
function now(raw: string): CapturedAt {
  return mustCapturedAt(raw, NARRATIVE_END);
}

let stepNumber = 0;
function step(title: string): void {
  stepNumber += 1;
  console.log(`\n--- Step ${stepNumber}: ${title} ---`);
}

function printAnswer<TValue extends Json>(label: string, answer: BeliefAnswer<TValue>): void {
  switch (answer.status) {
    case "believed":
      console.log(`  ${label}: BELIEVED — ${JSON.stringify(answer.memory.value)} (confidence ${answer.confidence.toFixed(3)}, source ${answer.memory.source.sourceId})`);
      break;
    case "doubted":
      console.log(`  ${label}: DOUBTED — ${JSON.stringify(answer.memory.value)} (confidence ${answer.confidence.toFixed(3)}, reason: ${answer.reason})`);
      break;
    case "disputed":
      console.log(`  ${label}: DISPUTED — candidates: ${answer.candidates.map((m) => `${JSON.stringify(m.value)} (${m.source.sourceId})`).join(" vs. ")}`);
      break;
    case "unknown":
      console.log(`  ${label}: UNKNOWN (${answer.reason}) — ${answer.tombstones.length} known tombstone(s): ${answer.tombstones.map((t) => t.reason).join(", ") || "none"}`);
      break;
    default:
      assertNeverBeliefAnswer(answer);
  }
}

type BeliefStatus = BeliefAnswer<Json>["status"];

function assertVariant<TValue extends Json>(answer: BeliefAnswer<TValue>, expected: BeliefStatus): void {
  assert.equal(answer.status, expected, `expected BeliefAnswer status "${expected}", got "${answer.status}"`);
}

function tellAssistant<P extends Predicate>(
  state: StoreState,
  utterance: string,
  input: Omit<FactInput<P>, "utterance">,
  atNow: CapturedAt,
): StoreState {
  console.log(`  You: "${utterance}"`);
  const outcome = recordFact(state, { ...input, utterance }, atNow);
  assert.equal(outcome.ok, true, "demo corpus is hardcoded and must always construct a valid Memory");
  if (!outcome.ok) {
    throw new Error("unreachable");
  }
  const { result } = outcome;
  console.log(`  -> wrote ${result.written.predicate} = ${JSON.stringify(result.written.value)} (confidence ${result.written.confidence}, tier ${result.written.source.tier})`);
  for (const tombstone of result.newTombstones) {
    console.log(`  -> tombstoned prior ${tombstone.predicate} (${JSON.stringify(tombstone.value)}): reason "${tombstone.tombstone.reason}"${tombstone.tombstone.reason === "contradicted" || tombstone.tombstone.reason === "superseded" ? `, superseded by ${tombstone.tombstone.supersededBy}` : ""}`);
  }
  return result.state;
}

const foundVariants = new Set<BeliefStatus>();
function trackVariant<TValue extends Json>(answer: BeliefAnswer<TValue>): void {
  foundVariants.add(answer.status);
}

async function main(): Promise<void> {
  let state: StoreState = EMPTY_STORE;

  // ---- Step 0: unknown/no-memory — the assistant has never been told anything. ----
  step("Ask about something never mentioned");
  {
    const t = now("2026-03-01T08:00:00.000Z");
    console.log(`  You: "What's my shipping address?"`);
    const { result, state: s } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t);
    state = s;
    printAnswer("Assistant", result.answer);
    assertVariant(result.answer, "unknown");
    trackVariant(result.answer);
  }

  // ---- Step 1: the §8 scenario begins — a direct human avowal. ----
  step("Tell the assistant a shipping address");
  const t1 = now("2026-03-01T09:00:00.000Z");
  state = tellAssistant(
    state,
    "My shipping address is 42 Elm Street, Portland.",
    {
      predicate: "shipping-address",
      value: { line1: "42 Elm Street", city: "Portland", state: "OR" },
      source: humanAvowal("user:vlad"),
      believedAtRaw: t1,
      confidenceRaw: 0.9,
    },
    t1,
  );
  {
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t1);
    printAnswer("Assistant", result.answer);
    assertVariant(result.answer, "believed");
    trackVariant(result.answer);
  }

  // ---- Step 2-4: small talk that decays on its own, no contradiction involved. ----
  step("Small talk: a coffee order (drives freshness decay alone)");
  const t2 = now("2026-03-05T10:00:00.000Z");
  state = tellAssistant(
    state,
    "I usually get an oat milk latte.",
    {
      predicate: "coffee-order",
      value: "oat milk latte",
      source: humanAvowal("user:vlad"),
      believedAtRaw: t2,
      confidenceRaw: 0.85,
      decayPolicy: { kind: "half-life", halfLifeMs: ms(604_800_000), doubtedThreshold: confidenceLiteral(0.5), forgetFloor: confidenceLiteral(0.15) },
    },
    t2,
  );
  {
    const { result } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, t2);
    printAnswer("Assistant (right away)", result.answer);
    assertVariant(result.answer, "believed");
    trackVariant(result.answer);
  }

  step("Two weeks later: the coffee order has gone stale (doubted)");
  const t3 = now("2026-03-19T10:00:00.000Z");
  {
    const { result, state: s } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, t3);
    state = s;
    printAnswer("Assistant (14 days later)", result.answer);
    assertVariant(result.answer, "doubted");
    trackVariant(result.answer);
  }

  step("Eight half-lives later: the coffee order is forgotten (unknown)");
  const t4 = now("2026-04-30T10:00:00.000Z");
  {
    const { result, state: s } = query(state, SUBJECT, "coffee-order", DEFAULT_SCOPE, t4);
    state = s;
    printAnswer("Assistant (56 days later)", result.answer);
    assertVariant(result.answer, "unknown");
    assert.equal(result.answer.status === "unknown" && result.answer.reason, "all-known-memories-tombstoned");
    trackVariant(result.answer);
  }

  // ---- Step 5-6: two integrations disagree — disputed. ----
  step("A calendar integration infers the user's current city");
  const t5 = now("2026-05-10T09:00:00.000Z");
  state = tellAssistant(
    state,
    "(calendar integration) Location on today's calendar entries: Austin.",
    {
      predicate: "current-city",
      value: "Austin",
      source: derivedInference("integration:google-calendar"),
      believedAtRaw: t5,
      confidenceRaw: 0.6,
    },
    t5,
  );

  step("A contacts integration infers a different current city");
  const t6 = now("2026-05-11T09:00:00.000Z");
  state = tellAssistant(
    state,
    "(contacts integration) Address book sync shows current city: Denver.",
    {
      predicate: "current-city",
      value: "Denver",
      source: derivedInference("integration:contacts-sync"),
      believedAtRaw: t6,
      confidenceRaw: 0.55,
    },
    t6,
  );
  {
    const { result } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, t6);
    printAnswer("Assistant", result.answer);
    assertVariant(result.answer, "disputed");
    trackVariant(result.answer);
  }

  // ---- Step 7: a second, single-candidate source-revoked case. ----
  step("The calendar integration also infers a meeting location");
  const t7 = now("2026-06-01T09:00:00.000Z");
  state = tellAssistant(
    state,
    "(calendar integration) Next meeting location: Building 4, Room 210.",
    {
      predicate: "linked-calendar-location",
      value: "Building 4, Room 210",
      source: derivedInference("integration:google-calendar"),
      believedAtRaw: t7,
      confidenceRaw: 0.7,
    },
    t7,
  );

  // ---- Step 8: revoke the calendar integration — resolves the dispute as a side effect. ----
  step("User disconnects the Google Calendar integration");
  const t8 = now("2026-07-15T09:00:00.000Z");
  {
    console.log(`  You: (disconnects "Google Calendar" in settings)`);
    state = revokeSource(state, "integration:google-calendar", t8);
  }
  {
    const { result, state: s } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, t8);
    state = s;
    console.log("  (revoking Google Calendar removed Austin from contention — only the Contacts-based guess is left)");
    printAnswer("Assistant (current-city)", result.answer);
    assertVariant(result.answer, "believed");
    assert.equal(result.answer.status === "believed" && result.answer.memory.value, "Denver");
    trackVariant(result.answer);
  }
  {
    const { result, state: s } = query(state, SUBJECT, "linked-calendar-location", DEFAULT_SCOPE, t8);
    state = s;
    printAnswer("Assistant (linked-calendar-location)", result.answer);
    assertVariant(result.answer, "unknown");
    trackVariant(result.answer);
  }

  // ---- Step 8.5: the ONE real case for ForgetReason "superseded". ----
  step("The user directly confirms the guessed city — a non-contradicting upgrade");
  const t85 = now("2026-08-10T09:00:00.000Z");
  state = tellAssistant(
    state,
    "Yes, I can confirm — I'm in Denver.",
    {
      predicate: "current-city",
      value: "Denver",
      source: humanAvowal("user:vlad"),
      believedAtRaw: t85,
      confidenceRaw: 0.95,
    },
    t85,
  );
  {
    const { result } = query(state, SUBJECT, "current-city", DEFAULT_SCOPE, t85);
    printAnswer("Assistant", result.answer);
    assertVariant(result.answer, "believed");
    assert.equal(result.answer.status === "believed" && result.answer.memory.source.tier, "direct-avowal");
    trackVariant(result.answer);
  }

  // ---- Step 9: an unremarkable live fact, kept only to give the finale more than one thing to sweep. ----
  step("A plain, uncontested fact");
  const t9 = now("2026-08-20T09:00:00.000Z");
  state = tellAssistant(
    state,
    "My timezone is America/Los_Angeles.",
    {
      predicate: "timezone",
      value: "America/Los_Angeles",
      source: humanAvowal("user:vlad"),
      believedAtRaw: t9,
      confidenceRaw: 0.9,
    },
    t9,
  );

  // ---- Step 10: the §8 scenario's own second half — months later, phrased completely differently. ----
  step("Months later: the address changes, phrased completely differently");
  const t10 = now("2026-09-15T09:00:00.000Z");
  state = tellAssistant(
    state,
    "I moved — my new address is 118 Birch Avenue, Seattle.",
    {
      predicate: "shipping-address",
      value: { line1: "118 Birch Avenue", city: "Seattle", state: "WA" },
      source: humanAvowal("user:vlad"),
      believedAtRaw: t10,
      confidenceRaw: 0.9,
    },
    t10,
  );
  {
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t10);
    printAnswer("Assistant", result.answer);
    assertVariant(result.answer, "believed");
    assert.equal(result.answer.status === "believed" && result.answer.memory.value.city, "Seattle");
    trackVariant(result.answer);
  }

  // ---- Step 11: THE demo question — same wording as step 1, engine vs. fair baseline, side by side. ----
  step('The demo question: "What\'s my shipping address?" — same phrasing as step 1');
  const t11 = now("2026-09-22T09:00:00.000Z");
  const oldMemory = state.tombstoned.find((m) => m.predicate === "shipping-address" && m.tombstone.reason === "contradicted");
  assert.ok(oldMemory, "expected the old shipping-address memory to have been tombstoned by step 10");
  {
    console.log(`  You: "What's my shipping address?"`);
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t11);
    printAnswer("Assistant (this system)", result.answer);
    assertVariant(result.answer, "believed");
    assert.equal(result.answer.status === "believed" && result.answer.memory.value.city, "Seattle");
    trackVariant(result.answer);

    const oldConfidenceViaContracts = effectiveConfidence(oldMemory, t11);
    const oldConfidenceViaDecay = queryConfidence(oldMemory, t11);
    console.log(`  The old address's effectiveConfidence is now ${oldConfidenceViaContracts} (queryConfidence agrees: ${oldConfidenceViaDecay}) — recorded history untouched, only its status changed.`);
    assert.equal(oldConfidenceViaContracts, 0);
    assert.equal(oldConfidenceViaDecay, 0);

    console.log(`  Asked to prove it forgot: tombstone ${oldMemory.tombstone.id}`);
    console.log(`    reason: "${oldMemory.tombstone.reason}", forgottenAt: ${oldMemory.tombstone.forgottenAt}, supersededBy: ${oldMemory.tombstone.reason === "contradicted" ? oldMemory.tombstone.supersededBy : "(n/a)"}`);

    console.log("\n  --- Fair baseline comparison (bag-of-words cosine similarity — see domains/personal-assistant/baseline.ts) ---");
    const ranked = rankBySimilarity('What\'s my shipping address?', [
      { id: "old", text: "My shipping address is 42 Elm Street, Portland." },
      { id: "new", text: "I moved — my new address is 118 Birch Avenue, Seattle." },
    ]);
    for (const candidate of ranked) {
      console.log(`    "${candidate.text}" — cosine similarity ${candidate.score.toFixed(4)}`);
    }
    const [top] = ranked;
    assert.ok(top);
    console.log(`  Fair baseline's top match: "${top.text}" (id: ${top.id})`);
    if (top.id === "old") {
      console.log("  >>> FINDING CONFIRMED: the fair, unmodified baseline ranks the STALE statement higher — it alone shares the word \"shipping\" with the query — while this system correctly answers with the current address and can prove why the old one no longer counts.");
    } else {
      console.log("  >>> FINDING: the fair baseline did NOT rank the stale statement higher on this corpus. This contradicts memory-plan.md §8's own prediction and must be reported, not worked around — see this milestone's own build report.");
    }
    assert.equal(top.id, "old", 'memory-plan.md §8 predicts the fair baseline ranks the OLD statement higher on this exact query — if this assertion ever fails, §8\'s own scenario needs revisiting, not a rephrased query (see baseline.ts\'s header and this milestone\'s build report).');
  }

  // ---- Step 12: the finale — account deletion, a real scope-exited trigger. ----
  step("Finale: the user deletes their account");
  const t12 = now("2026-09-22T09:30:00.000Z");
  console.log("  You: (deletes account)");
  state = closeScope(state, DEFAULT_SCOPE, t12);
  {
    const { result } = query(state, SUBJECT, "shipping-address", DEFAULT_SCOPE, t12);
    printAnswer("Assistant (shipping-address, post-deletion)", result.answer);
    assertVariant(result.answer, "unknown");
    assert.equal(result.answer.status === "unknown" && result.answer.reason, "all-known-memories-tombstoned");
    trackVariant(result.answer);
    for (const t of result.answer.status === "unknown" ? result.answer.tombstones : []) {
      console.log(`    tombstone reason: ${t.reason}`);
    }
  }

  console.log("\n=== Summary ===");
  console.log(`BeliefAnswer variants observed: ${[...foundVariants].sort().join(", ")}`);
  const expectedVariants: readonly BeliefStatus[] = ["believed", "doubted", "disputed", "unknown"];
  for (const variant of expectedVariants) {
    assert.ok(foundVariants.has(variant), `expected the demo run to reach BeliefAnswer status "${variant}" at least once`);
  }
  console.log("All four BeliefAnswer variants reached. Demo complete.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});

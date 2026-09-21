import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import type { DecayPolicy } from "../contracts/decay-policy.js";
import { type Confidence, ZERO_CONFIDENCE, parseConfidence } from "../contracts/confidence.js";
import { ageOf, type CapturedAt, type Milliseconds } from "../contracts/captured-at.js";

/**
 * `decay(memory, now)` — the interpreter `decay-policy.ts` (M1, frozen)
 * named but did not build: "`halfLifeMs` names the CURVE'S PARAMETER, not
 * the curve itself — `lib/decay/**` (M3) is the interpreter that actually
 * computes a confidence value from `(policy, memory, now)`."
 * `memory-plan.md` §3's own "legal operations" list: "`decay(memory, now)`
 * → recomputed `confidence` per `decayPolicy`; pure function of `(memory,
 * now)`, no side effect." This file is the whole of that promise, kept.
 *
 * WHY THE RESULT IS `{ confidence, status }`, NEVER A MUTATED `Memory` OR A
 * BARE NUMBER: `memory-plan.md` §3 is explicit that decay "recompute[s]
 * `confidence`" without ever rewriting `Memory.confidence` itself (that
 * field is "the value recorded at creation/affirmation time... never
 * rewritten afterward"). Returning a whole new `Memory` would invite a
 * caller to treat it as the new recorded truth and persist it, silently
 * violating that immutability rule one call site away from where it's
 * declared. `decay` hands back exactly the two computed facts a caller
 * needs to decide what to do next — nothing that looks like a record to
 * save. THIS FILE'S OWN `queryConfidence` (query-confidence.ts, same
 * directory) is one such caller, and M5's still-unbuilt store is another —
 * see query-confidence.ts's header for why the composed, query-facing
 * answer lives at THIS layer and not in `lib/contracts`.
 *
 * `status` HERE IS ITS OWN THREE-MEMBER VOCABULARY
 * (`"believed" | "doubted" | "forgettable"`), DELIBERATELY NOT
 * `Memory.status`'s OWN THREE-MEMBER UNION (`"believed" | "doubted" |
 * "disputed"`, memory.ts) — the two unions share two labels but are NOT
 * the same type, on purpose, and the difference is exactly the "forgettable
 * as a derived property, not a stored status" design question this
 * milestone was asked to settle. See `.genesis/decisions/0002-decay.md`
 * for the full argument; in short: `Memory.status` is a FROZEN, STORED
 * field M1 fixed to three members specifically to keep tombstoning a
 * compile-time-refused separate TYPE (`TombstonedMemory`), not a fourth
 * status value. Decay cannot honestly report `"disputed"` (that is M4's
 * contradiction engine's finding, never freshness's) and — symmetrically —
 * `Memory.status` cannot honestly gain a `"forgettable"` member without
 * reopening that frozen file for a change M1 never authorized. `decay`'s
 * own `status` is therefore a QUERY-TIME, COMPUTED classification, not a
 * value ever written back onto a `Memory`. Crossing `forgetFloor` does NOT
 * tombstone anything here — `decay` has no side effect and does not know
 * how to construct a `Tombstone` (M5's `lib/store/**`, unbuilt, owns
 * `forget(memory, "age-exceeded", now)`); `status: "forgettable"` is the
 * pure, honest fact a caller needs to decide whether to call that later.
 *
 * THE CURVE: EXPONENTIAL HALF-LIFE. `decay-policy.ts`'s decaying variant is
 * named `"half-life"` (RENAMED from its original `"linear-to-floor"` once
 * this interpreter was actually built and it became clear the frozen
 * field's only parameter, `halfLifeMs`, can honestly mean nothing but
 * exponential decay — see that file's own header and
 * `.genesis/decisions/0002-decay.md` for the rename's full history). This
 * file interprets it the one mathematically honest way a value named
 * `halfLifeMs` can be read: `confidence(t) = recordedConfidence *
 * 0.5^(elapsedMs / halfLifeMs)`.
 *
 * NO EMA, NO SMOOTHING OVER A SEQUENCE OF SAMPLES — `memory-plan.md`'s own
 * house rule (M3's build brief) requires a threshold-flip test to prove an
 * EXACT tick boundary, "no EMA smoothing hiding the exact boundary." An
 * exponential half-life curve is a plain, deterministic, CLOSED-FORM
 * function of `(recordedConfidence, elapsedMs, halfLifeMs)` — every call
 * with the same three inputs produces the same output, with no hidden
 * accumulator carried between calls (an EMA, by contrast, blends a new
 * sample with its OWN PREVIOUS OUTPUT, which is precisely what smears a
 * sharp threshold crossing across many samples). Continuous does not mean
 * smoothed-over: `__tests__/decay.test.ts`'s threshold-flip tests prove the
 * crossing is exact to the millisecond, not fuzzy.
 *
 * CLOCK-INCONSISTENCY FAILS CLOSED TO `{ ZERO_CONFIDENCE, "doubted" }` —
 * REUSING, NOT REPLACING, `effectiveConfidence`'s OWN ESTABLISHED BRANCH.
 * `effective-confidence.ts`'s header: "a clock-inconsistent `now` fails
 * closed to 'cannot compute, treat as most doubted,' never to a fabricated
 * `confidence: 1`." `"doubted"` (not `"forgettable"`) is chosen because
 * that is the plan's own literal phrase ("most doubted") and because a
 * broken clock reading is a data-integrity signal distinct from a genuine,
 * curve-driven floor crossing — conflating the two would let a single bad
 * timestamp silently trigger the same consequence (eligible for
 * `forget(..., "age-exceeded", ...)`) a real elapsed-time floor crossing
 * earns, which overstates what a clock glitch alone has actually proven.
 * Checked against `memory.lastAffirmedAt`, the SAME field
 * `effectiveConfidence` already checks (ageOf, captured-at.ts) —
 * `believedAt <= lastAffirmedAt` always holds for a validly-constructed
 * `Memory` (no later milestone here reopens that to verify it structurally,
 * consistent with this milestone's freeze boundary), so this one check
 * already subsumes "`now` earlier than `believedAt`" as well. This
 * check runs BEFORE policy validation (below) — a broken clock is checked
 * independent of what the policy even says.
 *
 * A MALFORMED POLICY FAILS CLOSED TOO, EXPLICITLY VALIDATED, NOT MERELY
 * SURVIVED BY ACCIDENTAL ARITHMETIC. An earlier revision of this file
 * relied on `Math.max`/`Math.min` clamping plus `parseConfidence`
 * rejecting a non-finite result to keep a degenerate `halfLifeMs` (`0`,
 * negative, or non-finite) from crashing or fabricating a confidence above
 * the recorded one — true, but untested and therefore an accident of the
 * arithmetic, not a guarantee. `validateHalfLifePolicy` (below) now checks
 * `halfLifeMs` is finite and strictly positive, and that `forgetFloor` does
 * not exceed `doubtedThreshold`, BEFORE any arithmetic runs; a policy that
 * fails this check makes `decay` return `{ ZERO_CONFIDENCE, "forgettable"
 * }` — the strictest verdict this file has, deliberately stricter than the
 * clock-inconsistency branch's `"doubted"`: a broken clock is a one-time
 * bad reading about a single call, but a malformed policy is a defect in
 * the memory's OWN CONFIGURATION that will misbehave on every future call
 * as well, so this file never lets it produce anything softer than the
 * worst honest answer. `__tests__/decay.test.ts`'s "malformed policy"
 * block tests every case named above directly, rather than trusting the
 * arithmetic to keep defending them silently.
 *
 * PURITY: no `Date.now()`, no `systemNow()`, no shared mutable state
 * anywhere in this file — `now` arrives as an argument and is the only
 * clock this function ever reads. `__tests__/decay.test.ts` proves repeat
 * calls with identical inputs deep-equal each other.
 */

/**
 * `decay`'s own classification of a memory's freshness at query time —
 * NOT `Memory.status` (memory.ts). See this file's header for why the two
 * unions look similar but are deliberately different types.
 */
export type DecayStatus = "believed" | "doubted" | "forgettable";

export interface DecayResult {
  readonly confidence: Confidence;
  readonly status: DecayStatus;
}

type HalfLifePolicy = Extract<DecayPolicy, { kind: "half-life" }>;

/**
 * Reasons a `"half-life"` policy is rejected outright, before any decay
 * arithmetic runs on it — see the file header's "A MALFORMED POLICY FAILS
 * CLOSED TOO" paragraph. Exported so `__tests__/decay.test.ts` can assert
 * on the specific reason, not just the fact that SOME rejection happened.
 */
export type InvalidHalfLifePolicy =
  | { readonly reason: "half-life-not-finite"; readonly received: number }
  | { readonly reason: "half-life-not-positive"; readonly received: number }
  | { readonly reason: "forget-floor-exceeds-doubted-threshold"; readonly forgetFloor: number; readonly doubtedThreshold: number };

/**
 * Explicit, total validation for the one policy shape that has arithmetic
 * to protect — `"never-decays"` carries no thresholds and is trivially
 * always valid, so this function is never called for it. Checked BEFORE
 * `decayedConfidence`/`classify` ever run, not discovered afterward by
 * inspecting their output.
 */
function validateHalfLifePolicy(policy: HalfLifePolicy): InvalidHalfLifePolicy | null {
  if (!Number.isFinite(policy.halfLifeMs)) {
    return { reason: "half-life-not-finite", received: policy.halfLifeMs };
  }
  if (policy.halfLifeMs <= 0) {
    return { reason: "half-life-not-positive", received: policy.halfLifeMs };
  }
  if (policy.forgetFloor > policy.doubtedThreshold) {
    return { reason: "forget-floor-exceeds-doubted-threshold", forgetFloor: policy.forgetFloor, doubtedThreshold: policy.doubtedThreshold };
  }
  return null;
}

/**
 * Applies the exponential half-life curve to `recordedConfidence` over
 * `elapsedMs`, per `policy`. Only ever called on a policy that already
 * passed `validateHalfLifePolicy`, so `halfLifeMs` is known finite and
 * positive here. Still clamped into `[0, recordedConfidence]` before being
 * re-validated through `parseConfidence` — decay only ever REDUCES
 * confidence (never grows it, matching "must not produce a confidence
 * higher than the recorded one" for every path through this file, not only
 * the clock-inconsistency one), and the clamp guards the one place
 * ordinary floating-point rounding (not a malformed policy — that is
 * already excluded by validation) could otherwise hand `parseConfidence` a
 * value a hair outside `[0, 1]`. `parseConfidence` is called rather than a
 * bare brand-defeating cast to the `Confidence` type, because
 * `confidence.ts`'s own header reserves that particular shortcut for
 * `ZERO_CONFIDENCE` alone — every other `Confidence` this milestone
 * constructs goes through the real validator, same discipline
 * `brand-casts.test.ts` (lib/contracts) enforces for the three OTHER
 * branded types it scans for (that scan does not cover `Milliseconds` at
 * all — a gap in the frozen file this milestone does not own — but nothing
 * stops this file from holding itself to the same standard for
 * `Confidence`, which it does have a real validator for).
 */
function decayedConfidence(policy: HalfLifePolicy, recordedConfidence: Confidence, elapsedMs: Milliseconds): Confidence {
  const ratio = elapsedMs / policy.halfLifeMs;
  const factor = Math.pow(0.5, ratio);
  const raw = recordedConfidence * factor;
  const clamped = Math.min(recordedConfidence, Math.max(0, raw));
  const result = parseConfidence(clamped);
  // Belt-and-suspenders, not the primary defence any more (that is
  // validateHalfLifePolicy, above): fails closed rather than throws if
  // arithmetic ever produces something parseConfidence rejects, same
  // "never trust the arithmetic alone" discipline captured-at.ts's own
  // ageOf uses for clock skew.
  return result.ok ? result.value : ZERO_CONFIDENCE;
}

/**
 * Classifies an already-computed `confidence` against `policy`'s own
 * thresholds. `forgetFloor` is checked BEFORE `doubtedThreshold` —
 * `forgettable` is the more severe outcome. By the time this runs, the
 * policy has already passed `validateHalfLifePolicy` (so `forgetFloor <=
 * doubtedThreshold` is guaranteed) — the check-forgetFloor-first ORDER is
 * kept anyway as defence in depth, not because it is still load-bearing
 * for correctness.
 */
function classify(confidence: Confidence, policy: HalfLifePolicy): DecayStatus {
  if (confidence <= policy.forgetFloor) return "forgettable";
  if (confidence <= policy.doubtedThreshold) return "doubted";
  return "believed";
}

/**
 * The interpreter itself. See this file's header for the full argument on
 * shape, curve choice, status vocabulary, the clock-inconsistency branch,
 * and the malformed-policy branch.
 */
export function decay<TValue extends Json>(memory: Memory<TValue>, now: CapturedAt): DecayResult {
  const age = ageOf(memory.lastAffirmedAt, now);
  if (age.kind === "clock-inconsistency") {
    return { confidence: ZERO_CONFIDENCE, status: "doubted" };
  }
  if (memory.decayPolicy.kind === "never-decays") {
    // No side effect and no thresholds to cross by design (decay-policy.ts:
    // "this variant only opts a memory OUT of 'age-exceeded', never out of
    // forgetting altogether") — a never-decaying memory is always
    // `"believed"` from THIS function's point of view; contradiction,
    // scope-exit, and source-revocation (none of them decay's concern) are
    // the only ways such a memory ever stops being live.
    return { confidence: memory.confidence, status: "believed" };
  }
  if (validateHalfLifePolicy(memory.decayPolicy) !== null) {
    // Strictest verdict this file has — see the file header's "A MALFORMED
    // POLICY FAILS CLOSED TOO" paragraph for why this is deliberately
    // stricter than the clock-inconsistency branch above.
    return { confidence: ZERO_CONFIDENCE, status: "forgettable" };
  }
  const confidence = decayedConfidence(memory.decayPolicy, memory.confidence, age.ms);
  return { confidence, status: classify(confidence, memory.decayPolicy) };
}

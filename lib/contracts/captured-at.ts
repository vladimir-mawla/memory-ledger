/**
 * `CapturedAt`/`Age` — reused *thinking*, re-derived code, from decision-
 * engine's `lib/signals/time.ts` (per `memory-plan.md` §7: "CapturedAt/Age/
 * clock-inconsistency handling ... a signal (or memory) whose own
 * timestamp is in the future relative to `now` must never be treated as
 * fresh just because it happens to compare true today"). No line of this
 * file is copied from that one; the shape and the clock-skew argument are
 * independently re-authored here because `Memory.believedAt` and
 * `Memory.lastAffirmedAt` (memory.ts) need exactly the same guarantee a
 * `Signal.capturedAt` needed there, and there is no principled reason to
 * invent a weaker version of a fix this codebase's own sibling already
 * paid for once.
 *
 * WHY A FUTURE-DATED TIMESTAMP IS REJECTED OUTRIGHT, NOT TOLERATED WITH
 * SOME SLACK: `effectiveConfidence` (effective-confidence.ts) and, later,
 * M3's `decay()` both compute elapsed time as `now - lastAffirmedAt` (or
 * `now - believedAt`). If `lastAffirmedAt` were allowed to sit after `now`,
 * that subtraction goes negative — a memory would read as *younger than
 * zero*, i.e. impossibly, permanently fresh, no matter what decay policy
 * is attached to it. That is the one failure mode this file exists to make
 * unrepresentable: `parseCapturedAt` refuses to construct a `CapturedAt`
 * later than the `now` it is given, and `ageOf` treats an already-
 * constructed pair that is nonetheless inconsistent (e.g. a `now` reused
 * from before a later `lastAffirmedAt` was recorded) as its own explicit
 * outcome — `"clock-inconsistency"` — never as a negative `Milliseconds`.
 *
 * NOT A FULL FRESHNESS MODULE: this file stops at "how old is this, or is
 * the clock inconsistent" — it does not decide what counts as "too old"
 * (that is `DecayPolicy`'s job, decay-policy.ts) and it does not run any
 * decay curve (that is M3's `lib/decay/**`, a later, still-unbuilt
 * milestone). Keeping this file this narrow is deliberate: it is exactly
 * the slice of `lib/signals/time.ts`'s job that `Memory`'s own fields
 * (§6) need to exist and be honestly clock-checked, and nothing more.
 */
declare const capturedAtBrand: unique symbol;
export type CapturedAt = string & { readonly [capturedAtBrand]: "CapturedAt" };

export interface InvalidCapturedAt {
  readonly kind: "not-a-string" | "not-iso-8601" | "future-dated";
  readonly received: unknown;
}

export type CapturedAtResult =
  | { readonly ok: true; readonly value: CapturedAt }
  | { readonly ok: false; readonly error: InvalidCapturedAt };

// Deliberately strict, matching decision-engine's own re-derived rule: a
// full calendar date, a time, and an explicit UTC offset are required. A
// bare date or an offset-less timestamp (locale-ambiguous) is rejected
// rather than guessed at — this project has no use for "probably fine."
const ISO_8601_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Strict boundary constructor for `CapturedAt`. Takes the caller's own
 * `now` explicitly rather than reaching for `Date.now()` internally, for
 * the same reason decision-engine's `parseCapturedAt` does: it is what
 * keeps this function pure (same two inputs, same result, always) and what
 * makes the clock-skew rule testable against an injected, fixed `now`
 * instead of real wall-clock time racing the test.
 */
export function parseCapturedAt(value: unknown, now: CapturedAt): CapturedAtResult {
  if (typeof value !== "string") {
    return { ok: false, error: { kind: "not-a-string", received: value } };
  }
  if (!ISO_8601_INSTANT.test(value)) {
    return { ok: false, error: { kind: "not-iso-8601", received: value } };
  }
  const parsedMs = Date.parse(value);
  if (Number.isNaN(parsedMs)) {
    // Matches the regex shape but is not a real calendar instant (month 13,
    // day 32) — the regex only rules out ambiguous/incomplete shapes;
    // `Date.parse` is the actual calendar authority.
    return { ok: false, error: { kind: "not-iso-8601", received: value } };
  }
  const nowMs = Date.parse(now);
  if (parsedMs > nowMs) {
    return { ok: false, error: { kind: "future-dated", received: value } };
  }
  return { ok: true, value: value as CapturedAt };
}

/** The one real-clock touchpoint this file offers. Every other function here takes `now` explicitly and is otherwise pure — see the file header. */
export function systemNow(): CapturedAt {
  return new Date().toISOString() as CapturedAt;
}

declare const millisecondsBrand: unique symbol;
export type Milliseconds = number & { readonly [millisecondsBrand]: "Milliseconds" };

/**
 * How old `capturedAt` is, measured from `now`. Not a bare number: a
 * caller gets either a well-formed elapsed duration or an explicit
 * `"clock-inconsistency"` outcome — folding that inconsistency into "the
 * age is simply negative" would let a duration silently go negative, and
 * would let a caller half-check for it by accident (`age.ms < 0`, easy to
 * forget). See the file header for why this matters to `Memory` at all:
 * `effectiveConfidence` (effective-confidence.ts) fails closed to
 * `ZERO_CONFIDENCE` on exactly this outcome, never treating a nonsensical
 * clock reading as "fresh."
 */
export type Age = { readonly kind: "elapsed"; readonly ms: Milliseconds } | { readonly kind: "clock-inconsistency" };

export function ageOf(capturedAt: CapturedAt, now: CapturedAt): Age {
  const deltaMs = Date.parse(now) - Date.parse(capturedAt);
  if (deltaMs < 0) {
    return { kind: "clock-inconsistency" };
  }
  return { kind: "elapsed", ms: deltaMs as Milliseconds };
}

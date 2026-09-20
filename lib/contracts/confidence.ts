/**
 * `Confidence` — a probability, not an arbitrary number, meaningful only in
 * `[0, 1]`. Branding it means a raw number can't be handed to a `Memory`,
 * a `DecayPolicy` threshold, or a `BeliefAnswer` variant as its confidence
 * without first passing through `parseConfidence`, where the `[0, 1]`
 * boundary is actually enforced.
 *
 * This is the SAME shape decision-engine's own `lib/contracts/confidence.ts`
 * uses — re-derived independently in this file, not imported, per this
 * project's hard constraint (`memory-plan.md` §1/§7): the *pattern* of "a
 * probability deserves its own brand and its own boundary parser" is
 * reused thinking, the same way `CapturedAt` below reuses the *thinking*
 * behind decision-engine's `lib/signals/time.ts` without importing it.
 * `memory-ledger` runs standalone from a clean clone; this file has no
 * import from `decision-engine` anywhere in it.
 *
 * `ZERO_CONFIDENCE` is exported alongside the parser because it is the one
 * `Confidence` value this milestone's own code needs to construct WITHOUT
 * going through `parseConfidence` at a boundary — `effective-confidence.ts`
 * returns it for any tombstoned or clock-inconsistent record (see that
 * file's own comment), and `0` needs no validation to know it is in range.
 * Keeping it here, next to the brand's only other legitimate cast, is what
 * `__tests__/brand-casts.test.ts` checks for: every `as Confidence` in
 * `lib/` outside this file is a build failure.
 */
declare const confidenceBrand: unique symbol;
export type Confidence = number & { readonly [confidenceBrand]: "Confidence" };

export interface InvalidConfidence {
  readonly kind: "confidence-out-of-range" | "confidence-not-finite";
  readonly received: unknown;
}

export type ConfidenceResult =
  | { readonly ok: true; readonly value: Confidence }
  | { readonly ok: false; readonly error: InvalidConfidence };

export function parseConfidence(value: number): ConfidenceResult {
  if (!Number.isFinite(value)) {
    return { ok: false, error: { kind: "confidence-not-finite", received: value } };
  }
  if (value < 0 || value > 1) {
    return { ok: false, error: { kind: "confidence-out-of-range", received: value } };
  }
  return { ok: true, value: value as Confidence };
}

/** The one `Confidence` value this milestone constructs outside `parseConfidence` — see the file header for why `0` needs no validation. */
export const ZERO_CONFIDENCE: Confidence = 0 as Confidence;

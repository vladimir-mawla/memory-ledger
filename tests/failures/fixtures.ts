import type { CapturedAt } from "../../lib/contracts/captured-at.js";
import type { DecayPolicy } from "../../lib/contracts/decay-policy.js";
import { EMPTY_STORE, type StoreState } from "../../domains/personal-assistant/store.js";
import { DEFAULT_SCOPE, SUBJECT, type Predicate, type PredicateValueMap } from "../../domains/personal-assistant/vocabulary.js";
import { recordFact } from "../../domains/personal-assistant/store.js";
import type { FactInput } from "../../domains/personal-assistant/facts.js";

/**
 * Shared, minimal fixtures for `tests/failures/**` — mirrors every other
 * `__tests__/fixtures.ts` in this codebase's own "no shared test-fixture
 * package across directories" discipline (`memory-plan.md` §1): this file
 * is local to `tests/failures/`, re-authored rather than importing
 * `domains/personal-assistant/__tests__/fixtures.ts` or
 * `lib/store/__tests__/fixtures.ts` (both of which this milestone's own
 * freeze boundary — tests/failures (recursive) only — has no standing to
 * reach into anyway; a test-only file under any lib subdirectory's own
 * __tests__, or any domains subdirectory's own __tests__, is not part of
 * the frozen shipped surface, but this milestone's own scope is
 * tests/failures (recursive), not "any test directory," so this file
 * stays self-contained).
 */

export const T0: CapturedAt = "2026-06-01T00:00:00.000Z" as CapturedAt;

export function afterMs(base: CapturedAt, ms: number): CapturedAt {
  return new Date(Date.parse(base) + ms).toISOString() as CapturedAt;
}

export const ONE_DAY_MS = 86_400_000;
export const ONE_HOUR_MS = 3_600_000;

export { SUBJECT, DEFAULT_SCOPE };
export { EMPTY_STORE, type StoreState };

/** Thin wrapper over the real `recordFact` that throws on a construction failure — every literal this suite hardcodes is expected to be valid, the same "this is a bug in the test's own data, not a runtime condition" reasoning `domains/personal-assistant/timestamps.ts`'s own `mustCapturedAt` gives for throwing rather than returning a `Result`. */
export function record<P extends Predicate>(
  state: StoreState,
  predicate: P,
  value: PredicateValueMap[P],
  source: FactInput<P>["source"],
  believedAtRaw: string,
  confidenceRaw: number,
  now: CapturedAt,
  extra: { readonly decayPolicy?: DecayPolicy } = {},
) {
  const input: FactInput<P> = {
    predicate,
    value,
    source,
    believedAtRaw,
    confidenceRaw,
    utterance: `utterance for ${predicate} @ ${believedAtRaw}`,
    ...(extra.decayPolicy !== undefined ? { decayPolicy: extra.decayPolicy } : {}),
  };
  const outcome = recordFact(state, input, now);
  if (!outcome.ok) {
    throw new Error(`tests/failures fixture: unexpected construction failure: ${JSON.stringify(outcome.error)}`);
  }
  return outcome.result;
}

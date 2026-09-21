import { type CapturedAt, parseCapturedAt } from "../../lib/contracts/captured-at.js";

/**
 * `FAR_FUTURE` — the one sentinel `CapturedAt` this domain constructs via a
 * direct cast rather than `parseCapturedAt`, for the same reason
 * `lib/contracts/confidence.ts`'s own `ZERO_CONFIDENCE` is the one
 * `Confidence` it constructs that way: `parseCapturedAt(raw, asOf)`
 * rejects `raw` when it is LATER than `asOf` (`captured-at.ts`'s own
 * "future-dated" check) — so validating a fixed HISTORICAL literal needs
 * an `asOf` that is itself later still. This sentinel is that upper bound
 * for every timestamp this domain's demo corpus hardcodes
 * (`scripts/demo-memory.ts`'s own narrative runs entirely inside
 * 2026 — see that file's own `NARRATIVE_END`, which every one of its
 * literals is additionally checked against, a real, if coarse,
 * catch for a mistyped year). It is not a way of skipping validation —
 * every literal still goes through the real ISO-8601 grammar check and the
 * real not-later-than check; it simply has nothing earlier than itself to
 * be validated "not later than," the same base-case reasoning
 * `ZERO_CONFIDENCE`'s own header gives for needing one legitimate
 * unchecked construction.
 */
const FAR_FUTURE = "2099-01-01T00:00:00.000Z" as CapturedAt;

/**
 * `mustCapturedAt` — this domain's ONLY way to turn a raw ISO-8601 string
 * into a real `CapturedAt`. Deliberately NOT a brand-defeating `as
 * CapturedAt` cast for anything but the one sentinel above:
 * `lib/contracts/captured-at.ts` exports a real validator
 * (`parseCapturedAt`) for exactly this job, and using it here means every
 * fixed timestamp this domain's corpus hardcodes is proven well-formed AND
 * not later than whatever `asOf` the caller supplies (default
 * `FAR_FUTURE`, above; `scripts/demo-memory.ts` passes its own
 * `NARRATIVE_END` instead, for a real — if coarse — sanity bound on every
 * literal in its timeline).
 *
 * THROWS, RATHER THAN RETURNING A RESULT, ON PURPOSE: every timestamp this
 * function is ever called with in this domain is a HARDCODED LITERAL this
 * codebase itself wrote (the demo corpus, or a domain test fixture) —
 * never untrusted external input. A thrown error here is a bug in THIS
 * domain's own data, caught the moment the corpus is built, not a runtime
 * condition a caller needs to branch on. Contrast `facts.ts`'s
 * `toMemory`, which DOES return a `Result` for `confidence`/`believedAt`
 * validation — because a `FactInput` is meant to model the output of a
 * real (external, untrusted) parsing step, where "the input was
 * malformed" is a real, expected outcome a caller must handle, not a
 * coding mistake to crash on. This file is lower-level than that: a
 * construction helper for the corpus's own literals, and for `now`
 * anchors, not for arbitrary caller-supplied fact data.
 *
 * NOT A "TIME ONLY MOVES FORWARD" CHECK BETWEEN SUCCESSIVE STEPS —
 * disclosed plainly rather than oversold: `asOf` must be LATER than (or
 * equal to) `raw` for `parseCapturedAt` to accept it, so this function
 * cannot be used to assert "this step's `now` is after the previous
 * step's" (that would require the opposite inequality). That specific
 * ordering property — a new fact's `believedAt` strictly after the
 * candidate it might contend with — is instead enforced by
 * `contradict()` itself (ADR 0003, Decision 3), which every contended
 * write already goes through via `store.ts`'s `recordFact`.
 */
export function mustCapturedAt(raw: string, asOf: CapturedAt = FAR_FUTURE): CapturedAt {
  const result = parseCapturedAt(raw, asOf);
  if (!result.ok) {
    throw new Error(`mustCapturedAt: "${raw}" is not a valid CapturedAt as of ${asOf} (${result.error.kind}).`);
  }
  return result.value;
}

import type { Json } from "../../lib/contracts/json.js";
import type { Memory } from "../../lib/contracts/memory.js";
import type { Provenance } from "../../lib/contracts/provenance.js";
import type { Scope } from "../../lib/contracts/scope.js";
import type { DecayPolicy } from "../../lib/contracts/decay-policy.js";
import { type CapturedAt, type CapturedAtResult, parseCapturedAt } from "../../lib/contracts/captured-at.js";
import { type Confidence, type ConfidenceResult, parseConfidence } from "../../lib/contracts/confidence.js";
import type { MemoryId } from "../../lib/contracts/memory-id.js";
import { DEFAULT_SCOPE, type Predicate, type PredicateValueMap, SUBJECT } from "./vocabulary.js";

/**
 * `FactInput<P>` — this milestone's own "already parsed to typed `Memory`
 * candidates — no LLM inside `lib/`" requirement (`PLAN.md`'s M6 row),
 * made concrete. `FactInput` is what a (hypothetical, out-of-scope) real
 * NL-understanding front end would hand this domain AFTER doing its own
 * parsing — this file never touches raw English. `utterance` is the one
 * field that carries the original phrasing through anyway, not because
 * `toMemory` reads it (it does not — see below), but because
 * `baseline.ts`'s fair bag-of-words ranker needs the ACTUAL WORDS the user
 * used, and `memory-plan.md` §8's whole point is that a fair baseline and
 * this engine must be compared on the SAME two input facts. Carrying the
 * literal utterance on the `FactInput` (rather than threading it through a
 * side channel the demo script has to keep in sync by hand) is what makes
 * that "same facts" claim structural rather than a promise.
 */
export interface FactInput<P extends Predicate> {
  readonly predicate: P;
  readonly value: PredicateValueMap[P];
  readonly source: Provenance;
  /** Raw ISO-8601 instant — validated by `toMemory` via the real `parseCapturedAt`, never trusted directly. */
  readonly believedAtRaw: string;
  /** Raw `[0, 1]` fraction — validated by `toMemory` via the real `parseConfidence`, never trusted directly. */
  readonly confidenceRaw: number;
  readonly scope?: Scope;
  readonly decayPolicy?: DecayPolicy;
  /** The literal phrasing this fact came from — see this file's header. Not read by `toMemory`; read only by `baseline.ts` and the demo script's own transcript printing. */
  readonly utterance: string;
}

export type FactConstructionError =
  | { readonly field: "confidenceRaw"; readonly detail: ConfidenceResult & { readonly ok: false } }
  | { readonly field: "believedAtRaw"; readonly detail: CapturedAtResult & { readonly ok: false } };

export type FactConstructionResult<TValue extends Json> =
  | { readonly ok: true; readonly value: Memory<TValue> }
  | { readonly ok: false; readonly error: FactConstructionError };

/**
 * `toMemory` — the one function in this domain that assembles a real,
 * frozen `Memory<TValue>` out of a `FactInput`. It calls the REAL
 * validators (`parseConfidence`, `parseCapturedAt`) rather than trusting
 * `FactInput`'s raw fields or casting past the brand, and it FAILS CLOSED
 * — a `Result`, never a throw — because (per this file's header) a
 * `FactInput` is meant to model output from a real, untrusted parsing
 * step, where "the input didn't validate" is an expected outcome a caller
 * (the domain's `store.ts`, or eventually M8's UI) must be able to handle,
 * not a bug to crash on. Contrast `timestamps.ts`'s `mustCapturedAt`,
 * which throws — that helper is only ever used on this domain's OWN
 * hardcoded literals, never on a `FactInput`.
 *
 * Every field NOT explicitly named on `FactInput` is fixed by this
 * domain, never left to a caller: `subject` is always the one closed
 * `SUBJECT` (vocabulary.ts), `scope` defaults to `DEFAULT_SCOPE`,
 * `lastAffirmedAt` always equals the freshly-validated `believedAt` (a
 * `FactInput` describes a NEW fact, never a re-affirmation of an existing
 * one — this domain has no `affirm()`-equivalent; see store.ts's own
 * header for why "restate the same value from a better source" is instead
 * handled as an explicit `"superseded"` tombstone at the store layer, not
 * as an in-place field update here), and `status` always starts
 * `"believed"` — not a claim about the FINAL state a caller should trust
 * (nothing downstream in `lib/decay`/`lib/contradiction`/`lib/store` ever
 * reads `Memory.status` to decide anything — confirmed directly, `git
 * grep -n '\.status' lib/decay lib/contradiction lib/store` turns up only
 * `TombstonedMemory.status`/`DecayResult.status`/`ContradictionCheck`
 * outcome checks, never a read of a LIVE `Memory`'s own `status` field —
 * see this milestone's own build report for this finding stated plainly),
 * simply the only honest label a memory can carry the instant it is
 * created, before anything has had a chance to contradict or decay it.
 */
export function toMemory<P extends Predicate>(
  input: FactInput<P>,
  id: MemoryId,
  now: CapturedAt,
): FactConstructionResult<PredicateValueMap[P]> {
  const confidenceResult = parseConfidence(input.confidenceRaw);
  if (!confidenceResult.ok) {
    return { ok: false, error: { field: "confidenceRaw", detail: confidenceResult } };
  }
  const believedAtResult = parseCapturedAt(input.believedAtRaw, now);
  if (!believedAtResult.ok) {
    return { ok: false, error: { field: "believedAtRaw", detail: believedAtResult } };
  }
  const believedAt: CapturedAt = believedAtResult.value;
  const confidence: Confidence = confidenceResult.value;
  const memory: Memory<PredicateValueMap[P]> = {
    id,
    subject: SUBJECT,
    predicate: input.predicate,
    value: input.value,
    source: input.source,
    believedAt,
    lastAffirmedAt: believedAt,
    confidence,
    decayPolicy: input.decayPolicy ?? { kind: "never-decays" },
    scope: input.scope ?? DEFAULT_SCOPE,
    status: "believed",
  };
  return { ok: true, value: memory };
}

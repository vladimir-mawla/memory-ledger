import type { Provenance } from "../../lib/contracts/provenance.js";

/**
 * `domains/personal-assistant/provenance.ts` — answers, with real cases in
 * hand, the question ADR 0001 (`lib/contracts`, Decision 1) explicitly left
 * open: "seeing a real need for a `tierForKind` mapping is M4's or M6's
 * problem to surface with a real case, not M1's to guess at." M4 (ADR
 * 0003, Decision 6) found it never needed one — `contradict()` only ever
 * reads `Provenance.tier`, never `Provenance.kind`. This milestone is the
 * first real caller that CONSTRUCTS `Provenance` values at all, so it is
 * the one that finally has real cases to decide with.
 *
 * THE DECISION: NO GENERIC `tierForKind(kind: SourceKind): ConfidenceTier`
 * FUNCTION — two concrete, hardcoded constructors instead, and the
 * `counterparty`/`system` half of `SourceKind` deliberately left untouched.
 *
 * This domain's real corpus (`scripts/demo-memory.ts`) only ever
 * constructs TWO of `SourceKind`'s four members:
 *   - `human`   — the user directly telling the assistant something about
 *                 themselves ("my shipping address is...", "I'm in
 *                 Denver"). Always `"direct-avowal"` — there is no
 *                 first-person self-report in this corpus that ISN'T a
 *                 direct avowal; `memory-plan.md` §5.1's own worked
 *                 example makes exactly this mapping, unconditionally.
 *   - `derived` — a value computed/parsed rather than stated: this
 *                 domain's own real cases are an app inferring "current
 *                 city" from calendar/contacts data, and a calendar
 *                 integration computing a meeting location. Always
 *                 `"derived-inference"` — same reasoning, mirrored: §5.1's
 *                 own OCR-scan example is exactly this shape.
 *
 * For BOTH of those two kinds, the mapping is not a judgment call this
 * file is making up — it is the plan's own worked contrast, applied
 * directly, with zero ambiguity. THAT is what makes `tierForKind` "obvious
 * enough to encode" for these two cases specifically, unlike M1's own
 * finding that guessing all four was unauthorized speculation.
 *
 * `counterparty` and `system` are NOT given constructors here, and this is
 * the answer to the ADR's own question, not a gap this file forgot to
 * close: this domain's real corpus has NO case that is a claim from
 * someone OTHER than the subject (`counterparty`), and no case that is a
 * bare internal system observation with no inference step (`system` —
 * every automated fact this corpus has IS an inference, hence `derived`,
 * not a raw system timestamp). Writing `tierForKind` as a full four-way
 * `Record<SourceKind, ConfidenceTier>` would force a guess for the two
 * members this domain has never actually needed to construct — the exact
 * mistake ADR 0001 already refused to make for the same reason. A
 * `counterparty`/`system` mapping stays exactly as open as it was after
 * M1: undecided, because still nobody has a real case for it. Whoever
 * builds the next domain (M9's README already discloses which two
 * candidate domains were not built) is the next milestone with standing to
 * decide it.
 */

/** A first-person avowal from the person the memory is about. Always `"direct-avowal"` tier — see file header. `revocable` defaults to `false`: a human telling the assistant something directly has no "integration" to disconnect. */
export function humanAvowal(sourceId: string, opts: { readonly revocable?: boolean } = {}): Provenance {
  return { kind: "human", sourceId, tier: "direct-avowal", revocable: opts.revocable ?? false };
}

/** A value computed or parsed rather than stated outright. Always `"derived-inference"` tier — see file header. `revocable` defaults to `true`: every real case in this domain's corpus for a `derived` source IS an integration (a calendar sync, a contacts sync) that can genuinely be disconnected — unlike `humanAvowal`, where the default direction is the other way. A caller with a `derived` source that is NOT revocable (there is no real case for one in this corpus) can still override it explicitly. */
export function derivedInference(sourceId: string, opts: { readonly revocable?: boolean } = {}): Provenance {
  return { kind: "derived", sourceId, tier: "derived-inference", revocable: opts.revocable ?? true };
}

/**
 * `Provenance` — "where did this claim come from," reused *conceptually*
 * from decision-engine's `Signal` provenance discipline (`memory-plan.md`
 * §7: "the closed `Provenance` vocabulary and the trust-boundary
 * discipline around it — never trust a raw string for 'where did this
 * come from'"), re-derived here with this project's own vocabulary rather
 * than imported.
 *
 * `SourceKind` — four closed members, matching §3/§6 exactly:
 *   - `human`         — a first-person avowal from the person the memory
 *                        is about ("my shipping address is ...").
 *   - `counterparty`  — an avowal from someone else *about* the subject
 *                        (a support rep's own note about a customer).
 *   - `system`         — an internal system's own observation (a login
 *                        timestamp, a computed aggregate).
 *   - `derived`         — inferred rather than stated: parsed from
 *                          unstructured text, computed from other
 *                          memories, OCR'd from a document.
 * Never an open `string`: `memory-plan.md` §5.1's whole `superseded`-vs-
 * `disputed` mechanism depends on `tier` (below) being decided by a fixed,
 * reviewable table keyed on this vocabulary, not on whatever string a
 * future caller happens to type.
 *
 * `ConfidenceTier` — deliberately TWO members, not the four one might
 * expect to mirror `SourceKind` one-for-one. `memory-plan.md` §5.1's own
 * worked contrast only ever needs to distinguish two things: a "direct,
 * first-person, current-state avowal" (a `human` avowal is the plan's own
 * example) from a "derived inference" (its own OCR-scan example). Adding a
 * third or fourth tier now, for `system`/`counterparty` sources the plan
 * never worked an example for, would be exactly the "speculative
 * flexibility nobody asked for" the house rules warn against — seeing a
 * real need for a `system`-only tier is M4's (the contradiction engine) or
 * M6's (the domain adapter) problem to surface with a real case, not this
 * milestone's to guess at.
 *
 * `tier` IS A PLAIN, CALLER-SUPPLIED FIELD, NOT DERIVED FROM `kind` BY A
 * FUNCTION IN THIS FILE — the one deliberate omission in this file, spelled
 * out because a reviewer will look for it. `memory-plan.md` §5.1 says the
 * tier is "fixed by the source kind at the moment a memory is created,"
 * which reads like it wants a `tierForKind(kind): ConfidenceTier` mapping
 * function. That function was considered and rejected for THIS milestone:
 * deciding which `SourceKind`s map to which `ConfidenceTier` (is
 * `counterparty` always `direct-avowal`? Always `derived-inference`?
 * Something else depending on context the plan never specifies) is a
 * judgment call the plan itself never argues for beyond its one `human` vs
 * `derived` worked example — encoding a guessed four-way mapping table
 * into a FROZEN M1 file, on no stated authority, is a worse mistake than
 * leaving the decision to whoever constructs a `Provenance` (M6's domain
 * adapter, or M4 if it needs a default) with a real case in front of them.
 * `tier` stays a required field a caller must state explicitly; nothing in
 * `lib/contracts` infers it silently.
 *
 * `sourceId` — a stable identifier for the issuing source itself (e.g.
 * `"user:vlad"`, `"ocr-scanner:v2"`), not the memory. `memory-plan.md`
 * §5.3 requires that "when a source is revoked, every live memory it
 * produced is immediately forget(...)'d" — that requires some way to ask
 * "which memories came from this same source," which requires the source
 * itself to have an identity distinct from any one memory's `id`.
 *
 * `revocable` — whether this source's memories must be tombstoned if the
 * source is later revoked (§5.3). The actual revocation registry/check
 * ("is `sourceId` X currently revoked, as of `now`") is NOT this file's
 * job — it is necessarily a STORE-LEVEL, time-varying fact (a source can
 * be revoked at any later moment, long after a `Memory` referencing it was
 * already constructed and frozen), and `memory-plan.md`'s own house rule
 * ("model every value as data, never a closure") rules out embedding a
 * live "check now" function on this immutable type. `revocable` only
 * records that THIS source is the *kind* of thing revocation applies to at
 * all.
 *
 * AMENDMENT (M6, `.genesis/decisions/0005-domain.md`): the paragraph
 * originally here asserted, as settled fact, that "M5's `lib/store/**`
 * owns the actual revocation registry and the `forget(...,
 * "source-revoked", now)` mechanism that reads it." That was WRONG, not
 * merely premature: M5 (`.genesis/decisions/0004-store.md`) built
 * `forget()`'s own mechanism only — no registry exists anywhere in
 * `lib/store/**`, confirmed directly (`git grep -n "revoke" lib/store`
 * turns up nothing outside `ForgetReason`'s own literal). This file could
 * not have foreseen that at M1, since no store existed yet to check
 * against. **What actually happened:** no registry was ever built, at any
 * layer. `domains/personal-assistant/store.ts`'s `revokeSource` (M6) is a
 * plain filter over currently-tracked live memories sharing a
 * `sourceId`, restricted to those with `revocable: true` — the identical,
 * no-registry shape M5 itself already established for `scope-exited`
 * (`forget(memory, "scope-exited", now)` as "a plain, direct call", per
 * `0004-store.md`, Decision 5). A real revocation-checking registry, if
 * one is ever genuinely needed, remains undecided and belongs to whichever
 * future caller has a concrete case for one.
 */
export type SourceKind = "human" | "counterparty" | "system" | "derived";

export type ConfidenceTier = "direct-avowal" | "derived-inference";

export interface Provenance {
  readonly kind: SourceKind;
  readonly sourceId: string;
  readonly tier: ConfidenceTier;
  readonly revocable: boolean;
}

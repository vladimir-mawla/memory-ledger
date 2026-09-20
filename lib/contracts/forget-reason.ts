/**
 * `ForgetReason` — the closed enum naming WHY something stopped being
 * believed. `memory-plan.md` §4: "A memory that never gets tombstoned has
 * no mechanic to demo — this plan makes tombstoning mandatory, not
 * optional," and every tombstone must carry exactly one of these five,
 * never free text:
 *
 *   - `"age-exceeded"`     — `decay()` (M3, unbuilt) crossed the store's
 *                            configured floor (`DecayPolicy.forgetFloor`,
 *                            decay-policy.ts).
 *   - `"contradicted"`     — a newer memory of the same `(subject,
 *                            predicate, scope)` disagreed and won (§5.1,
 *                            M4's job).
 *   - `"superseded"`       — an explicit, non-contradicting replacement
 *                            (§5.1's `superseded` outcome — same value,
 *                            refreshed/re-confirmed source).
 *   - `"scope-exited"`     — the bounded context this memory lived in
 *                            closed (account deleted, session ended) —
 *                            independent of confidence or age.
 *   - `"source-revoked"`   — the issuing source was later revoked (§5.3,
 *                            reusing revocation *thinking* from
 *                            agent-trust-layer, re-derived independently,
 *                            not imported).
 *
 * WHY A UNION OF STRING LITERALS, NOT A `class`/`enum` OR AN OPEN
 * `string`: a TypeScript `string` union is exhaustively checkable by
 * `tsc` (an unhandled member in a `switch` is a real compile error at the
 * point a `default` branch narrows to something other than `never` — see
 * `__tests__/forget-reason.test.ts`) and is trivially `Json`-safe
 * (json.ts) for embedding in a `Tombstone` (tombstone.ts) that must itself
 * be plain, serializable data. An open `string` field would let a future
 * caller write `reason: "purged"` or `reason: "the user asked nicely"` —
 * exactly the free-text escape hatch this type exists to close off. No
 * `assertNeverForgetReason` helper is exported here: `Tombstone`
 * (tombstone.ts) is a two-branch discriminated union keyed on a SUBSET of
 * these five reasons in each branch (see that file's own header), so the
 * exhaustiveness proof that matters for THIS milestone lives on
 * `Tombstone`'s own two branches, not on a bare switch over all five
 * reason strings that nothing in this milestone yet consumes.
 */
export type ForgetReason = "age-exceeded" | "contradicted" | "superseded" | "scope-exited" | "source-revoked";

/** Every legal `ForgetReason`, for tests that need to enumerate the closed set (e.g. proving all five are pairwise distinct, or that this list's length tracks the type's own member count). Not used by any production code in this milestone — the forgetting engine that would iterate this is M5's, unbuilt. */
export const ALL_FORGET_REASONS: readonly ForgetReason[] = [
  "age-exceeded",
  "contradicted",
  "superseded",
  "scope-exited",
  "source-revoked",
];

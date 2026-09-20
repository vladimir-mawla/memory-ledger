/**
 * `Scope` — the bounded context a memory applies within, as a typed
 * ordered set, never a single string tag. `memory-plan.md` §3: "an ordered
 * set of bounded contexts ('account:acme-corp', 'user:vlad'), compared by
 * exact set containment, never by substring or fuzzy match. A query's
 * scope must be a superset match against a memory's scope for the memory
 * to be eligible at all — this is checked *before* freshness, confidence,
 * or contradiction" (mirroring agent-trust-layer's "cheapest/most-
 * structural check first" ordering discipline, reused conceptually, not
 * imported).
 *
 * WHY A SET OF `{ dimension, value }` PAIRS, NOT A SINGLE STRING: a bare
 * `scope: string` (`"user:vlad"`) cannot express a memory that lives in
 * TWO independent bounded contexts at once (an account AND a user within
 * it) without inventing an ad hoc concatenation grammar that some later
 * caller inevitably needs to parse back apart. `{ dimension: "account",
 * value: "acme-corp" }` keeps "which axis" and "which value on that axis"
 * as two separate, directly comparable fields — no string-splitting, no
 * parsing, no ambiguity about where one dimension's value ends and the
 * next dimension's name begins.
 *
 * WHY EXACT CONTAINMENT, NEVER SUBSTRING OR FUZZY MATCH: this is the
 * single sharpest structural difference this project draws against plain
 * retrieval (`memory-plan.md` §2's whole argument). A vector index has no
 * notion of "this chunk is categorically ineligible for this query" —
 * everything is ranked, nothing is refused outright. `scopeIsSupersetOf`
 * below is a hard boolean gate checked BEFORE any confidence or
 * contradiction reasoning runs: a memory scoped only to `"user:vlad"` is
 * not a candidate for a query scoped to `"user:sam"`, full stop, never a
 * low-similarity match that could still surface. `entriesEqual` uses exact
 * string equality on both `dimension` and `value` — no case-folding, no
 * prefix matching, no "close enough."
 *
 * `Scope` IS AN ARRAY, NOT A `Set` OR A `Map`: `Set`/`Map` are not `Json`
 * (json.ts) — they cannot be `Memory.scope`'s type without breaking the
 * "value is plain, serializable data" guarantee this whole directory
 * enforces for everything a `Memory` carries, scope included. An array of
 * plain `{ dimension, value }` records serializes, compares, and
 * fingerprints exactly like everything else `Memory` holds.
 *
 * `scopeIsSupersetOf` and `scopeEntryEquals` are included in THIS
 * milestone (not deferred to M5/M6) because they are the one piece of
 * behavior the `Scope` TYPE cannot honestly be said to mean anything
 * without: `memory-plan.md`'s own text defines the type entirely in terms
 * of how it compares ("compared by exact set containment"), so leaving
 * that comparison unwritten would leave the type's own definition
 * unproven. This is NOT the query engine (M5) — it is the one total, pure,
 * comparison-only function the type's stated meaning depends on, the same
 * category of thing `isPlainData` is to `Json` (json.ts) and `parseConfidence`
 * is to `Confidence` (confidence.ts) — a boundary function owned by the
 * type it belongs to, not a piece of the forgetting/query engine that
 * consumes it.
 */
export interface ScopeEntry {
  readonly dimension: string;
  readonly value: string;
}

export type Scope = readonly ScopeEntry[];

function scopeEntryEquals(a: ScopeEntry, b: ScopeEntry): boolean {
  return a.dimension === b.dimension && a.value === b.value;
}

/**
 * True iff every entry in `narrower` is present, exactly, in `broader` —
 * the "query scope is a superset match against a memory's scope" rule
 * (file header). Order-independent (a `Scope` is a SET of bounded
 * contexts, not a sequence one entry must precede another in) and
 * duplicate-independent (a repeated entry in either array changes
 * nothing). An empty `narrower` is trivially a subset of anything,
 * including an empty `broader` — a memory scoped to nothing at all is
 * eligible for a query scoped to nothing at all, and for every query,
 * which is the correct reading of "no bounded context restricts this."
 */
export function scopeIsSupersetOf(broader: Scope, narrower: Scope): boolean {
  return narrower.every((need) => broader.some((have) => scopeEntryEquals(have, need)));
}

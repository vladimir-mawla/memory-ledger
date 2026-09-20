/**
 * `TombstoneId` — the same discipline as `MemoryId` (see `memory-id.ts`
 * for the full reasoning: branded so it can't be confused with any other
 * string-shaped identity in this directory, no parser because there is no
 * invariant beyond "is a string" to check, one cast, kept inside this
 * file only).
 *
 * Split into its own file for the same reason `memory-id.ts` is: `Tombstone`
 * (tombstone.ts) needs this brand, and nothing about it depends on
 * `Memory`/`MemoryId` — keeping every brand in its own leaf file means no
 * file in this directory ever has to import a brand it doesn't itself use,
 * and the dependency graph among these small files stays a fan-out from
 * leaves, never a cycle.
 */
declare const tombstoneIdBrand: unique symbol;
export type TombstoneId = string & { readonly [tombstoneIdBrand]: "TombstoneId" };

/** The one blessed way to mint a `TombstoneId` from a plain string — see `memoryId` (memory-id.ts) for why there is no validating parser here. */
export function tombstoneId(raw: string): TombstoneId {
  return raw as TombstoneId;
}

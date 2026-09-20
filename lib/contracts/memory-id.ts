/**
 * `MemoryId` — a branded identity, never a derived/structural key. This
 * file exists on its own (rather than living inside `memory.ts`) purely to
 * avoid a real import cycle: `tombstone.ts` needs `MemoryId` (a
 * `Tombstone.memoryId` names exactly which memory it forgot) and
 * `memory.ts` needs `Tombstone` (a `TombstonedMemory` carries the
 * tombstone that killed it) — both cannot import from each other's own
 * file. Splitting the one brand both sides need into its own leaf file is
 * the same fix decision-engine's own `lib/contracts` uses for
 * `action.ts`/`confidence.ts` as independent leaves under `decision.ts`.
 *
 * WHY BRANDED, NOT A BARE `string`: M1's own success criterion (plan §11,
 * M1) requires a test proving "two `Memory` values that differ only in
 * `id` prove equality is never structural — `id` is load-bearing." A bare
 * `string` field would still make that test pass today, but branding earns
 * its keep the same way `Confidence`/`CapturedAt` do elsewhere in this
 * directory: it stops an arbitrary string (a subject name, a predicate, a
 * tombstone id) from being handed to a parameter that expects a `MemoryId`
 * by accident, at every call site from M4 onward — a mistake that would be
 * silent and structurally valid if `MemoryId` were just `string`.
 *
 * NO `parseMemoryId` HERE, DELIBERATELY: unlike `Confidence` or
 * `CapturedAt`, a `MemoryId` has no invariant to validate beyond "is a
 * string" — it is an opaque identity token (a UUID, a ULID, whatever the
 * eventual store generates), not a value with a numeric range or a
 * calendar grammar. Adding a parser with nothing to check would be
 * validation theater. The one cast this brand needs (`as MemoryId`) lives
 * here, in this file, and nowhere else — see
 * `__tests__/brand-casts.test.ts`, which greps `lib/` for exactly that and
 * fails the build if a cast escapes to a second file.
 */
declare const memoryIdBrand: unique symbol;
export type MemoryId = string & { readonly [memoryIdBrand]: "MemoryId" };

/**
 * The one blessed way to mint a `MemoryId` from a plain string. Whoever
 * eventually builds the store (M5/M6) owns *how* the string is generated
 * (uuid, ulid, a content hash — out of scope for this milestone); this
 * function only owns the brand. Real generation strategy is deliberately
 * not decided here — deciding it now, before a store exists to consume it,
 * would be exactly the kind of speculative flexibility the house rules
 * warn against.
 */
export function memoryId(raw: string): MemoryId {
  return raw as MemoryId;
}

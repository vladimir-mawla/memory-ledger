import { type MemoryId, memoryId } from "../../lib/contracts/memory-id.js";
import type { CapturedAt } from "../../lib/contracts/captured-at.js";
import type { Predicate } from "./vocabulary.js";

/**
 * `mintMemoryId` — `memory-id.ts`'s own header (lib/contracts) leaves
 * generation entirely to whoever eventually builds a store: "a UUID, a
 * ULID, whatever the eventual store generates." This domain is that
 * store. Deliberately mirrors `lib/store/forget.ts`'s own
 * `mintTombstoneId` — `Math.random`/`Date`, no `node:crypto` import — not
 * because this file is bound by `lib/store/__tests__/architecture.test.ts`
 * (it scans `lib/store/**` only, not `domains/**`), but because a
 * `MemoryId` has the identical "opaque audit-trail identity, no invariant
 * beyond 'is a string'" nature `TombstoneId` has (memory-id.ts's own
 * header: no format is specified), so there is no reason to reach for a
 * heavier mechanism here than `forget.ts` already found sufficient for
 * the same job one layer over. Seeded with `subject:predicate:believedAt`
 * for traceability plus a random suffix for uniqueness, the same shape
 * `mintTombstoneId` uses.
 */
export function mintMemoryId(predicate: Predicate, believedAt: CapturedAt): MemoryId {
  const random = Math.random().toString(36).slice(2, 10);
  return memoryId(`memory:${predicate}:${believedAt}:${random}`);
}

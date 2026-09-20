import type { Json } from "./json.js";
import type { MemoryId } from "./memory-id.js";
import type { Provenance } from "./provenance.js";
import type { CapturedAt } from "./captured-at.js";
import type { Confidence } from "./confidence.js";
import type { DecayPolicy } from "./decay-policy.js";
import type { Scope } from "./scope.js";

/**
 * `MemoryCore<TValue>` — the fields `Memory` (memory.ts) and
 * `TombstonedMemory` (tombstoned-memory.ts) share, factored into its own
 * file so neither of those two files has to import the other. Not exported
 * from `index.ts`'s public barrel: it is an implementation seam, not a
 * type either the plan or a consumer ever names on its own — a caller
 * always holds a `Memory<TValue>` or a `TombstonedMemory<TValue>`, never a
 * bare `MemoryCore<TValue>`.
 *
 * WHY THIS FILE EXISTS AT ALL (the split that keeps `memory.ts` and
 * `tombstoned-memory.ts` from cycling): a `TombstonedMemory` carries the
 * `Tombstone` that killed it (tombstoned-memory.ts imports tombstone.ts),
 * and a `Tombstone` names the `MemoryId` it forgot (tombstone.ts imports
 * memory-id.ts) — neither of those files needs anything from `memory.ts`
 * itself. Both `Memory` and `TombstonedMemory` extend this file's fields
 * and add their own `status` discriminant on top; this file is the one
 * place all ten shared fields are declared, so `memory.ts` and
 * `tombstoned-memory.ts` cannot drift apart on what a memory's content
 * actually consists of.
 *
 * `TValue extends Json` (json.ts) is enforced here, once, for both
 * consumers — see json.ts's own header for why `value` can never be a
 * function/closure.
 */
export interface MemoryCore<TValue extends Json> {
  readonly id: MemoryId;
  /** The entity this claim is about — e.g. `"user:vlad.shipping-address"`. Deliberately a plain `string`, not a closed union: naming the real subjects a store will ever see is a domain concern (M6), not this milestone's. */
  readonly subject: string;
  /** The closed vocabulary of what's being asserted about `subject`, matched by exact string equality — same discipline decision-engine's `Signal.kind` uses. Kept `string` here for the same reason `subject` is: the actual closed vocabulary of predicates is a domain's (M6's) to name. */
  readonly predicate: string;
  /** Plain, serializable data only — see json.ts. Never a function/closure. */
  readonly value: TValue;
  /** Where this claim came from — see provenance.ts. */
  readonly source: Provenance;
  /** When this specific claim was first accepted. Immutable — an `affirm()` (M5, unbuilt) never rewrites this; it produces a brand-new `Memory` whose OWN `believedAt` is the affirmation's own moment. */
  readonly believedAt: CapturedAt;
  /** Last time evidence re-confirmed this claim. May equal `believedAt` (never affirmed since creation). Also immutable on any one `Memory`/`TombstonedMemory` value — see memory.ts's header for what "immutable, append-only" means for this type as a whole. */
  readonly lastAffirmedAt: CapturedAt;
  /** The confidence RECORDED at creation/affirmation time. Never rewritten afterward — see memory.ts's header and effective-confidence.ts for why this is deliberately distinct from what a query reports. */
  readonly confidence: Confidence;
  /** How confidence degrades with age — data an interpreter (M3, unbuilt) evaluates, never a function. See decay-policy.ts. */
  readonly decayPolicy: DecayPolicy;
  /** The bounded context(s) this claim applies within — see scope.ts. */
  readonly scope: Scope;
}

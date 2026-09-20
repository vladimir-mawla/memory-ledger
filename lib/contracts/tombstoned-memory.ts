import type { Json } from "./json.js";
import type { MemoryCore } from "./memory-core.js";
import type { Tombstone } from "./tombstone.js";

/**
 * `TombstonedMemory<TValue>` — the third state `memory-plan.md` §2 argues
 * plain retrieval cannot represent at all: "there is no typed state
 * between 'present' and 'absent' for something that was once believed and
 * is now known wrong." A tombstoned record is neither a live `Memory`
 * (memory.ts) nor simply gone — it retains every field a live memory had
 * (so "prove what you believed at time T" — §3 — stays answerable
 * forever) plus the `Tombstone` that explains why it stopped being
 * retrievable as belief.
 *
 * STRUCTURALLY DISTINCT FROM `Memory`, ON PURPOSE — this is the type half
 * of M1's own success criterion ("the live-query function must be
 * structurally unable to accept a tombstoned memory... compile-time
 * refusal, not a runtime check"). `TombstonedMemory.status` is the single
 * literal `"tombstoned"`, which is NOT a member of `Memory.status`'s
 * three-value union (`"believed" | "doubted" | "disputed"` — see
 * memory.ts's own header for why that union was narrowed from the plan's
 * literal four-value sketch specifically to make this refusal possible).
 * Any function typed to accept `Memory<TValue>` (or `ReadonlyArray<Memory
 * <TValue>>`) therefore cannot accept a `TombstonedMemory<TValue>` value —
 * not because of a runtime guard, but because no valid `TombstonedMemory`
 * satisfies `Memory`'s own type. See
 * `__tests__/live-query-refusal.test.ts` for the `@ts-expect-error` proof
 * against a representative stand-in for M5's real `BeliefQuery` function
 * (M5 owns the actual signature; this milestone only proves the refusal
 * property is available given these two types' shapes).
 *
 * `tombstone: Tombstone` — every `TombstonedMemory` carries the exact
 * record that killed it, inline, so a caller holding one never has to go
 * looking for the matching `Tombstone` elsewhere. This is the second half
 * of §4's "proof-of-forgetting" requirement made structural: a
 * `TombstonedMemory` cannot exist without a reason attached to it, because
 * `Tombstone` itself has no field that could be omitted here (this field
 * is required, not optional).
 *
 * NOT PARAMETERIZED DIFFERENTLY FROM `Memory<TValue>` — both extend the
 * same `MemoryCore<TValue>` (memory-core.ts), so a `TombstonedMemory<Json>`
 * and the `Memory<Json>` it was built from carry byte-for-byte the same
 * `subject`/`predicate`/`value`/`source`/timestamps/`confidence`/
 * `decayPolicy`/`scope` — tombstoning changes what a QUERY may report
 * about a memory, never the memory's own recorded content (§3's
 * `confidence` vs. `effectiveConfidence` distinction, effective-confidence.ts,
 * is the same principle applied to one specific field).
 */
export interface TombstonedMemory<TValue extends Json = Json> extends MemoryCore<TValue> {
  readonly status: "tombstoned";
  readonly tombstone: Tombstone;
}

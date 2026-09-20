import type { Json } from "./json.js";
import type { MemoryCore } from "./memory-core.js";

/**
 * `Memory<TValue>` — the belief record. `memory-plan.md` §3: "A memory is
 * not a chunk of text with fields attached. It is a typed, comparable
 * claim." This is one of this milestone's four irreducible types.
 *
 * `status: "believed" | "doubted" | "disputed"` — THREE MEMBERS, NOT THE
 * FOUR `memory-plan.md` §3's OWN LITERAL SKETCH LISTS. This is a
 * deliberate, verified correction to the plan, recorded here and in full
 * in `.genesis/decisions/0001-contracts.md` (Decision 2) — not silently
 * "fixed" without a trace. §3's sketch writes `status: "believed" |
 * "doubted" | "disputed" | "tombstoned"`, all four sharing one type. But
 * M1's OWN success criterion (`memory-plan.md` §11, M1, and restated for
 * M5) requires: "the live-query function's parameter type refuses a
 * `TombstonedMemory` at compile time" — a COMPILE-TIME refusal, not a
 * runtime `if (memory.status !== "tombstoned")`. If tombstoning were just
 * a fourth value of THIS type's own `status` field, that refusal would be
 * unenforceable: a live-query function typed to accept `Memory<TValue>`
 * would structurally have to accept ANY object satisfying that interface,
 * including one whose `status` happens to be `"tombstoned"` — the object
 * literal would still be a perfectly well-formed `Memory<TValue>`, and
 * TypeScript has no way to reject "a `Memory` whose `status` field holds
 * one particular string value" without either a value-level runtime check
 * (exactly what the plan rules out) or moving that one status into ITS
 * OWN, structurally distinct type. So tombstoning is a `TombstonedMemory`
 * (tombstoned-memory.ts) — a different type, not a different status value
 * of this one — and `status` here is narrowed to the three values a LIVE
 * memory can actually hold. `TombstonedMemory.status` is `"tombstoned"`,
 * a value NOT in this union, which is exactly what makes a `TombstonedMemory`
 * fail to satisfy `Memory<TValue>` structurally — see
 * `__tests__/live-query-refusal.test.ts` for the compile-time proof this
 * correction makes possible.
 *
 * IMMUTABLE, APPEND-ONLY — NEVER EDITED IN PLACE. `memory-plan.md` §3:
 * "an editable `Memory.value` would make 'prove what you believed at time
 * T' impossible to answer honestly." Enforced as far as TypeScript allows:
 * every field on `MemoryCore`/`Memory` is `readonly`, and this file
 * exports NO mutator — no `setValue`, no `affirm` (that verb belongs to
 * M5's `lib/store/**`, and even there it returns a brand-new `Memory`,
 * never mutates the one passed in, per §3's own "legal operations" list).
 * `__tests__/memory.test.ts` proves `memory.value = ...` and
 * `memory.status = ...` both fail to compile. What `readonly` CANNOT stop
 * — a caller reaching for `as any` or mutating a NESTED field one level
 * down (`memory.source.revocable = false`, since `Provenance`'s own
 * fields are independently `readonly` but nothing here deep-freezes a
 * constructed value at runtime) — is a stated, disclosed limitation of
 * this milestone, not a gap papered over: this file constructs no values
 * on anyone's behalf (unlike, say, shadow-run's `makeWorld`, which deep-
 * freezes its input), because M1 defines no `Memory`-constructing API at
 * all — that belongs to whichever later milestone (M5/M6) actually builds
 * one, and is exactly the kind of speculative flexibility ("let's add a
 * constructor nobody asked for yet") the house rules warn against adding
 * ahead of a real caller.
 *
 * `id` IS LOAD-BEARING, NOT DERIVABLE FROM CONTENT — equality between two
 * `Memory` values is NEVER structural (§3's "immutable, append-only"
 * design: two memories with identical `subject`/`predicate`/`value` but
 * different `id`s are two DIFFERENT affirmations of the same fact, not one
 * record accidentally duplicated). `__tests__/memory.test.ts` proves this
 * directly with two otherwise-identical memories differing only in `id`.
 */
export interface Memory<TValue extends Json = Json> extends MemoryCore<TValue> {
  readonly status: "believed" | "doubted" | "disputed";
}

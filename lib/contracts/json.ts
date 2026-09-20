/**
 * `Json` / `isPlainData` — the plain-data constraint `Memory<TValue>.value`
 * (memory.ts) is pinned to. Re-derived independently for this project's own
 * concern (a *belief's value*, not shadow-run's `World.data`) — the
 * *pattern* of "constrain the type parameter to a recursive Json union,
 * then back it with a runtime walk because a cast defeats the type
 * system" is shared verification discipline across this account's
 * projects, never a shared package (`memory-plan.md` §1's hard
 * constraint).
 *
 * WHY `Memory.value` MUST BE PLAIN, SERIALIZABLE DATA — NO FUNCTIONS, EVER.
 * This is M1's own explicit success criterion, and the reason is sharper
 * here than "clean code": `memory-plan.md` §5 requires `contradict(older,
 * newer)` (M4, unbuilt) to compare two memories' `value`s by a closed,
 * typed, fail-closed comparison — and a comparison against a function
 * value has no honest answer (functions are never `equals`-comparable by
 * content, only by reference or by `toString()`-scraping, neither of which
 * this project's own house rules will accept — see the ADR's citation of
 * shadow-run's `Rollback` decision for the identical argument one layer
 * over). A `Memory<TValue>` whose `value` could hold a closure would make
 * `contradict` either silently wrong or unable to run at all, for a type
 * this milestone freezes before M4 exists to discover the problem.
 *
 * ENFORCED TWO WAYS, BECAUSE TYPESCRIPT'S STRUCTURAL TYPING CANNOT CLOSE
 * THIS GAP ALONE:
 *
 *   1. Type-level: `TValue` is constrained to `Json` everywhere it appears
 *      (`Memory<TValue extends Json>`, `TombstonedMemory<TValue extends
 *      Json>`) — a `Memory<{ onRecall: () => void }>` does not compile
 *      (`__tests__/memory.test.ts` proves it).
 *   2. Runtime: `isPlainData`/`assertPlainData` walk an actual value and
 *      reject a function, a symbol-keyed property, a `Date`/`Map`/`Set`,
 *      an accessor property, or a circular reference — everything a
 *      deliberate `as Json` cast (which type-level constraints cannot
 *      stop) or an object-literal getter (which TypeScript types by its
 *      RETURN value, needing no cast at all — `{ get x() { return 1; } }`
 *      satisfies `Json` cleanly) could otherwise sneak past the type
 *      check.
 *
 * KNOWN, UNCLOSED GAP — stated plainly: a hostile `Proxy` can fabricate
 * `ownKeys`/`getPrototypeOf`/`getOwnPropertyDescriptor` answers that make a
 * function-valued or unstable property invisible to this walk. Nothing in
 * this milestone defends against that; see
 * `__tests__/json.test.ts`'s own "KNOWN LIMITATION" test for a working
 * demonstration, not a fix.
 */
export type Json = null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

/**
 * True if `value` has any own accessor property (a `get`/`set`, enumerable
 * or not), checked via `Object.getOwnPropertyDescriptor` so a stateful
 * getter is never invoked as a side effect of this check itself. Rejected
 * even though it is not a function: nothing requires two reads of an
 * accessor to agree, which breaks the same "same input, same comparison,
 * always" premise a closure would.
 */
function hasOwnAccessorProperty(value: object): boolean {
  for (const key of Object.getOwnPropertyNames(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor && (descriptor.get !== undefined || descriptor.set !== undefined)) return true;
  }
  return false;
}

/**
 * Runtime companion to the `Json` type constraint. Walks a value
 * depth-first and returns `false` the moment it finds anything that is not
 * a plain primitive, plain array, or plain object — see the file header
 * for the two-way enforcement this closes and the Proxy gap it does not.
 */
export function isPlainData(value: unknown, seen: ReadonlySet<unknown> = new Set()): boolean {
  if (value === null) return true;
  const t = typeof value;
  if (t === "string" || t === "number" || t === "boolean") return true;
  if (t === "function" || t === "symbol" || t === "undefined" || t === "bigint") return false;

  // t === "object" from here on.
  if (seen.has(value)) return false; // circular reference: not plain.
  const nextSeen = new Set(seen).add(value as object);

  // Checked before any value is read off `value`, so a stateful getter is
  // never invoked as a side effect of walking past it.
  if (hasOwnAccessorProperty(value as object)) return false;

  if (Array.isArray(value)) {
    return value.every((entry) => isPlainData(entry, nextSeen));
  }

  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return false; // rejects Date, Map, Set, class instances, etc.

  for (const key of Object.getOwnPropertySymbols(value)) {
    void key;
    return false; // symbol-keyed properties are not representable in Json.
  }
  return Object.values(value as Record<string, unknown>).every((entry) => isPlainData(entry, nextSeen));
}

/** Thrown by `assertPlainData` — named so a caller can distinguish "your value isn't plain data" from any other error at a construction boundary. */
export class NonPlainDataError extends Error {
  constructor(context: string) {
    super(`${context}: value is not plain, serializable data (found a function, symbol, or non-plain object).`);
    this.name = "NonPlainDataError";
  }
}

/** Throws `NonPlainDataError` if `value` is not plain data — the runtime gate a `Memory<TValue>`'s `value` field must pass, for a value that defeats the type system via a cast. */
export function assertPlainData(value: unknown, context: string): void {
  if (!isPlainData(value)) {
    throw new NonPlainDataError(context);
  }
}

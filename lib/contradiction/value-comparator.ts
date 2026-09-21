import type { Json } from "../contracts/json.js";

/**
 * `ValueComparator` — the closed, locally-authored vocabulary `contradict()`
 * (contradict.ts) uses to decide whether two memories' `value`s "agree" at
 * all, before either the `superseded`/`disputed` split (§5.1) or the
 * `not-comparable` fail-closed outcome ever comes into play.
 * `memory-plan.md` §5: "reusing the *shape* of decision-engine's
 * `ValueConstraint` (equals / gte / lte / in, evaluated fail-closed: a type
 * mismatch is `not-comparable`, never silently 'equal' or silently
 * 'different'), but applied *between two memories*, not between a
 * requirement and a signal." `decision-engine/lib/signals/constraint.ts` is
 * READ, not imported — this file's shape (closed discriminated union on
 * `op`, one branch per operator, DATA never a predicate closure) is reused
 * thinking, re-derived independently, per this project's hard constraint
 * (`memory-plan.md` §1/§7). No import from `decision-engine` appears
 * anywhere in this file.
 *
 * FIVE OPERATORS, NOT DECISION-ENGINE'S FOUR — `tolerance` is new here,
 * because `memory-plan.md` §5's own `no-conflict` clause names it directly:
 * "values agree (exact-equal, or within a declared numeric tolerance for
 * `predicate`s that define one)." The other four (`equals`/`gte`/`lte`/
 * `in`) are decision-engine's own set, re-derived for a genuinely different
 * question — see each branch below for what "agree" means for a
 * MEMORY-VS-MEMORY comparison, which is not the same question
 * `ValueConstraint` answers (a fixed bound/set vs. one live signal value).
 *
 * WHAT EACH OPERATOR MEANS, PRECISELY, AND FOR WHICH `Json` SHAPES — this is
 * the ADR 0003 design question ("what does tolerance mean, precisely, and
 * for which value types") answered in code, not left to prose alone:
 *
 *   - `equals` — THE DEFAULT (`DEFAULT_VALUE_COMPARATOR` below). Works for
 *     every `Json` shape. Two values "agree" iff they have the same
 *     top-level shape (`null`/`boolean`/`number`/`string`/`array`/`object`
 *     — see `jsonShapeOf`) AND are deep-equal (arrays compared
 *     order-sensitively index-by-index, objects compared by their full key
 *     set regardless of enumeration order). A SHAPE mismatch (a `string`
 *     where the other is a `number`) is not "disagree" — it is
 *     `"value-type-mismatch"`, `memory-plan.md` §5's own worked case ("a
 *     `predicate` whose value type changed"), which `contradict()` turns
 *     into `not-comparable` rather than ever guessing which value is
 *     "right."
 *   - `gte` / `lte` — NUMBERS ONLY (finite `number`s on both sides;
 *     anything else is `"comparator-inapplicable"`). Unlike `equals`, these
 *     two are NOT a symmetric equality test — they encode a declared
 *     MONOTONIC invariant for a predicate whose value is only ever expected
 *     to move in one direction (an odometer reading, a running total that
 *     never refunds). `gte` "agrees" iff `newer >= older`: the newer
 *     reading did not go backward, so there is nothing to contradict.
 *     `lte` is the mirror: `newer <= older` agrees. A violation (the
 *     monotonic invariant broke — the odometer went backward) is exactly
 *     the disagreement case a real contradiction should register, and
 *     falls through to the same tier `superseded`/`disputed`
 *     split as any other disagreement (contradict.ts) — it is not a
 *     special "invalid data" outcome of its own, because the DATA is
 *     perfectly well-typed; it is the CLAIM that conflicts.
 *   - `in` — PRIMITIVES ONLY (`string | number | boolean`, `NaN`/`Infinity`
 *     excluded — anything else is `"comparator-inapplicable"`). Models a
 *     declared SYNONYM SET for a categorical predicate whose live vocabulary
 *     is wider than one exact string ("active" and "enabled" meaning the
 *     same state). Both values found in `comparator.values` → agree (the
 *     two claims use different words for the same fact). NEITHER value
 *     found → `"comparator-inapplicable"` (this comparator cannot classify
 *     either value at all — a caller-configuration problem, not a belief
 *     conflict). Exactly ONE found and the other not → disagree (one claim
 *     uses the declared vocabulary, the other plainly does not — a real
 *     conflict, not a comparator gap).
 *   - `tolerance` — NUMBERS ONLY, DELIBERATELY. `epsilon` is a required,
 *     non-negative, finite `number`; two values agree iff
 *     `|newer - older| <= epsilon`. THE ADR QUESTION THIS ANSWERS
 *     EXPLICITLY: what about dates, strings, arrays? NOT SUPPORTED, ON
 *     PURPOSE, NOT AN OVERSIGHT. A `CapturedAt` difference has its own
 *     purpose-built elapsed-time machinery already (`ageOf`,
 *     captured-at.ts) that is about a memory's OWN freshness, not about
 *     comparing two memories' VALUES, and reusing it here would conflate
 *     two different questions. A string "tolerance" would need an
 *     invented distance metric (edit distance? token overlap?) with no
 *     concrete predicate in this plan asking for one — exactly the
 *     "speculative flexibility nobody asked for" the house rules warn
 *     against, and the same reason `memory-plan.md` §12 rejects an
 *     embedding-based baseline for the read path generally. An array
 *     "tolerance" (e.g. per-element distance, or set distance) has the
 *     same problem, doubled: no concrete predicate, and no single obvious
 *     metric to pick. `tolerance` stays two lines of code and one
 *     precondition (`typeof value === "number"`) rather than growing a
 *     metric-selection sub-vocabulary nobody has a real case for yet.
 *
 * `compareValues` NEVER THROWS. Every branch below is a total function over
 * its inputs — a malformed comparator (a negative or non-finite `epsilon`,
 * an empty `in` set) resolves to `"comparator-inapplicable"`, the same
 * fail-closed instinct `decision-engine`'s own `evaluateConstraint` applies
 * to a malformed constraint.
 */
export type ValueComparator =
  | { readonly op: "equals" }
  | { readonly op: "gte" }
  | { readonly op: "lte" }
  | { readonly op: "in"; readonly values: readonly (string | number | boolean)[] }
  | { readonly op: "tolerance"; readonly epsilon: number };

/** The comparator `contradict()` uses when none is supplied — exact structural equality, the only operator that needs no per-predicate configuration and applies to every `Json` shape. */
export const DEFAULT_VALUE_COMPARATOR: ValueComparator = { op: "equals" };

/**
 * The two reasons `compareValues` can fail to reach an agree/disagree
 * verdict at all — kept as their own named type (rather than inlined into
 * `ValueComparisonResult` below) because `contradiction-check.ts`'s
 * `NotComparableReason` re-exports this exact union as a subset of its own
 * closed reason set, so the two files cannot drift on what these two
 * strings mean.
 */
export type ComparisonInapplicableReason = "value-type-mismatch" | "comparator-inapplicable";

/**
 * Deliberately NOT a bare boolean — same "never a bare score/boolean"
 * discipline `memory-plan.md` §7 names for `BeliefAnswer`/`ContradictionCheck`,
 * applied one layer down: "the values differ" and "this comparator cannot
 * judge these values at all" are different facts a caller (`contradict.ts`)
 * must be able to tell apart, the first proceeding to the tier
 * split (§5.1), the second failing closed to `not-comparable` outright.
 */
export type ValueComparisonResult =
  | { readonly agreement: "agree" }
  | { readonly agreement: "disagree" }
  | { readonly agreement: "inapplicable"; readonly reason: ComparisonInapplicableReason };

function jsonShapeOf(value: Json): "null" | "boolean" | "number" | "string" | "array" | "object" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  const t = typeof value;
  if (t === "boolean" || t === "number" || t === "string") return t;
  return "object";
}

/**
 * Structural equality over `Json` — arrays compared index-by-index
 * (order-sensitive: `Memory.value` is a recorded claim, not a set, so
 * `["a","b"]` and `["b","a"]` are two different claims), objects compared
 * by their full key set regardless of insertion/enumeration order. Callers
 * of this function have already confirmed both values share the same
 * top-level shape (`jsonShapeOf`) — this function assumes that, it does not
 * re-check it, because `compareValues`'s `"equals"` branch is its only
 * caller and always checks shape first.
 */
function deepEqualJson(a: Json, b: Json): boolean {
  if (a === b) return true; // covers matching primitives and reference-equal arrays/objects in one step.
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((entry, i) => deepEqualJson(entry, b[i] as Json));
  }
  if (typeof a === "object" && a !== null && typeof b === "object" && b !== null && !Array.isArray(a) && !Array.isArray(b)) {
    const aObj = a as { readonly [key: string]: Json };
    const bObj = b as { readonly [key: string]: Json };
    const aKeys = Object.keys(aObj).sort();
    const bKeys = Object.keys(bObj).sort();
    if (aKeys.length !== bKeys.length) return false;
    return aKeys.every((key, i) => key === bKeys[i] && deepEqualJson(aObj[key] as Json, bObj[key] as Json));
  }
  return false; // different shapes, or unequal primitives — already ruled out reference equality above.
}

/** `NaN`/`Infinity` are technically `typeof "number"` but are never a legal recorded belief value under this milestone's numeric operators — excluded explicitly rather than let a `gte`/`lte`/`tolerance` comparison silently propagate a `NaN` (which compares `false` to every `<=`/`>=`, a wrong-shaped kind of "disagree"). */
function isFiniteNumber(value: Json): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isComparablePrimitive(value: Json): value is string | number | boolean {
  if (typeof value === "string" || typeof value === "boolean") return true;
  return isFiniteNumber(value);
}

/**
 * The one function this file exists to provide: given two `Memory.value`s
 * (already the same `TValue` by `contradict`'s own generic signature — see
 * that file) and a comparator, decide whether they agree, disagree, or
 * cannot be judged by this comparator at all. Pure, total, never throws —
 * see the file header for why each branch is shaped the way it is.
 */
export function compareValues(older: Json, newer: Json, comparator: ValueComparator): ValueComparisonResult {
  switch (comparator.op) {
    case "equals": {
      if (jsonShapeOf(older) !== jsonShapeOf(newer)) {
        return { agreement: "inapplicable", reason: "value-type-mismatch" };
      }
      return deepEqualJson(older, newer) ? { agreement: "agree" } : { agreement: "disagree" };
    }
    case "gte": {
      if (!isFiniteNumber(older) || !isFiniteNumber(newer)) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      return newer >= older ? { agreement: "agree" } : { agreement: "disagree" };
    }
    case "lte": {
      if (!isFiniteNumber(older) || !isFiniteNumber(newer)) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      return newer <= older ? { agreement: "agree" } : { agreement: "disagree" };
    }
    case "in": {
      if (comparator.values.length === 0) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      if (!isComparablePrimitive(older) || !isComparablePrimitive(newer)) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      const olderInSet = comparator.values.includes(older);
      const newerInSet = comparator.values.includes(newer);
      if (olderInSet && newerInSet) return { agreement: "agree" };
      if (!olderInSet && !newerInSet) return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      return { agreement: "disagree" }; // exactly one side uses the declared vocabulary — a real conflict, not a comparator gap.
    }
    case "tolerance": {
      if (!Number.isFinite(comparator.epsilon) || comparator.epsilon < 0) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      if (!isFiniteNumber(older) || !isFiniteNumber(newer)) {
        return { agreement: "inapplicable", reason: "comparator-inapplicable" };
      }
      return Math.abs(newer - older) <= comparator.epsilon ? { agreement: "agree" } : { agreement: "disagree" };
    }
    default: {
      // Exhaustiveness backstop matching this directory's own convention
      // (contradiction-check.ts's assertNeverContradictionCheck,
      // lib/contracts' assertNeverBeliefAnswer): a sixth operator added to
      // ValueComparator without a branch here fails to compile at this
      // `never` assignment, not at runtime.
      const neverOp: never = comparator;
      throw new Error(`Unreachable: unhandled ValueComparator op ${JSON.stringify(neverOp)}`);
    }
  }
}

import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import { scopeIsSupersetOf } from "../contracts/scope.js";
import { compareValues, DEFAULT_VALUE_COMPARATOR, type ValueComparator } from "./value-comparator.js";
import type { ContradictionCheck, NotComparableReason } from "./contradiction-check.js";
import { resolveTierSplit } from "./tier-split.js";

/**
 * `contradict(older, newer)` — `memory-plan.md` §5's contradiction engine,
 * M4's one job. Takes exactly the two LIVE `Memory<TValue>` values the plan
 * names (a `TombstonedMemory` does not satisfy `Memory<TValue>` at all —
 * `lib/contracts`' own compile-time refusal, memory.ts's header — so this
 * function structurally cannot be handed an already-forgotten record) plus
 * an OPTIONAL `comparator` (value-comparator.ts), defaulting to exact
 * equality. Never mutates either argument (both are read-only per
 * `lib/contracts`' own `readonly` fields, and this function never casts
 * past that), never throws, never reads a clock.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CHECK ORDER — cheapest/most-structural first, THEN value comparison last
 * ─────────────────────────────────────────────────────────────────────────
 * Mirrors `agent-trust-layer`'s ordering discipline, reused conceptually
 * (`memory-plan.md` §3's own scope-eligibility text cites the identical
 * precedent) and this milestone's own brief ("Scope overlap is exact
 * superset containment per the plan's §3, checked before anything else"):
 *
 *   1. `(subject, predicate)` equality — a plain string compare, cheapest
 *      possible, and the plan's own first gate ("fires only on the same
 *      `(subject, predicate)`").
 *   2. Scope overlap.
 *   3. `believedAt` ordering (`newer` strictly after `older`).
 *   4. Value comparison via `comparator` (value-comparator.ts) — the most
 *      expensive check (a recursive deep-equal, in the `equals` case), run
 *      last, only once every structural precondition already passed.
 *
 * Any failure at steps 1–3 returns `not-comparable` immediately — value
 * comparison never even runs for two memories that are not eligible to be
 * compared at all.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DESIGN QUESTION (ADR 0003): WHAT DOES "SCOPE OVERLAP" MEAN?
 * ─────────────────────────────────────────────────────────────────────────
 * `lib/contracts/scope.ts`'s own `scopeIsSupersetOf(broader, narrower)` is
 * defined for a QUERY's scope against a memory's scope (a query is eligible
 * for a memory iff the query's scope is a superset of the memory's). Two
 * MEMORIES comparing against EACH OTHER is a different relation — neither
 * is "the query." This milestone answers the ADR's own "partial scope
 * overlap" question as follows: two memories' scopes "overlap" for
 * contradiction purposes iff ONE IS A SUPERSET OF THE OTHER (in EITHER
 * direction) — `scopeIsSupersetOf(older.scope, newer.scope) ||
 * scopeIsSupersetOf(newer.scope, older.scope)`. A memory scoped to
 * `[{account:acme}]` and one scoped to `[{account:acme},{user:vlad}]` DO
 * overlap this way (the second is a strict superset of the first — the
 * narrower memory's claim lives entirely inside the broader one's bounded
 * context, so a real disagreement between them is a real disagreement
 * within that shared context). A memory scoped to `[{account:acme}]` and
 * one scoped to `[{account:acme},{department:sales}]` also overlap, for
 * the identical reason. But a memory scoped to `[{account:acme},
 * {department:sales}]` and one scoped to `[{account:acme},{department:
 * eng}]` — genuinely intersecting (they share `account:acme`) but NEITHER
 * contains the other — are DELIBERATELY TREATED AS NOT OVERLAPPING here,
 * and `contradict` returns `not-comparable` (`"scope-not-overlapping"`)
 * rather than trying to adjudicate a conflict between two claims that each
 * carry a bounded context the other doesn't share. REJECTED ALTERNATIVE:
 * "any non-empty intersection of entries counts as overlap." Rejected
 * because it would let two claims neither of which was ever asserted about
 * the same combined context contradict each other on the strength of
 * sharing just ONE dimension out of several — exactly the kind of
 * lower-precision, "close enough" matching `scope.ts`'s own header argues
 * this project structurally refuses ("compared by exact set containment,
 * never by substring or fuzzy match... a hard boolean gate"). Superset
 * containment is the one relation `lib/contracts` already defines and
 * already argues for; reusing it in both directions is the minimal,
 * non-speculative extension this milestone needs, not a new fuzzy-overlap
 * concept invented from scratch.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DESIGN QUESTION (ADR 0003): IS `contradict` SYMMETRIC?
 * ─────────────────────────────────────────────────────────────────────────
 * NO, BY DESIGN — `contradict(a, b)` and `contradict(b, a)` are NOT
 * required to agree, because the two parameters are not interchangeable:
 * they are ROLES ("the older claim," "the newer claim"), not an unordered
 * pair. `superseded`/`disputed`'s own meaning ("the newer claim wins/
 * doesn't win") is stated entirely in terms of which argument is older and
 * which is newer — swapping them would ask a different question, not
 * re-ask the same one. What IS proven, and load-bearing: `contradict` is
 * "anti-symmetric" in the SPECIFIC, provable sense that the `believedAt`
 * ordering check (step 3) makes it structurally impossible for BOTH
 * `contradict(a, b)` and `contradict(b, a)` to reach the value-comparison
 * step for the same pair — whichever call has its second argument
 * `believedAt`-earlier-than-or-tied-with its first fails closed to
 * `not-comparable` before any value is even read. See
 * `__tests__/contradict.test.ts`'s dedicated symmetry test for the direct
 * proof: for any two same-`(subject,predicate)`-and-overlapping-scope
 * memories with DIFFERENT `believedAt`, EXACTLY ONE of the two call orders
 * can ever produce anything other than `not-comparable`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DESIGN QUESTION (ADR 0003): SAME `believedAt` — A GENUINE TIE
 * ─────────────────────────────────────────────────────────────────────────
 * Fails closed to `not-comparable` (`"clock-order-violated"`) — a tie is
 * treated exactly like a caller passing the two memories in the wrong
 * order, because this function has no principled way to decide which of
 * two claims recorded at the identical instant is "the newer one," and the
 * `superseded`/`disputed` split's entire mechanism (§5.1) is defined in
 * terms of "newer" meaning something. Guessing (e.g. "prefer whichever
 * argument came second") would silently resolve a genuine tie by argument
 * order — the exact "whichever side happens to run the comparison first"
 * outcome `memory-plan.md` §5 says this project must never produce.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS FUNCTION COMPARES `source.tier`, NOT `Memory.confidence` —
 * CORRECTED, closing M1's own ADR 0001 forward note the RIGHT way
 * ─────────────────────────────────────────────────────────────────────────
 * `.genesis/decisions/0001-contracts.md`, Decision 1, left
 * `Provenance.tier`'s mapping explicitly unresolved: "Whoever needs it
 * first should decide it with a real case in hand." M4 is that caller.
 * THIS MILESTONE'S FIRST PASS COMPARED `Memory.confidence` INSTEAD, ON THE
 * REASONING THAT `ConfidenceTier` (a two-member union) "has no numeric
 * ordering of its own." That reasoning was wrong, caught in review: a
 * two-member union has an obvious total order, and `PLAN.md`'s own M4
 * success criteria state the rule directly in terms of the two tier NAMES
 * — "two same-tier `human` avowals... resolve to `superseded`... two
 * same-tier `derived` inferences... resolve to `disputed`" — never in
 * terms of a numeric confidence value. The tell was in the milestone's own
 * proof obligation: two `direct-avowal` memories with wildly different
 * RECORDED confidence (`0.9` and `0.1`) must still resolve to `superseded`
 * (a person restating a fact supersedes their own earlier statement,
 * regardless of how confidently either statement happened to be recorded)
 * — and a confidence-number comparison gets that case wrong. This function
 * now calls `resolveTierSplit(older.source.tier, newer.source.tier)`
 * (`tier-split.ts`) DIRECTLY. `Memory.confidence` plays NO role in this
 * decision at all — see that file's own header for the complete four-case
 * rule and why the two same-tier cases are asymmetric on purpose (the
 * plan's own asymmetry, not an arbitrary choice). Both halves of the
 * worked contrast (§5.1), AND the wildly-divergent-confidence proof case,
 * are proven directly in `__tests__/contradict.test.ts`.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * A FINDING AGAINST `memory-plan.md` §5.1 ITSELF, NOT SILENTLY WORKED
 * AROUND (see this milestone's own build report for the same finding
 * stated again)
 * ─────────────────────────────────────────────────────────────────────────
 * §5.1's `disputed` clause reads: "`newer.confidence` is lower than
 * `older`'s **and** `older` is still inside its own freshness window."
 * The FIRST conjunct is superseded by the tier-based correction above (see
 * `tier-split.ts`'s header for why the plan's own worked examples read as
 * a tier rule, not a confidence-number rule). The SECOND conjunct requires
 * evaluating a `DecayPolicy` against `now` — exactly `lib/decay/**` (M3),
 * which this milestone is explicitly forbidden to import, stub, or wait
 * for, and `contradict`'s own signature (`memory-plan.md`'s own outcome
 * line: "`contradict(older, newer)`") never names a `now` parameter to
 * compute it with. **The freshness half of §5.1's condition is
 * DELIBERATELY UNIMPLEMENTED AT THIS LAYER — not overlooked, not
 * forgotten, a stated scope boundary.** This function treats that conjunct
 * as a PRECONDITION owned by `contradict`'s eventual caller (M5's
 * `lib/store/**`, which DOES have `now` and DOES have `lib/decay/**`), not
 * as something `contradict` recomputes internally. Concretely: a store is
 * expected to call `contradict` only for `older` memories that are still
 * live (undecayed past `forgetFloor`) — a memory already decayed past that
 * floor would already have been `forget(..., "age-exceeded", now)`'d by
 * M3/M5's own machinery before ever reaching `contradict` at all, so
 * "older is still inside its freshness window" is, in practice, equivalent
 * to "older is still a live `Memory<TValue>`" — which IS structurally
 * guaranteed by this function's own parameter type (a `TombstonedMemory`
 * cannot be passed in). This is disclosed here, precisely, as a genuine
 * simplification this milestone makes because the alternative — inventing
 * a `now` parameter and a decay call `contradict(older, newer)`'s own
 * stated signature never asks for, reaching into M3's frozen-elsewhere
 * territory — would be worse: exactly the "inventing an interface M3 may
 * contradict" this milestone's own brief warns against.
 */
export function contradict<TValue extends Json>(
  older: Memory<TValue>,
  newer: Memory<TValue>,
  comparator: ValueComparator = DEFAULT_VALUE_COMPARATOR,
): ContradictionCheck<TValue> {
  if (older.subject !== newer.subject || older.predicate !== newer.predicate) {
    return notComparable(older, newer, "different-subject-or-predicate");
  }

  if (!(scopeIsSupersetOf(older.scope, newer.scope) || scopeIsSupersetOf(newer.scope, older.scope))) {
    return notComparable(older, newer, "scope-not-overlapping");
  }

  // Numeric epoch-ms comparison, never lexicographic string comparison —
  // CapturedAt's own ISO-8601 grammar (captured-at.ts) permits either a
  // "Z" suffix or an explicit "+hh:mm"/"-hh:mm" offset, and permits
  // variable sub-second precision; two valid CapturedAt strings for the
  // SAME instant, or in the wrong relative order, do not always compare
  // correctly as plain strings. `Date.parse` is the same calendar
  // authority captured-at.ts's own `parseCapturedAt`/`ageOf` already trust.
  const olderMs = Date.parse(older.believedAt);
  const newerMs = Date.parse(newer.believedAt);
  // NaN only if a caller defeated the type system with a defeating cast
  // into the CapturedAt brand on a non-ISO string (captured-at.ts's own
  // header names this exact "a cast defeats the type system" gap for
  // Json; CapturedAt has the identical, disclosed limitation) — folded
  // into the same "clock-order-violated" outcome as a genuine ordering
  // failure, rather than adding a sixth reason for a case honest
  // construction can never produce.
  if (!(newerMs > olderMs)) {
    return notComparable(older, newer, "clock-order-violated");
  }

  const comparison = compareValues(older.value, newer.value, comparator);
  switch (comparison.agreement) {
    case "agree":
      return { outcome: "no-conflict", older, newer };
    case "inapplicable":
      return notComparable(older, newer, comparison.reason);
    case "disagree":
      // §5.1's split, decided on RECORDED TIER — see this function's own
      // header, and tier-split.ts's, for why `Provenance.tier`, not
      // `Memory.confidence`, is read here.
      return resolveTierSplit(older.source.tier, newer.source.tier) === "superseded"
        ? { outcome: "superseded", older, newer }
        : { outcome: "disputed", candidates: [older, newer] };
  }
}

function notComparable<TValue extends Json>(older: Memory<TValue>, newer: Memory<TValue>, reason: NotComparableReason): ContradictionCheck<TValue> {
  return { outcome: "not-comparable", reason, older, newer };
}

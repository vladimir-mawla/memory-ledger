import type { Json } from "../../lib/contracts/json.js";
import type { Scope } from "../../lib/contracts/scope.js";

/**
 * `domains/personal-assistant/vocabulary.ts` — the closed subject/predicate
 * vocabulary `memory-core.ts`'s own header left to a domain to name: "the
 * actual closed vocabulary of predicates is a domain's (M6's) to name."
 * `memory-plan.md`'s own house rule applies directly here: "canonical form
 * over a flexible parser; no speculative flexibility" — this file names
 * exactly the subject and five predicates the running scenario
 * (`scripts/demo-memory.ts`) actually uses, not a broader vocabulary
 * "for completeness."
 *
 * WHY A SINGLE, FIXED `SUBJECT`, NOT A CLOSED UNION OF SUBJECTS: a
 * personal-assistant memory store is, by the domain's own nature,
 * single-tenant per deployment — "your own assistant only ever holds your
 * memories." `memory-plan.md` §9's own framing is "what do you remember
 * about ME," never "about a roster of users." A multi-user personal
 * assistant (subject per account) is a genuinely different, unbuilt
 * feature this milestone has no real case for — inventing a closed union
 * of subjects now, with only one ever populated by the demo, would be
 * exactly the "speculative flexibility nobody asked for" the account's own
 * standing note warns against. If a second subject is ever needed, adding
 * one is a config change here, not a redesign.
 *
 * WHY FIVE PREDICATES, NOT MORE: each one earns its place by driving a
 * DIFFERENT real mechanism `scripts/demo-memory.ts` exercises — see each
 * comment below. No predicate exists "for symmetry" or "in case a future
 * milestone wants it."
 */

/** The one subject this deployment's memories are ever about. See file header. */
export const SUBJECT = "user:vlad";

/** The one bounded context every fact in this domain lives in by default — closed by `closeScope` (store.ts) to demonstrate `scope-exited` with a real, concrete trigger: account deletion. See store.ts's own header for why account deletion, specifically, is that trigger. */
export const DEFAULT_SCOPE: Scope = [{ dimension: "user", value: "vlad" }];

/**
 * The closed predicate vocabulary. Each one is the real case that decided
 * it belongs here:
 *   - `shipping-address`     — drives §8's own demo moment: two direct
 *                              human avowals disagreeing, resolving to
 *                              `superseded`/`contradicted`.
 *   - `coffee-order`          — small-talk, drives freshness decay alone
 *                              (`doubted` → `forgettable`/`unknown`), no
 *                              contradiction involved at all.
 *   - `current-city`          — drives `disputed` (two same-tier
 *                              `derived-inference` sources disagreeing),
 *                              THEN `source-revoked` (one of the two
 *                              disputants' source is revoked, resolving
 *                              the dispute as a side effect — not staged,
 *                              a real consequence of revocation applying
 *                              regardless of which side of a dispute a
 *                              memory is on), THEN the one real case in
 *                              this whole system for `ForgetReason:
 *                              "superseded"` (see store.ts's own header —
 *                              `contradict()` itself never produces that
 *                              reason).
 *   - `linked-calendar-location` — drives `source-revoked` a second,
 *                              simpler way: a single live memory, still
 *                              fresh and confident, tombstoned purely
 *                              because its source was revoked.
 *   - `timezone`               — a plain, otherwise-unremarkable live
 *                              belief, kept ONLY so `closeScope`'s
 *                              `scope-exited` finale has more than one
 *                              kind of live memory to prove it actually
 *                              sweeps everything, not just the memory the
 *                              rest of the script happens to be watching.
 */
export type Predicate = "shipping-address" | "coffee-order" | "current-city" | "linked-calendar-location" | "timezone";

export const ALL_PREDICATES: readonly Predicate[] = [
  "shipping-address",
  "coffee-order",
  "current-city",
  "linked-calendar-location",
  "timezone",
];

/**
 * A postal address, structured rather than a bare string, so the
 * contradiction demo compares REAL structured disagreement (`compareValues`'s
 * `equals` branch, deep-equal over a plain object) — not a coincidence of
 * string formatting (" 42 Elm St" vs "42 Elm St." would spuriously
 * "disagree" as strings for reasons that have nothing to do with the
 * address actually changing).
 *
 * DEFINED AS A `Record`, NOT A PLAIN `interface`, ON PURPOSE: `Json`
 * (lib/contracts/json.ts) types a plain object as `{ readonly [key:
 * string]: Json }` — an INDEX SIGNATURE. A hand-written `interface` with
 * named fields and no index signature of its own is not structurally
 * assignable to that shape (a known TypeScript rule, not a bug in this
 * file) even when every one of its fields IS individually `Json`-typed —
 * `Readonly<Record<...>>` is a mapped type, which TypeScript treats as
 * carrying that index signature already, so it satisfies `Json` directly.
 */
export type ShippingAddress = Readonly<Record<"line1" | "city" | "state", string>>;

/** Maps each closed predicate to the `Json`-compatible value shape it carries. Every `Memory<TValue>` this domain constructs is typed against this map — a caller cannot construct a `"coffee-order"` fact carrying a `ShippingAddress`, or vice versa. */
export interface PredicateValueMap {
  readonly "shipping-address": ShippingAddress;
  readonly "coffee-order": string;
  readonly "current-city": string;
  readonly "linked-calendar-location": string;
  readonly timezone: string;
}

// Compile-time proof that every value in the map is real `Json` — the same
// discipline `MemoryCore<TValue extends Json>` (lib/contracts) enforces at
// its own boundary, checked here too so a future predicate added with a
// non-serializable value shape (a class instance, a function field) fails
// to compile in THIS file, at the point it was added, rather than
// surfacing as a confusing generic-constraint error deep inside facts.ts.
type _PredicateValuesAreJson = { readonly [P in Predicate]: PredicateValueMap[P] extends Json ? true : false };
const _predicateValuesAreJson: { readonly [P in Predicate]: true } = {
  "shipping-address": true,
  "coffee-order": true,
  "current-city": true,
  "linked-calendar-location": true,
  timezone: true,
} satisfies _PredicateValuesAreJson;
void _predicateValuesAreJson;

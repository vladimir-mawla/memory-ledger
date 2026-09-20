import type { Confidence } from "./confidence.js";
import type { Milliseconds } from "./captured-at.js";

/**
 * `DecayPolicy` — DATA, EVALUATED BY AN INTERPRETER, NEVER A FUNCTION OR
 * CLOSURE. This is the single most explicitly flagged risk in this
 * milestone's own brief: "`DecayPolicy` is the field most at risk here: if
 * you are tempted to make it a function, don't; make it data that an
 * interpreter evaluates, and say why in the ADR" — and it is the same
 * mistake this account's own sibling projects already made and reversed,
 * one layer over, twice:
 *
 *   1. decision-engine's `Prohibition.matches` started as a predicate
 *      closure `(action: Action) => boolean`. It could not be serialized,
 *      so its audit trail could only record prohibitions BY ID and had to
 *      require the caller to re-supply the real predicates again at replay
 *      time — an honest but real limitation forced entirely by the
 *      closure's unserializability (`decision-engine/.genesis/decisions/
 *      0003-audit-model.md`).
 *   2. shadow-run's `Rollback.runnable` was drafted as `{ compensate:
 *      (world) => world }` and reversed before any code existed, once it
 *      was clear a closure "cannot be recorded into an audit-style trail,
 *      cannot be replayed by an independent verifier, and cannot be
 *      compared for equality" (`shadow-run/.genesis/decisions/
 *      0001-contracts.md`, Decision 5).
 *
 * `DecayPolicy` would repeat exactly that mistake, and the stakes here are
 * the same as shadow-run's: `memory-plan.md` §10's whole failure suite (M7,
 * unbuilt) needs to REPLAY a race between an `affirm` and a query and prove
 * what the store *should* have decided — that is impossible if "how this
 * memory decays" is a function value with no serializable representation
 * to check against. A `DecayPolicy` also has to sit inside a `Memory`
 * value that this milestone's own criteria require to be provably
 * immutable and comparable (`__tests__/memory.test.ts`'s "differ only in
 * id" proof) — a closure-valued field would make two otherwise-identical
 * memories incomparable by anything but reference equality on the
 * function, defeating that proof's own premise.
 *
 * THE CHOSEN SHAPE: a closed, two-member discriminated union on `kind`.
 *
 *   - `"linear-to-floor"` — the common case: confidence degrades over time
 *     toward a configured floor. `halfLifeMs` names the CURVE'S PARAMETER,
 *     not the curve itself — M3's `lib/decay/**` (unbuilt, this
 *     milestone's job is only the shape) is the interpreter that actually
 *     computes a confidence value from `(policy, memory, now)`.
 *     `doubtedThreshold` and `forgetFloor` are the two configured
 *     `Confidence` boundaries `memory-plan.md` §5.2 names: crossing the
 *     first flips a live query's status to `"doubted"`; crossing the
 *     second (necessarily lower) triggers `forget(memory, "age-exceeded",
 *     now)`. Both are `Confidence` values (confidence.ts), not bare
 *     numbers, for the same reason every other confidence-shaped field in
 *     this directory is: a raw `0.3` cannot be assigned here without
 *     passing through `parseConfidence` first.
 *   - `"never-decays"` — some memories don't lose confidence purely from
 *     the clock (a fact whose truth doesn't degrade with age, or a
 *     source-revocation-only claim). Still tombstonable via contradiction,
 *     scope-exit, or source-revocation (`ForgetReason`, forget-reason.ts)
 *     — this variant only opts a memory OUT of `"age-exceeded"`, never out
 *     of forgetting altogether.
 *
 * REJECTED ALTERNATIVE, RECORDED HERE RATHER THAN IN THE ADR ALONE: an
 * open-ended expression language (`{ formula: string; params: ... }`,
 * evaluated by some tiny interpreter) for "flexibility." Rejected for the
 * same reason `memory-plan.md` cites decision-engine's own `ValueConstraint`
 * precedent: an expression language nobody has a concrete second case for
 * is exactly the "speculative flexibility" the house rules warn against,
 * and a `formula: string` field is one step away from being the exact
 * "model's prose" escape hatch this whole project's read path (§2) exists
 * to refuse. Two members, closed, is the CORRECT amount of flexibility for
 * what `memory-plan.md` actually demos — nothing more is added on spec.
 */
export type DecayPolicy =
  | {
      readonly kind: "linear-to-floor";
      readonly halfLifeMs: Milliseconds;
      readonly doubtedThreshold: Confidence;
      readonly forgetFloor: Confidence;
    }
  | {
      readonly kind: "never-decays";
    };

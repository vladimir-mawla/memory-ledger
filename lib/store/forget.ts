import type { Json } from "../contracts/json.js";
import type { Memory } from "../contracts/memory.js";
import type { TombstonedMemory } from "../contracts/tombstoned-memory.js";
import type { ForgetReason } from "../contracts/forget-reason.js";
import type { CapturedAt } from "../contracts/captured-at.js";
import type { MemoryId } from "../contracts/memory-id.js";
import type { Tombstone } from "../contracts/tombstone.js";
import { type TombstoneId, tombstoneId } from "../contracts/tombstone-id.js";

/**
 * `forget(memory, reason, now[, supersededBy])` — `memory-plan.md` §4's
 * forgetting operation, made real. "Forgetting is tombstoning, never
 * physical deletion... deletion leaves nothing to point at when asked
 * 'what did you forget.'" This is the ONE function in this milestone that
 * changes retrievability (§3's own "legal operations" list), and it does so
 * by construction, not by mutation: it never edits `memory` (every field
 * is `readonly`, and this file spreads rather than writes), it returns a
 * BRAND-NEW `TombstonedMemory<TValue>` carrying every one of `memory`'s
 * original fields untouched plus the `Tombstone` that explains why.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THE SIGNATURE IS OVERLOADED, NOT A FLAT `(memory, reason, now,
 * supersededBy?)` — a correction to `memory-plan.md` §3's own literal
 * sketch, in the same spirit (though not the same mechanism) as M1's ADR
 * correcting §3's four-member `status` sketch and §4's bare `supersededBy?`
 * sketch.
 * ─────────────────────────────────────────────────────────────────────────
 * `memory-plan.md` §3 writes the operation's outcome line as
 * `forget(memory, reason, now) → Tombstone` — three arguments. But
 * `Tombstone` (`lib/contracts/tombstone.ts`, frozen) is a two-branch
 * discriminated union: `CausedTombstone` (`reason: "contradicted" |
 * "superseded"`) REQUIRES `supersededBy: MemoryId`; `UncausedTombstone`
 * (the other three reasons) has NO such field — adding one is an
 * excess-property error. A flat, single signature
 * `forget(memory, reason: ForgetReason, now, supersededBy?: MemoryId)`
 * cannot express "required iff caused" at the type level — the same gap
 * `Tombstone`'s own ADR (`.genesis/decisions/0001-contracts.md`, Decision
 * 3) already named and fixed for the TYPE itself ("a bare `?:` field cannot
 * enforce it... nothing stops a caller from constructing
 * `{ reason: 'age-exceeded', supersededBy: someId }`"). Fixing the TYPE but
 * leaving this function's own call sites free to make the identical mistake
 * (`forget(m, "age-exceeded", now, someIrrelevantId)`, or
 * `forget(m, "contradicted", now)` with no `supersededBy` at all — the
 * TypeScript compiler infers the widest legal `Tombstone` for either call
 * and only a LATER runtime path, or nothing at all, would ever catch it)
 * would waste the type-level fix one call away from where it matters most:
 * the one function that actually constructs a `Tombstone`. Two overload
 * signatures below make the SAME constraint the type already enforces on
 * `Tombstone` itself hold at every CALL SITE of `forget`, too — proven in
 * `__tests__/forget.test.ts` with `@ts-expect-error` on both a missing
 * `supersededBy` for a caused reason and an excess one for an uncaused
 * reason.
 *
 * The runtime body still defends itself (`isCausedReason`/the `undefined`
 * check below) against a caller who defeats the overloads with an `as
 * ForgetReason` cast — the same "belt-and-suspenders, not the primary
 * defence" discipline `lib/decay/decay.ts`'s own header describes for its
 * clamp-after-validation pattern. This should be unreachable through the
 * public, typed overloads; it throws rather than silently guessing, the
 * same "never silently resolve either way" instinct `lib/contradiction`
 * applies to a malformed comparator.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE `TombstoneId` COMES FROM — the one thing `lib/contracts`
 * deliberately left unowned
 * ─────────────────────────────────────────────────────────────────────────
 * `tombstone-id.ts`'s own header (mirroring `memory-id.ts`'s identical
 * note): "no invariant to validate beyond 'is a string'... whoever
 * eventually builds the store (M5/M6) owns *how* the string is generated
 * ... out of scope for [M1]." This is that milestone. `mintTombstoneId`
 * below needs no cryptographic strength (a `TombstoneId` is an opaque
 * audit-trail identity, not a security credential) and deliberately avoids
 * any Node-specific global (`node:crypto`'s `randomUUID`) that would need
 * an import this directory's own architecture test (`__tests__/
 * architecture.test.ts`, copied verbatim per this milestone's brief) would
 * have to special-case — `Math.random`/`Date` are plain ES2022 globals,
 * already relied on elsewhere in this codebase (`captured-at.ts`'s
 * `systemNow`), and need no import at all. Uniqueness, not
 * unpredictability, is the only property this identity needs: the seed
 * (`memoryId:reason:now`) already makes every id traceable to exactly which
 * call produced it, and the random suffix only exists to disambiguate two
 * calls sharing that same seed (e.g. `queryBelief`, `belief-query.ts`,
 * synthesizing an age-exceeded tombstone for the same memory across two
 * separate query calls at the same `now`).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * NOT OFFERED, ON PURPOSE: no `unforget`/`resurrect` — see
 * `.genesis/decisions/0004-store.md` ("Can a tombstone be un-tombstoned?")
 * for the full argument. This file's own public surface is exactly two
 * things: mint a tombstone, or don't call this file at all. There is no
 * third operation.
 */

function isCausedReason(reason: ForgetReason): reason is "contradicted" | "superseded" {
  return reason === "contradicted" || reason === "superseded";
}

/** See the file header's "WHERE THE TombstoneId COMES FROM" — uniqueness, not unpredictability, is this function's only job. */
function mintTombstoneId(memoryId: MemoryId, reason: ForgetReason, now: CapturedAt): TombstoneId {
  const random = Math.random().toString(36).slice(2, 10);
  return tombstoneId(`tombstone:${memoryId}:${reason}:${now}:${random}`);
}

export function forget<TValue extends Json>(
  memory: Memory<TValue>,
  reason: "contradicted" | "superseded",
  now: CapturedAt,
  supersededBy: MemoryId,
): TombstonedMemory<TValue>;
export function forget<TValue extends Json>(
  memory: Memory<TValue>,
  reason: "age-exceeded" | "scope-exited" | "source-revoked",
  now: CapturedAt,
): TombstonedMemory<TValue>;
export function forget<TValue extends Json>(
  memory: Memory<TValue>,
  reason: ForgetReason,
  now: CapturedAt,
  supersededBy?: MemoryId,
): TombstonedMemory<TValue> {
  const id = mintTombstoneId(memory.id, reason, now);
  const { status: _status, ...core } = memory;

  let tombstone: Tombstone;
  if (isCausedReason(reason)) {
    if (supersededBy === undefined) {
      // Unreachable through the typed overloads above — see file header.
      throw new Error(
        `forget: reason "${reason}" requires a supersededBy MemoryId, but none was given. This is only reachable if a caller defeated the ` +
          `overloaded signature above with a type cast (e.g. "as ForgetReason").`,
      );
    }
    tombstone = { id, memoryId: memory.id, reason, forgottenAt: now, supersededBy };
  } else {
    tombstone = { id, memoryId: memory.id, reason, forgottenAt: now };
  }

  return { ...core, status: "tombstoned", tombstone };
}

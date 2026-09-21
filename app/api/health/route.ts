import {
  effectiveConfidence,
  memoryId,
  tombstoneId,
  parseConfidence,
  parseCapturedAt,
  systemNow,
  ZERO_CONFIDENCE,
  type Memory,
  type TombstonedMemory,
  type Confidence,
  type CapturedAt,
} from "../../../lib/contracts/index";

/**
 * Force dynamic + Node.js runtime: without `dynamic = "force-dynamic"`,
 * Next.js may treat this route as statically renderable and serve a
 * prerendered response from build time forever after — at which point the
 * "live" contracts check below becomes theatre, run once at build and
 * never again, and the commit SHA below would freeze at whatever it was
 * during the build that produced the static output. `runtime = "nodejs"`
 * is Next 16.3+'s unconditional default for route handlers already (Next's
 * own migration note for the deprecated `"edge"` config says exactly this:
 * "The Node.js runtime is the default, so no replacement is needed"), so
 * this line no longer guards against a default that could silently change
 * — it is kept purely as explicit, self-documenting proof of intent, since
 * this route imports lib/ directly and lib/'s whole premise assumes real
 * Node semantics.
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface ContractsCheckResult {
  readonly pass: boolean;
  readonly elapsedMs: number;
  readonly detail: string;
}

/**
 * Real work, not a liveness ping — adapted from shadow-run's and
 * decision-engine's own app/api/health/route.ts (both exercise a real
 * piece of their own lib/ on every request), scoped to what THIS project
 * has actually built by M2: only lib/contracts/** (M1) exists so far.
 * lib/decay, lib/contradiction, and lib/store are M3–M5 and do not exist
 * yet, so this check cannot (and must not pretend to) exercise them.
 *
 * Exercises `effective-confidence.ts`'s own central, load-bearing claim —
 * the one its file header names as the thing a passing `npm test` alone
 * does not prove is still true in THIS deployed process, on THIS Node
 * version: that tombstoning zeroes a query's reported confidence
 * STRUCTURALLY (by the type-level `status` discriminant), never by reading
 * the record's own stored `confidence` number. Two `MemoryCore`-identical
 * records are built here, sharing every field including a deliberately
 * HIGH recorded confidence (0.9) — one wrapped as a live `Memory`, the
 * other as a `TombstonedMemory` carrying a real `Tombstone`. Three
 * assertions, each one a specific way `effectiveConfidence` could
 * regress without any existing unit test catching it in a build that
 * still typechecks and passes locally:
 *
 *   1. The live, clock-consistent record reports its own recorded
 *      confidence (0.9) UNCHANGED — the disclosed limitation
 *      effective-confidence.ts's own header names ("decay() does not
 *      exist yet"; M3 replaces only this branch). If this ever returns
 *      something other than the recorded value without M3's decay()
 *      being wired in, that disclosed limitation has silently become a
 *      different, unreviewed behavior.
 *   2. The TOMBSTONED record — same 0.9 stored confidence — reports
 *      ZERO_CONFIDENCE. This is the check that would actually catch a
 *      real regression: if a future edit replaced the type-level
 *      `record.status === "tombstoned"` branch with something that reads
 *      the stored number instead (e.g. "confidence <= 0"), this
 *      assertion fails immediately, because the stored number here is
 *      deliberately nonzero.
 *   3. A live record whose `lastAffirmedAt` sits AFTER the `now` handed to
 *      `effectiveConfidence` (a clock-inconsistent pair, not merely an old
 *      timestamp) also reports ZERO_CONFIDENCE — the fail-closed rule
 *      §5.2 specifies for M3's real decay(), already true of this
 *      milestone's honest partial implementation.
 *
 * If any of the three fails — or anything here throws — this reports
 * failure; it never lets an exception escape past the health endpoint.
 */
function runContractsCheck(): ContractsCheckResult {
  const start = performance.now();
  try {
    const requestNow = systemNow();

    const confidenceResult = parseConfidence(0.9);
    if (!confidenceResult.ok) {
      return {
        pass: false,
        elapsedMs: performance.now() - start,
        detail: `parseConfidence(0.9) unexpectedly failed: ${confidenceResult.error.kind}`,
      };
    }
    const highConfidence: Confidence = confidenceResult.value;

    // Well in the past relative to the real clock, so `parseCapturedAt`'s
    // own future-dated check (validated against `requestNow`, the actual
    // moment this request is being handled) never trips.
    const lastAffirmedResult = parseCapturedAt("2024-06-01T00:00:00.000Z", requestNow);
    if (!lastAffirmedResult.ok) {
      return {
        pass: false,
        elapsedMs: performance.now() - start,
        detail: `parseCapturedAt (lastAffirmedAt) unexpectedly failed: ${lastAffirmedResult.error.kind}`,
      };
    }
    const lastAffirmedAt: CapturedAt = lastAffirmedResult.value;

    const sharedCore = {
      id: memoryId("mem-health-check"),
      subject: "health-check:subject",
      predicate: "health-check:predicate",
      value: "health-check-value",
      source: {
        kind: "system" as const,
        sourceId: "health-check:self",
        tier: "direct-avowal" as const,
        revocable: false,
      },
      believedAt: lastAffirmedAt,
      lastAffirmedAt,
      confidence: highConfidence,
      decayPolicy: { kind: "never-decays" as const },
      scope: [{ dimension: "health-check", value: "self-test" }],
    };

    const liveMemory: Memory<string> = { ...sharedCore, status: "believed" };

    const tombstonedMemory: TombstonedMemory<string> = {
      ...sharedCore,
      status: "tombstoned",
      tombstone: {
        id: tombstoneId("ts-health-check"),
        memoryId: sharedCore.id,
        reason: "superseded",
        forgottenAt: lastAffirmedAt,
        supersededBy: memoryId("mem-health-check-successor"),
      },
    };

    // Assertion 1: live, clock-consistent -> the recorded value, unchanged.
    const liveResult = effectiveConfidence(liveMemory, requestNow);
    const liveReportsRecorded = liveResult === highConfidence;

    // Assertion 2: tombstoned, SAME high stored confidence -> zero. This is
    // the one that actually exercises the structural discrimination rather
    // than a value comparison that a stored 0.9 would defeat.
    const tombstonedReportsZero = effectiveConfidence(tombstonedMemory, requestNow) === ZERO_CONFIDENCE;

    // Assertion 3: live, but `now` handed to the query is BEFORE the
    // memory's own lastAffirmedAt -> clock-inconsistency -> zero, never a
    // fabricated high confidence.
    const inconsistentNowResult = parseCapturedAt("2020-01-01T00:00:00.000Z", requestNow);
    if (!inconsistentNowResult.ok) {
      return {
        pass: false,
        elapsedMs: performance.now() - start,
        detail: `parseCapturedAt (inconsistentNow) unexpectedly failed: ${inconsistentNowResult.error.kind}`,
      };
    }
    const clockInconsistentReportsZero =
      effectiveConfidence(liveMemory, inconsistentNowResult.value) === ZERO_CONFIDENCE;

    const pass = liveReportsRecorded && tombstonedReportsZero && clockInconsistentReportsZero;
    return {
      pass,
      elapsedMs: performance.now() - start,
      detail: pass
        ? `effectiveConfidence: live->recorded (${liveResult}), tombstoned->0 despite a 0.9 stored value, clock-inconsistent->0`
        : `contracts check failed: liveReportsRecorded=${liveReportsRecorded} tombstonedReportsZero=${tombstonedReportsZero} clockInconsistentReportsZero=${clockInconsistentReportsZero}`,
    };
  } catch (err) {
    return {
      pass: false,
      elapsedMs: performance.now() - start,
      detail: `contracts check threw: ${err instanceof Error ? err.message : "unknown error"}`,
    };
  }
}

export async function GET(): Promise<Response> {
  const contracts = runContractsCheck();

  const body = {
    status: contracts.pass ? "ok" : "degraded",
    // Set FOR us by Vercel on every deployment — see .env.example. Unset in
    // local dev, where the honest answer is "unknown," never a guessed or
    // hardcoded SHA: a health endpoint that fabricates its own provenance
    // is worse than one that admits it doesn't know.
    commit: process.env.VERCEL_GIT_COMMIT_SHA ?? "unknown (local dev)",
    checks: {
      contracts: {
        pass: contracts.pass,
        elapsedMs: Math.round(contracts.elapsedMs * 1000) / 1000,
        detail: contracts.detail,
      },
    },
  };

  // Fail closed: a health endpoint that reports 200 while the one thing it
  // actually verified is broken is worse than no health endpoint at all.
  return Response.json(body, { status: contracts.pass ? 200 : 503 });
}

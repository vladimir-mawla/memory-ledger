import { MILESTONES, currentMilestone } from "./milestones";

/**
 * Root page — still infrastructure only at M2, not the interactive demo
 * (that is M8's job, see .genesis/PLAN.md). This exists so the deployed
 * skeleton says, plainly, exactly how far along the project is instead of
 * a static "placeholder" sentence that would go stale the moment any
 * milestone's status changed.
 *
 * Progress is read from app/milestones.ts, never hardcoded into this
 * prose — see that file's comment for why (a hardcoded milestone number
 * on a sibling project's public page went stale for two milestones).
 * `doneCount` below is COMPUTED from that module at render time, so this
 * file never needs a second edit purely because a milestone's status
 * changed. What still needs saying in prose, because the count alone
 * doesn't say it: ONE milestone (M1, contracts) has BUILT code, and even
 * that is not yet independently verified — nothing on this page may imply
 * a decay, contradiction, or forgetting engine exists, because none of
 * lib/decay, lib/contradiction, or lib/store exist yet, regardless of how
 * many milestones this module ever marks done.
 */
export default function Home() {
  const current = currentMilestone();
  const doneCount = MILESTONES.filter((m) => m.status === "done").length;

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>memory-ledger</h1>
      <p>
        Memory that knows it might be wrong: a typed, append-only store of beliefs with source,
        confidence, freshness, scope, and an explicit, provable forgetting policy.
      </p>
      <p>
        This is a deploy skeleton. No decay, contradiction, or forgetting engine exists yet —
        only the typed contracts (M1, built but not yet independently verified) and this app
        shell (M2).
      </p>
      <p>
        <strong>
          {doneCount} of {MILESTONES.length} milestones verified done.
        </strong>{" "}
        {current ? (
          <>
            In progress: M{current.id} — {current.title}.
          </>
        ) : (
          "All milestones done."
        )}
      </p>
      <ul>
        {MILESTONES.map((m) => (
          <li key={m.id}>
            M{m.id} — {m.title} ({m.status})
          </li>
        ))}
      </ul>
      <p>
        <a href="/api/health">/api/health</a> reports the deployed commit SHA and a live check of
        the M1 contracts&rsquo; <code>effectiveConfidence</code> behavior.
      </p>
    </main>
  );
}

import { MILESTONES, currentMilestone } from "./milestones";
import { DemoAssistant } from "../components/DemoAssistant";

/**
 * Root page. Two things share it, the same split shadow-run's own
 * app/page.tsx settled on for its M8: the milestone-status prose that has
 * lived here since M2 (kept — app/milestones.ts is still the one place a
 * reader should trust for "how far along is this"), and, below it, the
 * actual interactive demo this project is built to show
 * (`memory-plan.md` §8, `.genesis/PLAN.md`'s M8 row).
 *
 * THIS COMMENT USED TO SAY nothing on this page may imply a decay,
 * contradiction, or forgetting engine exists. That was true through M2 and
 * is FALSE now: M3/M4/M5/M6 are all merged, and `<DemoAssistant />` below
 * calls `recordFact()`/`query()` for real, client-side, on every click —
 * leaving the old sentence in place after it stopped being true would be
 * exactly the comment-contradicts-code mistake this project's own
 * discipline exists to catch. `doneCount` is still computed from
 * `app/milestones.ts` at render time rather than hardcoded, for the same
 * "never let a public page's prose go stale" reason M2's version of this
 * comment gave — and M8 itself is not marked `done` here, or in
 * `.genesis/DONE.html`, by this build: that flip is the orchestrator's
 * call after independent verification, not this milestone's own to make.
 */
export default function Home() {
  const current = currentMilestone();
  const doneCount = MILESTONES.filter((m) => m.status === "done").length;

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>memory-ledger</h1>
      <p>
        Memory that knows it might be wrong: a typed, append-only store of beliefs with source,
        confidence, freshness, scope, and an explicit, provable forgetting policy.
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

      <h2>See it live</h2>
      <p>
        Tell the assistant your shipping address. Months later, tell it you moved — phrased
        completely differently. Ask a third time, in your original words. Every button below calls
        the real engine (<code>recordFact()</code>, <code>query()</code>, and — inside the two
        panels below — <code>effectiveConfidence()</code>, <code>queryConfidence()</code>, and the
        fair baseline&rsquo;s own <code>rankBySimilarity()</code>) client-side, with no network
        round-trip. Open your browser&rsquo;s Network tab and click through it: nothing fires.
      </p>
      <DemoAssistant />
    </main>
  );
}

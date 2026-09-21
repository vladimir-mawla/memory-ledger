/**
 * Single source of truth for the progress shown on the landing page
 * (app/page.tsx). Copied as a mechanism from decision-engine's and
 * shadow-run's own app/milestones.ts: on an earlier sibling project, the
 * landing page's prose once hardcoded its milestone number directly ("we're
 * on milestone 4...") and that text stayed stale on a public URL for two
 * whole milestones, because updating it meant remembering to hunt down the
 * sentence. The fix is structural, not procedural: exactly one place —
 * this array — knows the milestone list and each one's status.
 * app/page.tsx only ever reads MILESTONES and currentMilestone(); it never
 * writes a milestone number into its own text.
 *
 * Mirrors the milestone table in .genesis/PLAN.md / .genesis/DONE.html
 * (titles shortened for display). This file is NOT read by the genesis
 * loop tooling — PLAN.md remains the machine-parseable source for loops;
 * this is the human-facing mirror for the deployed page. Keep the two in
 * sync when a milestone's title or status changes — app/milestones.test.ts
 * enforces that the *set of milestones claimed done* never drifts from
 * .genesis/DONE.html, even if this comment is forgotten.
 *
 * STATUS AS OF THIS M2 PASS: M1's commits are on `main` (lib/contracts/**,
 * ADR 0001), but M1 is NOT marked `done` here — a separate PR (#2,
 * "mark-m1-done") exists specifically to flip that, pending independent
 * (L4) verification, and this M2 build deliberately does not touch it or
 * pre-empt its outcome. `.genesis/DONE.html`'s own M1 row still carries the
 * `todo` pill on `main` as of this commit, so marking M1 "done" in THIS
 * module while that table says otherwise is exactly the drift
 * app/milestones.test.ts exists to catch. M1 is therefore "in-progress"
 * here (built, awaiting the separate verification that would earn `done`)
 * — as is M2 itself, for the same reason: this PR makes the M2 code
 * import-ready, but the milestone's own success criterion is a real
 * `$DEPLOY_URL` answering `curl -sf $DEPLOY_URL/api/health`, which cannot
 * happen until a human completes the Vercel import (see the PR
 * description). Neither is flipped to `done` by the building agent's own
 * say-so.
 */
export interface Milestone {
  readonly id: number;
  readonly title: string;
  readonly status: "done" | "in-progress" | "planned";
}

export const MILESTONES: readonly Milestone[] = [
  { id: 1, title: "Contracts: Memory, ForgetReason, Tombstone, BeliefAnswer", status: "done" },
  { id: 2, title: "Deploy a live skeleton to Vercel", status: "done" },
  { id: 3, title: "The decay engine", status: "done" },
  { id: 4, title: "The contradiction engine", status: "done" },
  { id: 5, title: "The forgetting engine (tombstoning)", status: "planned" },
  { id: 6, title: "Domain: the personal-assistant memory adapter", status: "planned" },
  { id: 7, title: "The failure suite", status: "planned" },
  { id: 8, title: "The interactive demo", status: "planned" },
  { id: 9, title: "Deliverables", status: "planned" },
] as const;

/**
 * The milestone the page should describe as "current". Prefers an
 * in-progress milestone; falls back to the first not-yet-done one if none
 * is explicitly marked in-progress (e.g. between loop runs); returns
 * undefined only if every milestone is done, in which case the page
 * should say so rather than name a milestone at all.
 */
export function currentMilestone(): Milestone | undefined {
  return (
    MILESTONES.find((m) => m.status === "in-progress") ??
    MILESTONES.find((m) => m.status === "planned")
  );
}

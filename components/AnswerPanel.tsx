import type { JSX } from "react";
import type { CapturedAt } from "../lib/contracts/captured-at.js";
import { effectiveConfidence } from "../lib/contracts/effective-confidence.js";
import { assertNeverBeliefAnswer, type BeliefAnswer } from "../lib/contracts/belief-answer.js";
import type { TombstonedMemory } from "../lib/contracts/tombstoned-memory.js";
import { queryConfidence } from "../lib/decay/query-confidence.js";
import type { ShippingAddress } from "../domains/personal-assistant/index.js";
import { card, mono, muted } from "./styles.js";

/**
 * `AnswerPanel` — the ledger's half of §8's side-by-side moment. Renders
 * ONLY what `query()` (`domains/personal-assistant/store.ts`) actually
 * returned for the real, live call `DemoAssistant` just made — never a
 * value this component computes or guesses at itself. The exhaustive
 * `switch` below (with `assertNeverBeliefAnswer` in the default arm)
 * mirrors `scripts/demo-memory.ts`'s own `printAnswer`, not a new
 * convention invented for this component: every one of `BeliefAnswer`'s
 * four variants is handled by name, because in the live UI a viewer could
 * in principle reach any of them (an edited query, a re-sent message with
 * different confidence) even though the scripted §8 flow only ever
 * produces `"believed"`.
 *
 * `Memory.status` DISCLAIMER — ADR 0005's own forward note for this
 * milestone: "a UI or documentation author reading a `Memory` value
 * should not infer current belief status from its own `.status` field...
 * the real, current answer is always whatever `queryBelief()` returns."
 * This component never reads `.status` to decide what to render (the
 * `BeliefAnswer.status` discriminant it switches on is a DIFFERENT field,
 * computed fresh by `queryBelief` itself, not read off a stored record) —
 * but `oldMemory.status` ("tombstoned") is still printed, once, as a
 * label, with the caption below stating plainly what it is and is not.
 */
export function AnswerPanel({
  answer,
  oldMemory,
  now,
}: {
  readonly answer: BeliefAnswer<ShippingAddress>;
  readonly oldMemory: TombstonedMemory<ShippingAddress> | undefined;
  readonly now: CapturedAt;
}): JSX.Element {
  return (
    <div style={card}>
      <h3 style={{ marginTop: 0 }}>This system&rsquo;s answer</h3>
      <p style={muted}>
        Real output of <code style={mono}>query()</code> → <code style={mono}>queryBelief()</code>, called
        just now. Nothing below is written by this component.
      </p>
      <AnswerBody answer={answer} />
      {oldMemory ? <OldMemoryProof oldMemory={oldMemory} now={now} /> : null}
    </div>
  );
}

function AnswerBody({ answer }: { readonly answer: BeliefAnswer<ShippingAddress> }): JSX.Element {
  switch (answer.status) {
    case "believed":
      return (
        <p>
          <strong>Believed:</strong> {formatAddress(answer.memory.value)} — confidence{" "}
          <code style={mono}>{answer.confidence.toFixed(3)}</code>, source{" "}
          <code style={mono}>{answer.memory.source.sourceId}</code>.
        </p>
      );
    case "doubted":
      return (
        <p>
          <strong>Doubted:</strong> {formatAddress(answer.memory.value)} — confidence{" "}
          <code style={mono}>{answer.confidence.toFixed(3)}</code>, reason <code style={mono}>{answer.reason}</code>.
        </p>
      );
    case "disputed":
      return (
        <p>
          <strong>Disputed</strong> — two live candidates disagree and neither won mechanically:{" "}
          {answer.candidates.map((m) => formatAddress(m.value)).join(" vs. ")}.
        </p>
      );
    case "unknown":
      return (
        <p>
          <strong>Unknown</strong> ({answer.reason}) — {answer.tombstones.length} known tombstone(s).
        </p>
      );
    default:
      return assertNeverBeliefAnswer(answer);
  }
}

/**
 * The second half of §8's demo moment: the OLD memory's `effectiveConfidence`
 * at zero, and the tombstone that proves why. Both numbers below
 * (`effectiveConfidence` from `lib/contracts`, `queryConfidence` from
 * `lib/decay`) are real calls against the real `oldMemory` this component
 * was handed — `memory-plan.md` §3's own point made checkable twice, by two
 * independently-written functions that are required to agree (see each
 * function's own header for why they can never disagree on a tombstoned
 * record specifically).
 */
function OldMemoryProof({
  oldMemory,
  now,
}: {
  readonly oldMemory: TombstonedMemory<ShippingAddress>;
  readonly now: CapturedAt;
}): JSX.Element {
  const viaContracts = effectiveConfidence(oldMemory, now);
  const viaDecay = queryConfidence(oldMemory, now);
  const t = oldMemory.tombstone;
  return (
    <div style={{ marginTop: "1rem", paddingTop: "1rem", borderTop: "1px solid #8884" }}>
      <p>
        <strong>No longer current:</strong> {formatAddress(oldMemory.value)} — recorded confidence at creation
        was <code style={mono}>{oldMemory.confidence.toFixed(3)}</code>, but its <em>effectiveConfidence</em> is
        now <code style={mono}>{viaContracts.toFixed(3)}</code> (queryConfidence agrees:{" "}
        <code style={mono}>{viaDecay.toFixed(3)}</code>). The recorded history is untouched — only its status
        changed.
      </p>
      <p style={muted}>
        Its own <code style={mono}>.status</code> field now reads <code style={mono}>&quot;tombstoned&quot;</code>
        . That label is not what decided the answer above — nothing in this engine ever reads a live memory&rsquo;s{" "}
        <code style={mono}>.status</code> to decide anything (a disclosed, deliberate finding — see ADR 0005);
        the current belief is always recomputed fresh by <code style={mono}>query()</code>, the same call that
        produced this whole panel.
      </p>
      <p>
        <strong>Asked to prove it forgot — the tombstone:</strong>
      </p>
      <ul>
        <li>
          reason: <code style={mono}>&quot;{t.reason}&quot;</code>
        </li>
        <li>
          forgotten at: <code style={mono}>{t.forgottenAt}</code>
        </li>
        {t.reason === "contradicted" || t.reason === "superseded" ? (
          <li>
            superseded by: <code style={mono}>{t.supersededBy}</code>
          </li>
        ) : null}
      </ul>
    </div>
  );
}

function formatAddress(a: ShippingAddress): string {
  return `${a.line1}, ${a.city}, ${a.state}`;
}

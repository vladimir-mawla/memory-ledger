"use client";

import { useRef, useState, type JSX } from "react";
import { systemNow, type CapturedAt } from "../lib/contracts/captured-at.js";
import type { BeliefAnswer } from "../lib/contracts/belief-answer.js";
import type { TombstonedMemory } from "../lib/contracts/tombstoned-memory.js";
import {
  DEFAULT_SCOPE,
  EMPTY_STORE,
  SUBJECT,
  derivedInference,
  humanAvowal,
  query,
  recordFact,
  type FactConstructionError,
  type ShippingAddress,
  type StoreState,
} from "../domains/personal-assistant/index.js";
import { AnswerPanel } from "./AnswerPanel.js";
import { BaselinePanel } from "./BaselinePanel.js";
import { button, card, errorText, label, muted, smallInput, textInput } from "./styles.js";

/**
 * `DemoAssistant` — `.genesis/memory-plan.md` §8's demo moment, live and
 * clickable, per PLAN.md's M8 row. THIS COMPONENT NEVER COMPUTES A
 * `BeliefAnswer`, A `Tombstone`, OR A SIMILARITY SCORE ITSELF — every
 * number a viewer sees is the real return of a real call into
 * `domains/personal-assistant/**` (`recordFact`, `query`, and, one layer
 * down inside `AnswerPanel`/`BaselinePanel`, `effectiveConfidence` /
 * `queryConfidence` / `rankBySimilarity`), which in turn are the real,
 * frozen `lib/contradiction`/`lib/decay`/`lib/store` engine calls — the
 * same "render, don't produce" discipline `shadow-run`'s own
 * `InventoryDemo.tsx` states for itself. Open your browser&rsquo;s Network
 * tab while using this: nothing fires. `lib/**`/`domains/**` import no
 * `node:` module outside their own `__tests__/` (confirmed directly, `git
 * grep -rn 'from "node:' lib domains --include=*.ts` excluding
 * `__tests__/`, turns up nothing) — every call below runs entirely in this
 * tab.
 *
 * WHY THE ADDRESS/CONFIDENCE FIELDS ARE NOT ALL FREELY EDITABLE, BUT THE
 * SECOND MESSAGE&rsquo;S SOURCE KIND IS — a deliberate line, not an
 * oversight, redrawn once on review. §8&rsquo;s scenario is specifically
 * the `superseded` case (two same-tier `direct-avowal` memories — ADR
 * 0003&rsquo;s worked contrast), and that stays the DEFAULT, reached with
 * zero interaction. But §2&rsquo;s whole argument for why this project is
 * not RAG rests on THREE of `BeliefAnswer`&rsquo;s four variants being
 * things a similarity ranker structurally cannot produce — `doubted`,
 * `disputed`, and a reasoned `unknown` — and a demo that only ever reaches
 * `believed` shows the one variant retrieval CAN produce, leaving the rest
 * of §2&rsquo;s argument as prose nobody can click on. So exactly one more
 * control exists: &ldquo;how did the assistant learn this?&rdquo; for the
 * SECOND message, `direct` (default) or `derived`. That one control
 * changes ONE FIELD of the real `FactInput` handed to the real
 * `recordFact()` — `source: humanAvowal(...) | derivedInference(...)` — and
 * the real, frozen `resolveTierSplit` (`lib/contradiction/tier-split.ts`)
 * decides the rest: an older `direct-avowal` contradicted by a newer
 * `derived-inference` is tier-case 4, `disputed`, unconditionally. This
 * component contains no `if (derived) show disputed` anywhere — see
 * `handleSendNew`, below, which only ever changes the `source` argument,
 * never branches on an expected outcome. A confidence SLIDER was
 * considered and rejected: `Memory.confidence` plays no role in
 * `resolveTierSplit`&rsquo;s decision at all (that file&rsquo;s own
 * header), so a slider would invite a viewer to fiddle with a number that
 * cannot change the outcome, which is worse than not offering it.
 */

const DEFAULT_OLD_UTTERANCE = "My shipping address is 42 Elm Street, Portland.";
const DEFAULT_NEW_UTTERANCE = "I moved — my new address is 118 Birch Avenue, Seattle.";
const DEFAULT_QUERY = "What's my shipping address?";

/** The first message is always a direct avowal, at this codebase's own standard confidence for one (`scripts/demo-memory.ts`'s own corpus uses the same 0.9). */
const OLD_CONFIDENCE = 0.9;

type SourceKind = "direct" | "derived";

/**
 * The second message's confidence follows its source kind, not a separate
 * control — 0.9 for a direct avowal (unchanged from §8's default path),
 * 0.6 for a derived inference, matching the real values
 * `scripts/demo-memory.ts`'s own corpus uses for its calendar/contacts
 * integration guesses. Recorded ONLY for realism: per `tier-split.ts`'s own
 * header, `Memory.confidence` plays no role in `superseded`-vs-`disputed`
 * at all — only `source.tier` does.
 */
function newConfidenceFor(kind: SourceKind): number {
  return kind === "direct" ? 0.9 : 0.6;
}

interface AddressFields {
  readonly line1: string;
  readonly city: string;
  readonly state: string;
}

function addressComplete(a: AddressFields): boolean {
  return a.line1.trim() !== "" && a.city.trim() !== "" && a.state.trim() !== "";
}

function describeFactError(error: FactConstructionError): string {
  return `Could not record that (${error.field}: ${error.detail.error.kind}). Try again.`;
}

export function DemoAssistant(): JSX.Element {
  const [store, setStore] = useState<StoreState<ShippingAddress>>(EMPTY_STORE as StoreState<ShippingAddress>);
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [error, setError] = useState<string | null>(null);

  const [oldUtterance, setOldUtterance] = useState(DEFAULT_OLD_UTTERANCE);
  const [oldAddress, setOldAddress] = useState<AddressFields>({ line1: "42 Elm Street", city: "Portland", state: "OR" });
  const [sentOldUtterance, setSentOldUtterance] = useState<string | null>(null);

  const [newUtterance, setNewUtterance] = useState(DEFAULT_NEW_UTTERANCE);
  const [newAddress, setNewAddress] = useState<AddressFields>({ line1: "118 Birch Avenue", city: "Seattle", state: "WA" });
  const [sentNewUtterance, setSentNewUtterance] = useState<string | null>(null);
  // Default "direct" lands on §8's own headline path with zero interaction
  // — see this file's header for why "derived" exists at all.
  const [newSourceKind, setNewSourceKind] = useState<SourceKind>("direct");

  const [queryText, setQueryText] = useState(DEFAULT_QUERY);
  const [askedQueryText, setAskedQueryText] = useState<string | null>(null);
  const [answer, setAnswer] = useState<BeliefAnswer<ShippingAddress> | null>(null);
  const [answeredAt, setAnsweredAt] = useState<CapturedAt | null>(null);

  // See this file's header — a self-generated, live wall-clock CapturedAt,
  // never a hardcoded literal. `lastMs` guards only against two sends
  // landing in the SAME millisecond (a fast double-click), so `recordFact`'s
  // own strict `believedAt` ordering (store.ts's `eligibleOlder` filter)
  // always sees message 2 as strictly after message 1 — the real-clock
  // case this matters for is rare, but a live demo should not depend on
  // never hitting it. Mirrors `captured-at.ts`'s own `systemNow()` — the
  // one authorized `new Date(...).toISOString() as CapturedAt` construction
  // in this codebase — applied at the same real-clock boundary here.
  const lastMs = useRef(0);
  function nextNow(): CapturedAt {
    const real = systemNow();
    const realMs = Date.parse(real);
    if (realMs > lastMs.current) {
      lastMs.current = realMs;
      return real;
    }
    lastMs.current += 1;
    return new Date(lastMs.current).toISOString() as CapturedAt;
  }

  function handleSendOld(): void {
    setError(null);
    const now = nextNow();
    const outcome = recordFact(
      store,
      {
        predicate: "shipping-address",
        value: { line1: oldAddress.line1, city: oldAddress.city, state: oldAddress.state },
        source: humanAvowal(SUBJECT),
        believedAtRaw: now,
        confidenceRaw: OLD_CONFIDENCE,
        utterance: oldUtterance,
      },
      now,
    );
    if (!outcome.ok) {
      setError(describeFactError(outcome.error));
      return;
    }
    setStore(outcome.result.state);
    setSentOldUtterance(oldUtterance);
    setStep(1);
  }

  function handleSendNew(): void {
    setError(null);
    const now = nextNow();
    // The ONLY place `newSourceKind` is read: it picks which real
    // `Provenance` constructor to call. Everything past this line is the
    // same `recordFact()` call regardless of which one was chosen — the
    // engine, not this component, decides whether that makes the write
    // `superseded` or `disputed`. See this file's header.
    const source = newSourceKind === "direct" ? humanAvowal(SUBJECT) : derivedInference(SUBJECT);
    const outcome = recordFact(
      store,
      {
        predicate: "shipping-address",
        value: { line1: newAddress.line1, city: newAddress.city, state: newAddress.state },
        source,
        believedAtRaw: now,
        confidenceRaw: newConfidenceFor(newSourceKind),
        utterance: newUtterance,
      },
      now,
    );
    if (!outcome.ok) {
      setError(describeFactError(outcome.error));
      return;
    }
    setStore(outcome.result.state);
    setSentNewUtterance(newUtterance);
    setStep(2);
  }

  function handleAsk(): void {
    setError(null);
    const now = systemNow();
    const { state: nextState, result } = query(store, SUBJECT, "shipping-address", DEFAULT_SCOPE, now);
    setStore(nextState);
    setAnswer(result.answer);
    setAnsweredAt(now);
    setAskedQueryText(queryText);
    setStep(3);
  }

  function handleReset(): void {
    setStore(EMPTY_STORE as StoreState<ShippingAddress>);
    setStep(0);
    setError(null);
    setSentOldUtterance(null);
    setSentNewUtterance(null);
    setAskedQueryText(null);
    setAnswer(null);
    setAnsweredAt(null);
    setOldUtterance(DEFAULT_OLD_UTTERANCE);
    setOldAddress({ line1: "42 Elm Street", city: "Portland", state: "OR" });
    setNewUtterance(DEFAULT_NEW_UTTERANCE);
    setNewAddress({ line1: "118 Birch Avenue", city: "Seattle", state: "WA" });
    setNewSourceKind("direct");
    setQueryText(DEFAULT_QUERY);
  }

  // The tombstone `recordFact`'s own eager resolution (store.ts) produces
  // the MOMENT message 2 is sent — not something this component waits for
  // the "Ask" step to discover. Found by scanning `store.tombstoned` for
  // the shipping-address record superseded by contradiction, the same
  // lookup `scripts/demo-memory.ts` itself does.
  const oldMemory: TombstonedMemory<ShippingAddress> | undefined = store.tombstoned.find(
    (t) => t.predicate === "shipping-address" && t.tombstone.reason === "contradicted",
  );

  return (
    <div>
      <div style={card}>
        <h3 style={{ marginTop: 0 }}>1. Tell the assistant your shipping address</h3>
        <label style={label} htmlFor="old-utterance">
          What you say
        </label>
        <input
          id="old-utterance"
          style={textInput}
          value={oldUtterance}
          disabled={step >= 1}
          onChange={(e) => setOldUtterance(e.target.value)}
        />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem" }}>
          <input
            style={smallInput}
            placeholder="Street"
            value={oldAddress.line1}
            disabled={step >= 1}
            onChange={(e) => setOldAddress({ ...oldAddress, line1: e.target.value })}
          />
          <input
            style={smallInput}
            placeholder="City"
            value={oldAddress.city}
            disabled={step >= 1}
            onChange={(e) => setOldAddress({ ...oldAddress, city: e.target.value })}
          />
          <input
            style={smallInput}
            placeholder="State"
            value={oldAddress.state}
            disabled={step >= 1}
            onChange={(e) => setOldAddress({ ...oldAddress, state: e.target.value })}
          />
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          {step === 0 ? (
            <button style={button} disabled={!addressComplete(oldAddress) || oldUtterance.trim() === ""} onClick={handleSendOld}>
              Send
            </button>
          ) : (
            <p style={muted}>
              ✓ Recorded — <code>shipping-address</code> = {oldAddress.line1}, {oldAddress.city}, {oldAddress.state} (confidence{" "}
              {OLD_CONFIDENCE.toFixed(3)}, tier direct-avowal, status &ldquo;believed&rdquo; — a label assigned at
              creation, not read by any engine below to decide anything).
            </p>
          )}
        </div>
      </div>

      <div style={{ ...card, opacity: step >= 1 ? 1 : 0.5 }}>
        <h3 style={{ marginTop: 0 }}>2. Months later: tell it you moved — phrase it differently</h3>
        <label style={label} htmlFor="new-utterance">
          What you say
        </label>
        <input
          id="new-utterance"
          style={textInput}
          value={newUtterance}
          disabled={step < 1 || step >= 2}
          onChange={(e) => setNewUtterance(e.target.value)}
        />
        <fieldset style={{ border: "none", padding: 0, margin: "0 0 0.5rem" }}>
          <legend style={label}>How did the assistant learn this? (defaults to the §8 scenario)</legend>
          <label style={{ display: "block", marginBottom: "0.25rem" }}>
            <input
              type="radio"
              name="new-source-kind"
              checked={newSourceKind === "direct"}
              disabled={step < 1 || step >= 2}
              onChange={() => setNewSourceKind("direct")}
            />{" "}
            You told it directly
          </label>
          <label style={{ display: "block" }}>
            <input
              type="radio"
              name="new-source-kind"
              checked={newSourceKind === "derived"}
              disabled={step < 1 || step >= 2}
              onChange={() => setNewSourceKind("derived")}
            />{" "}
            It was inferred — e.g. parsed from an email, not stated directly
          </label>
        </fieldset>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: "0.5rem" }}>
          <input
            style={smallInput}
            placeholder="Street"
            value={newAddress.line1}
            disabled={step < 1 || step >= 2}
            onChange={(e) => setNewAddress({ ...newAddress, line1: e.target.value })}
          />
          <input
            style={smallInput}
            placeholder="City"
            value={newAddress.city}
            disabled={step < 1 || step >= 2}
            onChange={(e) => setNewAddress({ ...newAddress, city: e.target.value })}
          />
          <input
            style={smallInput}
            placeholder="State"
            value={newAddress.state}
            disabled={step < 1 || step >= 2}
            onChange={(e) => setNewAddress({ ...newAddress, state: e.target.value })}
          />
        </div>
        <div style={{ marginTop: "0.75rem" }}>
          {step < 1 ? (
            <p style={muted}>Waiting for step 1.</p>
          ) : step === 1 ? (
            <button style={button} disabled={!addressComplete(newAddress) || newUtterance.trim() === ""} onClick={handleSendNew}>
              Send
            </button>
          ) : (
            <p style={muted}>
              ✓ Recorded — {oldMemory && oldMemory.tombstone.reason === "contradicted" ? (
                <>
                  and the old address was tombstoned immediately: reason{" "}
                  <code>&quot;{oldMemory.tombstone.reason}&quot;</code>, superseded by{" "}
                  <code>{oldMemory.tombstone.supersededBy}</code>.
                </>
              ) : (
                // NOT "no contradiction was detected" — that would overclaim.
                // recordFact()'s own eager pass (store.ts) only ever
                // tombstones on a "superseded" or tier-upgraded "no-conflict"
                // outcome; a real, live "disputed" contradiction leaves BOTH
                // memories live and produces no tombstone at all until
                // queryBelief() resolves it — so "nothing was tombstoned yet"
                // is not evidence that nothing disagrees.
                "how this resolves against the first message isn't decided yet — ask below to see."
              )}
            </p>
          )}
        </div>
      </div>

      <div style={{ ...card, opacity: step >= 2 ? 1 : 0.5 }}>
        <h3 style={{ marginTop: 0 }}>3. Ask a third time, in your original words</h3>
        <label style={label} htmlFor="query-text">
          Your question
        </label>
        <input
          id="query-text"
          style={textInput}
          value={queryText}
          disabled={step < 2}
          onChange={(e) => setQueryText(e.target.value)}
        />
        <button style={button} disabled={step < 2 || queryText.trim() === ""} onClick={handleAsk}>
          Ask
        </button>
      </div>

      {error ? <p style={errorText}>{error}</p> : null}

      {step === 3 && answer && answeredAt && askedQueryText !== null && sentOldUtterance !== null && sentNewUtterance !== null ? (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "1rem" }}>
          <AnswerPanel answer={answer} oldMemory={oldMemory} now={answeredAt} />
          <BaselinePanel
            queryText={askedQueryText}
            oldText={sentOldUtterance}
            oldLabel="Old address"
            newText={sentNewUtterance}
            newLabel="New address"
            ledgerStatus={answer.status}
          />
        </div>
      ) : null}

      <div style={{ marginTop: "1rem" }}>
        <button style={{ ...button, opacity: 0.8 }} onClick={handleReset}>
          Reset demo
        </button>
      </div>
    </div>
  );
}

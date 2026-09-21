# 90-second walkthrough script

Built around the live demo on `/`, under the &ldquo;See it live&rdquo; heading (`components/DemoAssistant.tsx`,
driven with `npm run dev` or the deployed URL — identical either way, for the reason this page&rsquo;s own
on-screen copy states and `git grep -rn 'from "node:' lib domains` (excluding `__tests__/`) confirms directly:
the whole pipeline — `recordFact()`, `query()`, `effectiveConfidence()`, `queryConfidence()`,
`rankBySimilarity()` — runs client-side, reads no network state, and is verified here against this branch&rsquo;s
own real output, with the browser&rsquo;s Network tab open the whole time. One continuous take. Every line of
copy and every number below was read off an actual run of this exact branch — nothing here is
`memory-plan.md` §8&rsquo;s prose re-typed without checking it against a real run.

**A real finding this script had to account for, not paper over:** the exact cosine-similarity numbers
(`0.5303` / `0.3162`) only reproduce §8&rsquo;s own prediction when the query echoes the first message&rsquo;s
wording (&ldquo;shipping&rdquo;), exactly as the plan specifies. Verified live, off-script, before writing this
table: asking a genuinely different question (&ldquo;Where should my order be shipped?&rdquo;) still makes the
baseline pick the stale address, but at different, still-real numbers (`0.1443` / `0.1291`) — the baseline is
never hardcoded to lose one specific way, it just structurally has no way to notice the old address was ever
superseded. That off-script run is not part of the timed take below, but a presenter with a spare moment should
edit the question live and show the numbers change for real.

| # | Time | What to click / point at | What to say |
|---|------|---------------------------|--------------|
| 1 | 0:00–0:08 (8s) | Scroll to &ldquo;See it live.&rdquo; Point at step 1&rsquo;s prefilled message, &ldquo;My shipping address is 42 Elm Street, Portland.&rdquo; | &ldquo;A real personal-assistant memory store, running entirely in this tab. I&rsquo;ll tell it my address.&rdquo; |
| 2 | 0:08–0:20 (12s) | Click **Send**. Point at the confirmation line: &ldquo;Recorded — `shipping-address` = 42 Elm Street, Portland, OR (confidence 0.900, tier direct-avowal).&rdquo; | &ldquo;That&rsquo;s a real `recordFact()` call — the actual, frozen engine, not a script pretending to.&rdquo; |
| 3 | 0:20–0:35 (15s) | Point at step 2&rsquo;s prefilled message — completely different phrasing: &ldquo;I moved — my new address is 118 Birch Avenue, Seattle.&rdquo; Click **Send**. Point at: &ldquo;the old address was tombstoned immediately: reason `"contradicted"`, superseded by `memory:shipping-address:…`.&rdquo; | &ldquo;Months later, in totally different words, I tell it I moved. The tombstone isn&rsquo;t discovered later — it&rsquo;s produced the instant the contradiction is detected.&rdquo; |
| 4 | 0:35–0:45 (10s) | Point at step 3&rsquo;s prefilled question — my *original* phrasing: &ldquo;What&rsquo;s my shipping address?&rdquo; Click **Ask**. | &ldquo;Now I ask it back, in the exact words I used the first time.&rdquo; |
| 5 | 0:45–1:00 (15s) | Point at &ldquo;This system&rsquo;s answer&rdquo;: &ldquo;Believed: 118 Birch Avenue, Seattle, WA&rdquo;, then &ldquo;No longer current: 42 Elm Street… effectiveConfidence is now `0.000`&rdquo;, then the tombstone&rsquo;s reason/forgottenAt/supersededBy. | &ldquo;Right answer. And asked to prove it forgot the old one, it does — reason, timestamp, and exactly which memory replaced it.&rdquo; |
| 6 | 1:00–1:20 (20s) | Point at &ldquo;Fair baseline&rsquo;s answer&rdquo; — the table: `0.5303 ← baseline's pick` on the old address, `0.3162` on the new one. | &ldquo;Same two facts, same question, run through a real bag-of-words cosine ranker — no stopword tuning, no field weighting, no recency signal, both scores on screen so you can check it wasn&rsquo;t tuned. It picks the *stale* address, because my question happens to echo the old message&rsquo;s own wording back.&rdquo; |
| 7 | 1:20–1:30 (10s) | Point at the closing line: &ldquo;It has no mechanism for &lsquo;this was superseded&rsquo; at all — it only ever ranks, never refuses.&rdquo; | &ldquo;That&rsquo;s the whole thesis in one click-through: a similarity ranker can&rsquo;t know what it should have forgotten. This ledger can, and can prove it.&rdquo; |

**Total: 90 seconds.**

**The one line worth protecting if time runs short:** beat 6&rsquo;s — *&ldquo;it picks the stale address, because
my question happens to echo the old message&rsquo;s own wording back.&rdquo;* Per `memory-plan.md` §8&rsquo;s own
argument, this is the one fact that answers a skeptical judge&rsquo;s first objection (&ldquo;you just rigged the
comparison&rdquo;) — the baseline&rsquo;s scoring is fully specified on screen and in
`domains/personal-assistant/baseline.ts`, and it loses for a real, checkable reason, not a configured one.

**What this script does not claim:** the demo&rsquo;s address/confidence fields are prefilled to reproduce
§8&rsquo;s own documented numbers exactly, and this script keeps them as prefilled for the timed take — but they
are real, editable `<input>` fields wired to the real engine, not a static screenshot; the off-script re-run
noted above (different wording, different real scores, same structural loser) is available to a presenter with
a spare moment, the same way `shadow-run`&rsquo;s own walkthrough keeps its repeated-Inject check available
rather than performed by default.

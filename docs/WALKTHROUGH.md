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
edit the question live and show the numbers change for real. It is the single best evidence in this whole demo
that nothing is pre-baked — no assertion could show that as convincingly as watching the numbers move.

| # | Time | What to click / point at | What to say |
|---|------|---------------------------|--------------|
| 1 | 0:00–0:06 (6s) | Scroll to &ldquo;See it live.&rdquo; Point at step 1&rsquo;s prefilled message, &ldquo;My shipping address is 42 Elm Street, Portland.&rdquo; | &ldquo;A real personal-assistant memory store, running entirely in this tab.&rdquo; |
| 2 | 0:06–0:14 (8s) | Click **Send**. Point at: &ldquo;Recorded — `shipping-address` = 42 Elm Street, Portland, OR (confidence 0.900, tier direct-avowal).&rdquo; | &ldquo;That&rsquo;s a real `recordFact()` call — the actual engine, not a script pretending to.&rdquo; |
| 3 | 0:14–0:26 (12s) | Point at step 2&rsquo;s differently-phrased message and, below it, the toggle — left on its default, &ldquo;You told it directly.&rdquo; Click **Send**. Point at: &ldquo;tombstoned immediately: reason `"contradicted"`.&rdquo; | &ldquo;Months later, in different words, I say I moved. Left on its default, this is a direct statement — the tombstone appears the instant the contradiction is detected.&rdquo; |
| 4 | 0:26–0:33 (7s) | Point at step 3&rsquo;s prefilled question — my *original* phrasing. Click **Ask**. | &ldquo;Now I ask it back, in the exact words I used the first time.&rdquo; |
| 5 | 0:33–0:45 (12s) | Point at &ldquo;Believed: 118 Birch Avenue, Seattle, WA,&rdquo; then &ldquo;No longer current… effectiveConfidence is now `0.000`,&rdquo; then the tombstone&rsquo;s reason/forgottenAt/supersededBy. | &ldquo;Right answer, and asked to prove it forgot the old one, it does.&rdquo; |
| 6 | 0:45–0:58 (13s) | Point at &ldquo;Fair baseline&rsquo;s answer&rdquo; — `0.5303 ← baseline's pick` on the old address, `0.3162` on the new one. | &ldquo;Same two facts, same question, a real cosine ranker — no tuning, both scores on screen. It picks the *stale* one, because my question echoes its wording back.&rdquo; |
| 7 | 0:58–1:16 (18s) | Click **Reset demo**. Click **Send** (message 1, unchanged). This time select **&ldquo;It was inferred — e.g. parsed from an email&rdquo;** for message 2, then **Send**, then **Ask**. Point at: &ldquo;Disputed: two live candidates disagree&rdquo; — both addresses listed, one `tier direct-avowal`, one `tier derived-inference`. | &ldquo;One control, one real input change — nothing else in this page decided that. The engine itself won&rsquo;t let an inference silently overturn a direct statement, so now it reports both and tombstones neither.&rdquo; |
| 8 | 1:16–1:30 (14s) | Point at the baseline panel&rsquo;s new line: &ldquo;Notice what this baseline just did… it always ranks, and always hands back exactly one &lsquo;winner.&rsquo;&rdquo; | &ldquo;Same baseline, same two facts — it still confidently picks one. It has no way to say &lsquo;I don&rsquo;t know which one,&rsquo; even when that&rsquo;s the honest answer. That&rsquo;s the whole thesis, twice over, from one page.&rdquo; |

**Total: 90 seconds.**

**The one line worth protecting if time runs short:** beat 8&rsquo;s — *&ldquo;it still confidently picks one…
it has no way to say &lsquo;I don&rsquo;t know which one.&rsquo;&rdquo;* Beat 6 alone answers &ldquo;you rigged
the comparison&rdquo; (the baseline&rsquo;s scoring is fully specified on screen and in
`domains/personal-assistant/baseline.ts`, and it loses for a real, checkable reason); beat 8 answers the deeper
objection — that a smarter ranker might just fix this one case — by showing the baseline fail on a SECOND,
structurally different pair, where a ranker cannot represent the honest answer at all, no matter how it&rsquo;s
tuned.

**What this script does not claim:** the demo&rsquo;s address/confidence fields are prefilled to reproduce
§8&rsquo;s own documented numbers exactly, and this script keeps them as prefilled for the timed take — but
every field is a real, editable `<input>` wired to the real engine, not a static screenshot; the off-script
question re-run and the source-kind toggle are both genuinely available to a presenter with a spare moment, the
same way `shadow-run`&rsquo;s own walkthrough keeps its repeated-Inject check available rather than performed by
default. One disclosed limit, stated on screen where the &ldquo;disputed&rdquo; answer itself renders, not just
here: `BeliefAnswer`&rsquo;s frozen `disputed` variant carries no reason field, so a genuine dispute and a
not-comparable pair (mismatched scope, a same-instant tie) render identically — in this demo&rsquo;s own fixed
construction that collapse never actually applies, but the walkthrough should not claim more precision than the
type itself carries.

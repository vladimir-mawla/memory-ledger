# Two-year thesis

Personal-AI-assistant products will keep failing in the same specific way for the next two years: not by
retrieving the wrong fact, but by being structurally unable to say when they stopped believing an old one.
Every shipping assistant today is built on retrieval — rank stored text by similarity to a query — and
similarity has no mechanism for currency, retraction, or self-contradiction. A user who corrects their
assistant keeps watching it resurface the correction's own opposite, because nothing forces two disagreeing
chunks into contact with each other before an answer is generated.

The falsifiable claim: within two years, at least one mainstream consumer AI product will ship a public
postmortem, complaint thread, or feature announcement whose root cause is exactly this — an assistant
confidently repeating information its own user already retracted — treated as a distinct, named failure mode,
not folded into generic "hallucination." If that does not happen, this thesis is wrong, not merely early.

What would have to be true for it to fail: either retrieval-based memory turns out to be a non-issue in
practice (users rarely correct assistants, or the failures stay rare enough to go unnoticed), or the industry
routes around the problem by brute force — larger context windows, aggressive re-summarization, a bigger model
papering over the seam — without ever building an explicit, typed, auditable belief-and-forgetting layer like
the one this project sketches. Both are real possibilities, and either one would mean this project's bet
(confidence, provenance tier, and tombstoned-not-deleted forgetting as first-class, queryable state) solved a
problem the market never needed solved as its own abstraction, rather than one that keeps patching over itself
well enough at the prompt layer.

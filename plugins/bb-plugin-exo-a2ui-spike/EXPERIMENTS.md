# Presentation experiments — summary

Several routes from conversation to canvas were tried in October 2026. The direct route is the one in use; the others are archived in `composition/` and `observer/`, disabled by `src/generation-policy.ts` (including when an old branch is restored), and kept so existing session history still decodes.

| Route | Idea | Outcome |
|---|---|---|
| **Direct agent → A2UI** (active) | The agent writes incremental A2UI over a generic catalog | Kept. Usefulness depends on the presentation guide and the visual catalog, not on extra models |
| Prepared candidates + Jev | The agent prepares a candidate set; [Jev](https://openrouter.ai/docs/guides/community/jev) (a fast typed-decision model) composes, Haiku writes copy | Fast composition, but candidates are guesses standing in for generation; timings excluded preparation. Rejected as contrary to generative UI |
| Streaming observer | Normal prose → Haiku extracts meaning → Jev chooses structure → deterministic A2UI | Real overlap with streaming prose; brittle citations; no end-to-end speed or quality win |
| Lossless document observer | Preserve the full prose hierarchy, Jev chooses layout | Faithful but produced a formatted mirror of the chat, not a useful interface. Stopped |

Lessons:

- Plumbing, streaming, fidelity and persistence are prerequisites, not product success. A visual has to make understanding, choosing or acting easier than prose.
- Preserving every word overcorrected away from useful interfaces; preserve meaning and qualifications instead.
- Generic catalogs beat prepared scenario vocabularies; curated flows should be earned from observed use.
- Compare against the direct baseline and count all preparation and model time, including failures.

Reopen a Jev-style route only with a concrete hypothesis that a bounded decision adds visual or interactive value over the direct baseline.

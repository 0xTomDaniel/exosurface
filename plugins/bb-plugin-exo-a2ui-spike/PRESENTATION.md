# Exo presentation guide

Status: **spike**. Runtime text: `src/presentation-guide.ts` (keep in sync). Guidance for the agent's judgement, not quotas or templates.

## Why

Two failures seen on the direct agent → A2UI route:

1. **A topic switch was appended, not switched.** A request about a new topic created a new panel at the bottom of a six-panel dashboard, because the instructions said to preserve unaffected modules and the frontend showed every module.
2. **Overload.** The new panel packed some forty components into one view, and the chat reply repeated much of it.

Direction: the agent should walk the person along, adapting and morphing the interface as the conversation moves, keeping focus on the current point without forbidding depth. Not every surface is a task; sometimes it is just visual context. No literal wizards. Chat, canvas and later voice are senses of one conversation; chat prefers shorter with a bias to visuals, but length follows need.

## Principles

| Principle | Source | What the agent does |
|---|---|---|
| Stage follows the conversation | Owner direction | One focused surface; earlier ones recede to a shelf, kept and one click back; ≤2 small context surfaces beside. New topic → new or redesigned surface. Delete stale surfaces. |
| Overview first, zoom and filter, details on demand | Shneiderman, “The Eyes Have It” (1996) | First view orients, shows the one thing that matters now and the natural next move. Depth behind Disclosure/Tabs. |
| Coherence, signaling, contiguity, segmenting, pre-training, redundancy/modality | Mayer, *Multimedia Learning* (2nd ed., 12 principles) | Cut what doesn't serve the point; make the key thing visible; label in place; user-paced chunks; name terms first; never put the same words in chat and canvas (with voice: speak the explanation, show the picture). |
| Update and adapt cautiously; show contextually relevant information; remember recent interactions; support efficient correction | Amershi et al., Guidelines for Human-AI Interaction (CHI 2019, 18 guidelines) | Don't move or remove what the person is reading or editing; stable IDs; preserve drafts and submitted values; one primary action per view. |
| Perceptual accuracy of encodings | Cleveland & McGill (1984) | Position and length carry data (bars, lines); colour marks meaning only. |
| Accessibility floor | WCAG 2.2 AA | Never colour alone (tone + words); visible focus; contrast; reduced motion respected. |

Not adopted: step wizards and progress chrome (unless the content is a sequence), fixed component quotas, page/scenario templates.

## Mechanism (spike)

- **Stage**: `layout.focus` (+ optional `layout.beside`, max 2). If the agent omits it, focus becomes the last surface created or structurally redesigned in that update; data-only updates (applying submitted values) do not move it. Deleted focus falls back to context, then the newest surface. Invalid explicit focus is rejected so the agent learns. Pure reducer in `src/stage.ts`, applied identically on native replay; historical layouts (`columns`/`wide`) remain valid.
- **Shelf**: receded surfaces stay mounted (CSS-hidden), so drafts survive. The three most recent are shown, plus any with unsent edits; the rest are behind “N more”. A shelf pick is local and lapses when the agent moves the stage (“Back to the current topic”).
- **Exo visual catalog** `urn:exosurface:catalog:exo-visual:v1` = A2UI basic components + `Callout`, `Metric`, `Timeline`, `Table`, `Chart` (bar/line), `Flow` (layered graph; back-edges looped and dashed; long chains go top-down), `Disclosure`. Schema-only definitions shared by validator and renderer (`src/exo-catalog.ts`); React views in `src/exo-components.tsx`; semantic checks (table shape, flow edges, chart max). Presentational only: no actions, URLs or model HTML except via the official sanitized Markdown renderer. Existing basic-catalog surfaces stay valid; Exo components need an Exo-catalog surface.
- **Bounds**: 8 surfaces, 64 components/surface, depth 8, 40 KB materialized workspace (was 6/24 KB), so a receded history can exist; the guide asks the agent to delete stale surfaces.
- **Look** (`lib/exo-theme.ts`): host light/dark neutrals; one accent (orbit blue `#3e5fd8`) and three meaning tones (teal `#1c8c80` good, amber `#b9770e` caution, `#c2414f` risk). Rounded display face (`ui-rounded`/SF Pro Rounded) for headings and numbers, system text face for reading, tabular numerals. Flat hairline cards, no shadows; chips, tabs, inputs and buttons restyled; one entrance motion when the stage changes; reduced motion respected.

## Chat beside the canvas

When the canvas changes, it carries the content; chat carries only what it cannot (the notable point and why, judgement, a source or confidence caveat, nuance, what the agent needs from the person) — usually one to three sentences, with a self-check against canvas-visible sentences and no meta narration. Implemented as an explicit instruction plus a final `<tone_preference>` reminder, following Anthropic's Opus 5-family verbosity guidance; deliberately no single worked example (examples are copied closely and would anchor on one domain). Measured with `test/reply-metrics.mjs`.

## Context hygiene

The agent and its memory see the view-model, never the view. Canvas updates enter history as "Showed on canvas — …" text; the current canvas reaches each request as a compact outline placed last (stable cached prefix); button presses arrive as readable lines from the person after code commits their values; edits are shared state with no turn.

## Where it lives

Presentation guide: a stable harness system-prompt section `exosurface`. Canvas contract: the `apply_workspace` description, snippet and guidelines (`src/tool-contract.ts`). Reference depth: `skills/exosurface`. Portable as a Pi package (`package.json` `pi` manifest). The agent's general AGENTS.md is not used for Exosurface.

## Limits

Verified with fictional fixtures (`test/stage-fixtures.ts`) in light/dark and desktop/narrow, plus offline tests. Whether the agent follows the guide well is judged in real use: usefulness first (did it walk along, stay focused, show rather than tell?), latency second. Known gaps: wide tables scroll on narrow canvases; context stacks below the stage on canvases under ~1180 px; Flow layout is simple layering; no voice yet.

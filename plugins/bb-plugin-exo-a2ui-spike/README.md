# Exosurface canvas — BB plugin and Pi package

A canvas beside the chat for a personal agent. The agent (a [Pi](https://github.com/earendil-works/pi) coding agent running [OptChat](https://github.com/jonaslsaa/pi-optchat)) presents through it by writing incremental [A2UI](https://a2ui.org) v0.9.1 messages; the person reads, edits and presses buttons; both sides share one state. It runs as a stock [BB](https://getbb.app) plugin (no fork) on an isolated clone of the agent's home, so experiments never touch the owner's main agent.

Status: **spike**, used daily by its author. Graduation to the main agent session is pending.

## What it does

- **Direct agent → A2UI.** The agent authors the canvas with `apply_workspace` (incremental A2UI messages, previewed while they stream, committed by the tool result) over a generic catalog: the A2UI basic components plus an Exo visual set — `Callout`, `Metric`, `Timeline`, `Table`, `Chart` (bar/line), `Flow`, `Disclosure`. No prepared scenario templates.
- **A stage that follows the conversation.** One focused surface; earlier ones recede to a shelf (kept, drafts intact, one click back); at most two small context surfaces beside it. A new or redesigned surface takes the stage automatically.
- **A presentation guide** delivered as a stable system-prompt section: overview first, details on demand; chat complements the canvas instead of repeating it; change cautiously. See [PRESENTATION.md](PRESENTATION.md).
- **Clean context.** Canvas layout never enters conversation history or OptChat memory: each canvas update is recorded as "Showed on canvas — …" text; each request carries a compact outline of the current canvas (ids, types, meaning, input values) placed last so the cached prefix stays stable; full JSON only via `read_workspace`.
- **Shared state.** Edits are saved as revision-checked state with no chat message and no model turn. A button press commits its values by code first, then reaches the chat as one readable line from the person ("▸ Weekend trip · Plan this trip — Which one?: Lake cabin").
- **One typed document.** The canvas is `exosurface.canvas` v1, changed only through a pure reducer — shaped for a near one-to-one move to Pi's durable harness (`src/canvas-doc.ts`).

Next: [NEXT-SPIKE.md](NEXT-SPIKE.md) — the canvas as an equal channel to text.

## Layout

| Path | Role |
|---|---|
| `src/workspace-extension.ts` | Pi extension loaded **before** OptChat: canvas tools, prompt sections, `message_end` rewrite of canvas calls into "what was shown", shared-state commands |
| `src/workspace-frame.ts` | Pi extension loaded **after** OptChat: attaches the per-request canvas outline and records a context-hygiene receipt |
| `src/workspace.ts`, `src/exo-catalog.ts`, `src/stage.ts`, `src/canvas-doc.ts` | Validation, catalog, stage reducer, canvas document |
| `src/presentation-guide.ts`, `src/tool-contract.ts`, `skills/exosurface/` | What the agent is told: guide, tool contract, optional reference skill |
| `src/canvas-memory.ts` | Deterministic text forms: what was shown, the outline, button presses |
| `src/owner-service.ts`, `src/pi-rpc.ts` | Independent per-user owner of the agent process; BB attaches and detaches |
| `server.ts`, `app.tsx`, `src/workspace-view.ts`, `src/exo-components.tsx`, `lib/` | BB plugin server, frontend, renderer, theme |
| `composition/`, `observer/` | Archived experiments (disabled by policy, kept for history decoding); see [EXPERIMENTS.md](EXPERIMENTS.md) |
| `test/*.test.ts` | Offline tests (`npm test`); `test/*.mjs` are live verification scripts for the author's machine |

`package.json` also declares a Pi package (`pi` manifest: extensions and skill).

## Develop

```sh
npm install
npm run typecheck && ./node_modules/.bin/tsc -p tsconfig.live.json
npm test
bb plugin build .   # then: bb plugin reload exo-a2ui-spike
```

Paths in `src/state.ts` and the live scripts point at the author's machine; adjust them for your own setup. `evidence/` (real conversations, paid outputs, screenshots) is never committed.

## Upstream

Runs on pure upstream OptChat plus one fix proposed as [jonaslsaa/pi-optchat#187](https://github.com/jonaslsaa/pi-optchat/pull/187) (end-of-request cache mark, needed when a proxy sets 1h cache TTLs).

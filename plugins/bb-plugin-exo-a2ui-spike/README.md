# Exosurface — BB plugin and Pi package

The surface beside the chat for a personal agent (vocabulary: [GLOSSARY.md](../../GLOSSARY.md)). The agent (a [Pi](https://github.com/earendil-works/pi) coding agent running [OptChat](https://github.com/jonaslsaa/pi-optchat)) draws **pages** on it; the person reads, edits and presses buttons; both sides share one state. It runs as a stock [BB](https://getbb.app) plugin (no fork) on an isolated clone of the agent's home, so experiments never touch the owner's main agent.

Status: **spike**, used daily by its author. Promotion to the main agent session is prepared ([GRADUATION.md](GRADUATION.md)).

## What it does

- **One readable language for pages.** The agent draws, reads and edits pages in a line-per-element snapshot format modelled on Playwright's aria snapshots (`update_exosurface`, `read_exosurface`); code translates to standard [A2UI](https://a2ui.org) v0.9.1 for the renderer. A generic catalog: basic elements plus notes, meters, timelines, tables, charts, flows and collapsible groups. No prepared templates. Pages stream in line by line.
- **Edits by ref.** Small changes replace, insert or remove lines by ref instead of redrawing.
- **A stage that follows the conversation.** One page on stage, up to two beside it, recent ones on the shelf. The system moves older pages into page history on its own; nothing is deleted, and the agent never manages the past.
- **Pages as conversation history.** Each draw or edit appears in the chat as a page card. Opening an earlier version and editing it, or pressing one of its buttons, brings it back with the person's next message (a pill in the input; one at a time; cancel with ✕).
- **Clean context, append-only history.** The agent's calls are stored exactly as written, as readable snapshot lines; no layout JSON reaches requests or OptChat memory, and nothing in history is rewritten. Each request carries an outline of the current surface (current state, never stored). Page edits reach the agent with the person's next message as a labelled `[page-edits]` message.
- **A presentation guide** delivered as a stable system-prompt section: overview first, details on demand; chat complements the surface instead of repeating it. See [PRESENTATION.md](PRESENTATION.md).

Next: [NEXT-SPIKE.md](NEXT-SPIKE.md).

## Layout

| Path | Role |
|---|---|
| `src/workspace-extension.ts` | Pi extension loaded **before** OptChat: page tools, prompt sections, page history, shared-state commands |
| `src/workspace-frame.ts` | Pi extension loaded **after** OptChat: attaches the per-request surface outline and records a context-hygiene receipt |
| `src/workspace.ts`, `src/exo-catalog.ts`, `src/stage.ts`, `src/canvas-doc.ts` | Validation, catalog, stage reducer, surface document |
| `src/presentation-guide.ts`, `src/tool-contract.ts`, `skills/exosurface/` | What the agent is told: guide, tool contract, optional reference skill |
| `src/snapshot-format.ts`, `src/canvas-history.ts`, `src/canvas-memory.ts` | Snapshot format and translation, page versions and history, outline and readable text forms |
| `src/owner-service.ts`, `src/pi-rpc.ts` | Independent per-user owner of the agent process; BB attaches and detaches |
| `server.ts`, `app.tsx`, `src/workspace-view.ts`, `src/exo-components.tsx`, `lib/` | BB plugin server, frontend, renderer, theme |
| `composition/`, `observer/` | Archived experiments (disabled by policy, kept for history decoding); see [EXPERIMENTS.md](EXPERIMENTS.md) |
| `test/*.test.ts` | Offline tests (`npm test`); `test/*.mjs` are live verification scripts for the author's machine |

`package.json` also declares a Pi package (`pi` manifest: extensions and skill).

## Develop

```sh
npm ci
just check          # the gate: type check, dependencies, tests, and the counted gates (AGENTS.md)
bb plugin build .   # then: bb plugin reload exo-a2ui-spike
```

Paths in `src/state.ts` and the live scripts point at the author's machine; adjust them for your own setup. `evidence/` (real conversations, paid outputs, screenshots) is never committed.

## Upstream

Runs on pure upstream OptChat plus one fix proposed as [jonaslsaa/pi-optchat#187](https://github.com/jonaslsaa/pi-optchat/pull/187) (end-of-request cache mark, needed when a proxy sets 1h cache TTLs).

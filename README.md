# Exosurface

A shared, adaptive interface for you and your personal agent.

Exosurface explores interfaces that materialize around your intent and context: a shared surface where you and your agent can organize information and act together across screens and, eventually, physical devices.

## Current implementation — October 2026

The working Exosurface lives in [`plugins/`](plugins/): stock [BB](https://getbb.app) plugins plus Pi extensions, no fork.

| Path | What it is |
|---|---|
| [`plugins/bb-plugin-exo-spike`](plugins/bb-plugin-exo-spike) | Exo's daily entry point in BB: one growing OptChat session, independent per-user owner (launchd), attach/detach, journal replay |
| [`plugins/bb-plugin-exo-a2ui-spike`](plugins/bb-plugin-exo-a2ui-spike) | The canvas beside the chat, on an isolated clone of Exo: direct Exo → A2UI over a generic visual catalog, stage that follows the conversation, presentation guide, shared-state edits, context hygiene with upstream OptChat. Also a Pi package (`package.json` `pi` manifest). Start with its [README](plugins/bb-plugin-exo-a2ui-spike/README.md) and [PRESENTATION.md](plugins/bb-plugin-exo-a2ui-spike/PRESENTATION.md) |

Repo boundaries: **Exosurface** is the interface (BB plugins, Pi extensions, presentation guide); **[exocortex](https://github.com/0xTomDaniel/exocortex)** is the owner's agent instance (identity, policy, skills, profile config) and enables Exosurface — never the reverse; **[Exomachina](https://github.com/0xTomDaniel/Exomachina)** is the factory product. The memory vault is not in git.

`evidence/`, `node_modules/` and `dist/` are not committed: evidence holds real conversations and stays local. Machine-specific locations (vault, Pi, OptChat checkouts, Playwright) come from a local `~/.config/exo/exosurface.json` (see `plugins/*/src/local-config.ts`), never from the repo.


## September 2026 research

Before the current implementation, the project compared agent protocols (A2A, AG-UI, A2UI) and built two independent spikes. Kept here:

- [Protocol trade-offs (ADR 0001)](docs/adr/0001-compare-agent-protocols.md), [independent protocol recheck](docs/research/2026-09-11-protocol-recheck.md), [protocol trade-offs research](docs/research/2026-09-12-protocol-tradeoffs.md), [thread lifecycle debate](docs/research/2026-09-12-thread-lifecycle-debate.md)
- [A2A vs AG-UI requirements](docs/a2a-vs-ag-ui-requirements.md) and [weighted comparison](docs/a2a-vs-ag-ui-weighted-comparison.md), [spike debate](docs/research/2026-09-13-spike-debate.md), [weighted forecast](docs/research/2026-09-13-weighted-forecast.md), [private control convention](docs/research/2026-09-13-private-control-convention.md), [A2UI input and shared core](docs/research/2026-09-13-a2ui-input-and-shared-core.md)
- [Shared core interface](docs/shared-core-interface.md) and [protocol mapping](docs/shared-core-protocol-mapping.md)
- Spikes: [`spikes/a2a-pi`](spikes/a2a-pi) and [`spikes/ag-ui-pi`](spikes/ag-ui-pi), both with fictional fixture data
- [Project vocabulary](CONTEXT.md)

The September harness and runtime comparisons are not published: they analyse third-party private code. References to them in the documents above are marked "kept private".

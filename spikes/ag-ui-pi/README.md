# Exosurface · A2UI over AG-UI + Pi

An independent, runnable spike of a temporal multimodal conversation: a daily
agenda is the primary expression, with optional words and a simulated room lamp.
It uses real published AG-UI processing, the actual A2UI Lit renderer/basic
catalog, and a custom Pi SDK host. There is no A2A dependency or bridge.

**The browser/Pi and bounded lifecycle scenarios run successfully. The adversarial
external-editor probe fails: acceptance can overwrite a vault edit in the final
filesystem write window. This implementation does not pass every mandatory gate
and is not a protocol selection or a production-ready source writer.** See
[evidence/REPORT.md](evidence/REPORT.md) for the full PASS/FAIL/UNKNOWN map.

## Run independently

From this directory, using Node 22.12 or newer and npm:

```sh
npm run setup
npm start
```

Open <http://127.0.0.1:61002>. The single start command serves the host and Vite
browser together. Every dependency and the lockfile belong to this package; no
repository-root workspace, sibling package, shared code or shared state is used.
The default runtime directory is the OS temporary directory's
`exosurface-ag-ui-pi`; the startup line prints its exact location.

For an isolated new run and work that starts before a browser exists:

```sh
npm start -- --state /tmp/my-exo-agui-spike --start-work
```

For a built browser:

```sh
npm run build
npm start -- --production
```

`--port`, `--state` and `--work-delay` are explicit local spike overrides. The host
listens on loopback. `--crash-at after-prepare` and `--crash-at after-vault-write`
are opt-in fault injection used only by the crash tests. Do not point this spike
at a real vault. Its private checkpoint and copied fixture vault live together
under the selected temporary directory; the supplied fixture files are untouched.

## Try the conversation

1. Select **Sketch the garden plan**. Use **After lunch** for a visual-only turn,
   or type “Move this after lunch” and choose **Propose the move**.
2. Detach during work. Reconnect to find the pending proposal without submitting
   the original command again. **Use this version** records acceptance and edits
   the copied Markdown frontmatter while preserving the Markdown body.
3. Open a second browser. An acceptance or lamp change appears in both.
4. Edit the copied `vault/agenda.md`, increasing its `revision`. Idle browsers
   receive the new current expression. An old selection stays an exact reference;
   stale write actions are rejected rather than retargeted.
5. Open **View revision 1** and **Reference sketch at revision 1**. The historical
   A2UI renderer is read only and isolated from the current renderer. Choose
   **Pi model**, enter a question about the old plan, and use **Ask about this**.

The **Lifecycle fixture** mode is deterministic host execution for repeatable
lifecycle tests. It is visibly separate from actual Pi execution. The **Pi model**
mode uses the published Pi SDK with no built-in shell or filesystem tools, an
isolated in-memory session, a fixed-schema A2UI-producing `propose_agenda` tool,
and a deliberate current/history/visual-reference context projection.

Pi reads existing approved `~/.pi/agent/auth.json`, `models.json`, and provider
environment through its own `ModelRuntime`. This package neither requests nor
copies secrets and does not change provider setup. In this run it used
`openrouter/anthropic/claude-sonnet-4.6`. If no configured model is available, the
work becomes failed with a readiness explanation; no fixture is substituted.

## Verification

```sh
npm run build
npm test
npm run test:browser
npm run test:pi
EXO_LIVE_PI=1 npm run test:browser
npm run probe:source-race
```

The normal browser suite skips the model-costing case; the explicit live command
was executed and passed. `test:pi` invokes the actual model twice and saves its
fixture-only context and responses. The browser suite is a serial conversation
journey plus a separate process-restart case, using fresh temporary state each
run. Chromium is installed by `setup`; no cloud browser or browser API key is used.

**`probe:source-race` is expected to exit nonzero while the documented source-write
failure exists.** It runs a genuine second filesystem writer on another worker
thread. A failed probe is not counted as a passing test or offset by other results.

Tests and fault probes write reviewable evidence under `evidence/`; build output,
node_modules, runtime files, logs and browser traces remain ignored. There is no
root Makefile or existing product test gate to invoke. `npm run format:check`
checks the package's source formatting.

## Pinned integration

| Dependency                  | Version / choice                   |
| --------------------------- | ---------------------------------- |
| AG-UI client, core, encoder | 0.0.59                             |
| A2UI Lit and web_core       | 0.11.0, public `v0_9` entry points |
| A2UI wire/catalog           | v0.9, upstream basic catalog       |
| Pi coding-agent and pi-ai   | `@earendil-works/*` 0.85.1         |
| Lit / RxJS                  | 3.3.3 / 7.8.1                      |
| SSE parser                  | eventsource-parser 3.0.6           |

The current Pi scope replaces the deprecated `@mariozechner` packages. Published
packages and lockfile integrity are recorded in [dependencies.json](evidence/dependencies.json).
No patches, forks, overrides, copied SDK repairs or SDK replacement are present.

The [AG-UI integration skill](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/skills/ag-ui-a2ui-integration/SKILL.md)
recommends fixed-schema tool results when the application knows the tree. That
mode fits this agenda. The published middleware 0.0.10 was investigated; it is
not a dependency because Exo already owns the fixed operation source and ordered
observer publication. The host directly uses its documented
`a2ui-surface` / `content.a2ui_operations` activity convention. It does not copy
middleware internals, add a private event type, or pretend run middleware covers
`connectAgent`. [Upstream runtime/binding guidance](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/skills/ag-ui-a2ui-integration/references/a2ui-runtime-and-renderer.md).

The public [AG-UI run/connect Seams](https://docs.ag-ui.com/sdk/js/client/abstract-agent)
and [Pi session/tool Seams](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/sdk.md)
are the integration points. [Architecture and ownership](evidence/ARCHITECTURE.md)
and [the evidence report](evidence/REPORT.md) enumerate the additional lifecycle
support that this application must maintain.

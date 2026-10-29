# Desktop-route install check (spike)

Author run, 2026-10-29, branch `spike/desktop-install` from private main `472474f`. Paths below are generic (`$R` = a new private temp directory). Raw logs stay local.

## Route

BB 0.45.0's own launcher, isolated by HOME, data directory and ports, run under the BB.app binary with `ELECTRON_RUN_AS_NODE=1` (how BB.app runs its server and host daemon; the working app's server process environment was inspected read-only):

```sh
env -i HOME=$R/h TMPDIR=$R/t PATH=/usr/bin:/bin:/usr/sbin:/sbin ELECTRON_RUN_AS_NODE=1 \
  /Applications/bb.app/Contents/MacOS/bb .../bb-app/dist/bb-app.js \
  --data-dir $R/bb --server-port 49411 --host-daemon-port 49412 --bundled
```

The launcher enrolled the local host by itself (`machine list`: one connected server host). No BB account login or machine enrollment. This supersedes the earlier "missing host bootstrap" diagnosis, which came from starting `bb-server` and `bb-host-daemon` separately. A first pass ran the same launcher under Node 24.15 and found the runtime-root defect; the instance was then restarted under the BB.app binary.

Plugin: root and `legacy/surface` `npm ci`, `bb plugin build`, `build.mjs`, `build-runtime.mjs`, `bb plugin install <checkout> --yes --json` → running, provider `exo-spike`. Project created with `--root <vault> --machine <host>`. UI driven in a fresh headless Chromium profile against the isolated server only.

## Defects found by the real Initialize Exo button, and fixes

| Symptom in BB | Cause | Fix |
|---|---|---|
| `OptChat supported profile API create failed` (bare) | Error discarded child output | Error now carries a bounded head of the helper's output |
| `Cannot find module …/legacy/primary/dist/optchat-init.js` | BB loads the server from `legacy/primary/src`, so `new URL('..')` was `legacy/primary`, not the plugin root | `SOURCE` walks up to the `bb-plugin-exosurface` package (historical parent kept as fallback) |
| Helper exits 0 with no output under BB.app's binary | Plugin children use `process.execPath` (the Electron binary); `ELECTRON_RUN_AS_NODE` does not reach them, so the child starts as a silent app instance | `childEnv` sets `ELECTRON_RUN_AS_NODE=1` when running under Electron. Reproduced by the Electron-run instance; the unpatched GUI launch was not deliberately triggered |
| `HTTP 400: hostId is required unless workspace.type is personal` | BB 0.45 requires a machine for an unmanaged workspace | Use the host of the selected project's source at exactly the vault path; preflighted in the RPC before any setup write (selecting *Personal* is refused cleanly, state unchanged) |
| (latent) canonical thread start would require `dist/workspace-extension.js` beside BB's copied host artifact | BB runs host code from a copy under its data directory | The host no longer launches/validates a runtime for the canonical kind; the separate owner process still does |

The 400 left the first attempt's journal at `spawning` (no thread created; `thread list` empty). By design that needs explicit reconciliation; the disposable state was set aside and setup was rerun on fresh paths.

## Result

Second attempt: **Stage: bound**. One native thread `Exo initialization`, generic profile, Pi session with the single labelled initialization record, binding/receipt committed. No inference. Private Pi directory has an empty `auth.json`.

## Real conversation, page action and reopen (after Tom's explicit consent, 2026-10-29)

Scope: the isolated instance only; provider `openai` (ChatGPT sign-in made by Tom in the isolated owner's own Pi directory), model GPT-6.1 Sol, `"primarySolProvider": "openai"` in the isolated config, saved model set to Sol. No credential copying, no fallback.

| Step | Observed |
|---|---|
| Owner `dist/owner-service.js` started | `owner/state.json` ready; runtime-info model `openai/gpt-6.1-sol`, thinking high |
| First send (BB composer, Sol picked) | Initially blocked by defect 5 below; after the fix the reply streamed into BB. Pi session: assistant message `provider openai`, `model gpt-6.1-sol`, `stopReason stop` |
| "Draw a page with a Note textbox and Save button" | `update_exosurface` tool call; page card in chat; workspace revision 1 (`TextField` + `Button` with a `save` event) rendered in the Exosurface view |
| Typed "fresh install note 1", clicked Save | Revision 2 stored with `note: "fresh install note 1"`; action delivered to Exo as `▸ installtest · Save — Note: …`; reply "Note received: …" (Sol) |
| Stopped owner + BB (SIGTERM), restarted both, reopened thread | Same thread and full history shown; same Pi session file/ID; owner reattached (`clients: 1`); asked what note was saved → "You saved “fresh install note 1”." (Sol) |

Caveat observed: to reopen the page the run clicked the original (revision 1) card and then sent the question, which by design **brought the earlier version back** as revision 3 (empty note). Revision 2 remains in `workspace/history.jsonl`. Exo's answer came from the session history, not that page.

Defect 5: BB started the setup thread ~40 s after setup had already committed `bound`, without a provider identity, and the host refused it ("must resume its provider identity"). Fix: for `thread/start` without identity, reuse the committed canonical binding **only** for the journal's exact thread; with no input, return the identity without attaching (owner may not be running yet); otherwise attach as usual. Other threads, and non-canonical bindings, are still refused. The canonical host path again validates profile/generation (`prepareRuntime`) before attaching, keeping the existing resume fail-closed check (the earlier fix 4 had skipped it; restored before commit, verified against the real bound state without inference). The end-to-end run above used the build before that restoration; the restored check is covered by the host control test.

## Checks (author)

- `test/canonical-setup.test.ts`: 26/26 (24 existing + host selection + runtime root).
- Full `test/*.test.ts`: 54/54.
- `test/canonical-rpc-authorization.mjs`: six refused requests, zero native calls.
- `test/canonical-control-host.mjs` (actual host build): 11 controls, late-bound start for exact thread only with owner deferred, other thread and non-canonical binding refused, unchanged resume fail-closed, zero model entries.
- `tsc --noEmit`: exit 0.

## Not demonstrated

A physically fresh Mac, the BB desktop window itself (a headless browser served the same frontend), Anthropic sign-in/Opus, uncached downloads, launchd/reboot, distribution and SDK rights. Inputs remain capped at 2,000 UTF-16 units. `releaseReady: false`.

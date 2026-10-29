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

## Checks (author)

- `test/canonical-setup.test.ts`: 26/26 (24 existing + host selection + runtime root).
- Full `test/*.test.ts`: 54/54.
- `test/canonical-rpc-authorization.mjs`: six refused requests, zero native calls.
- `tsc --noEmit`: exit 0.

## Not demonstrated

Provider login, retained owner start, conversation, page action and reopen (a ChatGPT sign-in in the isolated owner's own Pi directory reports `openai` ready by `pi auth check --no-refresh`, metadata only; real inference awaits explicit test consent). The project-host preflight matches exact source path and a unique host ID, not this-Mac identity; spike scope is a locally created project. Physical fresh Mac, uncached downloads, the desktop GUI window itself (the browser served the same frontend), lifecycle/reboot, distribution and SDK rights remain open. `releaseReady: false`.

# Native BB layout spike — not a release runtime

Private staging-only proof for [#46](https://github.com/0xTomDaniel/exosurface/issues/46), under release tracker #45. **Layout remains Tom's decision.** No production migration, publication, or release acceptance is implied.

## Observed in stock BB 0.45.0 / SDK 0.6.15

On 2026-10-28, a new headless BB server/host-daemon and a fresh Chromium profile exercised the **actual BB web app**, not a lookalike harness. Provider replies are deterministic fixtures; no LLM was called.

| Question | Observed result |
| --- | --- |
| Native sidebar for surfaces? | Yes. Exo can be pinned; visible child threads nest beneath it. Clicking a child navigates to its native thread. |
| Hide plumbing threads? | `visibility:'hidden'` removes the worker from the sidebar. **Not from parent chat:** BB's child-completion summary still exposes its title/link. |
| Pages on first native open? | No. Presetting a `plugin-panel` tab creates a Pages tab but neither opens the right panel nor selects Pages. First child open showed chat + composer and zero mounted page views. |
| Native Pages tab? | Works after opening the right panel and selecting Pages. Home and child-specific fixture pages render. |
| Page button dispatch? | Home `today/done-run` and child `reg/filed` reached their own fixture thread and produced matching provider replies. This is a real UI→plugin RPC→BB thread→fixture-provider path, not an OptChat proof. |
| Composer? | A sequential native-composer submission produced `Fixture echo: native composer second attempt`. One earlier concurrent submission failed because this fixture explicitly rejects steering; failure remains visible in screenshots. |
| Status / Needs you? | BB's sidebar announced “Thread needs user input” after `bb.ui.requestInput`. Native thread rendered Keep/Drop and resolved the form. This is not a custom Needs you group. |
| Page-first alternative? | A navPanel with pages + embedded native `ThreadChat` works. At viewport 1280×720, measured page-content widths were 591px (page-first) vs 447px (native side panel). These are content widths including fixture padding exclusion, not universal layout defaults. |
| Embedded pending form? | The same pending Keep/Drop form was **absent from compact ThreadChat's rendered accessibility tree** while the native sidebar indicated input needed; it appeared on navigating to the native thread. Treat this as an unresolved integration gap, not a universal SDK claim. |
| Native sidebar + page-first main? | **Not proved.** Native child links switch away from the custom page-first navPanel into BB's native chat-first route. The spike does not replace that route. |

### Recommendation (not approved)

Reuse BB navigation and native chat where they fit, but do not infer that native thread nesting delivers the agreed page-first product. Smallest stock-BB adapter is a registered fixture/product provider + `threadPanelAction({layout:'flush'})` + persisted Pages tab per thread. That adapter is chat-first on initial open. The page-first option is a navPanel plus embedded ThreadChat, with a pending-interaction integration gap to resolve. Present both to Tom before choosing; native sidebar/page-first route integration remains open.

`server.ts` also records two actual SDK constraints: empty `input:[]` thread spawn is rejected; a parent spawn returns before its environment is provisioned, so immediate child spawn can fail. Setup persists partial IDs, waits for the environment, and retries without duplicating already bound fixture threads. Normal-project child creation needs a usable Git branch; this proof uses a synthetic temporary Git repository.

## Evidence

- `evidence/01-native-first-open-car.png`: first Car native open, right panel closed despite preset Pages tab.
- `evidence/02-native-pages.png`: manually selected native Pages tab.
- `evidence/03-page-first.png`: page-first navPanel and compact native composer.
- `evidence/04-needs-input-page-first.png`: native sidebar needs-input indicator, compact form absent.
- `evidence/05-native-input-form.png`: native thread shows the pending form.
- `evidence/06-child-surface-pages.png`: child-specific page and button.
- `evidence/isolation-audit.json`: sampled open-file audit of 19 owned processes; no open live sensitive state files found. This is not syscall tracing or a guarantee about every prior read/write.

All screenshots are from fixture-only staging. The retained failed concurrent turn is deliberate evidence of a fixture limitation. No screenshots/history from the real Exo were copied.

## Isolation and limitations

`stage-env.mjs` constructs an environment from an empty object: temporary HOME, BB data, XDG config/cache/data, temporary directory, explicit staging EXO_CONFIG (absent/fail-closed), and loopback ports 39886/39887. Inherited EXOSURFACE_/EXO_BB_/EXO_A2UI_/OPTCHAT_/PI_/EXO_ selectors and auth variables do not pass through. Use the **resolved absolute Node binary**, not mise's shim under a temporary HOME.

The app-bundle `bb-app.js` launcher is Node-only: it starts server and daemon, not Electron. Thus this test never launched another Electron app or relied on HOME to redirect Electron's Application Support. Chromium had a fresh explicit `/tmp/nls-stage/browser` profile. BB CLI status returned `/tmp/nls-stage/data`; lsof showed only staging server/daemon listening on 39886/39887. Production 38886/38887, existing BB app, services, threads and configuration were not changed by this replacement lane.

**Accident guards, not sandboxing.** Same macOS account still has filesystem/Keychain access. BB starts bundled provider metadata discovery; Node's bin directory may contain other CLI binaries (so PATH is not proof they are unreachable). No paid provider turn was requested; all created fixture threads explicitly use `nls-fixture`. Build fetched BB's toolchain into temporary staging HOME/cache; no global install. A real separate macOS account remains required for fresh-owner/auth/reboot acceptance.

Prior Opus transcript recovery returned “No run.” Existing source and partial test directories were preserved; no prior staging launcher receipt/process was present on takeover. Prior-agent live-state non-mutation cannot be independently certified from missing transcripts. One orphan **synthetic staging** root created during this lane's environment-provisioning failure was deleted by exact staging thread ID; no live sidebar cleanup was performed.

## Reproduce (explicit staging only)

Requirements already installed: macOS BB 0.45 app, Node 24.15 (tested), matching SDK dependencies, available browser tools. Do not silently install missing tooling. This spike is not a portable installer.

```sh
cd spikes/native-bb-layout
NODE=/absolute/path/to/node
"$NODE" scripts/test-isolated.mjs
"$NODE" node_modules/typescript/bin/tsc --noEmit
"$NODE" scripts/stage.mjs start
"$NODE" scripts/stage.mjs cli status --json  # MUST say /tmp/nls-stage/data
# Inspect own listeners/open files before loading plugin.
"$NODE" scripts/stage.mjs cli plugin build "$PWD" # BB may fetch a staging-local toolchain
"$NODE" scripts/stage.mjs cli plugin install "$PWD" --yes
```

Before setup, create a synthetic Git workspace under staging HOME with a committed fixture file and local-only fixture author config, then:

```sh
"$NODE" scripts/stage.mjs cli project create --name 'Layout fixture' --root /tmp/nls-stage/home
printf '{"presetTabs":true}\n' > /tmp/nls-stage/setup.json
"$NODE" scripts/stage.mjs cli plugin rpc call native-layout-spike setup --input-file /tmp/nls-stage/setup.json --json
```

For browser proof, explicitly supply existing absolute tool paths in `/tmp/nls-stage/browser-tooling.json`: `{"binary":"/path/to/agent-browser-native","chromium":"/path/to/chromium"}`. `browser.mjs` uses a unique disposable session/profile; it never attaches to an existing browser. `screenshot.mjs` speaks only to that staging session's Unix socket (workaround for installed native agent-browser client's `selector:null` screenshot schema bug).

```sh
"$NODE" scripts/browser.mjs open http://127.0.0.1:39886
"$NODE" scripts/browser.mjs snapshot -i
# Click current references only; take screenshots with scripts/screenshot.mjs.
"$NODE" scripts/browser.mjs close
"$NODE" scripts/stage.mjs stop
```

The tests cover fixture provider protocol conformance, fixture actions, staging-env inheritance guards, path/port rejection, idempotent setup and partial-setup recovery. They do not constitute production-provider, OptChat, clean-Mac, reboot, release-bundle, or UX acceptance.

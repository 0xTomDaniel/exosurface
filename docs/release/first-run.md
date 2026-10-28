# Exosurface first-run release candidate

Tracking: [#48](https://github.com/0xTomDaniel/exosurface/issues/48); release acceptance: [#51](https://github.com/0xTomDaniel/exosurface/issues/51).

**Not release-ready.** This is an implemented page-first BB → independent Pi/OptChat owner → reply/page bridge, with isolated mocked-provider bridge evidence and actual disposable-BB bootstrap evidence. **Core capability BLOCKED:** the production app currently renders only reply title/body beside `ThreadChat`; the browser snapshot renderer/textbox/button path is absent, not merely untested. A separate backend-only checkpoint now persists snapshot pages and transports revision-bound edits/presses; it is not browser product evidence. It is not clean-Mac, real-provider, staging-UI or snapshot-page evidence. Native-layout product acceptance is undecided. `release.json` deliberately says `releaseReady: false`.

## Inputs and setup

1. Apply the generic Exocortex starter to a new vault first. The plugin requires `AGENTS.md` and never seeds or overwrites the vault.
2. Use the bundle installer to place immutable plugin/owner files, pinned Pi and OptChat, and the user launchd job. Do not point this candidate at an existing personal Pi/OptChat profile.
3. Supply explicit main, compactor and subagent choices. Each has `provider`, `model`, `thinking`; no vendor defaults or inherited credentials are accepted. Pin Pi `@earendil-works/pi-coding-agent@1.1.0`, OptChat `v0.8.6` / `aae1caf7715830051d327f819fc776792211167a` from `https://github.com/jonaslsaa/pi-optchat.git`, Node `>=22.19.0`, BB `>=0.45.0` and SDK `0.6.15`.
4. Authenticate as the fresh owner using Pi with the configured private `PI_CODING_AGENT_DIR`. Authentication is not imported from the invoking shell. An `auth.json` file is only a startup prerequisite, **not proof of usable authentication**; fresh-owner inference must be demonstrated separately with permission.
5. Install/register the built plugin in the isolated target BB profile, open its Exo navPanel, and choose **Set up Exo in this project**. Setup creates/claims the fresh OptChat profile, explicitly configures all three models, and creates one native BB thread.
6. Send a prompt in the native composer. If its socket is absent, the host bridge requests `launchctl kickstart` of the installer's existing `app.exosurface.owner` job (never `-k`). This code path was **not executed against launchd** during development/tests. The service launches its own Pi subprocess, validates the OptChat profile lock against that Pi PID, and survives BB view detachment. The UI polls the latest assistant reply into a page beside native `ThreadChat`.

Configuration is read from `EXO_CONFIG` or `~/.config/exosurface/config.json`. `EXO_STATE_DIR` can override `stateDir`. Example shape (placeholder paths/model choices must be supplied by installer/user):

```json
{
  "vault": "/path/to/fresh-vault",
  "node": "/path/to/supported/node",
  "piCli": "/path/to/pinned/pi/dist/cli.js",
  "optchat": "/path/to/pinned/optchat",
  "stateDir": "/path/to/private-state",
  "agentDir": "/path/to/private-state/pi-agent",
  "profile": "exo",
  "models": {
    "main": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"},
    "compactor": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"},
    "subagent": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"}
  }
}
```

Do not persist credentials in this configuration. Child environments are allowlisted: inherited `EXOSURFACE_*`, `EXO_BB_*`, `OPTCHAT_*`, `PI_*`, other `EXO_*` bindings and vendor keys cannot silently select another live owner. This is an accident guard, not a sandbox.

## Crash recovery — SDK/API limitation

**No exactly-once guarantee is claimed.** SDK 0.6.15 `threads.spawn` has no caller-supplied durable creation ID/idempotency key or atomic operation-marker metadata. Therefore a crash after external creation and before saving its ID cannot be distinguished safely from a crash before creation.

`first-run.json` binds a random operation key to the real vault and profile. `bb-thread-intent.json` is saved **before spawn**, with that key, project/provider, intent time and then, when known, exact created thread ID. An uncertain outcome blocks retries before another spawn; the plugin never adopts a thread by its title. A saved receipt is checked against exact thread ID/provider before reuse. A conflict, unknown schema, unclaimed pre-existing profile or interrupted setup lock fails closed without overwrite.

Manual reconciliation must inspect the operation key, intended project/provider, intent time, candidate **exact thread IDs**, candidate project/provider and creation times, and available BB records/history. Diagnostics contain these non-secret matching criteria and intent-file location, not authentication material. The SDK does not attach our operation key to candidate records, so there may be **no conclusive candidate**. In that case stop and require operator/vendor reconciliation; do not guess, adopt by title, clear intent, or rerun spawn. After proven matching evidence, an operator may explicitly record the exact ID in the existing intent receipt while preserving its key/project/provider. Preserve evidence before any repair. A stale `first-run.lock` or owner socket likewise needs positive confirmation that its former owner stopped; neither is timeout-stolen.

Coverage injects failures before external creation, after BB creation before receipt, and after receipt before the bootstrap's local binding. Retrying uncertain cases performs no second create; unrelated keys/projects/providers are rejected. Acceptance must preserve this fail-closed behavior unless BB adds an atomic idempotency primitive.

## Build and disposable checks

Build in this order; BB build emits the native bundles/metadata, while `build.mjs` additionally emits the dependency-free owner and OptChat helper JavaScript:

```sh
cd plugins/bb-plugin-exosurface
npm ci --ignore-scripts --legacy-peer-deps
bb plugin build .
node build.mjs
node --experimental-transform-types --test test/*.test.ts
```

Run with an absolute supported Node, an allowlisted environment, a throwaway HOME/TMPDIR and no live state selectors. On the development Mac, the offline CLI was the BB application's `host-daemon/dist/bb` script, executed with that absolute Node and a disposable HOME; its build toolchain download also stayed disposable. Registration/reload occurred only in the separately described disposable BB fixture; no live BB registration/reload, launchctl call, deployment or inference was performed. An initial check used an existing SDK dependency tree; the final check copied the source to a disposable directory, ran `npm ci --ignore-scripts --legacy-peer-deps` from the exact lockfile, then typechecked, built all BB/owner bundles and passed all 12 tests without the worktree dependency symlink.

`dist/*.js`, `dist/*.css`, `dist/*.json` are shipped; generated source maps are deliberately excluded because BB maps can embed machine-local paths. The bundle lane privacy scanner caught this before packaging. No `node_modules`, state, auth or transcripts ship. The release manifest includes exact package lock/pins and a builtins-only `dist/owner-service.js` entry.

Evidence obtained:

- Production TypeScript typecheck passes.
- 12 isolated tests pass: bootstrap/retry and conflicts, all uncertain-create boundaries, environment filtering, relocated selftest/readiness, real Unix socket/Pi RPC with a mock subprocess, full multiline Unicode text with an ending sentinel, oversize rejection without send, wrong-thread refusal, exact initialization control binding/replay rejection, concurrent rejection without clearing busy state, and built-host kill while the independent mock owner finishes. The same fixture also runs the **actual BB-built host bundle** through SDK-style JSON-RPC `handleLine` → socket owner → mock Pi → native thread deltas and response-page update.
- Clean locked-dependency offline BB build emits app, CSS, server, host and identity/SDK metadata.
- Sibling `tools/release/lib/artifact.mjs` successfully builds the real package with privacy/import-graph/hash checks (`allowDirty: true` recorded for development) and verifies, packs, unpacks and executes relocated owner selftest on Node 24.15.0 without `node_modules`.
- `--release-selftest` imports the owner graph without reading config, writing files, accessing credentials or calling a provider. `--readiness` emits `exosurface-readiness/0`, authentication/connectivity `unverified`, `ready:false`, exit 2 (or exit 1 for unsupported state). Neither test is an inference-ready signal.

## Remaining release gates

- Genuine clean-Mac install/start/setup/login/provider roundtrip and explicit fresh-owner credential proof, with permission; no fixtures substituted.
- Staging BB UI and real native composer/provider rendering, reconnect/interruption/busy/error behavior, and full SDK conformance coverage.
- **BLOCKED core capability, not an untested option:** rich snapshot-page rendering and browser textbox/button input. The browser still shows only the latest assistant reply; backend page tools do not establish visual product completion. No historical replay, tool output/status/approval projection, worker views or exactly-once input delivery is claimed.
- Installer/launchd lifecycle exercise. Lazy kickstart is implemented but not executed here; stale owner sockets/locks intentionally require manual recovery. A disconnected BB view does not own/kill Pi.
- Artifact install evidence, supported Node-minimum execution and cross-lane acceptance review. A Node 24 pass does not establish every supported Node/platform.
- Resolve native-layout/product acceptance and retain `releaseReady:false` until #51 closes all required gates.

## Actual disposable-BB first-run proof (2026-10-28)

Evidence: `plugins/bb-plugin-exosurface/test/evidence/isolated-bb-bootstrap.json`. Actual BB 0.45.0 / SDK 0.6.15 ran with absolute Node 24.15.0, allowlisted environment, dedicated temporary HOME/data/vault and ports 39896/39897 (not live 38886/38887). The synthetic vault contained its own fixture `AGENTS.md`; no live configuration, memory, credentials or transcript was copied. Only a read-only pinned OptChat source checkout was used to create a fresh private profile. These are same-account accident guards, not an OS sandbox or syscall audit.

The production plugin was built, installed and its actual `setup` RPC called in that isolated BB. It created one native `exosurface` thread in a normal synthetic project. BB's observed project-default environment reached **ready**, the native thread reached **idle**, and the persisted intent recorded `initializationConsumed:true`. Retry returned the same exact ID, with thread count still one. The Pi executable deliberately did not exist, private `auth.json` did not exist and no owner directory was created. No launchctl/provider inference was requested. **This control-turn proof is not normal authenticated-request proof.** The staging process group was stopped afterward.

Two real SDK/BB constraints are now handled: empty `input:[]` is invalid, and personal-workspace environment is rejected for a normal project. Setup now uses SDK `prompt` with a nonempty operation-bound initialization control and `environment:{type:'project-default'}`. The built native host consumes the control locally only after exact journal key/vault/profile, intent provider and persisted exact thread ID match; it waits up to five seconds for the spawn receipt and rejects stale/replayed/near-match controls. Ordinary prompts still take the authenticated owner path. A late/unknown receipt is not an auth bypass or permission to create again.

The ambiguous-outcome check **injected** a lost-local-receipt journal state after a real BB thread had been created; it did not crash a process at that boundary. Actual production setup then refused unknown outcome and thread count remained one. Only the exact saved synthetic receipts were restored for the fixture; no title-based discovery or automatic adoption occurred. Earlier actual BB rejection of the incompatible personal-workspace request also left an intent that blocked retry. Neither observation proves SDK exactly-once behavior. This setup creates only the parent: future worker/child setup must wait for its environment provisioning to be ready; no child provisioning is claimed.

## Separate bounded page-backend checkpoint (not browser acceptance)

The requirement remains actual **drawn snapshot → rendered textbox edit → button press → independent owner → updated persisted page**. Native composer protection and the backend tests below do not meet that whole requirement.

Reused local Exosurface grammar/conversion from `plugins/bb-plugin-exo-a2ui-spike/src/snapshot-format.ts` at `981941ade8f35ccc1a96628bbc2f317370e3692a`; extracted only its pure `workspace.ts` data/ref helpers and `stage.ts` title helper into `src/snapshot-data.ts` and `src/snapshot-stage.ts`. Provenance appears in the files. They create ordinary A2UI-shaped objects without importing A2UI runtime/catalog/schema packages, legacy deployment/profile state, or third-party renderer source. No dependency/lockfile change or new third-party source-license obligation is introduced by this extraction; future renderer reuse must retain applicable upstream notices.

`src/pages.ts` adds durable `current-pages.json`, exclusive fail-closed mutation lock, full offered-input checks, exact revision/ref/mutation IDs and bounded press receipts. Press intent is saved before dispatch; a pending/unknown outcome cannot be automatically retried. Receipt retention is bounded (128); this is not permanent exactly-once delivery. Detected malformed/newer persisted state and stale locks require explicit investigation rather than overwrite or automatic lock stealing. Page/snapshot/input budgets reject without truncation and are **not** a fix for the Zod advisory. These checks cover bounds/structure/refs and offered inputs; they do not claim independent A2UI catalog-schema conformance.

The fresh Pi process explicitly loads compiled `src/page-tools.ts` (`update_exosurface`, `read_exosurface`) with a private `EXO_PAGE_STATE`. Patched-Zod4 `pageRead`/`pageEdit`/`pagePress` server envelopes connect to the existing owner socket, which accepts page inputs only for the exact primary thread. UTF-8 socket decoding preserves split Unicode. This remains a current-page protocol, not a copy of legacy history, workers, rewind, observer or composition systems.

A disposable clean copy with locked dependencies passed TypeScript, actual BB server/app/host build, owner-module build, and **18/18 tests**. `test/pages.test.ts` covers extracted grammar, durable edits, long Unicode textbox/final sentinel, offered button context, stale/ref/type/size/unknown-field rejection, mutation replay/conflicts, unknown press outcomes, newer state/stale locks, and built Zod4 envelopes. Its transport fixture invokes the **compiled server handlers** → real owner socket → **mock Pi** loading/executing the compiled page tools → persisted updated heading and reloadable exact textbox. It is neither an actual BB page-RPC/browser exercise nor an actual Pi extension-loader/authenticated-provider turn. This checkpoint is separate from pinned bootstrap/artifact acceptance; no prior artifact result is extended to these new files.

## Renderer reuse boundary (still unresolved)

The existing visual implementation is in `plugins/bb-plugin-exo-a2ui-spike/app.tsx`, `src/workspace-view.ts`, `src/exo-catalog.ts`, `src/exo-components.tsx`, `lib/document-style.ts` and `lib/exo-theme.ts`. The spike lock/manifest pins A2UI 0.13.0 and Zod 3.25.76; investigation also found A2UI 0.14.0 still requires Zod `^3.25.76`. GHSA-mrhx-c7xc-m3w5 affects that validation path. Late input limits are not an approved fix; forcing Zod4 beneath incompatible peers is not safe integration. No such runtime graph has been imported here.

The authorized route is reuse-first: identify the narrow compatibility-preserving dependency correction and its exact graph/regression evidence, preserve the existing appearance/behavior/licensing, and adapt deployment paths and current-page transport only as necessary. Do not redesign the UI, infer acceptance of residual vulnerability, or import the spike's hard-coded clone/live configuration. Actual visual edit/press/reopen acceptance remains a release blocker.

A clean locked production-plugin `npm audit --omit=dev --json` on this date reports **zero advisories** (`test/evidence/production-npm-audit.json`), including its Zod 4.6.6. This result applies only to this plugin lockfile, not the external Pi/OptChat runtime, BB host, future renderer, whole repository or final installed artifact. Native-layout manual first-open Pages selection, missing compact pending input form and hidden-worker title/link leakage in parent completion summaries remain unapproved product gaps.

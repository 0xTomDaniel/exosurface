# Exosurface first-run release candidate

Tracking: [#48](https://github.com/0xTomDaniel/exosurface/issues/48); release acceptance: [#51](https://github.com/0xTomDaniel/exosurface/issues/51).

**Not release-ready.** This is an implemented page-first BB → independent Pi/OptChat owner → reply/page bridge, with isolated mocked-provider evidence. It is not clean-Mac, real-provider, staging-UI or snapshot-page evidence. Native-layout product acceptance is undecided. `release.json` deliberately says `releaseReady: false`.

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

Run with an absolute supported Node, an allowlisted environment, a throwaway HOME/TMPDIR and no live state selectors. On the development Mac, the offline CLI was the BB application's `host-daemon/dist/bb` script, executed with that absolute Node and a disposable HOME; its build toolchain download also stayed disposable. No BB registration, reload, launchctl call, deployment or inference was performed. An initial check used an existing SDK dependency tree; the final check copied the source to a disposable directory, ran `npm ci --ignore-scripts --legacy-peer-deps` from the exact lockfile, then typechecked, built all BB/owner bundles and passed all 10 tests without the worktree dependency symlink.

`dist/*.js`, `dist/*.css`, `dist/*.json` are shipped; generated source maps are deliberately excluded because BB maps can embed machine-local paths. The bundle lane privacy scanner caught this before packaging. No `node_modules`, state, auth or transcripts ship. The release manifest includes exact package lock/pins and a builtins-only `dist/owner-service.js` entry.

Evidence obtained:

- Production TypeScript typecheck passes.
- 10 isolated tests pass: bootstrap/retry and conflicts, all uncertain-create boundaries, environment filtering, relocated selftest/readiness, real Unix socket/Pi RPC with a mock subprocess, full 1,800-character input and wrong-thread refusal. The same fixture also runs the **actual BB-built host bundle** through SDK-style JSON-RPC `handleLine` → socket owner → mock Pi → native thread deltas and response-page update.
- Clean locked-dependency offline BB build emits app, CSS, server, host and identity/SDK metadata.
- Sibling `tools/release/lib/artifact.mjs` successfully builds the real package with privacy/import-graph/hash checks (`allowDirty: true` recorded for development) and verifies, packs, unpacks and executes relocated owner selftest on Node 24.15.0 without `node_modules`.
- `--release-selftest` imports the owner graph without reading config, writing files, accessing credentials or calling a provider. `--readiness` emits `exosurface-readiness/0`, authentication/connectivity `unverified`, `ready:false`, exit 2 (or exit 1 for unsupported state). Neither test is an inference-ready signal.

## Remaining release gates

- Genuine clean-Mac install/start/setup/login/provider roundtrip and explicit fresh-owner credential proof, with permission; no fixtures substituted.
- Staging BB UI and real native composer/provider rendering, reconnect/interruption/busy/error behavior, and full SDK conformance coverage.
- Rich snapshot-page rendering and tool-driven page manipulation. Current page is only the latest assistant reply; it does not claim a full Exo page tool protocol, historical replay, tool output/status/approval projection, worker views or exactly-once input delivery.
- Installer/launchd lifecycle exercise. Lazy kickstart is implemented but not executed here; stale owner sockets/locks intentionally require manual recovery. A disconnected BB view does not own/kill Pi.
- Artifact install evidence, supported Node-minimum execution and cross-lane acceptance review. A Node 24 pass does not establish every supported Node/platform.
- Resolve native-layout/product acceptance and retain `releaseReady:false` until #51 closes all required gates.

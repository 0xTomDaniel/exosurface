# Package contract: `exosurface-package/0` (provisional)

Producer: `plugins/bb-plugin-exosurface/release.json`. Consumer: `tools/release/lib/contract.mjs`. Tested fixtures are not proof that the production plugin or receiving Mac is ready. Parent #45 / lifecycle #47 / acceptance #51.

```json
{
  "contract": "exosurface-package/0",
  "id": "exosurface",
  "files": ["dist/**", "src/**", "host.ts", "server.ts", "app.tsx"],
  "owner": {
    "entry": "src/owner-service.ts",
    "launchdLabel": "app.exosurface.owner",
    "selftestArgs": ["--release-selftest"]
  },
  "stateSchema": {"writes": 1, "reads": [1]},
  "requires": {
    "node": ">=22.19.0", "bb": ">=0.45.0",
    "tools": {"required": ["uv"], "recommended": ["git"]}
  },
  "pins": {
    "pi": {"npm": "@earendil-works/pi-coding-agent", "version": "1.1.0", "nodeEngine": ">=22.19.0"},
    "optchat": {"git": "https://github.com/jonaslsaa/pi-optchat.git", "commit": "aae1caf7715830051d327f819fc776792211167a", "version": "0.8.6"}
  },
  "releaseReady": false
}
```

`package.json` supplies the exact version (including prereleases), module type and BB metadata. `id` is a stable lowercase slug, not an id containing dotted version text. `files` uses relative globs: `dist/**`, not just `dist`. Package/release JSON are always included. At least one dist file is mandatory. Optional `owner.nodeArgs` contains explicit Node flags; TypeScript requires compatible Node/flags. A compiled `dist/owner-service.js` entry is also valid; the selected entry and every relative import must ship. No runtime bare imports/node_modules for the owner graph. All declared runtime package dependencies require exact lockfile versions; the manifest records them, but this is not proof that the app bundler included every module. BB host/server/app loading remains an independent gate.

## Artifact

`exosurface-artifact/0`: directory with `plugin/`, `MANIFEST.json`, `MANIFEST.sha256`. The manifest records source commit/clean status, contract, dependency pins, entry/import graph, and file path/hash/size. The checksum is not a digital signature. Verification rejects missing/extra files, changed bytes, symlinks and unsafe/duplicate manifest paths. The builder rejects credential/history/evidence paths and scans text for common key material and absolute personal paths; a privacy review is still necessary (not every secret can be detected heuristically). Never package private homes wholesale. `--deny-patterns <file>` adds project-specific patterns.

Owner selftest is side-effect-free and must exit 0 without writing files. It runs in a temporary HOME with explicit fixture selectors, no inherited auth env, and the absolute selected Node. The import scan is heuristic; selftest proves that executed path, not every branch. Full-trust code is not sandboxed by a temporary HOME.

The owner also exposes `--readiness`, JSON schema `exosurface-readiness/0`: configuration readiness/codes, authentication status/reason, connectivity status/reason, runtime readiness and top-level `ready`. Exit 2 is unready; exit 1 unsupported state. This command must not mutate state, read secret values or call a provider. Doctor reports unverified authentication/connectivity as unverified, not passed.

## Install bindings

- Stable label `app.exosurface.owner` must appear in shipped code; conflicting literal kickstart labels fail build.
- Explicit launchd env: `EXO_CONFIG`, `EXO_STATE_DIR`, `EXO_RELEASE`, `EXO_RELEASE_ROOT` plus HOME/PATH. No inherited live session selectors or provider credentials.
- Defaults: `~/.config/exosurface/config.json`, `~/.exosurface` with `state-schema.json` containing `{"schema":1}`.
- Installer initially writes vault, stateDir, exosurfacePlugin, node and explicit piCli/optchat paths; model selections are explicit `main`, `compactor`, `subagent` objects (`provider`, `model`, `thinking`). Absent config only; later model recovery fills only missing roles.
- Pi pin checked against the configured package.json. OptChat pin checked against configured checkout HEAD. Receiving machine supplies those dependencies; no developer checkout paths are shipped in the artifact.
- State schema `reads` governs update/rollback; absent state can initialize, unknown/incompatible state is refused. A code switch never rewinds notes/history.
- Crash-only KeepAlive (`SuccessfulExit:false`) plus RunAtLoad. The tool writes the plist but never loads/restarts a job or changes BB registration.

## Starter boundary

Separate Exocortex `exo-mac-starter/0` artifact and script. One explicit `setup` wrapper applies starter, verifies, then installs product. Conflict exit 3 occurs before release-install writes. Starter receipt is `.exo/starter-receipt.json`; timezone must be explicitly configured. Stage/apply need Python >=3.9; the bundled metadata validator separately needs Python >=3.11 plus PyYAML or uv's available environment/cache. Missing execution coverage fails verification. No automatic dependency installation or integrations. GPL-3.0 starter/source and MIT Nitride/third-party notices require distribution review even for a private repo; licensing is not a passed release gate.

## Unverified integration gates

Actual BB plugin dist loading/page dispatch, correct first-run/login on a fresh account, provider connectivity (only separately authorized), reboot/service persistence, clean-Mac dependencies/uv cache, artifact distribution/provenance/licensing, and crash recovery remain open. Do not close #45/#51 from lifecycle fixtures.

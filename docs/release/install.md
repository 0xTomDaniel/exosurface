# Private Mac release tooling (draft)

Implements #47 under release tracker #45. **Not a supported release yet.** No real clean-Mac install, login, reboot or rollback has been performed. Native layout is provisional; fixture success is not those release gates (#51).

## Trust and prerequisites

Exo and its skills execute with your macOS user's permissions. This is not a sandbox. Only run artifacts from a trusted private source; checksums detect changed bytes, not a malicious publisher. No credentials, histories, provider keys or developer home directories are shipped. The installer never edits BB's database, invokes launchctl, installs dependencies, registers a plugin, or calls a model provider.

Install these yourself: Node >=22.19.0 (real executable, not a shim), Python >=3.9, uv, BB >=0.45, Pi 1.1.0, and the pinned OptChat checkout. Starter stage/apply needs Python >=3.9; its metadata validator separately needs Python >=3.11 + PyYAML or a usable uv environment/cache. Offline verification fails if that environment is unavailable. No automatic integrations. Pins are declared in the production plugin's `release.json`; doctor checks the configured paths. macOS `/usr/bin/python3` may be a Command Line Tools installer stub rather than an available interpreter. Use a known real Python.

## Build and verify (developer)

Use an absolute Node executable for every command below; `$NODE` must not point at a mise shim under a temporary HOME.

```
"$NODE" tools/release/exo-release.mjs build --package-dir plugins/bb-plugin-exosurface --out-dir /tmp/exo-artifacts
"$NODE" tools/release/exo-release.mjs verify --artifact /tmp/exo-artifacts/exosurface-VERSION
"$NODE" tools/release/exo-release.mjs selftest --artifact /tmp/exo-artifacts/exosurface-VERSION
"$NODE" tools/release/exo-release.mjs pack --artifact /tmp/exo-artifacts/exosurface-VERSION
```

Build requires committed package sources, an explicit file allowlist and prebuilt `dist/`. `--allow-dirty` is a development escape hatch recorded in the manifest; not a release approval. Owner code must use Node builtins and relative, shipped imports. The tool's static import scan is conservative, not a security boundary. Run the owner's `--release-selftest` from the artifact to prove that entry resolves without developer node_modules. It does not exercise every runtime path or BB's dist loader.

The artifact contains `plugin/`, a pinned dependency manifest, file hashes and a manifest checksum. External Pi/OptChat/tools are *not* copied; doctor must resolve their exact configured versions on the receiving machine. Runtime npm dependencies need lockfile versions and must already be compiled into dist. Directory artifacts or tool-generated tar.gz transports are accepted. Archive links/special files/escaping paths are refused before extraction. No code signing or provenance verification is supplied.

## One setup entry (receiving Mac)

First stage the starter from the separate Exocortex repository using `deploy/mac-bb/exo_mac_starter.py stage --out ...`. Transfer its reviewed artifact and script as well as the product artifact and this built-in-only tooling directory. There is not yet a combined downloadable distribution.

```
"$NODE" tools/release/exo-release.mjs setup \
  --accept-full-access \
  --artifact /path/to/exosurface-VERSION \
  --starter-script /path/to/exo_mac_starter.py \
  --starter-artifact /path/to/starter-artifact-directory \
  --python /absolute/real/python3 \
  --vault /absolute/owner-vault \
  --owner-timezone YOUR_IANA_ZONE \
  --pi-cli /absolute/pi/entry \
  --optchat /absolute/optchat-checkout \
  --models /path/to/models.json
```

Setup and direct install refuse without `--accept-full-access`, displaying the full-permissions notice before any installation writes. Omitting it is the noninteractive decline path. The wrapper checks Python, applies the starter (conflict exit 3, no product-install writes), verifies it, then installs the immutable release. Owner timezone is explicit. Starter verification needs its executable tools, not just skill text. Retry preserves the existing installation; use `models` or `update` deliberately afterward. `--models` is a **file** containing explicit role selections:

```json
{"main":{"provider":"YOUR_PROVIDER","model":"YOUR_MODEL","thinking":"medium"},"compactor":{"provider":"YOUR_PROVIDER","model":"YOUR_MODEL","thinking":"low"},"subagent":{"provider":"YOUR_PROVIDER","model":"YOUR_MODEL","thinking":"medium"}}
```

No inferred models or credentials. Installing without selections is recoverable but unready: `models --models /file` fills missing roles only and never replaces existing selections. Config bindings are created only when absent; a conflicting vault/state binding is refused. To change an existing selection edit your own config deliberately, not by an implicit upgrade.

Defaults: config `~/.config/exosurface/config.json`; state/history `~/.exosurface`; releases `~/Library/Application Support/Exosurface/releases/VERSION`; atomic `current` symlink. Flags `--home`, `--prefix`, `--config`, `--state-dir`, `--launch-agents-dir`, `--logs-dir`, `--node` permit isolated fixtures or explicit relocation.

Installation writes a plist but **does not load it**. After reviewing doctor and first-run gates, a person separately registers `current/plugin` in BB and runs the printed launchctl command. Fresh-owner login is through the first-run flow using that owner's own account; never copy another machine's Pi home. The plist sets EXO_CONFIG, EXO_STATE_DIR, EXO_RELEASE and EXO_RELEASE_ROOT, stable Node/PATH, log files, RunAtLoad and crash-only KeepAlive. Switching `current` does not restart a loaded process: explicitly restart after an approved update. No automatic service-control or deployment is performed by this tool.

## Check, update, rollback, remove

```
"$NODE" tools/release/exo-release.mjs doctor --json
"$NODE" tools/release/exo-release.mjs update --artifact /path/to/new-artifact
"$NODE" tools/release/exo-release.mjs rollback --to OLD_VERSION
"$NODE" tools/release/exo-release.mjs uninstall --service-stopped
```

Doctor is read-only. `ok` means no failing preflight checks, **not release ready**; `ready:false`, unsupported and warning statuses remain visible. BB registration, own authentication, real connectivity and reboot need separate proof. The owner `--readiness` protocol is consulted without reading secrets or calling providers; unverified auth/connectivity stay unverified. `--query-launchd` is an explicit optional read-only service query.

Update/rollback preserve notes/history. State schema must be readable by the target release; unknown state or an incompatible downgrade is refused. Code rollback is not state rollback. No automatic migration exists. Back up state before any approved upgrade. Plist/config edits owned by a person are not silently overwritten. Local versions are immutable: a version already present with different contents is refused.

Uninstall requires explicit confirmation that the service has already been stopped. It removes only the installer-owned release prefix/plist and unchanged installer-created config. It always preserves vault, state/history and logs. Remove BB's plugin registration yourself. Generated install receipts are trusted local lifecycle metadata, not an untrusted import format. Install/update are not a crash-transaction across all filesystem paths; an interrupted write requires doctor and deliberate retry/recovery, never a claim of automatic crash rollback.

## Tests

```
"$NODE" --test tools/release/test/*.test.mjs
```

All lifecycle fixtures are in temporary roots; subprocesses use an environment allowlist. This prevents accidental inherited live selectors, not malicious code access. No test installs/registers a real service or changes live BB.

### Development evidence (2026-10-28)

- Ten disposable-root tests passed on Node 24.15.0, including decline-before-write, starter conflict exit 3, missing-tool doctor failure, relocated owner execution, archive-link refusal, and schema-incompatible rollback refusal.
- The actual sibling first-run plugin (stable id `exosurface`, version `0.1.0-dev`) built through this strict builder: 30 selected files, six dist owner-graph modules. Its relocated `--release-selftest` returned `ok:true` from a throwaway HOME without artifact node_modules. Package pins were `@earendil-works/pi-coding-agent@1.1.0` and OptChat `aae1caf7715830051d327f819fc776792211167a`; SDK/react/zod versions came from the package lock.
- That source was still uncommitted, so `--allow-dirty` was explicitly recorded (`clean:false`). This is cross-lane development evidence, not release provenance approval. Only Node 24.15.0 was exercised, not the minimum 22.19.0.
- The owner import graph resolves. Actual BB host/server/app loading, first-owner authentication, provider connectivity and service startup/reboot remain **unverified**. The dependency manifest says `lockedRuntimePackages`, not that runtime packages were proven bundled into BB's app output. No live service or BB profile was changed.

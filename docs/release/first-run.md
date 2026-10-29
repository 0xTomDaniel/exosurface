# Install and test the Exosurface BB plugin

**Current route: normal BB desktop + one source-built plugin.** Start with the [root README](../../README.md#install-the-current-spike-on-macos). This is a private spike (`releaseReady: false`), not a packaged Exocortex installer. The two older spike plugins and `first-run-shell-*` owner are not the fresh-install target.

## Scope and demonstrated checks

The plugin supplies the interface, surface instructions/extensions and Pi/OptChat integration. Supply your **Exocortex workspace/vault** separately: `AGENTS.md`, installed skills, any approved private notes and local tool configuration. A fresh OptChat profile does not import another person's identity, memory, conversation or credentials. Generic startup is not the same as provisioning a complete Exocortex instance.

The first-run source checkpoint `57819800fd466cdd270cfc25ba630d21d5778db7` passed a focused independent review: **24/24 targeted tests**, including six unauthorized/malformed RPCs refused with zero native calls. Author-run checks also passed: locked root/nested installs, 52 synthetic tests, configured strict types, owner/runtime builds and actual isolated BB server plugin registration. UI inspection and synthetic checks are not real conversation acceptance.

**Not yet demonstrated together:** normal fresh desktop installation, real native initialization/binding, authenticated retained-owner startup, conversation, page action and persisted reopen. The isolated test stopped before native setup because its separate headless server lacked an execution host. That is **not evidence that desktop plugin installation requires extra BB account login or manual machine enrollment**.

## Dependencies

- macOS with normal BB desktop installed and running (tested BB 0.45.0).
- Git and Node >=22.19 with npm (tested Node 24.15.0/npm 11.12.1).
- Writable source checkout of this private repository, access to its locked dependencies and BB's compiler toolchain.
- OptChat **0.8.6** from [upstream](https://github.com/jonaslsaa/pi-optchat), pinned to `aae1caf7715830051d327f819fc776792211167a`, with its dependencies installed. For a new source checkout:

  ```sh
  git clone https://github.com/jonaslsaa/pi-optchat.git
  cd pi-optchat
  git checkout aae1caf7715830051d327f819fc776792211167a
  npm ci
  ```

- Pi **1.1.0** and SDK **0.6.15** are pinned in the plugin's root lockfile. Use Pi's public `dist/bundle/cli.js`, not its incompatible SDK-root import.
- Your own workspace/vault and model-provider account. Normal provider authentication occurs after initialization in the new owner's private Pi directory.

The earlier isolated run reused populated npm/BB toolchain caches; an uncached download/install on a new Mac has not been tested. Normal `npm ci`/BB builds may download dependencies and execute trusted package scripts. No global Pi installation is needed by these instructions. SDK redistribution rights remain unresolved: this private source integration does not authorize a public binary/package release.

## Local configuration

Before registering the plugin, create `~/.config/exo/exosurface.json`, private to your user (mode 0600). The following JSON is a **template**: replace every placeholder with a real absolute path. Use a new owner label and fresh state paths; do not overwrite an existing working Exo configuration.

```json
{
  "ownerLabel": "app.exosurface.owner.NEW_INSTANCE",
  "primaryStateDir": "/absolute/short/path/s",
  "primaryOptchatHome": "/absolute/short/path/o",
  "primaryProfile": "exo-optchat",
  "primaryAgentDir": "/absolute/short/path/s/pi-config",
  "vault": "/absolute/path/to/your/exocortex-vault",
  "piCli": "/absolute/path/to/exosurface/plugins/bb-plugin-exosurface/node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js",
  "optchat": "/absolute/path/to/pi-optchat"
}
```

Path rules:

- `primaryAgentDir` **must be** `primaryStateDir/pi-config`. Do not precreate it or its credential files: setup creates/validates it. State/OptChat homes must be new and separate from any existing owner's directories.
- Use real normalized paths, not symlink aliases (on macOS, `/private/tmp` rather than `/tmp`). The vault and installed source/CLI paths must already exist.
- Keep homes short: `primaryOptchatHome/profiles/exo-optchat/windows.sock` must fit **103 UTF-8 bytes** on macOS. Short per-user paths such as `$HOME/.exo/s` and `$HOME/.exo/o` may work; check the fully expanded absolute paths for your username.
- The setup refuses conflicting config, foreign state, symlinks and ambiguous creation outcomes. Do not edit receipts or fabricate bindings to force progress.
- `ownerLabel` is a unique local supervisor identifier, **not** a launchd installer. No automatic service installation is supplied here.
- `EXO_CONFIG` can select a different file, but BB's plugin runtime and the separately started owner must both receive it. A terminal-only export does not change an already-running desktop app. Use the default location for the ordinary desktop instructions.

Keep credentials out of this JSON. Historical shell fields such as `stateDir`, `agentDir`, `models` and `EXO_STATE_DIR` do not configure this consolidated route.

## Build and register in normal desktop BB

Follow the clone/dependency commands in the [root README](../../README.md#2-clone-and-install-the-locked-plugin-dependencies), then from the plugin directory:

```sh
# PLUGIN is the absolute, writable plugins/bb-plugin-exosurface directory.
# BB_CLI is the installed public CLI, not the BB.app executable.
NODE="$(command -v node)"
BB_CLI="/Applications/BB.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/dist/bb.js"
cd "$PLUGIN"
"$NODE" "$BB_CLI" plugin build "$PLUGIN"
"$NODE" build.mjs
"$NODE" build-runtime.mjs
"$NODE" "$BB_CLI" plugin install "$PLUGIN" --yes --json
```

There are two locked installs (`npm ci` in the plugin root and `legacy/surface`), not a workspace-wide dependency flattening. BB rebuilds local plugin entries and writes build outputs. Keep the source/dependencies available and writable; a read-only archive or `dist/` alone is not installable by this route.

Registration creates the **Exosurface** plugin (`exosurface`) and `exo-spike` provider. Open its page in BB; route `/plugins/exosurface/proof`. Do not install both historical plugins alongside the consolidated one for a fresh instance. A normal desktop installation does not require creating a second server.

## Initialize and start the owner

**These are the implemented sequence and pending real-desktop test steps, not a claim that the sequence has been demonstrated end to end.**

1. In BB select/create a normal project for your Exocortex vault.
2. Open **Initialize a fresh Exo owner** in Exosurface. Confirm project, workspace, public Pi CLI and OptChat paths; review the checkbox authorizing one native conversation and a labelled user initialization record, without inference; click **Initialize Exo**.
3. Wait for setup to reach `bound`. `ownerReady: false` at this stage is intentional: initialization does not start the retained owner or authenticate a provider. If setup reports an uncertain creation outcome, stop and reconcile it; do not start a replacement operation or delete its journal.
4. Authenticate only the setup-created private Pi directory via normal Pi `/login`. Do not copy another instance's `auth.json` or inherit API keys. Use the paths from your configuration; set the variables below explicitly, with no placeholders left:

   ```sh
   # In the terminal from the build steps; PLUGIN and NODE are still set.
   CONFIG="$HOME/.config/exo/exosurface.json"
   config_value() {
     "$NODE" -e 'const fs=require("node:fs"); const c=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const v=c[process.argv[2]]; if(typeof v!=="string"||!v.startsWith("/")) throw Error("Expected a configured absolute path"); process.stdout.write(v)' "$CONFIG" "$1"
   }
   STATE="$(config_value primaryStateDir)"
   OPTCHAT_HOME_PATH="$(config_value primaryOptchatHome)"
   VAULT="$(config_value vault)"
   PI_CLI="$(config_value piCli)"
   cd "$VAULT"
   env -i HOME="$STATE/setup-home" TMPDIR="$STATE/setup-tmp" \
     PATH="$(dirname "$NODE"):/usr/bin:/bin" \
     PI_CODING_AGENT_DIR="$STATE/pi-config" OPTCHAT_HOME="$OPTCHAT_HOME_PATH" \
     "$NODE" "$PI_CLI" \
     --offline --no-extensions --no-mcp --no-skills --no-prompt-templates --no-context-files --no-tools
   ```

   Use interactive `/login` for the provider you intend to use; finish normal provider approval and exit Pi before starting the owner. `--offline` is not a network sandbox and does not replace provider authentication. No login or model call was performed in the isolated test. Do not run this before setup creates the private directories.

5. Start the retained owner in a **separate terminal**, using the same Node, plugin and config paths:

   ```sh
   # Set NODE and PLUGIN as in the build terminal; use BB's same config.
   CONFIG="$HOME/.config/exo/exosurface.json"
   OWNER_HOME="$HOME"
   OWNER_TMP="$(mktemp -d /private/tmp/exo-owner.XXXXXX)"
   env -i HOME="$OWNER_HOME" TMPDIR="$OWNER_TMP" \
     PATH="$(dirname "$NODE"):/usr/bin:/bin" EXO_CONFIG="$CONFIG" \
     "$NODE" "$PLUGIN/dist/owner-service.js"
   ```

   Keep this process running while testing. **Do not use `dist/first-run-shell-owner-service.js`**: that is the separate historical shell. No launchd/reboot supervision is provisioned by this spike. With the owner absent, the bridge may request its configured supervisor label; do not point the fresh config at another live owner's label.

6. Confirm your intended model in BB, send a short message, ask for a page with a textbox/button, perform an action, then reopen the same conversation and verify the same thread/session and page. These real acceptance checks are **pending**, not recorded passes.

The main model aliases remain `exo-opus-5-5` → `anthropic/claude-opus-5-5` (high), and the separately selected alternative `exo-gpt-6-1-sol` → `openai-codex/gpt-6.1-sol` (high). No automatic fallback is configured. The generic profile also names compactor `anthropic/claude-sonnet-5-5` (medium) and subagent `anthropic/claude-opus-5-5` (high); provision/authenticate a role before using it. Setup itself requests no inference for any role.

## Troubleshooting and test boundaries

| Symptom | Meaning / next check |
|---|---|
| Missing local path/config | Check the actual config read by BB and the owner; all source/vault/CLI paths must exist |
| Long socket path, symlink or foreign-state refusal | Correct the new instance's paths; do not weaken recovery guards or adopt another owner's files |
| Setup is `bound` but conversation cannot attach | Confirm model auth and that `dist/owner-service.js` is running with the same config |
| `Missing host bootstrap material` on a separately started headless server | That test server lacks an execution host; this is not proof that the desktop plugin requires manual machine enrollment |
| `Sign in to your bb account to use bb connect` in the manual-machine route | Account-side prerequisite of that **headless test route**, not a desktop extension installation step |
| Input too large | Atom/textbox cap 2,000 UTF-16 units; workspace 40 KiB and serialized owner command 12,000 UTF-16 units; refusal is atomic, not silent truncation |

The prior bounded test used a disposable HOME/data directory and separate backend ports. Plugin registration passed, but no host bootstrap/account credentials were manufactured or copied; no account login or machine enrollment was initiated. The desktop probe was stopped before launching a second Electron instance because safe profile/single-instance isolation was not established. A fresh HOME on an existing Mac is not physical clean-Mac proof.

Do **not** run account login, manual-machine creation/enrollment, a global installer or service installation merely to accommodate those test notes. Such account/device side effects require separate explicit authorization. Normal BB desktop first-launch prompts belong to BB; provider login belongs to Pi.

The [bounded check record](../../plugins/bb-plugin-exosurface/compat/consolidation/fresh-owner-install-spike/README.md) retains author checks and the actual stopping point. Fresh-desktop UI/native interaction, clean-machine downloads, reboot/lifecycle, distribution and licensing/security qualification remain open. Same-account guards and a scrubbed environment are accident controls, not an OS sandbox.

For an ordinary manual test, stop the owner with Ctrl-C in its terminal. Keep state if testing persistence. Never delete a profile/state directory while its owner is running or remove recovery records to force a new conversation. Preserve original private evidence separately; no working desktop or existing owner was restarted for this checkpoint.

# Install and test the Exosurface BB plugin

**Current route: normal BB desktop + one source-built plugin.** Start with the [root README](../../README.md#install-the-current-spike-on-macos). This is a private spike (`releaseReady: false`), not a packaged Exocortex installer. The two older spike plugins and `first-run-shell-*` owner are not the fresh-install target.

## Scope and demonstrated checks

The plugin supplies the interface, surface instructions/extensions and Pi/OptChat integration. Supply your **Exocortex workspace/vault** separately: `AGENTS.md`, installed skills, any approved private notes and local tool configuration. A fresh OptChat profile does not import another person's identity, memory, conversation or credentials. Generic startup is not the same as provisioning a complete Exocortex instance.

The first-run source checkpoint `57819800fd466cdd270cfc25ba630d21d5778db7` passed a focused independent review: **24/24 targeted tests**, including six unauthorized/malformed RPCs refused with zero native calls. Author-run checks also passed: locked root/nested installs, 52 synthetic tests, configured strict types, owner/runtime builds and actual isolated BB server plugin registration. UI inspection and synthetic checks are not real conversation acceptance.

**Demonstrated 2026-10-29 (branch `spike/desktop-install`):** in an [isolated instance](#isolated-test-instance) of BB 0.45's own server and host daemon, run under the BB.app binary exactly as the desktop app runs them, the plugin built, registered, and the real **Initialize Exo** button reached `bound`: one native BB conversation, a generic OptChat profile and Pi session, no inference. That run found and fixed four setup defects (runtime root, Electron child processes, host selection, copied host artifact; see the [check record](../../plugins/bb-plugin-exosurface/compat/consolidation/desktop-install-spike/README.md)).

**Then, with Tom's explicit consent, in the same instance:** owner started; one conversation answered by `openai/gpt-6.1-sol` (recorded in the Pi session); Exo drew a page with a textbox and button; typing a note and pressing Save stored revision 2 and delivered the action to Exo, which acknowledged it; after stopping and restarting BB and the owner, the same thread, history and Pi session reopened and Exo recalled the saved note. A fifth defect (BB starting the setup thread after setup was already `bound`) was fixed on the way.

**Not yet demonstrated:** an install on a physically fresh Mac, the BB desktop window itself (a browser served the same frontend), Anthropic sign-in, uncached downloads.

**Superseded diagnosis:** the earlier isolated test failed with `Missing host bootstrap material` because it started `bb-server` and `bb-host-daemon` separately. BB's `bb-app` launcher (what BB.app and `npx bb-app` use) requests a local-host enrollment key from its own server automatically. No BB account login or manual machine enrollment is involved.

## What the retained owner loads

Verified in a disposable fixture with generic marker instructions/skills: real OptChat 0.8.6 profile API and setup journal, Pi 1.1.0 CLI and the unmodified `dist/owner-service.js`; only BB's thread API was mocked. No inference: a local test provider recorded which markers reached the model request. Reproduce with `plugins/bb-plugin-exosurface/test/context-loading-real.mjs` (usage in its header; variants `plain`, `shadow`, `ancestor`).

The owner starts Pi with **working directory = the configured `vault`**, `--approve` (project trust for that run), the packaged Exosurface/OptChat extensions and `--skill <plugin>/resources/skills/exosurface`. Its environment is an allowlist: the owner's `HOME`, `PATH` and `TMPDIR`, plus `PI_CODING_AGENT_DIR=<primaryStateDir>/pi-config` and `OPTCHAT_HOME=<primaryOptchatHome>`. Inherited `PI_*`/`OPTCHAT_*`/`EXO_*` variables and API keys are not passed. The model request contains, in order: OptChat's preamble (replacing Pi's default base prompt), `AGENTS.md` context, the skill list, Exosurface's presentation guide, then the OptChat profile's `AGENTS.md`.

| Source | Loaded by the retained owner? |
|---|---|
| `<vault>/AGENTS.md`, plus `AGENTS.md` in the vault's parent directories | Yes |
| `<vault>/.agents/skills/` (and parent `.agents/skills/`, up to a Git root if there is one) | Yes, as project skills, because of `--approve` |
| `<vault>/.pi/` settings, extensions, MCP config | Trusted by `--approve` (not fixture-tested); extensions there run inside the owner |
| `~/.agents/skills/` of the owner's `HOME` | Yes, as user skills |
| Packaged `exosurface` skill | Yes, **unless** a workspace or user skill is also named `exosurface`: that copy wins and the packaged one is silently dropped |
| `~/.pi/agent` (skills, `AGENTS.md`, settings, auth) | No; the owner uses the setup-created `pi-config` |
| OptChat profile `AGENTS.md` | Yes, last. Setup writes OptChat's generic template. It adds nothing personal and does not replace the vault's instructions |

So put Exocortex identity and policy in the vault's `AGENTS.md` and its skills in `<vault>/.agents/skills/`. Don't keep a skill named `exosurface` there unless you intend to override the packaged one. Anything in the vault's parent directories, such as your home folder, also loads. Starting the owner with your real `HOME` loads your `~/.agents/skills`; that is intended on your own Mac, but a second test instance on the same account is not context-isolated. Initialization runs with skills and context files disabled, so these sources apply only to the retained owner.

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

1. In BB add a normal project whose folder is **exactly** your Exocortex vault path. Initialization runs the conversation on that project's source machine and refuses any other project (including *Personal*) before changing anything.
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

   Use interactive `/login` for the provider you intend to use; finish normal provider approval and exit Pi before starting the owner. `--offline` is not a network sandbox and does not replace provider authentication. Do not run this before setup creates the private directories.

   Check readiness without a model call or token refresh, using the same environment: `… "$NODE" "$PI_CLI" auth check --provider <provider> --json --no-refresh`. In the isolated test a ChatGPT login was stored by Pi 1.1 as provider **`openai`** (`ready`, OAuth); `anthropic` and `openai-codex` reported `credentials_not_configured`. That is credential metadata only; no inference has been run with it yet.

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

6. Confirm your intended model in BB, send a short message, ask for a page with a textbox/button, perform an action, then reopen the same conversation and verify the same thread/session and page. This passed once in the isolated test (see above). Note: clicking an earlier page card and then sending a message **brings that earlier version back** as a new revision; to check persistence, open the page from the latest card.

The main model aliases remain `exo-opus-5-5` → `anthropic/claude-opus-5-5` (high), and the separately selected alternative `exo-gpt-6-1-sol` → `openai-codex/gpt-6.1-sol` (high). No automatic fallback is configured.

**ChatGPT sign-in with Pi 1.1:** Pi 1.1 stores a ChatGPT login under provider `openai` and lists `gpt-6.1-sol` there, not under `openai-codex`. To use GPT-6.1 Sol with that login, add the existing optional key `"primarySolProvider": "openai"` to the local configuration (it only changes the Sol alias's provider; Opus is unaffected, and setup's configuration check permits this extra key), reload the plugin/owner so both read it, then pick **Exo — GPT-6.1 Sol** in BB's model picker. The owner starts on the last picked model (Opus by default) and switches before sending; a model whose provider is not signed in fails rather than falling back. This mapping was used for the isolated test conversation above. The generic profile also names compactor `anthropic/claude-sonnet-5-5` (medium) and subagent `anthropic/claude-opus-5-5` (high); provision/authenticate a role before using it. Setup itself requests no inference for any role.

## Isolated test instance

To test without touching a working BB, run BB's own launcher with a separate HOME, data directory and ports. This is exactly the tested invocation (Electron binary as Node, as the desktop app runs its server; desktop-like minimal PATH):

```sh
R=/private/tmp/exo-test.XXXXXX   # a new private directory; use mktemp -d
mkdir -p "$R/h" "$R/t" "$R/bb" "$R/v"
BBAPP=/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/dist
env -i HOME="$R/h" TMPDIR="$R/t" PATH=/usr/bin:/bin:/usr/sbin:/sbin ELECTRON_RUN_AS_NODE=1 \
  /Applications/bb.app/Contents/MacOS/bb "$BBAPP/bb-app.js" \
  --data-dir "$R/bb" --server-port 49411 --host-daemon-port 49412 --bundled
```

Open `http://127.0.0.1:49411` in a browser. Point the CLI at it with `env -i HOME="$R/h" TMPDIR="$R/t" PATH="$(dirname "$NODE"):/usr/bin:/bin" BB_DATA_DIR="$R/bb" BB_SERVER_URL=http://127.0.0.1:49411 "$NODE" "$BBAPP/bb.js" …`; for example `plugin install "$PLUGIN" --yes --json` and `project create --name "Exo vault" --root "$R/v" --machine <host id from machine list>`. Put the [local configuration](#local-configuration) in `$R/h/.config/exo/exosurface.json`. Stop it with Ctrl-C (or SIGTERM to the launcher). The working app's ports, data directory and userData are not used; this is an accident guard, not a sandbox.

## Troubleshooting and test boundaries

| Symptom | Meaning / next check |
|---|---|
| Missing local path/config | Check the actual config read by BB and the owner; all source/vault/CLI paths must exist |
| Long socket path, symlink or foreign-state refusal | Correct the new instance's paths; do not weaken recovery guards or adopt another owner's files |
| Setup is `bound` but conversation cannot attach | Confirm model auth and that `dist/owner-service.js` is running with the same config |
| `Select a BB project whose source on this Mac is exactly the workspace path` | Pick (or add) the project for the vault folder; nothing was changed. The check matches the project's exact source path and a single machine ID; it does not separately verify that machine is this Mac, so use a project created locally for this spike |
| `Missing host bootstrap material` | `bb-server` and `bb-host-daemon` were started separately; use BB.app or the `bb-app` launcher, which enrolls the local host itself |
| `Sign in to your bb account to use bb connect` | Only for adding a remote/manual machine; not needed for this plugin |
| Input too large | Atom/textbox cap 2,000 UTF-16 units; workspace 40 KiB and serialized owner command 12,000 UTF-16 units; refusal is atomic, not silent truncation |

The prior bounded test used a disposable HOME/data directory and separate backend ports. Plugin registration passed, but no host bootstrap/account credentials were manufactured or copied; no account login or machine enrollment was initiated. The desktop probe was stopped before launching a second Electron instance because safe profile/single-instance isolation was not established. A fresh HOME on an existing Mac is not physical clean-Mac proof.

Do **not** run account login, manual-machine creation/enrollment, a global installer or service installation merely to accommodate those test notes. Such account/device side effects require separate explicit authorization. Normal BB desktop first-launch prompts belong to BB; provider login belongs to Pi.

The [bounded check record](../../plugins/bb-plugin-exosurface/compat/consolidation/fresh-owner-install-spike/README.md) retains author checks and the actual stopping point. Fresh-desktop UI/native interaction, clean-machine downloads, reboot/lifecycle, distribution and licensing/security qualification remain open. Same-account guards and a scrubbed environment are accident controls, not an OS sandbox.

For an ordinary manual test, stop the owner with Ctrl-C in its terminal. Keep state if testing persistence. Never delete a profile/state directory while its owner is running or remove recovery records to force a new conversation. Preserve original private evidence separately; no working desktop or existing owner was restarted for this checkpoint.

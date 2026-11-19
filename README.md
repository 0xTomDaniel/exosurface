# Exosurface

A shared, adaptive interface for you and your personal agent: conversation and persistent, interactive pages in stock [BB](https://getbb.app), without a BB fork.

## Install the current spike on macOS

**Source-build spike, not a finished one-click installer.** Install the normal BB desktop app, then the **one consolidated plugin** at [`plugins/bb-plugin-exosurface`](plugins/bb-plugin-exosurface). Do not install the two older spike plugins alongside it for a fresh setup.

The source build, BB registration and the real **Initialize Exo** step (since replaced by **Set up Exo** in the Exo tab's settings; native conversation created and bound, no inference) have been exercised in an isolated BB instance running BB.app's own server and host daemon. In that instance a real conversation (GPT-6.1 Sol via a ChatGPT sign-in), a page with a textbox and button, a button action and a reopen after restarting BB and the owner also worked once. This is a working-spike claim on one Mac, not an end-to-end installation guarantee; a physically fresh Mac has not been tried.

### What is included?

| Component | Provided by this plugin? |
|---|---|
| BB conversation/pages interface, rendering and surface presentation instructions | Yes |
| Pi/OptChat owner integration and explicit first-run initialization | Yes; runtime dependencies and local configuration are still required |
| Your Exocortex identity, operating instructions and installed skills | **No** — provision your separate Exocortex workspace/vault |
| Your memory notes, existing history and credentials | **No** — never bundled or automatically imported |

The complete experience needs **BB + this plugin + an Exocortex workspace + model authentication**. A fresh owner gets a generic OptChat profile, not a copy of another person's Exo. See [repo boundaries](#repo-boundaries).

### 1. Prepare BB, Node and your workspace

- Install and open the normal **BB desktop app** (tested: 0.45.0); complete whatever first-launch setup BB itself requests. No BB account login or manual machine enrollment is needed for this plugin: BB's own launcher enrolls the local Mac automatically (verified in an isolated instance).
- Install Git and mise at `mise-version`, then use the repository's locked Node22.23.3/pnpm10.7.0/just1.21.0 tools. Keep Node available when running the owner. The migration's local native-build evidence does not establish a fresh Mac or desktop acceptance result.
- Provision your own Exocortex workspace/vault separately, including its `AGENTS.md` and `.agents/skills/`. The plugin does not install these or your private memory. Add it to BB as a normal project whose folder is **exactly** the workspace path (initialization refuses any other project before changing anything).
- Obtain **OptChat 0.8.6** from its [upstream repository](https://github.com/jonaslsaa/pi-optchat), pinned to `aae1caf7715830051d327f819fc776792211167a`, and install its locked dependencies. The plugin uses its public extension/profile API, not the incompatible Pi SDK-root import.

### 2. Clone and install the locked plugin dependencies

Choose a writable checkout; BB rebuilds local plugins from source.

```sh
git clone https://github.com/0xTomDaniel/exosurface.git
cd exosurface
export PLUGIN="$PWD/plugins/bb-plugin-exosurface"
just setup
export NODE="$(mise which node)"
# Standard macOS BB.app location; adjust if you installed it elsewhere.
export BB_CLI="/Applications/BB.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/dist/bb.js"

cd "$PLUGIN"
```

`just setup` performs the one frozen pnpm workspace installation. The shared root lock preserves distinct owner/SDK Zod4, surface vendored Zod3 and composition Zod4 graphs through explicit importer/selector mappings, not flattening. Pi1.1.0 and SDK0.6.15 remain pinned. Setup may download packages and runs only approved esbuild lifecycle scripts; review/trust sources first. BB0.48.0's exact local build toolchain is supplied through root pnpm packageExtensions, avoiding BB's download/npm fallback. Historical npm inputs remain byte-frozen compatibility provenance, never active install instructions. Full adoption, uncached Mac setup and desktop acceptance remain unproven; see [migration evidence and deferred standards](docs/pnpm-migration.md).

### 3. Set the local paths before registration

Create `~/.config/exo/exosurface.json` using the [configuration example and path rules](docs/release/first-run.md#local-configuration). Point it at your own vault, the installed Pi bundled CLI and the pinned OptChat checkout. Use **new, separate state and OptChat directories**, not another owner's state. Keep socket paths short; do not precreate the `pi-config` credentials directory.

The default config location is read by BB and the owner. An `EXO_CONFIG` override must reach **both**, not just the installation command; changing an environment variable in a terminal does not configure an already-running desktop app.

### 4. Build and register the one plugin

From the same terminal/plugin directory as step 2, with BB running:

```sh
pnpm exec bb plugin build
../../scripts/build
"$NODE" "$BB_CLI" plugin install "$PLUGIN" --yes --json
```

This registers the plugin **Exo** (id `exosurface`, with provider `exo-spike`). Keep the checkout and dependencies available: local installation is not a self-contained binary bundle. Do not copy only `dist/` or install from a read-only archive. The normal desktop route does not require starting a second BB server.

### 5. Set up, authenticate and start Exo

Open the **Exo** tab in BB's sidebar (plugin route `/plugins/exosurface/surface`). Until Exo is set up, the tab shows only **Settings**, offering set-up: in **Project** select the project for your workspace (not *Personal*), then check **Workspace**, **Pi** and **OptChat**, each filled in where Exo finds it and changeable, then choose **Set up Exo**. Pressing it authorizes one native conversation and a labelled initialization record **without model inference**. A set-up that stops part way shows **Resume set-up** in the same settings, with the values it started with; resume it there. Do not start a second operation or delete recovery records to get around an uncertain result.

Exo opens on set-up until its set-up record (`<primaryStateDir>/canonical-setup.json`) says `bound`; then the tab opens on the sidebar and Home, and the sidebar's **Settings** button shows Set-up, Model, Running and Owner profile. An existing install keeps working, with no new set-up, when its `canonical-setup.json` stage is `bound` and its bindings are canonical.

Initialization and owner startup are separate. Once setup reports `bound`, authenticate the model provider in the **setup-created private Pi directory** (signing in with ChatGPT under Pi 1.1? see [`primarySolProvider`](docs/release/first-run.md#initialize-and-start-the-owner)), then start the retained owner in a separate terminal. The [step-by-step guide](docs/release/first-run.md#initialize-and-start-the-owner) supplies the environment and commands. A running BB view is not the owner process; automatic launchd provisioning is not included in this spike.

**Test boundary:** initialization reached `bound` in an isolated instance of BB's own server/host daemon (see the [guide](docs/release/first-run.md#isolated-test-instance)); the owner start and real interactions are still unverified. Report an initialization error rather than inventing bindings or copying another instance's authentication. No BB account login or machine enrollment is needed: the earlier headless failure came from starting BB's server and host daemon separately, not from the desktop route.

### 6. Check the actual experience

With the owner running and your chosen model authenticated: send one short message, ask for a small page with a textbox/button, perform an action, then reopen the same conversation and confirm the page and session persist. This sequence passed once in the isolated test; repeat it on your own install.

Known limits: a typed value (textbox/atom), and a press with its typed text, are capped at **16,384 UTF-16 units**; oversize input is rejected, not silently truncated. BB plugin SDK redistribution rights remain unresolved, so this public source repository is not authorization for a package/binary release that bundles the SDK. Full details, troubleshooting and the distinction between desktop installation and the isolated headless test are in the [installation guide](docs/release/first-run.md).

## Repo boundaries

**Exosurface** is the BB interface, runtime integration, Pi extensions and surface presentation guide. **Exocortex** is a separate private project: the separately provisioned agent setup (identity, policy, skills and profile configuration); its private memory vault is not in this repository. **Exomachina** is a separate private project: the factory product. Installing Exosurface does not install or migrate an Exocortex instance.

Vocabulary: [GLOSSARY.md](GLOSSARY.md). Historical implementations at `plugins/bb-plugin-exo-spike` and `plugins/bb-plugin-exo-a2ui-spike` remain for reference; the fresh-install target is the consolidated plugin above. Local paths belong in your local configuration. Sanitized test records live under the consolidated plugin's `compat/`; private raw conversations, credentials and machine evidence stay local. `node_modules/` and generated `dist/` are not committed.

## September 2026 research

Before the current implementation, the project compared agent protocols (A2A, AG-UI, A2UI) and built two independent spikes. Kept here:

- [Protocol trade-offs (ADR 0001)](docs/adr/0001-compare-agent-protocols.md), [independent protocol recheck](docs/research/2026-09-11-protocol-recheck.md), [protocol trade-offs research](docs/research/2026-09-12-protocol-tradeoffs.md), [thread lifecycle debate](docs/research/2026-09-12-thread-lifecycle-debate.md)
- [A2A vs AG-UI requirements](docs/a2a-vs-ag-ui-requirements.md) and [weighted comparison](docs/a2a-vs-ag-ui-weighted-comparison.md), [spike debate](docs/research/2026-09-13-spike-debate.md), [weighted forecast](docs/research/2026-09-13-weighted-forecast.md), [private control convention](docs/research/2026-09-13-private-control-convention.md), [A2UI input and shared core](docs/research/2026-09-13-a2ui-input-and-shared-core.md)
- [Shared core interface](docs/shared-core-interface.md) and [protocol mapping](docs/shared-core-protocol-mapping.md)
- Spikes: [`spikes/a2a-pi`](spikes/a2a-pi) and [`spikes/ag-ui-pi`](spikes/ag-ui-pi), both with fictional fixture data
- [Project vocabulary](CONTEXT.md)

The September harness and runtime comparisons are not published: they analyse third-party private code. References to them in the documents above are marked "kept private".

## License

Copyright 2026 Tom Daniel. Licensed under the [Apache License 2.0](LICENSE). BB plugin SDK redistribution rights are unresolved: the licence covers this repository's own code, not the BB SDK.

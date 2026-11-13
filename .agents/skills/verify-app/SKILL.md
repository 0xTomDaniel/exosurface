---
name: verify-app
description: "Drive the Exo BB plugin (plugins/bb-plugin-exosurface) offline through its ADR 0002 fallback run surface, `demo/surfaces <scenario>` (real server.ts, host.ts, release owner and Pi CLI, rendered app.tsx in jsdom; BB, OptChat and the model faked at the boundary by the existing mock-BB harness), the way a user does, and keep the proof: stdout, stderr, exit code, files and leftover processes per scenario, plus an evidence store record. Use to prove a plugin change works before handoff, to check a pages-and-activity criterion offline, or when anything about the demo surface looks off."
---

# verify-app

The plugin's user surface is the Exo tab inside BB (package.json `bb.app`, `app.tsx`) and the BB conversation it backs. BB is not on this box, so the runnable surface is the plugin's accepted ADR 0002 fallback, the demo launcher `plugins/bb-plugin-exosurface/demo/surfaces <scenario>` (scenarios: `SCENARIOS` in `demo/surfaces.ts`). Each scenario is one short-lived process that builds a temp fixture, starts the real entry points, renders the Exo panel in jsdom, plays one user journey, prints what the person would see, checks it (exit 0 or not), stops its processes and removes its fixture.

What is real and what is faked there (the header of `demo/surfaces.ts` and `test/mock-bb.ts`):

- Real: `server.ts` (its RPCs and `message.dispatch` hook), `host.ts` provider bridge as a child process on JSON-RPC stdio, the release owner (`legacy/primary/release-owner.ts`, packaged in `dist/` by build:owner and build:runtime), the real Pi 1.1 CLI, and the rendered `app.tsx` with Testing Library events.
- Faked, only at the boundary, by the existing harness `test/mock-bb.ts`: BB (plugin SDK, JSON-RPC peer, thread spawn), OptChat (a Pi extension and its profile API) and the model (an offline stream, plus `test/fake-model-http.ts` for the namer). jsdom stands in for BB's window: no layout, paint or animation.
- This skill adds no fake and no test-only branch in production code: it runs the demo launcher as a subprocess. What only a real BB, OptChat or model can prove is listed as live-BB-only in [features/README.md](features/README.md) and is not driven.

## Helpers

One helper, [`scripts/verify-app`](scripts/verify-app), executable: a thin `sh` launcher that runs [`scripts/verify-app.ts`](scripts/verify-app.ts) with `node` (type stripping, no build). It reads `qc.toml` with `python3`'s `tomllib` (mise.toml pins python 3.13; this repo has no TOML package in its Node graph) and validates it, its own run state and the plugin's `package.json` fields it reads with Zod (the root package's dev dependency). It needs this repo's tools and packages (`just setup`). The root `tsconfig.json` includes the script, so `just check` types and lints it. Run it from anywhere; it finds the repo from its own path:

```
.agents/skills/verify-app/scripts/verify-app setup                # the contract's setup only (install + builds)
.agents/skills/verify-app/scripts/verify-app launch               # see Launch
.agents/skills/verify-app/scripts/verify-app doctor               # see Doctor
.agents/skills/verify-app/scripts/verify-app drive <feature>      # see Drive; features: new-surface
.agents/skills/verify-app/scripts/verify-app cleanup              # see Cleanup
.agents/skills/verify-app/scripts/verify-app run                  # all of the above, end to end
```

`run` does launch, doctor, `drive new-surface`, cleanup, then lists the evidence folder to show it survived. Exit 0 means every step passed. Any other argument prints the usage line and exits 1. On this box run it as the gate runs heavy jobs: one at a time, under the gate's bounds (AGENTS.md; the contract's entry applies them to the scenario).

## Contract

[`qc.toml`](../../../qc.toml) at the repo root is this plugin's driver contract (octo-feather quality spec `#qc-contract`); what it declares is that spec section's, not repeated here. The helper invokes only what it declares; edit the contract, never the helper, to change any of it. How the helper uses each key:

- `format`: the helper reads format 1.
- `setup`: `setup` and `launch` run it; it must leave the owner and runtime builds doctor checks.
- `entry.command`: the demo launcher; `launch` writes it as `bin/surfaces` in the run state; every case runs that with the scenario name.
- `services`: none. Each scenario starts and stops its own bridge, owner and Pi; `launch` fails naming any declared service.
- `fixture`: none. Each scenario makes and removes its own temp fixture. `drive` runs each declared `reset` before its cases.
- `values`: the names the new-surface drive expects (`home`, `new_surface`), a worked example the helper compares against, never rebuilds.

What each key means and how its commands run: the kit's `schemas/qc.v1.schema.json`. Validate the contract with the kit's `octo-feather-contract qc.toml` (prints ok, or names the missing or wrong key).

## Run state and evidence

- `VERIFY_APP_RUN_DIR`: run state (the `state` file, the `bin/surfaces` command, scratch working dirs). Default `${TMPDIR:-/tmp}/verify-app.<uid>.<checkout-hash>/run`.
- `VERIFY_APP_EVIDENCE_DIR`: proof. Default `${TMPDIR:-/tmp}/verify-app.<uid>.<checkout-hash>/evidence`.
- Both default outside the git dir, so the helper runs unchanged where HOME and the git dir are read-only and /tmp is private. A default folder is used only when it is this user's private directory (not a symlink, mode without group/other write); an absent one is made 0700. `launch` prints the resolved paths.
- `launch` exits non-zero naming the folder when it cannot write the run state or evidence folder. It never reports ready without a written state file.
- Isolation: two checkouts get different defaults, and each scenario makes its own `exo-live-*` fixture under the temp dir, so two checkouts can drive at once. Two runs of the same checkout at once must set distinct `VERIFY_APP_RUN_DIR` and `VERIFY_APP_EVIDENCE_DIR`, or they overwrite each other's scratch and proof. The builds in `plugins/bb-plugin-exosurface/dist` are shared by the checkout: do not run `setup` while another run of the same checkout drives.

## Launch

`verify-app launch` checks both folders are writable, reads the contract (fails on any declared service), runs its `setup`, writes the `surfaces` command (the contract's entry) to `$VERIFY_APP_RUN_DIR/bin/surfaces`, then records in `$VERIFY_APP_RUN_DIR/state` the contract as read, that command, the `node` path, the repo root and the git rev. Ready is the line `verify-app: ready: surfaces=<path> entry=<entry.command> rev=<rev>`. No process is left running: each drive case starts its scenario and waits for its whole process group to be gone.

## Doctor

`verify-app doctor` (read-only) answers "is this checkout worth driving?": the recorded `surfaces` command exists; the contract's entry it runs; the `node` on PATH meets the plugin's `package.json` `engines.node`; the owner build (every `src/*.ts` as its `dist/*.js`, none older than its source) and the runtime build (`dist/runtime-graph.json` and each bundle its `entries` name) are present; the Pi CLI is installed in the plugin's `node_modules`; `surfaces` with no scenario exits 2 with the usage line `usage: demo/surfaces <...>` listing every mapped feature's scenario; the plugin version; the checkout is still at the launch rev (WARN means relaunch); the scratch dir exists. Exit non-zero on any FAIL. Run it first whenever a drive result looks wrong; a FAIL on the builds means `verify-app setup`.

## Drive

`verify-app drive <feature>` resets the contract's fixtures, then runs the feature's scenario from [features/](features/README.md) with the contract's values. Each case:

- runs `"$SURFACES" <scenario>` with cwd an empty `$VERIFY_APP_RUN_DIR/scratch/<case>`, as the leader of its own process group, bounded to 300 s (then SIGTERM to the group, SIGKILL 10 s later; exit 124);
- once the scenario exits, waits up to 15 s for its process group (bridge, owner, Pi children) to be empty; any process still in it is recorded, gets SIGKILL and fails the case. An interrupted helper (SIGINT, SIGTERM) sends SIGTERM to the running group before it exits. Never by name;
- writes `<case>.cmd` (argv as typed), `<case>.stdout`, `<case>.stderr`, `<case>.exit`, `<case>.files` (files the scenario left in its cwd; must be empty) and `<case>.procs` (processes of its group left after it; must be empty) to `$VERIFY_APP_EVIDENCE_DIR/<feature>/`;
- appends `PASS|FAIL <case>: <cmd>` to `<feature>/summary.txt` and prints it with the case's stdout and exit code (stderr is counted, not printed: jsdom's React `act(...)` notices).

To drive one scenario by hand, the same way: after `launch`, `cd "$(mktemp -d)" && <run state>/bin/surfaces new-surface; echo "exit $?"` (`launch` prints the run state folder). Any scenario in `demo/surfaces.ts` `SCENARIOS` runs this way; only mapped features with a feature file are driven and recorded by the helper. No PTY: the demo is not interactive.

## Evidence

Proof standards:

- Exercise the demo launcher as a process, never the scenario functions or `test/mock-bb.ts` in-process; the gate's tests already cover those.
- Capture the action (`.cmd`) and the resulting state (stdout, stderr, exit code), not just a PASS line.
- Check side effects: the scenario must write nothing in its cwd (`.files`) and leave no process (`.procs`).
- Mocks only where the harness already isolates an external system (BB, OptChat, model; see the top of this file). Never add one, and never claim a live-BB-only behavior from this surface.
- Report a skipped case as skipped, never as proved through a different case.

Evidence lives at `$VERIFY_APP_EVIDENCE_DIR`: `doctor.txt` (from `run`) and one folder per driven feature. That folder is scratch: the next drive of the feature replaces it.

The kept record is this repo's evidence store (octo-feather quality spec `#evidence-store`), outside the repo and both folders above: every `drive`, passed or failed, appends one record through the kit's `octo-feather-evidence` (on PATH with the kit's `scripts/`; a drive fails without it) and prints `verify-app: evidence record <id> (criterion <spec>#<anchor>; ...)`. The record holds the feature folder's files as outputs and names the commit, the criterion, the contract and fixture versions:

- The criterion is the one the feature file's `Drive criterion:` line names; `octo-feather-evidence` hashes its text from this repo's spec (`docs/specs/<spec>.spec.html`, the element with that anchor). With no such element the drive fails naming the criterion, and no record is kept.
- A record is evidence only: it changes no `docs/specs/*.status.json`. Status moves through the supervisor's qc path, never from this skill.
- Read a criterion's records at a commit: `octo-feather-evidence read --repo . --criterion <spec>#<anchor> --commit <rev>` (`--json` for data). Where the store lives and the record format: `octo-feather-evidence --help`.

## Cleanup

`verify-app cleanup` removes the scratch dirs, the `bin/surfaces` command and the state file, then the run dir if empty. Nothing is killed there: every case already saw its process group empty, and the helper never kills by name. The `dist/` builds stay (they are the checkout's, `./scripts/build` output). Evidence is never removed, and the evidence store is never touched; cleanup prints where the evidence folder stays. Run cleanup after every failed attempt too.

## Features

See [features/README.md](features/README.md): every user-facing feature of the plugin, classified offline-provable (with its scenario) or live-BB-only, with source pointers. The map is the maintained verification source; keep it honest with the `maintain-verification-skill` skill.

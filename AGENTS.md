# Exosurface

Existing native BB plugin, not a standalone CLI. Pilot migration scope and remaining standards: [docs/pnpm-migration.md](docs/pnpm-migration.md). No full template-conformance claim.

Repo skills: typescript, pnpm, nodejs

## Commands

- `just setup`: locked mise tools, frozen pnpm dependency installation, local Git hook.
- `just check`: canonical offline native owner/runtime build, existing TypeScript check and bounded mock-BB Node test harness. Hook and CI call the same gate.
- `./scripts/build`: real owner and runtime artifacts in `plugins/bb-plugin-exosurface/dist` and generated resources.
- `pnpm --dir plugins/bb-plugin-exosurface exec bb plugin build`: native BB host/server/app packaging. Use an isolated `BB_DATA_DIR`, no service or provider calls.
- Narrow harness: `plugins/bb-plugin-exosurface/scripts/check [test file ...]`, paths relative to caller when present, otherwise plugin directory.

## Layout and pins

- `plugins/bb-plugin-exosurface/{host.ts,server.ts,app.tsx}`: native SDK bridge and real BB entrypoints, declared in that plugin's package.json; keep BB and SDK engine requirements.
- `src/`, `legacy/primary/`, `legacy/surface/`: owner, runtime and surface code. `legacy/surface/composition/` includes imported modules; its engine dependency graph remains tracked and explicitly installed during the pilot.
- Root `pnpm-workspace.yaml` enumerates active installation projects; root package.json owns pnpm selector overrides and the local pinned BB packaging CLI. `pnpm-lock.yaml` is the active graph once generated. Do not rewrite compatibility or historical lock/evidence snapshots.
- `mise.toml` and `mise.lock`: Node 22.23.3, pnpm 10.7.0, just 1.21.0. `mise-version` pins mise. No duplicate packageManager pin.
- `test/reap.ts`, `test/parent-watch.mjs`: existing subprocess ownership, parent watching and awaited harness cleanup. Preserve these and the gate's flock, heap1536, GOMAXPROCS2, test concurrency2 and timeout bounds.
- `.github/workflows/ci.yml`: frozen install, canonical gate, actual native BB packaging.
- `compat/` and `plugins/bb-plugin-exo-a2ui-spike/`: retained compatibility/research/evidence trees, inside the TS gate. `plugins/bb-plugin-exo-spike/`, `spikes/a2a-pi/` and `spikes/ag-ui-pi/` are DEFERRED BY OWNER from the TS gate ([#216 comment 6830616474](https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6830616474), `scripts/owner-deferrals.ts`): not assessed, not compliant, waived or exempt.

Standards gate (#216): each TS/JS gate (compiler per `ts_projects`, typed ESLint, knip) is a counted no-raise ratchet against `scripts/standards-baseline.json` ([owner decision](https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6829935664)): a new or higher finding fails; `node scripts/lint.ts --record-baseline` only lowers. Python lint/type is DEFERRED BY OWNER ([#216 comment 6828772822](https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6828772822)); `just check-python` is manual. Integrity-pinned files are listed in `scripts/source-inventory.json`. The migration record keeps the #217 pilot history and the tracked language/path inventory. Do not add integrate/qc recipes: brownfield integration is supervisor-owned via the kit's transactional command (octo-feather ADR0017). No product QC or live model/service runs in the deterministic gate.

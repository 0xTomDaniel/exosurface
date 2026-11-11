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
- `compat/`, other plugin spikes and `spikes/`: retained compatibility/research/evidence trees, not blanket exclusions from future standards work.

Tracked language/path inventory and deferred coverage live in the migration record. Do not add integrate/qc recipes: brownfield integration is supervisor-owned via the kit's transactional command (octo-feather ADR0017). No product QC or live model/service runs in the deterministic gate.

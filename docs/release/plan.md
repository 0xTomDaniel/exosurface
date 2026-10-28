# Private Mac release plan

Status: implementation in parallel; **not release ready**. Spec: [mac-release.spec.html](../specs/mac-release.spec.html). No Accept has been recorded. Production, its configuration and its history have not been migrated by this lane.

## Tracker and ownership

Private tracker: [#45](https://github.com/0xTomDaniel/exosurface/issues/45).

| Lane | Issue | Owned implementation |
|---|---|---|
| Native BB layout evidence | #46 | `spikes/native-bb-layout/` |
| Immutable bundle/lifecycle | #47 | `tools/release/`, excluding acceptance; install and contract docs |
| Production plugin/first run | #48 | `plugins/bb-plugin-exosurface/`, first-run docs |
| Generic starter integration | #49 | Implementation in private `0xTomDaniel/exocortex`, `deploy/mac-bb/`, branch `release/mac-starter` |
| Reliability/privacy integration | #50 | Existing spike fixes, reuses #31 textbox and #27 dependencies; related #25 isolation |
| Independent acceptance | #51 | Shipping spec, this plan, `tools/release/acceptance/` |

These issues are bounded release work, not duplicates of #33–#43 surfaces/pages or #44 Mermaid. That roadmap remains agreed; multi-surface runtime is deferred, not revoked. Mermaid is not silently made a prerequisite for this release. This lane checked all remote issues before creating #45–#51; the repository is private.

## Integration order

1. Reconcile starter, plugin and bundle interfaces; test using fixture paths and subprocess environment allowlists. Separate worktrees do not isolate runtime state.
2. Build the production plugin, port/review reliability fixes in that plugin, then build a relocatable immutable artifact and a separate starter artifact from exact committed sources.
3. Verify artifact checksums/privacy/source provenance, dependency lockfile and side-effect-free owner selftest with **no development node_modules** available.
4. The bundle owns one setup entry point: apply starter, then install with the resulting vault. Explicit owner timezone and models are required; missing configuration is not success. Stage-only output is not an installed working Exo.
5. Run the integrated negative suites and independent static checks. Record exact component commits, Node/Python/BB versions, commands and observations outside the distributable artifact. Source scans and pattern checks support, but do not replace, human privacy review.
6. Use a never-used macOS account or VM for real BB, own authentication, first answer/page button, persistence and lifecycle proof. Do not use the author's existing history or authentication.
7. Tom reviews layout evidence, chooses layout/delivery and Accepts the spec; shipping/deployment/migration/publication remain separately authorized actions.

## Reconciled candidate contract

Provisional until integrated proof: `exosurface-package/0`; service `app.exosurface.owner`; explicit `EXO_CONFIG`, default `~/.config/exosurface/config.json`; state `~/.exosurface`, `state-schema.json` containing `{"schema":1}`. Launchd has `RunAtLoad: true`, `KeepAlive: {SuccessfulExit: false}`. Awaiting-first-run owner exits 0. No config/history overwrite.

Node >=22.19.0; Pi 1.1.0; OptChat v0.8.6 commit `aae1caf7715830051d327f819fc776792211167a`. Explicit `models.main`, `models.compactor`, `models.subagent`, each provider/model/thinking. Doctor fails until configured; do not infer the author's provider or proxy. Starter `exo-mac-starter/0`: conflict exit 3 with zero writes, receipt `.exo/starter-receipt.json`; verify Python >=3.9, uv, and a configured timezone. Do not assume `/usr/bin/python3` exists on a new Mac.

Exo and its plugin have the owner's full account access; instructions are not a sandbox. Disclose this before consent. No copied Pi home, credentials, MCP config, personal vault, history, review evidence or integrations. Release packaging uses an explicit allowlist and dependency provenance, never a recursive copy of a local runtime.

Readiness report interface: owner `--readiness` emits `schema: exosurface-readiness/0`, configuration readiness/codes, authentication `unverified` with `fresh-owner-login-required`, connectivity `unverified` with `no-provider-call`, runtime readiness and aggregate `ready:false`. Exit 2 means unready; exit 1 unsupported schema. The call is side-effect-free with no secret output. Interface integration proves neither login nor inference; both gates stay OPEN.

## Independent checks

The Python checker is standard-library-only. Its executable must itself be provisioned; this repository running it does not prove clean-Mac prerequisites.

```sh
# Fixture tests; no live state read or written. Use an absolute resolved Python.
env -i HOME=/tmp PATH=/usr/bin:/bin PYTHONDONTWRITEBYTECODE=1 \
  /absolute/path/to/python3 -m unittest discover \
  -s tools/release/acceptance -p 'test_*.py'

python3 tools/release/acceptance/acceptance.py --json package /fixture/release/plugin \
  --deny-terms /outside/repository/personal-deny-terms.txt
python3 tools/release/acceptance/acceptance.py --json starter /fixture/starter-artifact
python3 tools/release/acceptance/acceptance.py --json install --home /fixture/installed-home
python3 tools/release/acceptance/acceptance.py gates
```

`package` expects the plugin payload directory containing `release.json`, not the outer artifact wrapper. `starter` checks artifact provenance/hashes; a rendered receipt alone is insufficient. `install` is static wiring inspection, not a functional test. The checker deliberately refuses incompatible contract shapes rather than guessing. Automated gates mean checks are available, **not** that they passed on a built candidate. Privacy checks do not prove absence of every possible secret; oversized text fails for review, binary files and external dependencies need separate review.

The optional `isolation snapshot --home <explicit-home> --out <outside-artifact>` and `isolation compare before.json after.json` commands fingerprint selected files/listings. They are limited regression evidence, not a sandbox or a complete proof that no live state changed. Secret-named files are stat-only, never read or hashed. Do not run live snapshots merely to make a fixture test green.

`gates.json` is the gate inventory. Manual/decision gates remain OPEN without real evidence. Evidence records require tester/date/macOS/release/fresh-account/observation and are reported RECORDED for review, never PASS. Do not commit private screenshots, tokens, model conversations or evidence into the release.

## Evidence from this lane

- Preserved original local spec commits `4c34fc7`, `d7bd6f4`, `d34b7d2` and the interrupted acceptance files; no reset/clean.
- Shipping spec passes spec-chat `validate-style.py` and `preflight.py` from the installed current workflow. No fake Accept or status file.
- 40 independent fixture tests pass, including full-keepalive rejection, future-state rejection, path/privacy/pin failures, nested starter hash/provenance metadata, missing-config no writes, and manual gates staying OPEN.
- macOS system Python initially created bytecode caches in the temporary HOME; CLI test subprocesses now set `PYTHONDONTWRITEBYTECODE=1`. The temporary-home no-write regression passes. No live owner tests were run.
- Sibling source inspection found a real integration mismatch: first-run's draft manifest used `format`, string `owner`, top-level label and string pins, whereas bundle and checker require `contract`, owner object and npm/git pin objects. This was reported to the parent; compatibility is **OPEN** until the manifests converge and the actual artifact passes. The checker's starter parser was corrected to the starter's actual `source.commit/source.dirty` and per-file hash objects, with regression coverage.

## Gates still OPEN

- Spec Accept, native layout choice and delivery choice; first-run screen integration.
- Final cross-lane contract/artifact build and dependency resolution without development checkout or node_modules; privacy review and production lockfile advisory disposition (#27).
- Installer consent and decline with zero installed residue; all prerequisites on a clean account; configured models/timezone and recoverable missing-config behavior.
- One real BB entry with no fixture/clone models; own-provider authentication; first actual drawn-page answer and page-button response, including full textbox data (#31).
- Interrupted/repeated bootstrap; quit/reopen; macOS reboot/login; owner process crash recovery.
- Two real immutable releases: update, compatible rollback, incompatible rollback refusal, history preservation; removal/reinstall and real doctor failure diagnosis.
- Author migration and branch-switch isolation proof require separate approval. The current checkout has not been made production-independent by merging documentation.

No clean-account, own-auth, reboot, real-BB or end-to-end result is claimed by this lane.

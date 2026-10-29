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
- 48 independent fixture tests pass, including full-keepalive rejection, future-state rejection, path/privacy/pin failures, nested starter hash/provenance metadata, missing-config no writes, and manual gates staying OPEN.
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

## Follow-up integration findings

- Local primary source confirms installed Pi package name `@earendil-works/pi-coding-agent`, version `1.1.0`; installed OptChat upstream `v0.8.6` resolves to `aae1caf7715830051d327f819fc776792211167a`, remote `https://github.com/jonaslsaa/pi-optchat.git`. First-run has now changed its manifest to the explicit object contract; actual artifact verification remains separate.
- SDK 0.6.15 thread spawn has no caller-supplied durable id/idempotency key and metadata follows spawn. Completed repeats may be idempotent; a crash in the spawn/metadata window is ambiguous. Journal intent, fail closed, require manual reconciliation; do not auto-retry or fabricate adoption. Smooth recovery stays OPEN pending injected failures before/after spawn, metadata and receipt, and an owner-facing decision. The spec now records this explicitly rather than promising universal recovery.
- Stage/apply need Python >=3.9; metadata validation requires Python >=3.11 plus PyYAML/uv dependencies. Offline verify must FAIL if unavailable. A cache on the author's Mac is not a clean-Mac prerequisite solution.
- Starter carries GPL-3.0 source license and Nitride MIT/third-party notices. Licensing/distribution review stays OPEN; private sharing does not eliminate license obligations.

- The reconciled draft then used a dotted package id, which violates the bundle lowercase-slug regex. Reported upstream; the independent checker rejects it rather than adapting.

## Independent producer/consumer exercise — 2026-10-28

Actual production producer `4570c1893d1fca47d43a8d5fb1c251535e4be7eb` now supplies package id `exosurface`, an exact npm lock, and real BB `app.js/app.css/server.js/host.js` with SDK metadata. These earlier completeness/shape blockers are resolved for this artifact, not waived. The independent checker now requires those files, matching metadata/host digest, and exact direct dependency lock entries. Four new negative fixtures cover missing lock, owner-only dist, mismatched metadata and altered host.

The lane independently built its own artifact from the actual producer through the sibling bundle consumer. Manifest reports source.clean=true at producer4570c18. `--allow-dirty` was present as a diagnostic flag, but no dirty-source exception was used in the resulting manifest. Consumer was HEAD `a68af070b760a546e918a2f2c4a7b10e020673d7` with evolving working-tree changes: this is **working-tree integration evidence, not clean-committed consumer reproducibility**. Consumer source was subsequently copied into a fixture with a SHA256 inventory and the dirty-status snapshot; exact evidence is outside the repository, pointed to by `/tmp/exo-independent-acceptance-latest`. A clean committed consumer rerun remains required.

Observed under an empty-object subprocess environment, temporary HOME/TMPDIR and resolved absolute Node24.15.0:

- Actual producer→bundle artifact build, verify and independent package check exit0. Runtime lock names SDK0.6.15, React19.3.0, Zod4.6.6. Runtime bundling is still explicitly unverified by the bundle tool.
- Archive pack→safe unpack→relocated owner selftest exit0 from the artifact with no node_modules. This establishes loading/execution of that owner's built import graph, not Pi authentication, inference, BB app loading or a working page renderer.
- Relocated `--readiness` exits2, reports config-missing, authentication/connectivity unverified, runtime/aggregate false. Temporary home inventory unchanged, nonexistent state path remains absent.
- The earlier concern that prerelease0.1.0-dev was rejected was an inspection inference, **not a reproduced failure**; current consumer accepts exact prerelease SemVer and the actual build succeeds. It is not a persistent blocker.
- A real relocation defect was reproduced: invoking copied `exo-release.mjs` via macOS `/var` path alias returns exit0 with no stdout/action because the direct-run guard compares a canonical `/private/var` import URL to an unresolved argv path. Canonicalizing the fixture path allowed the remaining probes; the alias case was reported upstream and remains a required regression/fix, not a production workaround. `pack --out-dir` additionally required the caller to create that directory.

## Independent reliability and layout assessment

Reviewed reliability52db1f3 source and residual advisory matrix; independently ran its actual legacy RPC/socket/mock-BB regression and seven textbox/overflow/edits unit checks: all eight pass. This is legacy coverage only. The new production app at4570c18 renders title/body and ThreadChat and explicitly lacks snapshot rendering. Production page buttons/textboxes are therefore **BLOCKED: implementation absent**, not merely untested. Require the actual built production snapshot→textbox edit→press→owner→page update path with >300-character input, persisted drafts and stable refs; no waiver from legacy success.

Reviewed layout PR54/b604ad4 source evidence/README. Actual UI evidence is reported there, not independently rerun by this lane. Native child sidebar navigation works, but first visit does not open/select Pages; compact embedded ThreadChat omits the pending native input form; hidden workers leak in parent completion summaries. These are unresolved shipping design/integration gaps, not accepted tradeoffs. The spike's fixture provider is not OptChat/inference. Page-first layout approval stays OPEN.

Cross-lane source finding: layout's actual SDK observations reject empty spawn input `[]`, while production setup at4570c18 still passes `input:[]`. Reported for producer fix and real-BB bootstrap proof; mocks alone do not resolve the discrepancy. Parent-environment provisioning before child spawn is another SDK boundary to respect.

## Clean pinned tuple follow-up — 2026-10-28

Supersedes only the working-tree provenance/aliased-CLI uncertainty above. Independent disposable local clones were pinned clean to consumer `0ca0f671518274b6d6afbb5781fbae8afcd186a3`, producer `4570c1893d1fca47d43a8d5fb1c251535e4be7eb`, starter `890ed34efa13699f3f637964e0f5e57f0d86ad71`. All three remain clean after the exercise. Committed bounded evidence: `tools/release/acceptance/evidence/pinned-integration.json`; external logs via `/tmp/exo-clean-independent-latest`.

Fresh producer dist was generated from committed source, **not copied from sibling dist**: offline npm ci with supplied cache, actual BB CLI build, owner build and TypeScript check all exit0. Cached developer dependencies/toolchain and an existing validator venv were supplied prerequisites. `--ignore-scripts --legacy-peer-deps` was used explicitly; `npm ls --all --json` exits0 with no problems for this lock. This does not prove clean provisioning, all native/install-script dependencies, or compatibility of an unrelated A2UI/Zod graph.

Strict build without --allow-dirty emits38 files and source.clean=true. Build/verify→copied CLI via directory symlink plus macOS path alias→pack nonempty JSON and actual archive→safe unpack all pass. Then the original producer and artifact directories were renamed unavailable; relocated verify/selftest and independent static package scan pass, no artifact node_modules. The aliased-path no-op is independently **fixed for consumer0ca0f67**. Consumer suite12/12 passes with supplied real Python3.13. Initial11/12 with Apple /usr/bin/python3, offline cache misses, and the test-harness quoted-YAML assertion correction remain in logs, not hidden.

Independent archive SHA256 `64f5042e5debeef4c6b6440f031b8cd08509c76b674e00305d71b91b9e1ed93d`; bundle lane archive `eeabb7acef3a0e7b968d7810c28ec2542b5b75ac3299c567b1499d6129942125`. All38 path/content digests match exactly. Archive bytes differ; manifests have different builtAt and transport metadata is not normalized. No deterministic-tar claim.

Latest starter890ed34 stage reports clean; actual wrapper apply→verify→fixture install exits0. Separate starter verify confirms36 files, four valid notes and one nitride task row. Receipt bindings and parsed Exo/Owner.md both contain fixture owner + Etc/UTC. Validator venv symlink was retained. Missing model roles remain main/compactor/subagent. No launchctl command was executed; generated plist/installation files are only in disposable HOME. The starter lane reported29 tests passing on retry after its earlier timeout; this lane did not rerun that suite.

**No rendering, spawn, UX, auth/inference, clean-Mac or real lifecycle gate is cleared.** This pinned producer predates ongoing implementations. New producer bootstrap evidence is awaiting a clean committed revision and independent inspection.

## Dependency reuse security gate

GHSA-mrhx-c7xc-m3w5 concerns resource amplification by accumulated validation issues in collections. Zod<4.6.6 is affected; published patch4.6.6 is v4. Legacy Zod3 `.max` and late size/count checks do not fix it: workspace snapshot/applyDelta parses precede caps; RPC action/edit Zod3 parse precedes handler caps; delivery updates array is unbounded. Do not count those limits as a demonstrated mitigation. No exploit/reachability/guard proof was performed.

A2UI0.13/0.14 peers require Zod^3.25.76; no compatible published patched route was found. Do not force Zod4 beneath those peers. The pinned new production artifact uses Zod4.6.6 and no A2UI, so it is not the legacy affected graph. Any visual reuse through WorkspaceView/MessageProcessor/catalog schemas/custom wrappers reintroduces that graph and requires reviewed migration/backport or explicit owner disposition of residual affected dependencies with demonstrated guards. Budget guards alone are not an advisory fix or security acceptance.

Dependency-free extraction of snapshot-format helpers/types, EXO_CATALOG string, workspace plain-object/path helpers and stage.ts can avoid importing legacy schemas. **Parser extraction is not a visual product** and does not close missing renderer/action gates. Use committed lock evidence, not stale node_modules; preserve Apache2 A2UI/markdown, MIT Zod and ISC zod-to-json-schema notices where applicable. No UI redesign or residual-risk acceptance is authorized by this assessment.

## New producer bootstrap review — separate from pinned artifact

Reviewed clean committed producer `3b685b206d045d4fb0da64c1b1e5cb9d1b942411`, its source,12 tests and committed `test/evidence/isolated-bb-bootstrap.json`. `server.ts` replaces empty input with SDK `prompt: initializationText(key)` and `environment:{type:'project-default'}`. `setup-input.ts` consumes that control only when journal operation/profile/real vault, provider intent and exact persisted thread ID match; it waits up to five seconds for the spawn receipt. Replays/near-matches do not get the initialization bypass. Unknown create remains manual reconciliation.

The committed producer evidence reports actual isolated BB0.45/SDK0.6.15 parent creation, environment ready/native thread idle, initialization consumed, retry same ID/count1, with Pi/auth/owner absent. The lost-receipt scenario is explicitly fixture-injected after actual creation, **not a crash test**. Staging was stopped. This supports resolution of the prior empty-input/project-environment SDK shape discrepancy for that reported parent bootstrap; it is not independent actual-BB reexecution, child provisioning, renderer, inference or lifecycle proof. Those gates are not cleared.

Independently cloned3b685b2 clean and repeated offline cached npm ci, actual BB build (build only, no running BB service), owner build and typecheck: pass. Its12 isolated/mock tests pass with a short dedicated TMPDIR. Initial run in the long macOS /var/folders fixture failed binding a Unix socket (EINVAL, path length); preserved logs, then reran with `/private/tmp` fixture. This is a real portability boundary for socket path placement, not an inference failure. Source clone remained clean. No native live BB/provider/launchctl was invoked.

The zero-advisory producer evidence is scoped only to the current plugin lock. It does not audit external Pi/OptChat/Node/BB or a future visual graph. The earlier pinned38-file artifact tuple remains producer4570c18; do not silently attribute its package/digest proof to3b685b2. The bundle proof file was subsequently extended with its full reproduction object/cache paths; the initial pre-update read is not a missing-documentation conclusion.

## Bounded page-backend checkpoint — producer8cb1f3b

Independently pinned clean pushed producer `8cb1f3b815f383bcfb1428acd5b3cbdbf6974bd4` in a disposable local clone. No sibling edits, dependency installs, online fetches, running BB service, provider calls or launchctl. Existing development dependencies were copied only after verifying an identical committed lock and every installed package version; the existing cached BB toolchain was copied into fixture BB_DATA_DIR. Empty-object allowlisted HOME/TMPDIR/PATH, absolute Node24.15.0 and short fixture socket paths were used.

Actual BB build, owner build, typecheck and **18/18 tests pass**. The six new page checks cover dependency-free reused grammar/ref helpers, durable snapshots and input values, stale/ref/type/size/mutation guards, offered button contexts, pending/unknown press fail-closed handling, and compiled Zod4 edit/press envelopes. No A2UI dependency or lockfile change is introduced. The local extraction records its legacy source commit; this is not acceptance of the affected legacy visual dependency graph.

The integration test explicitly parses compiled Zod4 server inputs and invokes captured compiled handlers directly → real owner Unix socket → mock Pi API loading/executing compiled page tools. Draw revision1 → edit2 → press3 → owner tool heading update4 succeeds. The **232,027-byte UTF-8 textbox** (224,027 UTF-16 units), including leading/trailing whitespace, multiline Unicode and final sentinel, survives exactly in persisted page data, disk reread and response text. Acknowledged duplicate press leaves revision4 unchanged. Original suite imports source owner runtime; an additional external copy of its six page tests was redirected to built JS modules, including compiled owner runtime: **6/6 pass**, with the source clone still clean.

Evidence: `tools/release/acceptance/evidence/page-backend-8cb1f3b.json`; full external logs via `/tmp/exo-page-acceptance-latest`. This is compiled **mocked backend integration**, not actual BB page-RPC/browser interaction, visual textbox/button/reopen acceptance, actual Pi extension-loader compatibility or authenticated inference. Draft persistence here means stored offered input data, not an unsubmitted browser draft. Press receipts are bounded128; no permanent exactly-once claim.

The old “implementation absent” assessment is refined: persisted page backend/edit/press/tools now exist at this checkpoint; **visual renderer and rendered interaction remain BLOCKED/unimplemented**. Prior38-file artifact/installer proof remains pinned to4570c18 and is not extended to8cb1f3b. Auth, real Pi loader, native first-open/compact-input/worker-summary UX, fresh-Mac and lifecycle gates stay OPEN. Visual edits are paused for reuse-first scope review: preserve existing functionality, appearance and behavior as a BB extension; no redesign, broad consolidation or migration is commissioned by this verification.

## Independent narrow Zod3 compatibility candidate — localc22ba24e

Reviewed clean local producer `c22ba24eac4a529a049f7f69af83607afac8b74e` and committed compat README, source/ESM/CJS patch, tarball, manifest, license/provenance and audit evidence. Producer reports push blocked by publish guard; local review is **not** a published candidate or permission to bypass that guard. No candidate dependencies, production lock/UI, scope or security disposition were changed by this lane.

In a new allowlisted offline fixture with copied cache, independently ran fresh locked `npm ci --offline --ignore-scripts --strict-peer-deps --omit=peer`:44 packages, no peer-conflict output. `npm ls --all` exits0, committed lock unchanged. This is independent fixture install evidence, not fresh-Mac provisioning. Upstream3.25.76 tarball SHA512 was checked; rebuild produces byte-identical artifact and manifest:584883 bytes, SHA256 `df2fe07a78ee5288ac917a1b453aa6bf6cc2a437536c7208697e95dc14ce9fe5`. Applying the committed patch separately to upstream's three files reproduces the rebuilt source/ESM/CJS bytes. Other file identity, unchanged declarations/API/exports, MIT license and added local notice pass checks.

Compared the supplied cached upstream fix commit a0ebf970f2d752e5f58527cd2942ff48be4f46bd (not independently fetched online): it gates leading upper size checks before child parsing. The candidate ports that mechanism to existing Zod3 array max/upper exact-length and set max/size paths, including async dispatch, without inventing Map bounds. **19/19 candidate tests pass**, including root and /v3 ESM/CJS and compiled actual TS source; unchanged legacy workspace/snapshot-format/stage/incremental **36/36 pass on each upstream and patched graph**. Additional independent checks cover eight async exact/max/nested-path cases: zero child callbacks, one size issue at the expected path. Default and actual @zod/source typechecks pass, with src/v3/types.ts confirmed in compiler file listing.

Actual A2UI core/converter consumers resolve patched v3; the SDK resolves separate Zod4.6.6 and its real contract API executes. A2UI React's dependency resolution is inspected, **not its DOM/browser entry execution**. Full basic/Exo catalog JSON and child refs, each basic converter output/warning set, sampled accepted sync/async data and65-option ChoicePicker/workspace match upstream. This is sampled preservation of existing functionality, not exhaustive or rendered-product parity.

**Independent conclusion:** the specific upper-constrained-container pre-child abort backport mechanism and its committed artifact are reproducible with bounded regression evidence. Already-invalid oversize values intentionally have fewer child issues and skip outer refinements. This is not blanket advisory clearance, universal resource safety, demonstrated application exploitability/reachability, upstream fixed-version status, browser acceptance or security disposition. The local3.25.76-derived version remains scanner-flagged; unconstrained reporting and other expensive behaviors are not claimed fixed. Untouched old bundled v4 exports remain outside the consumed candidate graph.

Separate documentation correction: committed lock, fresh fixture and checkpoint resolution pin **DOMPurify3.4.11**, not3.4.16 as README/audit narrative says;3.4.16 is a reported affected-range endpoint. The six DOMPurify advisory findings remain independently unresolved, not proof of Zod patch failure or renderer exploit reachability. No fresh online audit was requested. The production plugin's earlier zero-audit result does not cover this graph. Reuse-first visual scope/review pause, all actual browser/loader/auth/clean-Mac/lifecycle gates and owner security disposition remain unchanged.

Committed summary: `tools/release/acceptance/evidence/zod3-c22ba24e.json`; full independent logs via `/tmp/exo-zod-independent-latest`.

## Independent correction/DOMPurify delta — local0e21a2c

Bounded-review local producer `0e21a2c28bacfca6369fdd4d74a2f5435516d64b` versus c22ba24e confirms the tested **entire Zod artifact/manifest/patch/builder/notice tree, candidate package/lock/tests/type fixtures/legacy pins and raw install/TAP/audit remain byte-identical**. README/checkpoint now correctly identify installed DOMPurify3.4.11. New triage is documentation/evidence, not an implemented fix. Producer publication guard remains intact; no bypass or publication claim.

Independently executed the portable README commands in a fresh clean clone, with fail-fast shell and explicit fixture BB_DATA_DIR added to the existing empty-object allowlist. Real Node24/configured npm and copied offline cache:44-package strict-peer locked install, identical rebuild/manifest,19 candidate tests,36 unchanged legacy tests per graph, both default/source typechecks and actual source-condition listing all pass again. No lifecycle scripts, shared-cache writes, services or provider calls.

The six advisory IDs match the unchanged audit. Compared each triage record against PR#55's committed `52db1f3` ranges, first-patched versions and update timestamps: exact matches. Independent npm-semver checks include3.4.11 and exclude3.4.17 for all six. PR#55's scoped markdown→DOMPurify3.4.17 override and locked tarball integrity also match the proposal. Its108-test/typecheck results remain reviewed prior evidence, **not rerun proposed-candidate evidence**; no fresh online metadata/audit was fetched.

Installed markdown/sanitizer implementation hashes match the triage. Actual sanitizer module imports successfully without invoking it; inspected route renders an HTML string then calls `sanitize(html)` with default options. Bounded scan of31 existing spike app/src/lib files finds none of the documented DOMPurify hooks/configuration or six advisory-specific mode selectors. This does **not** establish general unreachability or demonstrate an exploit. No browser/real-DOM sanitizer regression ran.

Independently reproduced the root `@a2ui/markdown-it` **MODULE_NOT_FOUND** despite React's nested markdown0.2.1 resolving. Existing app directly imports that module: actual reuse must explicitly declare/resolve the existing0.2.1 module at its consuming app boundary and verify the final built import graph, rather than assume transitive hoisting.

The proposed scoped override `{ "@a2ui/markdown-it": { ".": "0.2.1", "dompurify": "3.4.17" } }` is the smallest supplied metadata-supported route covering all six patch thresholds: preserve A2UI0.13, markdown0.2.1 and its core^0.13 peer; replace only its exact vulnerable DOMPurify dependency, not a peer. This does not require a broad renderer/core upgrade, but **is not yet a tested proposed candidate graph**. No dependency change/install of that proposal was made. Still require authorized proposed-graph strict-peer lock/diff/resolution checks,19+36/graph/typechecks, real-DOM default-markdown and separate bounded six-configuration regressions, authorized fresh audit and final renderer/license review. Zod disposition, DOMPurify disposition and all product/release gates remain open.

Evidence: `tools/release/acceptance/evidence/dompurify-0e21a2c.json`; external logs via `/tmp/exo-dompurify-delta-latest`.

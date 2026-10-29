# Exosurface first-run release candidate

Tracking: [#48](https://github.com/0xTomDaniel/exosurface/issues/48); release acceptance: [#51](https://github.com/0xTomDaniel/exosurface/issues/51).

## Current one-plugin consolidation checkpoint (2026-10-29)

The selected route is now **one BB plugin composing the existing primary + surface implementation**, not the earlier candidate shell described below. Candidate entrypoints remain separately preserved as `src/first-run-shell-*`; original spike packages are untouched. No automatic adoption/migration or live/provider action occurred.

**Packaging/build repair implemented; still not release-ready.** The initial checkpoint retained failed workspace `npm ls`, 19 strict-type diagnostics and relocated dynamic-module failure. Authorized follow-up independently locks the complete surface (no workspace), statically imports the exact same markdown-it14.3.3, and isolates owned archived types without changing runtime JS. Author-run clean committed ci/npm-ls for both graphs, both strict tsc modes, actual artifact build/verify and all five relocated entrypoint imports now pass; readiness remains unverified/exit2. See [`compat/consolidation/REPAIR.md`](../../plugins/bb-plugin-exosurface/compat/consolidation/REPAIR.md) for producer/tooling SHAs, retained failures, commands and evidence. These are not independent producer review or native/product acceptance. **Historical initial blocker details:** Initial static builds and 28/28 source/candidate tests did not close the then-failed gates or packaged-product acceptance. Reduced standalone control passes strict ci/ls; the separately locked private surface route remains an option only. A static parser option demonstrates export/API/output and relocation parity without changing production source. Exact commands, raw failures, locks, graph assertions, file-level options and existing release-tooling/resource-allowlist gaps are in [`compat/consolidation/README.md`](../../plugins/bb-plugin-exosurface/compat/consolidation/README.md). `releaseReady:false`; no native startup, installation or publication.

The following candidate setup/configuration and earlier evidence are retained as history, **not current consolidation installation instructions**.

**Not release-ready.** This is an implemented page-first BB → independent Pi/OptChat owner → reply/page bridge, with isolated mocked-provider bridge evidence and actual disposable-BB bootstrap evidence. **Core capability BLOCKED:** the production app currently renders only reply title/body beside `ThreadChat`; the browser snapshot renderer/textbox/button path is absent, not merely untested. A separate backend-only checkpoint now persists snapshot pages and transports revision-bound edits/presses; it is not browser product evidence. It is not clean-Mac, real-provider, staging-UI or snapshot-page evidence. Native-layout product acceptance is undecided. `release.json` deliberately says `releaseReady: false`.

## Inputs and setup

1. Apply the generic Exocortex starter to a new vault first. The plugin requires `AGENTS.md` and never seeds or overwrites the vault.
2. Use the bundle installer to place immutable plugin/owner files, pinned Pi and OptChat, and the user launchd job. Do not point this candidate at an existing personal Pi/OptChat profile.
3. Supply explicit main, compactor and subagent choices. Each has `provider`, `model`, `thinking`; no vendor defaults or inherited credentials are accepted. Pin Pi `@earendil-works/pi-coding-agent@1.1.0`, OptChat `v0.8.6` / `aae1caf7715830051d327f819fc776792211167a` from `https://github.com/jonaslsaa/pi-optchat.git`, Node `>=22.19.0`, BB `>=0.45.0` and SDK `0.6.15`.
4. Authenticate as the fresh owner using Pi with the configured private `PI_CODING_AGENT_DIR`. Authentication is not imported from the invoking shell. An `auth.json` file is only a startup prerequisite, **not proof of usable authentication**; fresh-owner inference must be demonstrated separately with permission.
5. Install/register the built plugin in the isolated target BB profile, open its Exo navPanel, and choose **Set up Exo in this project**. Setup creates/claims the fresh OptChat profile, explicitly configures all three models, and creates one native BB thread.
6. Send a prompt in the native composer. If its socket is absent, the host bridge requests `launchctl kickstart` of the installer's existing `app.exosurface.owner` job (never `-k`). This code path was **not executed against launchd** during development/tests. The service launches its own Pi subprocess, validates the OptChat profile lock against that Pi PID, and survives BB view detachment. The UI polls the latest assistant reply into a page beside native `ThreadChat`.

Configuration is read from `EXO_CONFIG` or `~/.config/exosurface/config.json`. `EXO_STATE_DIR` can override `stateDir`. Example shape (placeholder paths/model choices must be supplied by installer/user):

```json
{
  "vault": "/path/to/fresh-vault",
  "node": "/path/to/supported/node",
  "piCli": "/path/to/pinned/pi/dist/cli.js",
  "optchat": "/path/to/pinned/optchat",
  "stateDir": "/path/to/private-state",
  "agentDir": "/path/to/private-state/pi-agent",
  "profile": "exo",
  "models": {
    "main": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"},
    "compactor": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"},
    "subagent": {"provider": "CHOOSE", "model": "CHOOSE", "thinking": "medium"}
  }
}
```

Do not persist credentials in this configuration. Child environments are allowlisted: inherited `EXOSURFACE_*`, `EXO_BB_*`, `OPTCHAT_*`, `PI_*`, other `EXO_*` bindings and vendor keys cannot silently select another live owner. This is an accident guard, not a sandbox.

## Crash recovery — SDK/API limitation

**No exactly-once guarantee is claimed.** SDK 0.6.15 `threads.spawn` has no caller-supplied durable creation ID/idempotency key or atomic operation-marker metadata. Therefore a crash after external creation and before saving its ID cannot be distinguished safely from a crash before creation.

`first-run.json` binds a random operation key to the real vault and profile. `bb-thread-intent.json` is saved **before spawn**, with that key, project/provider, intent time and then, when known, exact created thread ID. An uncertain outcome blocks retries before another spawn; the plugin never adopts a thread by its title. A saved receipt is checked against exact thread ID/provider before reuse. A conflict, unknown schema, unclaimed pre-existing profile or interrupted setup lock fails closed without overwrite.

Manual reconciliation must inspect the operation key, intended project/provider, intent time, candidate **exact thread IDs**, candidate project/provider and creation times, and available BB records/history. Diagnostics contain these non-secret matching criteria and intent-file location, not authentication material. The SDK does not attach our operation key to candidate records, so there may be **no conclusive candidate**. In that case stop and require operator/vendor reconciliation; do not guess, adopt by title, clear intent, or rerun spawn. After proven matching evidence, an operator may explicitly record the exact ID in the existing intent receipt while preserving its key/project/provider. Preserve evidence before any repair. A stale `first-run.lock` or owner socket likewise needs positive confirmation that its former owner stopped; neither is timeout-stolen.

Coverage injects failures before external creation, after BB creation before receipt, and after receipt before the bootstrap's local binding. Retrying uncertain cases performs no second create; unrelated keys/projects/providers are rejected. Acceptance must preserve this fail-closed behavior unless BB adds an atomic idempotency primitive.

## Build and disposable checks

Build in this order; BB build emits the native bundles/metadata, while `build.mjs` additionally emits the dependency-free owner and OptChat helper JavaScript:

```sh
cd plugins/bb-plugin-exosurface
npm ci --ignore-scripts --legacy-peer-deps
bb plugin build .
node build.mjs
node --experimental-transform-types --test test/*.test.ts
```

Run with an absolute supported Node, an allowlisted environment, a throwaway HOME/TMPDIR and no live state selectors. On the development Mac, the offline CLI was the BB application's `host-daemon/dist/bb` script, executed with that absolute Node and a disposable HOME; its build toolchain download also stayed disposable. Registration/reload occurred only in the separately described disposable BB fixture; no live BB registration/reload, launchctl call, deployment or inference was performed. An initial check used an existing SDK dependency tree; the final check copied the source to a disposable directory, ran `npm ci --ignore-scripts --legacy-peer-deps` from the exact lockfile, then typechecked, built all BB/owner bundles and passed all 12 tests without the worktree dependency symlink.

`dist/*.js`, `dist/*.css`, `dist/*.json` are shipped; generated source maps are deliberately excluded because BB maps can embed machine-local paths. The bundle lane privacy scanner caught this before packaging. No `node_modules`, state, auth or transcripts ship. The release manifest includes exact package lock/pins and a builtins-only `dist/owner-service.js` entry.

Evidence obtained:

- Production TypeScript typecheck passes.
- 12 isolated tests pass: bootstrap/retry and conflicts, all uncertain-create boundaries, environment filtering, relocated selftest/readiness, real Unix socket/Pi RPC with a mock subprocess, full multiline Unicode text with an ending sentinel, oversize rejection without send, wrong-thread refusal, exact initialization control binding/replay rejection, concurrent rejection without clearing busy state, and built-host kill while the independent mock owner finishes. The same fixture also runs the **actual BB-built host bundle** through SDK-style JSON-RPC `handleLine` → socket owner → mock Pi → native thread deltas and response-page update.
- Clean locked-dependency offline BB build emits app, CSS, server, host and identity/SDK metadata.
- Sibling `tools/release/lib/artifact.mjs` successfully builds the real package with privacy/import-graph/hash checks (`allowDirty: true` recorded for development) and verifies, packs, unpacks and executes relocated owner selftest on Node 24.15.0 without `node_modules`.
- `--release-selftest` imports the owner graph without reading config, writing files, accessing credentials or calling a provider. `--readiness` emits `exosurface-readiness/0`, authentication/connectivity `unverified`, `ready:false`, exit 2 (or exit 1 for unsupported state). Neither test is an inference-ready signal.

## Remaining release gates

- Genuine clean-Mac install/start/setup/login/provider roundtrip and explicit fresh-owner credential proof, with permission; no fixtures substituted.
- Staging BB UI and real native composer/provider rendering, reconnect/interruption/busy/error behavior, and full SDK conformance coverage.
- **BLOCKED core capability, not an untested option:** rich snapshot-page rendering and browser textbox/button input. The browser still shows only the latest assistant reply; backend page tools do not establish visual product completion. No historical replay, tool output/status/approval projection, worker views or exactly-once input delivery is claimed.
- Installer/launchd lifecycle exercise. Lazy kickstart is implemented but not executed here; stale owner sockets/locks intentionally require manual recovery. A disconnected BB view does not own/kill Pi.
- Artifact install evidence, supported Node-minimum execution and cross-lane acceptance review. A Node 24 pass does not establish every supported Node/platform.
- Resolve native-layout/product acceptance and retain `releaseReady:false` until #51 closes all required gates.

## Actual disposable-BB first-run proof (2026-10-28)

Evidence: `plugins/bb-plugin-exosurface/test/evidence/isolated-bb-bootstrap.json`. Actual BB 0.45.0 / SDK 0.6.15 ran with absolute Node 24.15.0, allowlisted environment, dedicated temporary HOME/data/vault and ports 39896/39897 (not live 38886/38887). The synthetic vault contained its own fixture `AGENTS.md`; no live configuration, memory, credentials or transcript was copied. Only a read-only pinned OptChat source checkout was used to create a fresh private profile. These are same-account accident guards, not an OS sandbox or syscall audit.

The production plugin was built, installed and its actual `setup` RPC called in that isolated BB. It created one native `exosurface` thread in a normal synthetic project. BB's observed project-default environment reached **ready**, the native thread reached **idle**, and the persisted intent recorded `initializationConsumed:true`. Retry returned the same exact ID, with thread count still one. The Pi executable deliberately did not exist, private `auth.json` did not exist and no owner directory was created. No launchctl/provider inference was requested. **This control-turn proof is not normal authenticated-request proof.** The staging process group was stopped afterward.

Two real SDK/BB constraints are now handled: empty `input:[]` is invalid, and personal-workspace environment is rejected for a normal project. Setup now uses SDK `prompt` with a nonempty operation-bound initialization control and `environment:{type:'project-default'}`. The built native host consumes the control locally only after exact journal key/vault/profile, intent provider and persisted exact thread ID match; it waits up to five seconds for the spawn receipt and rejects stale/replayed/near-match controls. Ordinary prompts still take the authenticated owner path. A late/unknown receipt is not an auth bypass or permission to create again.

The ambiguous-outcome check **injected** a lost-local-receipt journal state after a real BB thread had been created; it did not crash a process at that boundary. Actual production setup then refused unknown outcome and thread count remained one. Only the exact saved synthetic receipts were restored for the fixture; no title-based discovery or automatic adoption occurred. Earlier actual BB rejection of the incompatible personal-workspace request also left an intent that blocked retry. Neither observation proves SDK exactly-once behavior. This setup creates only the parent: future worker/child setup must wait for its environment provisioning to be ready; no child provisioning is claimed.

## Separate bounded page-backend checkpoint (not browser acceptance)

The requirement remains actual **drawn snapshot → rendered textbox edit → button press → independent owner → updated persisted page**. Native composer protection and the backend tests below do not meet that whole requirement.

Reused local Exosurface grammar/conversion from `plugins/bb-plugin-exo-a2ui-spike/src/snapshot-format.ts` at `981941ade8f35ccc1a96628bbc2f317370e3692a`; extracted only its pure `workspace.ts` data/ref helpers and `stage.ts` title helper into `src/snapshot-data.ts` and `src/snapshot-stage.ts`. Provenance appears in the files. They create ordinary A2UI-shaped objects without importing A2UI runtime/catalog/schema packages, legacy deployment/profile state, or third-party renderer source. No dependency/lockfile change or new third-party source-license obligation is introduced by this extraction; future renderer reuse must retain applicable upstream notices.

`src/pages.ts` adds durable `current-pages.json`, exclusive fail-closed mutation lock, full offered-input checks, exact revision/ref/mutation IDs and bounded press receipts. Press intent is saved before dispatch; a pending/unknown outcome cannot be automatically retried. Receipt retention is bounded (128); this is not permanent exactly-once delivery. Detected malformed/newer persisted state and stale locks require explicit investigation rather than overwrite or automatic lock stealing. Page/snapshot/input budgets reject without truncation and are **not** a fix for the Zod advisory. These checks cover bounds/structure/refs and offered inputs; they do not claim independent A2UI catalog-schema conformance.

The fresh Pi process explicitly loads compiled `src/page-tools.ts` (`update_exosurface`, `read_exosurface`) with a private `EXO_PAGE_STATE`. Patched-Zod4 `pageRead`/`pageEdit`/`pagePress` server envelopes connect to the existing owner socket, which accepts page inputs only for the exact primary thread. UTF-8 socket decoding preserves split Unicode. This remains a current-page protocol, not a copy of legacy history, workers, rewind, observer or composition systems.

A disposable clean copy with locked dependencies passed TypeScript, actual BB server/app/host build, owner-module build, and **18/18 tests**. `test/pages.test.ts` covers extracted grammar, durable edits, long Unicode textbox/final sentinel, offered button context, stale/ref/type/size/unknown-field rejection, mutation replay/conflicts, unknown press outcomes, newer state/stale locks, and built Zod4 envelopes. Its transport fixture invokes the **compiled server handlers** → real owner socket → **mock Pi** loading/executing the compiled page tools → persisted updated heading and reloadable exact textbox. It is neither an actual BB page-RPC/browser exercise nor an actual Pi extension-loader/authenticated-provider turn. This checkpoint is separate from pinned bootstrap/artifact acceptance; no prior artifact result is extended to these new files.

## Renderer reuse boundary (still unresolved)

The existing visual implementation is in `plugins/bb-plugin-exo-a2ui-spike/app.tsx`, `src/workspace-view.ts`, `src/exo-catalog.ts`, `src/exo-components.tsx`, `lib/document-style.ts` and `lib/exo-theme.ts`. The spike lock/manifest pins A2UI 0.13.0 and Zod 3.25.76; investigation also found A2UI 0.14.0 still requires Zod `^3.25.76`. GHSA-mrhx-c7xc-m3w5 affects that validation path. Late input limits are not an approved fix; forcing Zod4 beneath incompatible peers is not safe integration. No such runtime graph has been imported here.

The authorized route is reuse-first: identify the narrow compatibility-preserving dependency correction and its exact graph/regression evidence, preserve the existing appearance/behavior/licensing, and adapt deployment paths and current-page transport only as necessary. Do not redesign the UI, infer acceptance of residual vulnerability, or import the spike's hard-coded clone/live configuration. Actual visual edit/press/reopen acceptance remains a release blocker.

A clean locked production-plugin `npm audit --omit=dev --json` on this date reports **zero advisories** (`test/evidence/production-npm-audit.json`), including its Zod 4.6.6. This result applies only to this plugin lockfile, not the external Pi/OptChat runtime, BB host, future renderer, whole repository or final installed artifact. Native-layout manual first-open Pages selection, missing compact pending input form and hidden-worker title/link leakage in parent completion summaries remain unapproved product gaps.

## Scope correction and bounded dependency comparison

PR #56 and owning issue #48 now record the reuse-first correction: ship the existing A2UI spike renderer/components/styles and existing primary-provider experience, with minimal portability/bootstrap/config/transport adapters. Preserve both spikes. Checkpoint `8cb1f3b815f383bcfb1428acd5b3cbdbf6974bd4` is reusable work, **not mandatory release architecture**. No renderer/provider/protocol replacement or roadmap expansion is required.

### Actual graph and admission boundaries

At that checkpoint, `bb-plugin-exo-spike` locks Zod **4.6.6**, but its `src/runtime.ts` explicitly loads the separately configured A2UI `src/workspace-extension.ts` and `src/workspace-frame.ts` for the primary surface. That separate plugin locks `@a2ui/react`/`@a2ui/web_core` **0.13.0**, Zod **3.25.76**, and `zod-to-json-schema` **3.25.2**. Source/locks establish this launch route, not which configuration is currently live-installed. No live inspection/change was performed for this comparison.

A2UI `app.tsx` → `WorkspaceView` → official `MessageProcessor`/basic + Exo catalogs is the visual route to retain. Owner tools use `workspace.ts` snapshot/delta/action validation; `delivery.ts`/`WorkspaceView.accept` deliver checkpoints, deltas and previews. In `validateSnapshot`, the outer snapshot schema parses first, then the 40 KiB serialized limit and `inspect` run. `inspect` rejects FunctionCall keys and nesting over 20 before the main message-schema parse. The existing 64-component check follows `A2uiMessageSchema.parse`; it must not be mistaken for a pre-child-parser constraint. `applyDelta` also parses incoming message schemas. Delivery updates are schema-unbounded but the producer retains at most 128 / 512 KiB. These are distinct entry paths, not a claim that all unbounded library schemas admit arbitrary application input.

Relevant imported schemas include message components/list wrappers; `ChildList`, `DynamicStringList`, `Checkable.checks`, `ChoicePicker.options`, `Tabs` entries and function-argument records. Recursive FunctionCall schemas exist in the dependency, but the existing main snapshot guards prohibit their admission. JSON publication does not itself admit native JavaScript Map/Set objects. Existing guards and >64 ChoicePicker-option compatibility remain unchanged.

### What the offline comparison establishes—and does not

`test/dependency-fix-review.mjs` and `test/evidence/dependency-fix-comparison.json` preserve the reproducible, non-shipping comparison and registry integrity/provenance. All downloaded package SHA-512 digests match registry metadata. The scratch-only Zod3 ESM candidate implements the upstream mechanism at array `.max`/upper `.length` and set `.max` rejection sites; it is **not** a complete maintained source/ESM/CJS package.

Upstream commit `a0ebf970f2d752e5f58527cd2942ff48be4f46bd` / merged PR #6652 rejects oversized **constrained** containers before parsing children. PR #6475's optional abort-early proposal was not merged and has relevant continuable/async limitations. The mechanism probe prevents oversized constrained child visits, outer refinements and async child dispatch. Sample valid sync/async outputs and the pinned converter's catalog-shaped/message-schema output remain identical; complete catalog/browser parity is untested.

**Calibration:** 2,055 issues for 2,048 invalid components in the direct library probe establishes error reporting at that input size—not an exploit, superlinear amplification, crash or admitted-app vulnerability. Synthetic nested/recursive probes likewise establish parser behavior only. Published Zod4.6.6 retains unconstrained reporting by design; that alone does not show it remains affected by the advisory. No timing, RSS, maximum-safe workload or real browser/provider evidence was collected here.

1. **Dependency advisory/version disposition:** GHSA-mrhx-c7xc-m3w5 lists `<4.6.6`, first fixed `4.6.6`; its summary says constrained collections, while its description mentions unconstrained arrays. Preserve that distinction and the actual upstream mechanism. Current consolidated plugin has patched Zod4; adding the legacy graph changes its dependency disposition. A local Zod3 backport remains a locally maintained, scanner-flagged version absent a documented reviewed patch disposition. No clean-audit or remediation claim is made for that future graph.
2. **Demonstrated admitted-app resource risk:** not established by these parser-only probes. Existing size/depth/vocabulary guards reduce admitted inputs; complete coverage of browser delivery, tool/delta, action/edit and persisted replay paths has not been proven. Do not infer safety or an exploit from issue counts.
3. **General hardening:** new collection cardinality limits, recursion policy or issue budgets would be separate compatibility/security work, not automatically part of the upstream fix. The real ChoicePicker schema accepts 65 options; imposing 64 would change valid behavior. No such limit was introduced.

### Concrete options and recommendation (no implementation started)

- **Recommended smallest candidate:** maintain an exact, reviewed Zod3 backport of the constrained-container fix, retaining A2UI 0.13, its schema API/converter, current valid fixtures and existing guards. Complete source + ESM/CJS packaging, integrity/license notices, isolated dependency resolution alongside the SDK's Zod4, advisory disposition review and diagnostic/async/converter/visual regressions are required before calling it corrected or shipping. Expected compatibility change is upstream's rejection diagnostics/refinement execution for oversized constrained collections—not new accepted-input restrictions. Unconstrained behavior is intentionally not represented as fixed.
- **Broader alternative:** port the existing A2UI validation layer to patched Zod4. This entails catalog schema/reference loaders/generators, issue formatting, data-context/binder/ref-field internals, reachable schema constructors, converter replacement/parity and honest dependency/peer declarations. Keep the renderer unchanged. It has a larger compatibility/maintenance surface and does not itself change unconstrained reporting.
- **Separate material hardening:** introduce new pre-child collection restrictions only after explicit scope review and compatibility examples. Existing bounds may be moved earlier without deliberately shrinking accepted inputs, but blanket caps on options/checks/records must not be silently inferred.

No decision to accept residual vulnerability is requested. The engineering recommendation is the narrow backport candidate with independent advisory review, not the broader port by default. If review requires materially restricting currently valid inputs or changing a zero-advisory packaging policy, report those precise changes before proceeding; broader migration/restriction is not silently authorized here. User requested a checkpoint before more implementation, so no dependency patch, schema restriction or UI integration has started. **First reused browser textbox→press→owner→updated page/reopen interaction remains unproven**; previous mock-Pi backend evidence is unchanged.


## Authorized narrow Zod3 shipping-candidate checkpoint (2026-10-29)

Subsequent authorization superseded the comparison-only stop above. `plugins/bb-plugin-exosurface/compat/` now holds an independently locked **candidate**, not a production renderer/dependency migration. Existing renderer/provider/schemas and both spikes are untouched. `compat/README.md` contains exact fresh-checkout review, integrity/rebuild/install/test/typecheck/audit commands; `compat/a2ui-runtime/evidence/` preserves actual fresh-install output, TAP, audit JSON and scope summary.

The local MIT artifact `zod-3.25.76-exosurface.1.tgz` is 584883 bytes, SHA256 `df2fe07a78ee5288ac917a1b453aa6bf6cc2a437536c7208697e95dc14ce9fe5`. A fresh-directory build from integrity-verified upstream bytes reproduced artifact **and manifest byte-for-byte**. Exactly three source/runtime implementations change, plus local package version and modification notice; all other upstream files, declarations/exports and license are byte-identical. Source/ESM/CJS root and `/v3` paths test the constrained-container mechanism. Upstream bundled legacy v4 exports are deliberately untouched/outside the approved consumed graph; SDK0.6.15 separately resolves patched Zod4.6.6.

A fresh allowlisted/disposable-HOME/TMPDIR/cache `npm ci --ignore-scripts --strict-peer-deps --omit=peer --no-fund --no-audit` installed 44 packages without peer conflicts. A2UI0.13, converter3.25.2 and existing React19.2.4 remain; markdown-it is pinned to its existing compatible0.2.1 because newly selected0.2.2 requires core0.14. This is not an incompatible peer override or broad upgrade. Candidate19/19 tests pass; the unmodified original snapshot/workspace/stage/incremental suites pass **36/36 each against upstream and patched graphs**. Full basic + Exo catalog JSON/child-ref maps, all basic-component converter outputs/diagnostics, sampled sync/async accepted outputs and an accepted **65-option workspace** match. Default declarations and actual `@zod/source` condition typechecks pass. These are bounded regression observations, not exhaustive accepted-input/browser parity or universal resource safety.

Fresh audit still flags the local Zod3-derived version under GHSA-mrhx-c7xc-m3w5; provenance is not upstream4.6.6/scanner clearance. It also independently flags transitive **DOMPurify3.4.11** through preserved markdown-it0.2.1 under six advisories: GHSA-55q2-fjhq-7xh7, GHSA-c2j3-45gr-mqc4, GHSA-6688-9rhm-gjv2, GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr and GHSA-c6gr-qvv4-5v3f. Exact ranges/dependency nodes are in the raw audit JSON. **DOMPurify is a separate finding, not evidence of Zod-patch failure or confirmed/reachable renderer exploit.** No DOMPurify correction or risk acceptance is included in this checkpoint; the earlier production-plugin zero-advisory result does not extend to this added graph.

Independent Zod backport/advisory review and separate DOMPurify disposition remain open. No live state/provider calls, renderer rewrite, new limits, publication or installation occurred. **`releaseReady:false`; the first reused browser textbox→press→owner→persisted page update/reopen remains unproven.**


### Independent review and DOMPurify version correction (2026-10-29)

Acceptance PR#52 commit `43717f9` independently reviewed exact Zod candidate `c22ba24e`: offline locked strict-peer install44 packages/npm ls; byte-identical artifact/manifest; mechanism/source/ESM/CJS/notice coverage; candidate19 + original36 per graph +8 async-bound checks; both typechecks; actual A2UI/converter patched-v3 and separate SDK4. Upstream comparison used supplied cached source/commit, not an independent online acquisition. This confirms the specific mechanism and bounded regression evidence, **not blanket security/advisory acceptance or browser/release proof**.

Correction: initial candidate prose mistook the DOMPurify advisory upper bound3.4.16 for its installed version. The unchanged lock, installed package and markdown0.2.1 manifest all specify **3.4.11**. The raw audit/artifact/lock evidence remains unchanged. `compat/DOMPURIFY-TRIAGE.md` and its machine-readable evidence give all six exact ranges, import/configuration boundaries, comparison to #55 and the smallest proposed scoped3.4.17 override. **No dependency/renderer change is implemented.** All six advisory ranges cover3.4.11; none covers proposed3.4.17. The inspected renderer passes an HTML string to default sanitizer options; the advisories' non-default exploit conditions are not established. That is not a proof of general unreachability/safety.

Portable offline review commands now require verified configured Node/npm paths and copied cache instead of machine-specific paths. The private-draft push was blocked by the local guard, also on preserved local-author provenance; no bypass or notice stripping occurred. Candidate remains local. `releaseReady:false`; existing-UI isolated browser textbox→press→owner→persisted page update/reopen is the next product milestone. Browser, real inference/authentication, clean-Mac install, lifecycle/reboot/minimum-Node and release gates remain open.


### Authorized scoped DOMPurify correction (2026-10-29)

The separately locked compatibility graph now explicitly declares app-level `@a2ui/markdown-it:0.2.1` and overrides only that package's DOMPurify to3.4.17, retaining the0.2.1 package pin and satisfied core^0.13 peer. Logical lock changes are only direct markdown declaration/hoisting and DOMPurify tarball/version/integrity. No production-plugin lock, renderer/provider, schema, input restriction or notice changed. Fresh strict-peer install44/npm ls pass; actual root markdown and its DOMPurify resolution are verified. Zod candidate19, unchanged legacy36 per graph and both typechecks (including direct markdown import) pass; reviewed Zod bytes remain identical. Real headless Chromium131 fixture9/9 covers actual markdown/sanitizer defaults and bounded separate non-default advisory mechanisms. Rawtext-root test observes fail-closed TypeError, not permission to reuse dirty input after failure.

Fresh audit:0 critical,4 propagated Zod high,total4; no DOMPurify entry. The six saved advisory ranges exclude3.4.17. Neither this point-in-time scan nor finite tests establish blanket safety, application exploit reachability or acceptance of the remaining Zod advisory. Evidence/portable instructions: `compat/DOMPURIFY-FIX.md` and `compat/a2ui-runtime/evidence/dompurify-fix/`. No live/provider/global/publication action occurred. `releaseReady:false`; actual reused renderer/provider browser round-trip and real inference remain distinct open milestones.

### Existing-UI isolated browser round-trip (2026-10-29; separate checkpoint)

`compat/browser-roundtrip/` now proves **existing UI → production RPC → separate owner process → MOCK Pi → durable page update → entirely fresh-browser reopen**, not native BB, the actual Pi extension loader, fresh-owner authentication or inference. Existing WorkspaceView/drafts, official v0.9 React renderer, basic/Exo catalogs/components, styles/theme and markdown are reused byte-for-byte; a small pure adapter maps their existing edit/action contracts to current page RPCs. No production app/lock, spike, reviewed Zod artifact/notice or input restriction changed. Actual browser input/pointer events preserve complete multiline Unicode/whitespace text through the production Zod4 RPC schemas, real owner socket/PiRpc transport and compiled page tools. Exactly one mock prompt updates revision4; reopening does not mutate persisted bytes.

Final-source runs14/15 pass with browser and independent owner exit0, no remaining owned process groups, no forced cleanup or launchctl attempts, removed temporary fixtures and closed HTTP server. Adapter5/5, full production23/23, production + strict unit + fixture-client typechecks and offline tool install/npm ls pass. Runnable instructions, source/bundle/payload hashes, screenshots and **retained failed development attempts** are in `compat/browser-roundtrip/README.md` / `evidence/`. The standalone fixture supplies synthetic host palette/transport; it is not native-BB or layout acceptance.

Independent DOM-fix review reported via acceptance PR#52 **1828c34** confirms offline graph/runtime/Zod checks, but its first unmodified Chromium run **failed the shutdown deadline** before one unmodified9/9 retry. Both outcomes remain evidence; the old sanitizer runner/deadline is unchanged, and this new interactive runner does not close that separate lifecycle defect. No fresh independent network audit was performed. The four propagated local-Zod high scanner entries/advisory disposition remain; no blanket security clearance. `releaseReady:false`. Native extension transport/slot wiring with the same renderer and actual Pi loading/inference remain separate next gates; no live/provider/publication/merge/deploy action occurred.

Separate unit-test lifecycle observation: the existing fixture teardown recreates four stopped-state-only directories after its early removal hook. Captured in `compat/browser-roundtrip/evidence/checks/unit-teardown-residue.json`, then explicitly removed; no process leak demonstrated and no existing cleanup test weakened. TAP23/23 is not automatic directory-cleanup acceptance. The new browser fixture independently verifies owner/browser process-group exit **before** removing its stage.

### Separate unit-fixture teardown correction (2026-10-29)

Confirmed pinned57fc59f test-only hook ordering recreated one stopped-state-only root in each of `test/first-run.test.ts:93` and `test/pages.test.ts:55`: two per full-suite run, author four across two invocations; independent reviewer two in one invocation. `fixture-cleanup.ts` now awaits reverse resource shutdown and the final owner.close write before deletion, verifies normal mock-Pi exit0/PID disappearance and checks no root recreation. Existing compiled-host SIGTERM bridge-loss behavior is retained and reaped, not silently recast as normal exit. Production lifecycle code/spec and old sanitizer helper are unchanged. New regressions + full suite25/25, post-suite18 root receipts/five owned child PIDs gone and dedicated TMPDIR empty; strict new-helper/regression typecheck passes. Retained evidence includes a failed post-check caused by accidentally mixing tsc's node-compile-cache with suite TMPDIR; fresh dedicated suite TMPDIR passes the unchanged empty-directory assertion. See `compat/browser-roundtrip/TEST-TEARDOWN.md`.

User-relayed independent review46b91ae confirms pinned57fc59f UI/reopen, process exits, adapter5/production23/typechecks/acceptance48, but its browser sample is **901 UTF-16 units/925 bytes**. It does **not** satisfy >1000-character browser acceptance; larger unit/backend proofs are different scope. Next native-BB fixture must explicitly preserve >1000-character Unicode/multiline end to end. `releaseReady:false`; no actual Pi loader/auth/inference or product lifecycle clearance is inferred.

### Consolidated native local-source correction — bounded producer work

BB0.45 local registration rebuilds declared entries and requires writable dist. The producer now explicitly includes its traced 31 legacy source inputs and exact independent surface package/lock/patched-Zod tar, preserving root entrypoints, styles, provider IDs/order and all resource hashes. No blanket legacy glob or dist-entry bypass. `bbSource: {dependencyDirectories: ['.', 'legacy/surface']}` opts into separately owned tooling work for a receipt-owned writable BB source copy; verified releases remain immutable. Until that tooling checkpoint passes, its working-copy lifecycle/activation is not established. Ordinary strict offline npm ci (scripts enabled) and npm ls in both directories are prerequisites, not permission to fetch. See `compat/consolidation/REPAIR.md` and the source-closure test; source/graph checks are not native UI/provider/history acceptance. SDK0.6.15 upstream lacks license metadata/file, so rights acceptance remains qualified; preserved provenance is not license clearance. `releaseReady:false` remains unchanged.

Native follow-up: real offline receipt-owned BB source preparation and local BB
rebuild passed, but producer5007e44 exposed duplicate `message.dispatch`
registration (`ok:true`, **status:error**, no app/provider). The bounded root
composition now registers one ordered primary→surface dispatch handler, preserving
original context, rejection/throw behavior and surface-local error handling. The
focused actual-handler fixture passes16 checks; native rerun and UI/provider
acceptance are separate gates. Additional all-upstream-declarations checking is
not clear (missing optional lit-html/hono/better-sqlite3 declarations); existing
production strict configuration passes without new suppressions or fake modules.

### Native hook checkpoint (2026-10-29)

Producer `387acf93138976559881b89b1d0a886f3cebb00b` and pinned tooling
`36816b2d711e5a2f7463c3428f9a51b2f46a0db0` now load through a **fresh**
receipt-owned writable BB source; no immutable same-version release overwrite.
Sealed411-file manifest SHA256
`44cb01561bddda5b9ac1bc64e5f7330c31249b8123152c7fc67c08213781e91f`;
only root server source/compiled server differ from prior sealed payload.
Actual BB status is `running`, detail null, app present, provider `exo-spike`,
both original streams running. Served app/CSS load in actual BB frontend and
reload, with preserved navigation/styled Canvas. This supersedes the prior
native rerun-pending note, not the retained duplicate-hook failure.

A command-only **synthetic fixture owner**, not Pi/OptChat, exercises actual native
UI/RPC edit/persistence:1170 UTF-16 units/1080-code-point multiline Unicode survives
exactly through one owner command, projection and reloaded textarea. Shelf focus
switches/reverts. Native2001-unit edit rejects before any owner command/mutation;
this preserves the existing2000-unit compatibility limit, **not all long-input
requirements**. History/pending native RPCs work, but native conversation storage
has no synthetic thread: UI explicitly says “This thread is no longer available.”
No valid action/send button, message card/composer/pill/send-time bring-back,
real owner, provider dispatch or authentication was accepted/tested. Creating a
native conversation currently requires input/dispatch or an existing fork source;
no workaround/DB seed/new backend was added. Those remain separate acceptance
requirements. Source/reducer checks remain distinct from native/mock checks.

Server restart returns running/app/provider/streams and persisted synthetic
revision2. Both runs exit0; final health refuses, no listener/fixture runtime
processes or owner socket remain. Full pins, commands, screenshots, hashes,
retained failed attempts, optional upstream declaration failures, privacy/input/
SDK rights qualifications and teardown are in
`plugins/bb-plugin-exosurface/compat/consolidation/native-hook-evidence/README.md`.
`releaseReady:false`; SDK0.6.15 rights, fresh advisory audit, real-owner/fresh-Mac
and remaining native conversation behavior are still unresolved/unproven.

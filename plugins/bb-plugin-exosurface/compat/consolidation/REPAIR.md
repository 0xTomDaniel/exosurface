# Authorized bounded packaging/build repair

Supersedes the blocked statuses in README.md only when the corresponding clean committed-fixture checks below pass. Historical failures/evidence remain unchanged. No native/product acceptance, provider calls, service installation, publication or readiness clearance.

## Implementation

- One BB registration and existing modules unchanged in ownership; **no npm workspaces/link**. Root package/lock owns primary/SDK Zod4. Complete private `legacy/surface/package.json` + its own `package-lock.json` own A2UI, converter, patched Zod3 and scoped DOMPurify override. Standard strict locked installs are build-only; all runtime JS bundles, no shipped node_modules/runtime npm install.
- Static direct MarkdownIt14.3.3, types14.1.2; same old resolved integrity. Exactly two map-presence type predicates; parser options/output/bounds unchanged. Frozen baseline source is preserved in `repro/markdown/document-before.ts` solely for parity.
- Exactly three archived-type preservation source edits: client owns the structurally identical wire request; contract derives its existing owned schema type; provider types only its consumed local request/criteria. Engine, archived command source and rejecting policy remain byte-identical. No new experiment dependency, fake module, exclude, suppression or strict-check change.
- Build producer materializes `resources/skills/exosurface/**`, `resources/provenance/zod3/**`, `resources/provenance/surface/{package.json,package-lock.json}`, and `resources/licenses/**`. Surface manifest/lock are byte copies. `release.json` uses coordinated additive `/0` `dependencyProjects` and exact `{path,sha256}` inventory generated **after all resources**. Only `resources/**` is added to the allowlist, never legacy/**, evidence or node_modules; release.json is not self-hashed. `releaseReady:false` remains enforced.

## Prerequisites and isolation

Node24.15.0 / npm11.12.1, installed BB0.45.0 builder, and existing disposable offline npm cache. No new fetch authorization: all install/lock commands use `--offline`; missing cache entries are unavailable prerequisites, not permission to fetch. Source fixture `/tmp/exo-packaging-repair.GLh4R1` initially verified both complete ci/ls and strict typecheck/build; final clean committed-source validation/evidence will be checkpointed separately.

Producer integration is against a read-only git archive of tooling **55a85b2f146a05b682fb165313c0d5bd608bf44e**, not a changing sibling working tree. Parent independently reports corrected tooling **20/20 pass**, exit0, evidence `/private/tmp/exo-release-independent.kPWWJ7/tests.tap`. Original9377729's 17/18 discrepancy remains historical: Apple CLT Python3.9 startup created pyc in disposable HOME/Library before conflict. Wrapper-owned Python children now use -B, with cache-forcing/all-three-child regressions, without weakening conflict/no-write assertions. This closes that tooling discrepancy, not consolidated artifact or fresh-Mac acceptance.

## Runnable clean validation

From repository root; use separate diagnostic commands and preserve every exit/output. Do not invoke owner without --release-selftest/--readiness, and do not register/invoke extension defaults.

```sh
NODE=$NODE_PREFIX/bin/node
NPM=$NODE_PREFIX/lib/node_modules/npm/bin/npm-cli.js
BB=/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb
R=$(mktemp -d /tmp/exo-repair-review.XXXXXX)
mkdir "$R/home" "$R/tmp" "$R/source" "$R/tooling"
# Artifact provenance requires an actual clean git checkout, not a bare archive.
# Use a new nonexistent source path (omit source from mkdir above).
rmdir "$R/source"
git clone --shared --no-checkout "$(git rev-parse --show-toplevel)" "$R/source"
git -C "$R/source" checkout --detach <producer-SHA>
# A cache must already contain all pinned packages; copying a disposable cache is allowed.
cp -R /tmp/exo-packaging-repair.GLh4R1/cache "$R/cache"
P="$R/source/plugins/bb-plugin-exosurface"
run() { env -i HOME="$R/home" TMPDIR="$R/tmp" PATH="$(dirname "$NODE"):/usr/bin:/bin" NODE_DISABLE_COMPILE_CACHE=1 "$@"; }
cd "$P"
run "$NODE" "$NPM" ci --install-strategy=nested --ignore-scripts --strict-peer-deps --offline --cache "$R/cache" --no-audit --no-fund
run "$NODE" "$NPM" ls --all --json
cd legacy/surface
run "$NODE" "$NPM" ci --install-strategy=nested --ignore-scripts --strict-peer-deps --offline --cache "$R/cache" --no-audit --no-fund
run "$NODE" "$NPM" ls --all --json
cd ../..
run "$NODE" "$BB" plugin build .
run "$NODE" build.mjs
run "$NODE" build-runtime.mjs
run "$NODE" node_modules/typescript/bin/tsc --noEmit
run "$NODE" --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit
run "$NODE" --experimental-transform-types --test test/*.test.ts
run "$NODE" test/consolidation-graph.mjs "$P"
run "$NODE" --experimental-transform-types test/consolidation-parity.mjs "$P" "$R/parser-baseline"
TOOLING=$RELEASE_BUNDLE_REPO
git -C "$TOOLING" archive 55a85b2f146a05b682fb165313c0d5bd608bf44e tools/release | tar -xf - -C "$R/tooling"
run "$NODE" "$R/tooling/tools/release/exo-release.mjs" build --package-dir "$P" --out-dir "$R/artifacts"
# Substitute the exact emitted artifact directory, do not guess its name.
# run "$NODE" "$R/tooling/tools/release/exo-release.mjs" verify --artifact "$ARTIFACT"
# run "$NODE" test/consolidation-graph.mjs "$P" "$ARTIFACT/plugin"
# run "$NODE" test/consolidation-relocated.mjs "$ARTIFACT/plugin"
```

Build/verify provenance, full dependency-tree gates, actual importer/patch/bundle assertions, relocated **every extension entrypoint** and parser/source regression are distinct checks. None substitutes for actual native BB owner/reopen/history/bring-back >1000-character acceptance. No native proof before clean SHA/evidence review.

Generated `resources/` is ignored like existing dist/node_modules, not committed wholesale: the tracked release.json exact inventory pins every generated byte and secondary source identity. Both initial artifact refusals (archive not a checkout; generated resources initially untracked) are retained, not overridden with allow-dirty. Ordinary clean source provenance remains mandatory.

## Clean committed evidence checkpoint — author-reported, not independent producer review

**Producer:** `dcff5cb346138247f019c5602e09d11790f322c1` (clean source recorded by artifact tooling). **Tooling:** `55a85b2f146a05b682fb165313c0d5bd608bf44e`, read-only archive. Artifact: `/tmp/exo-packaging-repair.GLh4R1/committed-artifacts-repeat/exosurface-0.1.0-dev`. `MANIFEST.json` SHA256 **`ea25fb27a999f91ab1f5006e748260e8e51e6669833ac1720943be09492b0036`**. Exact every-file digests, manifest/checksum, full logs/exits and all five exact child argv/cwd are committed in `repair-evidence/` (RESULTS.json / artifact-file-sha256.json / relocated-exact-invocations.json).

| Check | Observed result |
| --- | --- |
| Complete root and surface fresh locked nested strict offline ci | Both **0**; committed-root-ci / committed-surface-ci. No workspace/link entries. |
| Ordinary full root and surface npm ls | Both **0**, independently invoked again by artifact-graph. Actual primary and both SDK consumers resolve4.6.6; every traversed A2UI/converter Zod consumer resolves patched3.25.76. Actual markdown importer resolves DOMPurify3.4.17 with the surface scoped override. |
| BB, candidate and existing-owner/extension bundlers | All **0**; committed-*-build logs. Tracked release.json byte-identical after regeneration; 312 resources exactly inventoried, source/packaged secondary manifests/locks byte-identical under tooling verification. |
| Strict tsc default + explicit8192MiB | Both **0** at committed producer; old OOM and completed19-error failures remain in historical evidence. No strict config change. |
| Candidate/source regressions | **28/28**, no failed/cancelled/skipped; committed-unit.tap, exit0. Awaited fixture/PID cleanup receipts; dedicated unit-tmp empty (unit-tmp-residue.txt is empty). |
| Three-file preservation runtime parity | **0**: esbuild-erased JS exactly equals frozen dca50200 for client/contract/provider; engine and archived source byte-identical. Runnable repair-evidence/type-parity.mjs (producer path argument). |
| Production parser versus frozen pre-repair source | **0**: 60 API comparisons,15 full document/roundtrips,3 matching rejections, identical old npm integrity `sha512-L//tDAkjTjJCU6pBUSBTgs3Kg4InVaZuUZog/b6V12UKhcDQ7S78877ibbCanRExwPuYP1CZD7Gd2dxSy1GXRg==`; exact MIT license bytes retained. This is **source/parser parity, not packaged UI behavior**. |
| Actual clean artifact build + verify with corrected tooling | Both **0**, clean:true, releaseReady:false. No allow-dirty/guard bypass. Initial two refusals retained in artifact-build and committed-artifact-build logs. |
| Actual compiled artifact/importer graph assertions | **0**. Actual server bytes match the mapped build: Zod4.6.6 version code + surface Zod3 mapped input; patched tar/source hashes checked. Actual app contains DOMPurify3.4.17, not3.4.11, and array/set early returns. Runtime graphs exclude experimental engine/core and expose only builtin static imports. Dynamic resolution is separately checked below, not assumed from metafiles. |
| All actual relocated runtime entrypoints | **0 each**: owner-service with --release-selftest; live, fixture, workspace-extension, workspace-frame import with default exports but **no registration/invocation**. Artifact has no node_modules/symlinks; NODE_PATH empty. Exact child commands and stdout are recorded. |
| Owner selftest / readiness | Selftest **0**, readiness **2/unverified/ready:false**. Not real auth/inference, Pi loader or runtime readiness acceptance. |

Exact artifact integration commands, from the clean producer package with the scrubbed `run` function above:

```sh
T=/tmp/exo-packaging-repair.GLh4R1
P="$T/committed/plugins/bb-plugin-exosurface"
CLI="$T/tooling-55a85b2/tools/release/exo-release.mjs"
ART="$T/committed-artifacts-repeat/exosurface-0.1.0-dev"
# env -i HOME="$T/home" TMPDIR="$T/tmp" PATH="$(dirname "$NODE"):/usr/bin:/bin" NODE_DISABLE_COMPILE_CACHE=1
# precedes each node invocation (see raw run-committed.sh):
run "$NODE" "$CLI" build --package-dir "$P" --out-dir "$T/committed-artifacts-repeat"
run "$NODE" "$CLI" verify --artifact "$ART"
run "$NODE" "$P/test/consolidation-graph.mjs" "$P" "$ART/plugin"
run "$NODE" "$P/test/consolidation-relocated.mjs" "$ART/plugin"
run "$NODE" "$ART/plugin/dist/owner-service.js" --release-selftest
run "$NODE" "$ART/plugin/dist/owner-service.js" --readiness # 2, not ready
```

Do not overwrite the retained output directory when reproducing; use a fresh output. Earlier archive-built source473ef37 and clean cloned source473ef37 differ from producerdcff5cb only in the checked-in generated-resource ignore and review documentation; compiled/build sources and dependency locks are identical. Final strict/parser/regression/artifact graph checks were rerun at producerdcff5cb. No claim of independent producer review, actual BB packaged UI, fresh-Mac layout, owner/history/bring-back or real-provider acceptance. Native disposable mock/tripwire regression is the next separately authorized gate; not performed in this checkpoint.

## Follow-up native prerequisite gate — blocked, no Exosurface registration

See `native-prerequisite-evidence/README.md` and raw logs. Installed BB0.45 server health succeeds in private guarded fixture. Complete existing offline toolchain cache removes initial prerequisite; supported local-path install of the copied actual artifact then fails on readonly dist permissions and, on a writable byte-identical copy, **missing `./legacy/primary/app` and `./legacy/surface/app`**. Host rebuilds the declared app.tsx for local sources. Original artifact digest unchanged; zero exosurface rows in private BB DB. Clean SIGTERM/exit0/process-group-gone teardown. Actual pages/provider/history/bring-back/long-input/oversize/reopen behavior remains **NOT RUN**. Read-only trace of prebuilt host/release routes is next; no new source repair or registration workaround authorized here.

## Authorized native local-source correction (supersedes the earlier source-omission plan)

The retained native failures and read-only route diagnosis are in `native-prerequisite-evidence/`. Supported BB0.45 local sources rebuild app/server/host; an immutable dist-only artifact cannot satisfy that route. The authorized producer correction explicitly allowlists the **31 traced legacy source files**, plus the existing surface package/lock/local patched-Zod tar. Root entries, identity/order, defaults, CSS/renderer, runtime code, both locks and all 312 resource hashes remain unchanged. No legacy glob, archived engine, new wrapper/backend or metadata dist bypass. `bbSource.dependencyDirectories` opts into exactly `['.','legacy/surface']` for the coordinated existing tooling's separate writable working copy. That tooling's owner remains responsible for receipt/activation/lifecycle; this producer does not implement an installer.

`test/consolidation-source-closure.mjs <installed-source-root> <artifact/plugin>` statically erases types and traverses real source imports without executing the plugin. It verifies 35-file/31-legacy closure, exact allowlist with missing/broad-glob rejection controls, preserved bytes/entries, both manifest-lock declaration sets, patched tar hash/integrity/source-resource agreement, existing license/notice provenance and every resource hash. Source checks do not prove host builds or behavior. Whole actual dependency graphs remain independently checked by strict ordinary ci/ls and `consolidation-graph.mjs`; no fresh network advisory audit is authorized.

**Notice qualification:** upstream SDK0.6.15's installed exact package has no license field or LICENSE/NOTICE. Existing resource provenance retains its identity, not fabricated terms. This was already bundled; adding its imports/source build inputs does not resolve distribution-rights acceptance. Other retained A2UI/DOMPurify and patched-Zod license/notice bytes are checked. No notice stripped and no blanket license/security clearance claimed. Meaningful state/home/profile defaults remain unchanged and must be confined to the disposable HOME/config during tests.

Current native-route dependency commands must retain ordinary lifecycle/security behavior: explicit npm executable, scrubbed HOME/TMPDIR/PATH, `npm ci --offline --strict-peer-deps` (existing nested install strategy permitted) and ordinary `npm ls --all --json` **for both independent directories**, with existing disposable cache only. Do not reuse the earlier build-only `--ignore-scripts` example as a native working-copy correction. No node_modules ships; installed working-copy dependencies and writable BB dist are distinct from immutable payload provenance. Missing cache/toolchain is a blocker, not fetch permission. Full native correction results and teardown are checkpointed separately after execution; readiness remains false.

## Native dispatch-registration correction (2026-10-29)

Pinned tooling `36816b2d711e5a2f7463c3428f9a51b2f46a0db0` prepared the real
receipt-owned writable source with ordinary scripts-enabled strict offline npm
ci/ls in both independent graphs. BB0.45 rebuilt the corrected source closure,
but registration returned `ok:true` with **status:error**, no app or provider:
`a "message.dispatch" hook handler is already registered by this plugin`.
This is a retained native consolidation failure, not successful plugin loading.

Both unchanged legacy server modules answer the same dispatch hook. Root
composition now collects those answers and registers once: primary first, surface
second, awaiting each with the exact original context. Rejection stops later work;
throws/rejections propagate without an added catch. This matches BB's admission
pass (`start-server.js` lines80906–80960); BB's one-registration restriction is
at57535–57538. Primary attachment checks/binding precede surface pending restore.
Neither current handler returns `wait`; the composition also continues later
checks after a wait and retains its first decision. No new multi-wait UI policy is
claimed. Existing surface-local handling of owner errors remains unchanged.

`test/consolidation-dispatch.mjs` exercises the actual retained handlers with a
registration-only test API and synthetic private state/Unix socket: one hook and
one provider registration, ordinary/non-provider paths, attachment rejection and
success/rebinding, start-turn filtering, pending restore, reject short-circuit,
surface-local owner error handling, unchanged context, await order, and thrown
errors. This is not a native host/provider/Pi/authentication test. The initial
attempt to use the optional SDK testing helper failed because the locked graph
does not contain its `better-sqlite3` import; no dependency shim was added.
Production strict tsc with its existing configuration passes. An additional
all-third-party-declarations check (`--skipLibCheck false`) remains blocked by
upstream missing `lit-html`, `hono`, and `better-sqlite3` declarations; no fake
modules, exclusions, suppressions, or lock changes were used to clear it.

The 31 legacy source inputs, source entries, models/defaults/order, two locks,
patched tar, runtime owner/extension bundles, resources and notices are unchanged.
Root server bytes necessarily change for this composition-only correction.
Native rerun/UI behavior remains a separate gate; `releaseReady:false` remains.

Native follow-through at producer387acf9 is retained in
[`native-hook-evidence/README.md`](native-hook-evidence/README.md): real strict
offline two-graph install to a fresh receipt-owned prefix; actual native running
status/app/provider/streams, styled BB Canvas, synthetic command-only owner UI
edit/equality/persistence/reload, existing-bound atomic rejection and clean
restart/teardown. Only root server source/compiled server differ across the
sealed411-file payloads. Native conversation/composer/card/send-time bring-back,
valid action dispatch and real owner remain **unproved**; the synthetic-thread
warning is retained. The2000-unit limit is existing compatibility behavior, not
all-long-input acceptance. `releaseReady:false` and rights/advisory qualifications
remain unchanged.

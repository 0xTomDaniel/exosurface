# One-plugin consolidation: blocked diagnostic checkpoint

This checkpoints the existing-primary + surface consolidation, **not a releasable product**. `releaseReady:false`; no native BB startup, provider call, live configuration/state write, installer/service change, merge or publication occurred. Same-account disposable HOME/TMPDIR isolation is not an OS sandbox. Original spike packages and sibling release tooling were not edited.

## Observed results

Toolchain: **Node v24.15.0, npm 11.12.1**, BB builder 0.45.0 / plugin SDK 0.6.15. Commands used scrubbed `env -i`, explicit Node/npm/BB paths, private HOME/TMPDIR/cache, `NODE_DISABLE_COMPILE_CACHE=1`; no force, legacy-peer-deps, aliases, relaxed checks or new protocol. Raw failures are retained in `evidence/`, including initial wrong consumption, ERESOLVE attempts and original default-heap OOM.

| Gate / diagnostic | Result and evidence |
| --- | --- |
| Fresh final locked nested strict-peer ci | **0**, `nested-final-ci.{log,exit}`. Initial successful nested ci also retained. |
| Final ordinary root `npm ls --all --json` | **FAIL, ELSPROBLEMS**, `nested-final-ls.{json,stderr}`. Only reported invalid edge is below. This is failed graph validation, not cosmetic clearance. |
| Actual consuming-module resolution | `consolidation-graph-relocated.json.log`: surface, A2UI React/web_core, converter resolve patched Zod3; CJS/ESM array/set sync+async oversize checks perform zero child transforms. Primary and both actual SDK importers resolve Zod4.6.6. Markdown resolves DOMPurify3.4.17. |
| Actual BB build | Emitted server/app/CSS/host; `bb-build-final.log`. App composition uses the SDK definition object's `.setup`, not a function call. Legacy apps retain their own contract types rather than creating a merged-contract type cycle. |
| Existing-owner/extensions bundle | Static build **0**, `runtime-build-notices.{log,exit}`. `@earendil-works/pi-ai@1.1.0` is explicitly declared because nested layout exposed fixture.ts's transitive-only import. Named-package provenance lookup skips nameless package.json module-mode markers. Notices conservatively include the installed graph, not just runtime metafile inputs. |
| Actual BB app / runtime static assertions | Patched array/set early returns, DOMPurify3.4.17 (not 3.4.11), reviewed Zod tar/source hashes, builtin-only **static** runtime imports, no composition engine or experimental dependency. These assertions do **not** detect arbitrary dynamic require resolution. |
| Relocated actual artifact, no node_modules or checkout files | Owner selftest **0**, readiness **2/unverified**. workspace-frame/live/fixture import without registration/execution. **workspace-extension import FAILS MODULE_NOT_FOUND**; details below. Raw stack and per-entry outcomes retained. No packaged-product acceptance claim. |
| Strict tsc, explicit 8192MiB heap | Completes but **FAILS, exit 2, 19 diagnostics**, `typecheck-8192-verified.{log,exit}`. |
| Strict tsc, default heap after bounded source/type-graph corrections | Completes but **FAILS, exit 2, same 19 diagnostics**, `typecheck-default-verified.{log,exit}`. Original OOM remains a failure, but memory/OOM is **not the current blocker**. No checks/configuration were disabled. |
| Source/reducer + preserved candidate tests | **28/28**, no skips/cancellation, `unit-final.tap`, exit 0. Includes 1170 UTF-16 / 1080-code-point Unicode multiline exact press/history replay/restore; atom, 40KiB prospective workspace, restore and 12000 serialized UTF-16-unit rejection without source mutation. These are **not** actual packaged UI/owner/reopen acceptance. Fixture cleanup diagnostics retained; dedicated unit TMPDIR was empty afterward. |

Fixture retained: `/tmp/exo-consolidation.tio5eJ` (package/, evidence/, relocated-artifact/, minimal-repro/, standalone-control/, markdown-static-probe/). Not automatically removed; failures remain inspectable. Relocated file digests: `evidence/relocated-artifact-sha256.json`.

## Exact invalid dependency edge and reduced control

Current locks:

- Checkpoint: `plugins/bb-plugin-exosurface/package-lock.json`.
- Final tested fixture: `/tmp/exo-consolidation.tio5eJ/package/package-lock.json`; copied as `evidence/nested-final-package-lock.json`.
- Reduced workspace: `repro/workspace/package-lock.json`; source fixture `minimal-repro/package-lock.json`.
- Separate standalone control: `repro/standalone/package-lock.json`; source fixture `standalone-control/package-lock.json`.

Offending **ordinary dependency**, not a newly identified incompatible peer:

```text
@exosurface/surface-runtime@0.1.0 (workspace link)
  -> @a2ui/markdown-it@0.2.1
  -> dompurify@3.4.17
     declared exact dependency: 3.4.11
     root scoped override: {"@a2ui/markdown-it":{".":"0.2.1","dompurify":"3.4.17"}}
```

`npm ls` says `overridden:false`, `invalid:"\"3.4.11\" from legacy/surface/node_modules/@a2ui/markdown-it"`; actual module resolution and lock point to 3.4.17. A strict fresh ci succeeds but does not make ls valid.

Reduced workspace contains only root Zod4 plus a private surface with patched Zod3, web_core0.13 and markdown0.2.1. **Strict ci 0, ls 1**, same DOMPurify edge. Standalone control uses the same surface dependency declarations and identical scoped override at its own root: **strict ci 0, ls 0**, DOMPurify `overridden:true`. See `minimal-repro-*-verified.*` / `standalone-control-*-verified.*`. This supports a **workspace-associated override/load-actual reporting defect** rather than an importer choosing DOMPurify3.4.11. It does not establish original-graph acceptance, full private-surface compatibility, security or runtime safety. No further override permutations were attempted after the stop instruction.

Earlier ERESOLVE remains real: `graph-clean-lock.log` shows converter3.25.2's overridden peer locator `file:legacy/surface/vendor/...` versus direct patched Zod `file:vendor/...`; upstream converter peer is `^3.25.28 || ^4`. `graph-common-locator-lock.log` retains web_core0.13's overridden Zod peer (`^3.25.76`) failure. Reference/alias experiments failed and are historical evidence only; none remain active.

## Relocation failure and bounded static-parser option (NOT adopted)

`legacy/surface/observer/document.ts` currently does:

```ts
createRequire(require.resolve('@a2ui/react/v0_9'))('markdown-it')
```

This runs at module import. Esbuild cannot discover that runtime resolution via its static graph. The shipped relocated workspace-extension therefore cannot import. Main-mode experiment rejection does not prevent this top-level load.

Smallest proposed correction, **3 production files**: (1) document.ts static `import MarkdownIt from 'markdown-it'` plus two truthful mapped-token filter predicates; (2) actual consuming surface package.json direct exact `markdown-it:14.3.3`, dev `@types/markdown-it:14.1.2`; (3) the selected surface-containing lock. No provider/runtime/protocol change. Do not ship a dynamic checkout dependency.

Disposable option probe only, not production adoption:

- Existing React0.13 declares markdown-it `^14.2.0`; actual old CJS resolution is **14.3.3**. Explicit dependency uses exactly **14.3.3 with identical npm integrity**.
- Published exports: import `./index.mjs`, require `./dist/index.cjs.js`. Compare existing renderer CJS constructor to explicit ESM default export.
- **60 parse/parseInline/render/renderInline comparisons**, **15 complete parseDocument/source reconstruction roundtrips**, **3 matching bound/blank/node-budget rejections**. Unicode, CRLF, headings, lists, code, HTML-disabled input, links, tables, emphasis/times/questions covered.
- Bundled probe relocates without node_modules; only node builtins remain. This is a parser-specific option experiment, **not a passing production workspace artifact**.
- First static typecheck exposed 5 nullable-token.map errors hidden by old require-any; retained `markdown-static-typecheck.log`. Two predicates narrow precisely the already checked map presence, without non-null assertions/suppression; strict probe then **0**, parity repeats pass. Production code remains unchanged.
- Markdown-it **MIT**, license retained; production-only audit of the narrow explicit parser fixture reports **0 vulnerabilities**, `markdown-static-audit.json`. Not a blanket security clearance: existing local-patched-Zod scanner flags and broader graph/package gates remain separate. DOMPurify is not a dependency of this parser-only option; sanitizer3.4.17 remains on the renderer's own scoped path.

Probe source/manifest/lock/metafile: `repro/markdown/`; runnable comparator: `markdown-parity.mjs`.

## Nineteen strict-type failures: what is actually reachable

Diagnostic counts: **16 contract.ts + 1 engine.ts + 2 provider.ts = 19**. No runtime import of `@json-render/core` or `composition/engine.ts` appears in any built runtime graph. But their types remain reachable:

1. server -> composition/client.ts -> **type-only** CompositionRequest import from engine.ts. TypeScript consequently follows engine's missing experimental runtime/type import, despite the actual native command rejecting immediately.
2. workspace-extension -> composition/contract.ts, retained offer/history helpers. Its unused experimental catalog/Spec annotations make the missing types infect mapSpec inference.
3. workspace-extension -> observer/document-turn and observer/stream -> composition/provider.ts. Provider class/choice helpers really enter the bundle; missing choice/evaluator annotations refer to the experimental package. These are not all dead files. Experimental execution remains owner-rejected; no provider call was made.

Smallest recommended preservation fix, **3 production files, no new dependency/configuration**:

- client.ts: own an exact structural copy of its existing CompositionRequest wire type (including the existing Mode type), rather than importing engine.ts solely for that type. Leave the archived engine declaration intact; assert the copied shape in a type regression. This deliberately avoids a new module or archived source edit.
- contract.ts: derive the owned Spec from existing `specSchema` (`z.infer`), explicitly type `validate(value:unknown)`, infer the existing owned catalog object instead of referencing an unavailable experimental API.
- provider.ts: type only the already-used local choice/evaluator request fields (criteria, state, questions), with inferred return shape; do not assert compatibility with an unavailable experimental API.

Leave engine.ts and the verbatim `archived-workspace-compose.ts.txt` intact, preserve rejecting registration and history/offer functions. Require unchanged generated runtime semantics plus strict compile and rejection tests. This is a proposal, **not yet implemented or proven**; do not add an unlocked experiment dependency, ambient fake module, suppression, broad exclude or deletion.

## Separately locked internal surface: option layout and release integration

**Recommended next assessment, not adopted:** one BB package/id/provider with ordinary independently locked private build resources. One plugin need not have one npm workspace tree. Keep all current primary/surface modules and root entrypoints; no competing service/store/tools or automatic migration.

```text
bb-plugin-exosurface/
  package.json + package-lock.json       # primary/SDK Zod4, build tools; no workspace link
  app.tsx, server.ts, host.ts            # existing single composition
  legacy/primary/...                    # existing implementation
  legacy/surface/
    package.json + package-lock.json    # private; own scoped overrides, Zod3, A2UI/DOMPurify
    vendor/zod3/...                     # reviewed existing provenance/artifact
    app.tsx, server.ts, src/, observer/, composition/, skills/...  # unchanged ownership
  dist/{app.js,app.css,server.js,host.js,owner-service.js,
        live.js,fixture.js,workspace-extension.js,workspace-frame.js,...}
  resources/skills/exosurface/...
  resources/provenance/zod3/...
  resources/provenance/surface/{package.json,package-lock.json}  # proposed build provenance
  resources/licenses/...
```

Build-only standard commands: clean locked strict `npm ci` at root and at `legacy/surface` (each with its own private cache/env). Existing esbuild/BB resolution follows imports from that surface source directory into its node_modules; primary/SDK stay on Zod4. SDK0.6.15 has an ordinary Zod dependency `^4.6.5`, not a Zod peer, so its exact4.6.6 must also be asserted from both SDK importers. The reduced standalone control is promising but **not a full surface+SDK build proof**.

All internal JS dependencies must be bundled before shipping; **no shipped node_modules, second BB registration, installer, daemon/service or runtime npm install**. No adoption/config migration.

Estimated follow-up packaging cost: **8 files**: root manifest+lock (2), surface manifest+new lock (2), build-runtime.mjs for second-lock provenance (1), release.json resource allowlist (1), graph assertions (1), this build/review documentation (1). Static markdown option shares the surface manifest/lock; the 3-file preservation fix is separate. A root vendor duplicate can then be removed only if the chosen root overrides no longer refer to it. This is an estimate, not permission or proof.

Existing release tooling inspected read-only at `0ca0f671518274b6d6afbb5781fbae8afcd186a3`:

- `tools/release/lib/artifact.mjs::buildArtifact` copies only `release.json.files` under `plugin/` and hashes it. Current allowlist **does not include resources/**, so skills/provenance/notices would be omitted today. That is an explicit integration blocker, regardless of dependency route. Add the resource allowlist only as reviewed source; no bypass.
- Its dependencyManifest records **root direct runtime dependencies only** and calls bundling `unverified-by-this-tool`. Root manifest/lock alone would not account for a separately locked surface. Proposed embedded surface manifest/lock + runtime graph/hash evidence must be included and checked by the existing tooling owner, not a duplicate installer here.
- contract.mjs::ownerGraph follows the owner entry's static/literal imports, not all extension entrypoints or arbitrary `createRequire().resolve`. It therefore cannot substitute for actual relocated extension import checks. Keep this failure as a required gate.
- Current source entrypoint metadata/compiled artifact allowlist, owner label/config/state compatibility and starter/resource integration still need review; no installer/launchd/native-startup claim is made. Do not blindly add `legacy/**` to an allowlist: that would select denied node_modules. Preserve candidate source/evidence separately as now.

Alternative: retain the current workspace source/locks, keep ls failed, and wait for an independently verified npm workspace-override fix. No new permutation is recommended. Do not patch upstream package metadata to hide the declared edge.

## Runnable review commands

Run from the plugin directory. Use a **fresh disposable copy/archive**, never live HOME/config. Exact executables used:

```sh
NODE=$NODE_PREFIX/bin/node
NPM_CLI=$NODE_PREFIX/lib/node_modules/npm/bin/npm-cli.js
BB=/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb
REVIEW=$(mktemp -d /tmp/exo-consolidation-review.XXXXXX)
mkdir "$REVIEW/home" "$REVIEW/tmp" "$REVIEW/cache" "$REVIEW/source"
# Use the committed checkpoint, not node_modules from a checkout.
git -C "$(git rev-parse --show-toplevel)" archive HEAD plugins/bb-plugin-exosurface | tar -xf - -C "$REVIEW/source"
PKG="$REVIEW/source/plugins/bb-plugin-exosurface"
run() { env -i HOME="$REVIEW/home" TMPDIR="$REVIEW/tmp" \
 PATH="$(dirname "$NODE"):/usr/bin:/bin" NODE_DISABLE_COMPILE_CACHE=1 "$@"; }
cd "$PKG"
run "$NODE" "$NPM_CLI" ci --install-strategy=nested --ignore-scripts --strict-peer-deps --cache "$REVIEW/cache" --no-audit --no-fund
run "$NODE" "$NPM_CLI" ls --all --json > "$REVIEW/npm-ls.json" 2> "$REVIEW/npm-ls.stderr" # FAIL 1; retain, not a pass
run "$NODE" "$BB" plugin build .
run "$NODE" build.mjs
run "$NODE" build-runtime.mjs
run "$NODE" --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit # FAIL 2, 19 errors
run "$NODE" node_modules/typescript/bin/tsc --noEmit # separately; FAIL 2, 19 errors
run "$NODE" --experimental-transform-types --test test/*.test.ts
run "$NODE" test/consolidation-graph.mjs "$PKG"
mkdir "$REVIEW/relocated"
cp -R dist resources "$REVIEW/relocated/"
printf '{"type":"module","private":true}\n' > "$REVIEW/relocated/package.json"
run "$NODE" test/consolidation-graph.mjs "$PKG" "$REVIEW/relocated" # static assertions only
run "$NODE" "$REVIEW/relocated/dist/owner-service.js" --release-selftest
run "$NODE" "$REVIEW/relocated/dist/owner-service.js" --readiness # unverified, exit 2
run "$NODE" --input-type=module -e "await import('file://$REVIEW/relocated/dist/workspace-extension.js')" # FAIL MODULE_NOT_FOUND
```

These are separate diagnostics: retain each exit status/output, never turn the failing gates into a passing run. Do not run expensive compilers concurrently. Poll any slow invocation in short separate calls, not a long blocking wait. No native daemon startup is part of these commands.

Reduced cases (preparation only copies pinned diagnostic fixtures; production route unchanged):

```sh
run "$NODE" compat/consolidation/prepare-repro.mjs workspace "$REVIEW/workspace"
run "$NODE" compat/consolidation/prepare-repro.mjs standalone "$REVIEW/standalone"
# In each fixture separately:
# run "$NODE" "$NPM_CLI" ci --install-strategy=nested --ignore-scripts --strict-peer-deps --cache "$REVIEW/cache" --no-audit --no-fund
# run "$NODE" "$NPM_CLI" ls --all --json     # workspace fails 1, standalone passes 0
run "$NODE" compat/consolidation/prepare-repro.mjs markdown "$REVIEW/markdown"
# Same locked strict ci in "$REVIEW/markdown", then return to "$PKG":
run "$NODE" --experimental-transform-types compat/consolidation/markdown-parity.mjs "$PKG" "$REVIEW/markdown" "$REVIEW/markdown-relocated"
run "$NODE" node_modules/typescript/bin/tsc --strict --noEmit --target ES2022 --module ESNext --moduleResolution bundler --types node --typeRoots "$REVIEW/markdown/node_modules/@types,$PKG/node_modules/@types" "$REVIEW/markdown/document.ts"
# Production-only audit in the parser fixture (not whole-product clearance):
# run "$NODE" "$NPM_CLI" audit --omit=dev --json --cache "$REVIEW/cache"
```

Latest bounded native checkpoint: [hook/load/render/native-mock evidence](native-hook-evidence/README.md)
(producer387acf9). Actual running plugin/styled Canvas and synthetic owner-command
edit/reopen/atomic rejection are distinct from still-unproved native conversation,
composer/card/send-time bring-back, real owner/Pi/auth/provider and fresh-Mac
acceptance. Existing2000-unit compatibility bound remains; readiness is false.

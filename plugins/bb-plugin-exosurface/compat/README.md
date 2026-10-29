# Narrow Zod3 shipping candidate — independent review required

`releaseReady:false`. This separately locked compatibility harness and local
artifact do **not** change the production plugin's lock, renderer, provider or
schemas. The first actual reused browser textbox → press → owner → persisted
page update/reopen remains unproven. No live install, BB state, provider call,
launchctl, deployment or publication was performed.

## Review surface

- `zod3/upstream.json`: pinned registry SHA512, upstream revision, fix provenance.
- `zod3/build.mjs`: integrity-checked, deterministic tarball builder; no install scripts.
- `zod3/backport.patch`: human-reviewable three-file runtime/source patch.
- `zod3/zod-3.25.76-exosurface.1.tgz`: exact local artifact (584883 bytes).
- `zod3/artifact.json`: original/patched per-file SHA256 and artifact SHA256/SHA512.
- `zod3/LICENSE.upstream`, `NOTICE.md`: original MIT license, local modification
  attribution, diagnostic change, limits and advisory distinction. The artifact
  retains all original license/notices and adds `EXOSURFACE_BACKPORT.md`.
- `a2ui-runtime/package-lock.json`: all registry integrities and local tarball integrity.
- `a2ui-runtime/evidence/`: exact fresh-install output, parity TAP, audit JSON and
  calibrated checkpoint summary. Audit evidence is a point-in-time registry response.

Only array upper `.length()` / `.max()` and set `.max()` / `.size()` rejection
abort before parsing children or dispatching async children. No Map bound API is
invented; no new cardinality limits are imposed. Already-invalid constrained
oversize inputs have fewer child issues and skip outer refinements. Other
package files, exports, declarations, metadata and accepted-input schemas remain
unchanged, except the explicitly local package version and added notice.

The tests cover ESM/CJS root and `/v3`, actual compiled shipped TS root and `/v3`,
finite upstream controls, nested/recursive constrained children, async dispatch,
sampled accepted sync/async outputs, preprocessing/union fallbacks, unconstrained
and below-bound diagnostics, original-file identity, and separate SDK4 runtime
contract use. The complete official basic and existing Exo catalog JSON and
child-reference maps match upstream; every basic component's converter output
and warnings match. An accepted 65-option ChoicePicker workspace matches. The
unmodified workspace/snapshot-format/stage/incremental suites pass 36/36 against
each graph. These tests preserve, rather than replace, existing FunctionCall and
depth guards. Default declarations and actual `@zod/source` TypeScript conditions
compile. This is sampled behavioral regression coverage, not exhaustive input or
browser parity.

A2UI React/web_core remain 0.13.0, converter 3.25.2, React/DOM 19.2.4 (the existing
spike versions). Its loose markdown range now selects 0.2.2, which requires
web_core0.14; this harness pins the existing compatible markdown-it0.2.1 instead.
Fresh `--strict-peer-deps` install passes without incompatible overrides. A2UI
core/converter imports consume root or `/v3`; React delegates validation to core.
The browser React entry requires a real DOM and is **not executed** in Node.
The SDK0.6.15 resolves its independent Zod4.6.6. Upstream's old bundled v4 exports
remain unchanged and are outside this candidate's approved consumed graph; do
not use them as an SDK4 substitute.

## Advisory disposition is not upstream-version clearance

GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 still lists upstream `<4.6.6` and first patched
4.6.6. `3.25.76+exosurface.1` is local patch provenance, not an upstream fixed
release or scanner-clean version. The fresh audit **still flags it**. Independent
review must assess the specific backport; no residual-risk acceptance is inferred.
No claim is made that unconstrained reporting, arbitrary expensive refinements,
recursive inputs, every resource-exhaustion vector or admitted-app exposure are
fixed/proven. Existing application budgets are not represented as advisory fixes.

The original c22ba24e isolated audit independently flagged DOMPurify3.4.11 through preserved
markdown-it0.2.1 under six advisories (raw IDs/ranges in `evidence/npm-audit.json`):
GHSA-55q2-fjhq-7xh7, GHSA-c2j3-45gr-mqc4, GHSA-6688-9rhm-gjv2,
GHSA-cg2g-xh64-v4q7, GHSA-mrv2-3pqr-j5jr, GHSA-c6gr-qvv4-5v3f.
This is a **separate finding**, not evidence the Zod patch failed or a renderer
exploit is reachable. No DOMPurify change or risk acceptance was included in that
original Zod checkpoint. The separately authorized correction is described below.
The original production-plugin zero-advisory evidence does not extend to this
candidate's additional graph.

## Exact independent commands (configured Node24, offline review)

Start at this checkout. Set `EXO_REVIEW_NODE` to an absolute installed **Node24
executable**, `EXO_REVIEW_NPM_CLI` to its absolute `npm-cli.js`,
`EXO_REVIEW_ZOD_TARBALL` to the cached upstream `zod-3.25.76.tgz`, and
`EXO_REVIEW_NPM_CACHE` to a supplied populated cache. Paths are configuration,
not machine-specific defaults. Commands validate Node identity/version, copy the
cache, and use only disposable HOME/TMPDIR/cache. They perform **no network**,
lifecycle scripts, global install or shared-cache writes. Missing offline inputs
are a coverage blocker, not permission to go online or infer install success.

```sh
REPO="$(git rev-parse --show-toplevel)"
: "${EXO_REVIEW_NODE:?Set absolute non-shim Node24 executable}"
: "${EXO_REVIEW_NPM_CLI:?Set absolute npm-cli.js from that installation}"
: "${EXO_REVIEW_ZOD_TARBALL:?Set cached upstream zod-3.25.76.tgz}"
: "${EXO_REVIEW_NPM_CACHE:?Set populated offline cache to copy}"
NODE="$EXO_REVIEW_NODE"
NPM="$EXO_REVIEW_NPM_CLI"
for p in "$NODE" "$NPM" "$EXO_REVIEW_ZOD_TARBALL" "$EXO_REVIEW_NPM_CACHE"; do
  case "$p" in /*) ;; *) echo 'Review inputs must be absolute paths' >&2; exit 1;; esac
done
CHECK="$(mktemp -d /tmp/exo-zod3-independent.XXXXXX)"
mkdir "$CHECK/home" "$CHECK/tmp"
cp -R "$EXO_REVIEW_NPM_CACHE" "$CHECK/cache"
cp -R "$REPO/plugins/bb-plugin-exosurface/compat" "$CHECK/compat"
run() { env -i HOME="$CHECK/home" TMPDIR="$CHECK/tmp" \
  PATH="$(dirname "$NODE"):/usr/bin:/bin" npm_config_userconfig=/dev/null \
  npm_config_cache="$CHECK/cache" npm_config_registry=https://registry.npmjs.org \
  npm_config_offline=true npm_config_fetch_retries=0 "$@"; }
run "$NODE" -e 'const a=require("node:assert/strict"),f=require("node:fs");a.equal(Number(process.versions.node.split(".")[0]),24);a.equal(f.realpathSync(process.execPath),f.realpathSync(process.argv[1]),"Use the real Node executable, not a shim");' "$NODE"
run "$NODE" "$NPM" --version
run "$NODE" "$CHECK/compat/zod3/build.mjs" "$EXO_REVIEW_ZOD_TARBALL"
cmp "$CHECK/compat/zod3/artifact.json" "$REPO/plugins/bb-plugin-exosurface/compat/zod3/artifact.json"
cmp "$CHECK/compat/zod3/zod-3.25.76-exosurface.1.tgz" "$REPO/plugins/bb-plugin-exosurface/compat/zod3/zod-3.25.76-exosurface.1.tgz"
cd "$CHECK/compat/a2ui-runtime"
run "$NODE" "$NPM" ci --offline --ignore-scripts --strict-peer-deps --omit=peer --no-fund --no-audit
run env EXO_LEGACY_SOURCE="$REPO/plugins/bb-plugin-exo-a2ui-spike" \
  "$NODE" --experimental-transform-types --test --test-reporter=tap test/candidate.test.mjs
run "$NODE" node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
run "$NODE" node_modules/typescript/bin/tsc --noEmit -p tsconfig.source.json
run "$NODE" node_modules/typescript/bin/tsc --listFilesOnly -p tsconfig.source.json > "$CHECK/source-files.txt"
grep -F '/zod/src/v3/types.ts' "$CHECK/source-files.txt"
```

The author originally downloaded public registry bytes and performed the fresh
install/audit recorded in `evidence/`; those are distinct from offline review.
A fresh audit is network-dependent and is **not run by these offline commands**.
Use the committed raw audit snapshot, not an inferred scanner-clearance result.

Legacy files are read-only pinned by `a2ui-runtime/legacy-fixtures.json`; the test
copies code into disposable TMPDIR and runs only the four named pure suites
against upstream and patched resolution graphs. Child runners receive a fresh
allowlisted environment and explicitly verify a nonzero executed-test count.
Same-account isolation is an accident guard, **not** an OS sandbox. Integration
and the subsequent actual browser interaction remain separate work.

## Correction and publication status

The c22ba24e prose incorrectly called DOMPurify3.4.16 the installed version. The
original checkpoint lock, installed package and markdown0.2.1 manifest all resolve
**3.4.11**;3.4.16 was an advisory upper bound. Raw install/TAP/audit evidence and reviewed
Zod artifact are unchanged. See `DOMPURIFY-TRIAGE.md` for the separate finding.

The attempted authorized private-draft push was blocked by the local publication
guard on a machine-specific README path and the local modification-author line
in `zod3/NOTICE.md`. Paths above are now portable. Original upstream MIT
copyright/license notices are required; the local author statement is modification
provenance rather than an MIT obligation. It remains unchanged, including inside
the reviewed artifact. The guard offers no private-name override under the
reviewed-content flag. No guard was disabled/bypassed and nothing was pushed.

## Authorized scoped DOMPurify follow-up

`DOMPURIFY-FIX.md` describes the separate correction: explicit app-level
markdown0.2.1 dependency and scoped DOMPurify3.4.17 override. Current graph strict
peers/npm ls, Zod19 + legacy36 per graph, both typechecks and9 real-DOM markdown/
advisory regressions pass. Fresh audit has no DOMPurify entry;4 propagated Zod
high entries remain. Original c22ba24e audit/checkpoint/triage files are historical
and preserved, not the current graph's installed-version or scanner result.
The new evidence is under `a2ui-runtime/evidence/dompurify-fix/`.

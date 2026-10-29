# Separate test-only teardown correction

Parent checkpoint: **57fc59feee7dde391e8708a1afa618c327a01042**. No production
lifecycle, protocol, dependency, renderer, input guard or browser deadline changes.

## Confirmed defect, exact scope

At pinned57fc59f:

- `test/first-run.test.ts:93`: **real socket → mock Pi RPC → response page; full long input; wrong thread refused**.
- `test/pages.test.ts:55`: **production owner socket → mock Pi running compiled page tools → persisted updated page; full text survives chunking**.

Their early fixture `t.after` deletes the root before the later awaited
`owner.close()` writes `state/owner/state.json`. That write recreates the root.
Author observed **four roots across TWO full-suite invocations**, not four per
run. Exact captured paths under the disposable UI fixture TMPDIR:

- `exo-fr-MnpGfM/state/owner/state.json`
- `exo-fr-wtbSsr/state/owner/state.json`
- `exo-pages-N6URr4/state/owner/state.json`
- `exo-pages-x1pFHG/state/owner/state.json`

Original contents/hashes remain in `evidence/checks/unit-teardown-residue.json`.
User-relayed independent review **46b91ae** / reviewer670e1e7c independently
reproduced **two** such roots in **one** pinned57fc59f suite invocation. It also
reproduced the isolated browser interaction first run, adapter5/production23 /
typecheck / acceptance48. None of that establishes old test-directory cleanup.

## Narrow correction and assertions

`test/fixture-cleanup.ts` registers one test-only barrier: close resources in
reverse order, await owner shutdown **and its final stopped-state write**, then
remove the root. Mock Pi writes its PID and normal-exit receipt; the affected
fixtures assert exit0 and `kill(pid,0)` → ESRCH. Existing compiled-host fixtures
retain deliberate SIGTERM bridge-loss behavior, now await child close and assert
PID disappearance. A child failing the new2s test-cleanup deadline fails and is
SIGKILL-cleaned; forced cleanup cannot pass. This does not change Pi/owner or
browser timeouts. No forced path was needed in recorded successful tests.

Every fixture checks its root stays absent after a50ms post-close observation and
rechecks owned PIDs. Two added regression tests cover awaited late stopped-state
writes/resource ordering and owned-child disappearance. The separate
`verify-unit-cleanup.mjs` checks all receipt roots/PIDs **after the entire suite
process exits**, and requires its dedicated TMPDIR to be empty. This is bounded
fixture verification, not general product lifecycle acceptance.

Final exact-source suite: **25/25** (previous23 +2 teardown regressions), Node
exit0, **18 root receipts**, **5 owned child PIDs absent**, dedicated TMPDIR
empty; strict new-helper/regression typecheck exit0. See
`evidence/test-teardown/production-tests-final.tap` and
`post-suite-cleanup-final.json`. Earlier clean suite receipts and all failures are
also retained. Production sources/lock and reviewed sanitizer helper are unchanged.

One retained post-suite verification FAILED despite25/25 because the operator had
reused the test TMPDIR for a subsequent TypeScript invocation, which created an
ordinary `node-compile-cache/` there. The verifier correctly rejected that dirty
TMPDIR; it was not an owner-state residue or surviving PID. The failure/output
remain in `post-suite-cleanup-repeat-failure.*`. Fresh dedicated suite TMPDIRs and
`NODE_DISABLE_COMPILE_CACHE=1` avoid mixing compiler-cache state with fixture
cleanup evidence; the assertion was not weakened or made to ignore that directory.

## Reproduce without the browser

Use a **disposable production package** with source/tests from this checkpoint,
production dependencies, and its existing built `dist/server.js` + `dist/host.js`.
No live daemon or provider is needed. Configure absolute `EXO_REVIEW_NODE` and
`EXO_REVIEW_BACKEND` paths and execute from this directory:

```sh
set -eu
TASK=$(mktemp -d "${TMPDIR:-/tmp}/exo-teardown-review.XXXXXX")
mkdir "$TASK/home" "$TASK/suite-tmp" "$TASK/evidence"
(cd "$EXO_REVIEW_BACKEND"; env -i HOME="$TASK/home" TMPDIR="$TASK/suite-tmp" \
  NODE_DISABLE_COMPILE_CACHE=1 PATH="$(dirname "$EXO_REVIEW_NODE"):/usr/bin:/bin" \
  "$EXO_REVIEW_NODE" --experimental-transform-types --test test/*.test.ts) \
  > "$TASK/evidence/production-tests.tap" 2>&1
# Do not run tsc or any other phase in suite-tmp between these two commands.
env -i HOME="$TASK/home" TMPDIR="$TASK/suite-tmp" NODE_DISABLE_COMPILE_CACHE=1 \
  PATH="$(dirname "$EXO_REVIEW_NODE"):/usr/bin:/bin" "$EXO_REVIEW_NODE" \
  verify-unit-cleanup.mjs "$TASK/evidence/production-tests.tap" "$TASK/suite-tmp"
```

Retain outputs on any failure. Source/committed hashes and mechanical path-prefix
normalization are recorded in `evidence/test-teardown/retained-files.json`.

## Still separate

The old sanitizer review's shutdown failure is not fixed or cleared by this test
fixture change. Native BB, actual Pi extension loader, authentication/inference,
product lifecycle/platform/layout and release acceptance remain open.

Important pinned57fc59f browser limit: its sample is **901 UTF-16 code units /
925 bytes**, not a >1000-character browser acceptance case. Large adapter/unit and
backend socket proofs are different scopes and do not substitute. Native-BB
follow-up must explicitly test >1000 characters with Unicode/multiline and exact
end-to-end equality. `releaseReady:false`.

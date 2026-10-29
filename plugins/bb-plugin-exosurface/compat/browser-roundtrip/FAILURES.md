# Retained failure / lifecycle record

## Independent DOM-fix review (separate runner; unresolved shutdown flake)

The user relayed acceptance PR#52 evidence **1828c34**: the first unmodified
Chromium run against checkpoint **5cab0d1** failed its shutdown deadline; exactly
one unmodified retry passed9/9. Preserve both in that independent review. This
operator did not independently collect those raw outputs, and does not infer a
root cause. The reviewed `a2ui-runtime/test/browser/chromium.mjs` and its deadline
are **unchanged** here. A passing retry is not reliable shutdown or product
acceptance. This needs a separate reproducer/lifecycle correction; the new
interactive runner's success must not be represented as fixing the old runner.
The saved independent audit corroborated the author's saved audit, not a fresh
independent network audit.

## Isolated round-trip fixture development (this checkpoint)

Every attempt has retained output under `evidence/attempt-N/`:

| Attempt | Result / correction before the next relevant run |
| --- | --- |
| 1 | esbuild rejected an incorrect basic-catalog import. Fixture imports/API calls were corrected to the existing app's actual v0.9 imports, renderMarkdown and surface prop. No renderer source changed. |
| 2 | esbuild metafile path reconstruction used the wrong macOS real/alias working directory. Normalize the disposable directory and set explicit absWorkingDir. |
| 3 | 20s hard deadline while waiting for initial controls, before requesting shutdown. Diagnostic instrumentation added; not a shutdown success. |
| 4 | New diagnostic queried body.innerText before body existed. Optional body access added; failure retained. |
| 5 | Diagnostics identified swapped WorkspaceView constructor arguments (catalogs.find). Fixture constructor corrected to the existing app's actual argument order. |
| 6 | 20s hard deadline before close: the button's light-DOM text includes template whitespace. Automation used exact textContent equality; selector corrected to trim its label only, never input values. |
| 7 | Full-value assertion caught automation appending to the existing initial value. Select the existing textarea contents before real Input.insertText. No draft/model assignment or input truncation. |
| 8 | First complete pass: two clean browser exits and independent owner exit0. |
| 9 | First browser phase completed; fresh-browser startup discovery's extra 500ms HTTP /json/list request timed out. This run FAILED and forcibly cleaned its owned browser group; not a shutdown failure or passing run. Discovery now uses Target.getTargets on the already established browser CDP channel, avoiding that separate HTTP startup race. Overall 20s including shutdown was NOT extended. |
| 10, 11 | Complete pass, including clean browser/owner group disappearance and forbidden service-attempt count0. |
| 12, 13 | Complete passes, including fresh offline-installed tool graph, explicit synthetic light host palette, Chromium version receipt and all cleanup assertions. |
| 14, 15 | Final-source complete passes after adding an explicit function return type for the injected mutation-ID factory (no emitted-runtime change). Adapter unit sources also pass strict typechecking. No modifications between these two runs. |

Earlier standalone screenshots also exposed poor contrast when the native host
palette was absent (dark browser canvas with dark fallback text). Final fixtures
supply explicit synthetic light host tokens only. Existing renderer/style/theme
bytes are unchanged. This observation is not a native-BB visual defect proof or
layout acceptance.

`checks/adapter-initial-failure.tap` retains a unit-test fixture error: the test
released a deferred RPC before the async flush continuation installed its
resolver. A deterministic setImmediate tick fixes the test, not production code;
final adapter tests5/5. `checks/production-tests-incomplete-fixture-failure.tap`
retains21/23 with two failures because the newly staged test package omitted
its existing compiled dist/host.js. Supplying that unchanged artifact yields
23/23. No production test, deadline, lifecycle guard or assertion was relaxed.

Original text evidence SHA256 and mechanically path-normalized committed SHA256
are both recorded. Failure evidence is not replaced with the succeeding run.
Browser timeouts/nonzero exits/remaining owned groups remain failing outcomes;
cleanup cannot convert them to success. No automatic retry loop is implemented.

## Additional existing unit-test teardown residue (not a browser failure)

After the two full-suite invocations, four disposable roots remained, each
containing **only** state/owner/state.json with stopped status. The existing
fixture's removal hook is registered before owner.close; close subsequently
writes stopped state and recreates the directory. The owner is in the test
process and no process leak was demonstrated. TAP23/23 is not clean-directory
teardown acceptance. `checks/unit-teardown-residue.json` captures all four
contents/hashes before explicit removal of those owned directories. Existing
unit teardown was not changed or silently cleared as passing. This is separate
from the independent sanitizer shutdown flake and from the new browser fixture,
which closes its owner before removing its stage and verifies no owned group
remains.

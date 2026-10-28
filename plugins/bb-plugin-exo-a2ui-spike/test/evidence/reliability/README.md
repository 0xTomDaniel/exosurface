# Reliability evidence — issues #50 / #31 / #27 / #25

Private release tracker #45; acceptance gates #51 remain **open**. These are legacy spike fixes and offline fixture checks, not production artifact or real-Mac acceptance.

## Textbox regression (#31)

`src/canvas-memory.ts` no longer abbreviates a person's textbox value at 300 characters, normalizes its newlines, or cuts their page edits. Labels may still be abbreviated. Canvas outline overflow is explicitly marked with a `read_exosurface` recovery instruction.

`src/workspace.ts` retains the existing limits: **2,000 UTF-16 code units per textbox; 16,384 per JSON action**. Above either limit, the action is rejected, never shortened. The real RPC schema now gives an explicit textbox overflow message too (schema validation happens before `validateAction`).

- Seven unit regression checks: fixed **7 pass**; baseline `368cba4` canvas-memory implementation **5 fail / 2 pass**.
- Real RPC schema + plugin action handler: fixed **1 pass**; baseline **1 fail**. A 1,000+ character multiline note is committed verbatim through a temporary Unix owner socket, then passed verbatim to a mocked BB `threads.send`. No actual agent/model call. The same test checks the actual RPC boundary's explicit oversized-text rejection.
- Failing-before method: copy source/tests into a disposable directory; replace only `src/canvas-memory.ts` using `git show 368cba4:...`, retain current workspace validation to avoid missing-export failures. No worktree rollback/reset. The two passing overflow unit checks are **not** claimed as failures on the original validation implementation.

## Tests do not target live state (#25)

Both suites import `test/isolation.ts` first, before modules compute state paths. A fresh temporary HOME/TMPDIR, XDG directories, config, stub checkout and vault are created. Inherited credentials, proxies, unknown selectors, NODE_OPTIONS and PATH shims are excluded by an environment allowlist. Subprocesses use `process.execPath`. Negative tests demonstrate that HOME alone fails when an inherited state selector wins, using a **second temporary fixture**, never a real home. An inherited inconsistent root fails closed. Logs name rejected variables, not their values.

This is an **accident guard, not an OS sandbox**: code retains account permissions. The real Pi/OptChat bridge check remains explicitly opt-in and was **skipped**; no real binary/model/provider execution was performed. Disposable files are removed unless `EXO_TEST_KEEP` is explicitly set. Canonical-profile tests now create their own fixture; missing canonical profiles must not be initialized by runtime launch.

Commands used, with an absolute installed Node 24.15.0 executable (not a mise shim):

- Primary: `node --experimental-transform-types test/run-isolated.ts --test-isolation=none test/*.test.ts` — **28 pass, 1 skip, 0 fail**.
- A2UI: `node --experimental-transform-types test/run-isolated.ts test/*.test.ts` — **108 pass, 0 fail** across 15 files.
- Both: `node node_modules/typescript/bin/tsc --noEmit` under an allowlisted environment and temporary HOME — pass.

## Exact advisory review (#27)

- `advisories.json`: **52 distinct public GitHub advisory records**, exact GHSA/CVE IDs, affected ranges, first patched versions, severities and update timestamps.
- `audit-matrix.json`: **61 advisory/dependency occurrences**, exact npm/GitHub ranges, dependency paths, baseline/final versions, lock scope flags and final sanitized npm audit results for **all three independent lockfiles**. Semver comparisons were cross-checked (GitHub comma separators normalized); final fixed versions fall outside the relevant ranges.
- `test-results.json`: sanitized machine-readable test evidence. No raw provider response, inherited environment, credentials, authenticated URL or live-state content is collected.

Compatible fixes only; no `audit fix --force`, no major Zod override:

| Boundary | Changes | Final audit |
|---|---|---|
| Primary spike | Explicit Pi→Undici override 8.10.2→8.12.2; compatible Hono lock refresh | **0** |
| A2UI spike | Undici override; Markdown renderer→DOMPurify override 3.4.11→3.4.17; markdown-it→14.3.3; Hono→4.13.14 | **4 high package entries**, all one residual advisory; **0 critical** |
| Independent composition install | Zod **4.3.6→4.6.7**, within major 4 | **0** |

Overrides are scoped to the owning dependency, explicit in package.json and locked; version regressions are tested. They do not patch separately installed runtimes. Typechecks and offline workspace/composition tests pass; browser/advisory exploit regressions and final production artifact integration are not claimed.

## Residual / release classification matrix

| Risk | Scope and reachability | Required disposition |
|---|---|---|
| **GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404**, Zod `<4.6.6`, first patched `4.6.6` | **Production dependency of the legacy A2UI spike**: Zod3.25.76, direct and through A2UI React/web_core schema/peer contracts. Four npm package entries are propagation, not four distinct advisories. Whether this legacy graph is included in the new production artifact is **unknown**. | Release/security review required if shipped; do not inherit unnoticed. Migrate/test A2UI-compatible upstream versions, or review a bounded/backported fix and every untrusted validation ingress. Do not force Zod4 beneath A2UI3 peers. |
| Zod3 compatibility/impact | GitHub range covers Zod3; actual installed `zod/v3/types.js` array parser maps all elements and accumulates issues, even after max-length failure. Thus no claim of a Zod4-only issue. A2UI0.13 explicitly depends/peers on `^3.25.76` and exchanges schemas with application code; arbitrary Zod4 substitution is **outside declared compatibility**, not demonstrated impossible. Existing action/snapshot byte caps are partial ingress mitigations, not global reachability proof. | No major migration attempted. The separate composition Zod4 fix does **not** fix the root Zod3 graph. |
| DOMPurify advisories, including critical GHSA-cg2g-xh64-v4q7 | Browser markdown renderer dependency; fixed to3.4.17. That particular critical advisory requires SAFE_FOR_TEMPLATES plus DOM-output/shadow-root/template-evaluation conditions; inspected A2UI sanitizer passes an HTML string with default options, so that exploit configuration was **not established** here. Other advisories have different conditions, recorded individually. | Known critical dependency removed regardless; final browser bundle and renderer integration still need verification. Not declared generally unreachable. |
| Eight Undici advisories | Pi dependency is **dev-only in these plugin locks**, now8.12.2; installed Pi HTTP dispatcher uses Undici. A runtime installed elsewhere or shipped separately is **not patched** by these plugin overrides. | Bundle/lifecycle lane must verify its actual Pi/runtime graph and Node engine (`>=22.19.0`), not inherit a stale independent install. |
| Hono advisories | `devOptional`, **not equivalent to dev-only**; root dev declaration plus optional SDK peer, imported by SDK testing subpath. No direct Hono import found in either plugin source; final artifact inclusion/HTTP reachability unknown. Fixed4.13.14. | Verify actual production lock/import graph; do not dismiss based only on lock flags. |
| Final release | No built production artifact/lock review, real-Mac install/enable/restart/reopen, real-agent delivery or stock-BB integration performed. | #45/#50/#51 gates remain open; fixture success alone is insufficient. |

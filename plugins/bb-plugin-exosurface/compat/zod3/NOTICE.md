# Exosurface local Zod3 constrained-container backport

Based on MIT-licensed `zod@3.25.76`, upstream git revision
`50606616c0d291caf3210a7521da51271b918333`. The original LICENSE and all
upstream notices are retained unchanged. Modification author: Ember Cognition Inc.

Local version: `3.25.76+exosurface.1` (not an upstream release).
Mechanism ported from Zod commit
`a0ebf970f2d752e5f58527cd2942ff48be4f46bd`, merged PR #6652:
https://github.com/colinhacks/zod/pull/6652

Only `src/v3/types.ts`, `v3/types.js` and `v3/types.cjs` change executable
behavior. Arrays above an explicit `.max()` or upper `.length()` bound and sets
above `.max()` / `.size()` return INVALID immediately after the size issue,
before child parsing or async child dispatch. Zod3 maps have no corresponding
size-bound API; none is invented. No new schema constraints or accepted-input
limits are added. Existing package exports, declarations, schema/ref metadata,
converter and other runtime files remain unchanged. The package version and
this notice identify the locally modified artifact.

Expected compatibility change: already-invalid oversized constrained values
report size rejection without child issues, and outer refinements do not run on
those aborted parses. Successful accepted outputs must remain unchanged.
Unbounded containers and below-bound validation are unchanged. Existing v4
subpaths bundled by the upstream Zod3 distribution are NOT patched and are NOT
approved consumed entrypoints of this candidate. The SDK uses separate pinned
Zod4.6.6; do not route SDK consumers to those legacy bundled v4 subpaths.

GHSA-mrhx-c7xc-m3w5 / CVE-2023-54404 lists upstream versions <4.6.6. This local
3.25.76-derived artifact does not become upstream 4.6.6 and is not claimed to
clear version scanners. The backport's provenance and regression evidence
require independent review; no residual-risk acceptance is inferred. This fixes
the specifically ported constrained-container mechanism, not every possible
resource-exhaustion vector, recursive input, expensive refinement or async task.

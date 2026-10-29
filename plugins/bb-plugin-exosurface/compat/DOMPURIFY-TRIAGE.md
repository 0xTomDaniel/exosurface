# Bounded read-only DOMPurify triage (2026-10-29)

Historical snapshot at `0e21a2c`. The subsequently authorized scoped correction
and new graph/runtime evidence are in `DOMPURIFY-FIX.md`; statements below describe
the earlier unchanged3.4.11 graph, not the current corrected graph.

**`releaseReady:false`. No dependency, renderer, schema, provider or live state
changed. This is separate from the independently reviewed Zod candidate.**

## Installed version correction and exact graph

The c22ba24e prose incorrectly said DOMPurify3.4.16. That was an advisory upper
bound, **not the installed version**. The committed lock, installed package.json
and registry/installed markdown0.2.1 manifest agree on **DOMPurify3.4.11**. The
checkpoint's existing resolutions map was already correct. Artifact, package
manifests/lock, fresh-install/TAP/raw audit bytes remain unchanged.

Actual candidate production dependency path:

```text
@a2ui/react@0.13.0
  → @a2ui/markdown-it@0.2.1 (node_modules/@a2ui/react/node_modules/@a2ui/markdown-it)
    → dompurify@3.4.11 (node_modules/dompurify)
```

Markdown0.2.1 declares **exact** `dompurify:"3.4.11"` and peer
`@a2ui/web_core:"^0.13.0"`. Lock tarball:
`https://registry.npmjs.org/dompurify/-/dompurify-3.4.11.tgz`, integrity
`sha512-zhlUV12GsaRzMsf9q5M254YhA4+VuF0fG+QFqu6aYpoGlKtz+w8//jBcGVYBgQkR5GHjUomejY84AV+/uPbWdw==`.
These are not dev-only dependencies. Exact lock entries and public advisory
metadata are preserved in `a2ui-runtime/evidence/dompurify-triage.json`.

## Six distinct advisories (not six demonstrated exploits)

GitHub public advisory records match the six records already preserved by
PR#55/`52db1f334314e9872d2b2c53b6b2764de21981b4`, including ranges, first-patched
versions and update timestamps. npm's propagated parent package entries are not
additional distinct advisories.

| GHSA | Affected range | First patched | Required application conditions, abbreviated |
|---|---|---|---|
| [55q2-fjhq-7xh7](https://github.com/advisories/GHSA-55q2-fjhq-7xh7) | `<=3.4.12` | 3.4.13 | IN_PLACE plus hook removing an element; detached descendant resource handler |
| [c2j3-45gr-mqc4](https://github.com/advisories/GHSA-c2j3-45gr-mqc4) | `<=3.4.11` | 3.4.12 | CUSTOM_ELEMENT_HANDLING, afterSanitizeElements policy, custom-element HTML re-injection sink |
| [6688-9rhm-gjv2](https://github.com/advisories/GHSA-6688-9rhm-gjv2) | `<=3.4.15` | 3.4.16 | IN_PLACE Node input; force-removed rawtext root serialized/reparsed as HTML |
| [cg2g-xh64-v4q7](https://github.com/advisories/GHSA-cg2g-xh64-v4q7) | `>=3.4.4 <=3.4.16` | 3.4.17 | SAFE_FOR_TEMPLATES + DOM-return mode + attached shadow root + downstream template evaluator |
| [mrv2-3pqr-j5jr](https://github.com/advisories/GHSA-mrv2-3pqr-j5jr) | `<=3.4.16` | 3.4.17 | IN_PLACE hook removing parent/sibling; detached descendant handler |
| [c6gr-qvv4-5v3f](https://github.com/advisories/GHSA-c6gr-qvv4-5v3f) | `<=3.4.16` | 3.4.17 | application/xhtml+xml parser plus allowed animate/set and attributeName; SMIL href rewrite |

Semver checks using npm's semver implementation (GitHub commas normalized):
**all six cover installed3.4.11; none covers proposed3.4.17**. This establishes
advisory/version applicability, not application-specific exploit reachability.

## Runtime imports and inspected configuration

Existing spike `app.tsx:7` imports `renderMarkdown` from `@a2ui/markdown-it` and
provides it through `MarkdownContext` at the existing surface render sites.
`src/exo-components.tsx:5-12` uses the renderer and inserts its returned HTML.
The installed markdown `src/markdown.js:16-26` calls
`rawMarkdownRenderer.render(...)` then `sanitize(htmlString)`;
`src/sanitizer.js:16-44` imports DOMPurify and calls **`purify.sanitize(html)`
with one HTML-string argument and default options**. ESM resolves
`dompurify/dist/purify.es.mjs`; the CJS export remains
`dist/purify.cjs.js`. Raw Markdown uses the default `markdownit()` constructor.

No DOMPurify configuration/hook, IN_PLACE, SAFE_FOR_TEMPLATES, RETURN_DOM,
CUSTOM_ELEMENT_HANDLING or PARSER_MEDIA_TYPE was found in the bounded inspected
spike app/src/lib source. The six advisories' non-default exploit configurations
are **not established** on this inspected route. This is neither a general
unreachability proof nor a confirmed exploit, and no browser exploit was run.

Separate integration caveat: this compatibility harness locks markdown **nested
under React only**; its root application-level `@a2ui/markdown-it` import currently
returns MODULE_NOT_FOUND. The existing renderer imports that module directly.
Actual reuse must declare/resolve that existing module explicitly rather than
assume transitive hoisting. The candidate has not integrated/built/executed that
browser renderer. This is not a DOMPurify or Zod-parser failure.

## Smallest correction proposal — not implemented

Keep A2UI0.13, markdown0.2.1, renderer and Zod candidate unchanged. Replace only
the existing markdown override string with this scoped object:

```json
"@a2ui/markdown-it": { ".": "0.2.1", "dompurify": "3.4.17" }
```

Registry metadata confirms published DOMPurify3.4.17 is available/latest, with
ESM/CJS default exports and no peer/Node-engine restriction. Its tarball integrity
is recorded in the JSON; it was **not downloaded or installed** in this triage.
This intentionally overrides markdown's exact3.4.11 dependency, not an
incompatible peer. Markdown's core peer `^0.13.0` stays satisfied. Therefore the
proposal does not require core0.14/markdown0.2.2, a renderer rewrite or new limits.
Actual proposed-graph strict-peer installation still needs testing; metadata
alone is not runtime compatibility proof.

PR#55 already applied scoped markdown→DOMPurify3.4.17 with A2UI0.13 and recorded
A2UI108 passing tests, both spike typechecks and zero critical audit entries
(only four propagated Zod high entries remained). It did **not** claim a browser
exploit regression or production-bundle acceptance. The current harness did not
inherit that correction. Reuse/review its narrow fix rather than rediscovering a
broad upgrade; retain this harness's explicit markdown0.2.1 pin to avoid drift.

### Tests required if the correction is authorized

1. Fresh copied-cache/disposable graph, `npm ci --offline --ignore-scripts
   --strict-peer-deps --omit=peer --no-audit --no-fund`, then `npm ls`; verify only
   intended DOMPurify/dependency lock changes, A2UI0.13/markdown0.2.1 retained,
   actual sanitizer resolves3.4.17, and SDK separately resolves Zod4.6.6.
2. Re-run candidate19, legacy36 per graph, both declaration/source typechecks;
   reviewed Zod tarball/manifest must remain byte-identical. These existing passes
   currently apply to **DOMPurify3.4.11**, not the proposed update.
3. Isolated real-DOM markdown regression: ordinary formatting/links/classes and
   returned-string behavior unchanged; unsafe links/event attributes removed;
   no production sanitizer-option changes. Add bounded upstream-style tests for
   the six advisory configurations separately, without declaring those test-only
   configurations reachable in the application. No scripts/resources/providers
   outside the disposable local fixture.
4. Separately authorized fresh audit should drop the six DOMPurify advisories;
   the locally patched Zod3 version is still expected to be scanner-flagged.
   Preserve licenses/notices and inspect the final built renderer import graph.

No proposed fix test/install or dependency change was performed. Browser
textbox→press→independent owner→persisted page update/reopen is the next meaningful
product milestone; real inference/authentication, clean-Mac install,
lifecycle/reboot/minimum-Node and all release gates remain open.

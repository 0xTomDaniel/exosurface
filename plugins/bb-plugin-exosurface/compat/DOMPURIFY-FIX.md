# Scoped DOMPurify correction (2026-10-29)

`releaseReady:false`. Separate follow-up to read-only triage at `0e21a2c` and the
independently reviewed Zod artifact at `c22ba24e`. No renderer/provider/schema
rewrite, new input restriction, live configuration, paid inference or publication.

## Exact change

The compatibility graph now declares the existing app's direct import explicitly:
`dependencies["@a2ui/markdown-it"] = "0.2.1"`. Its scoped override is:

```json
"@a2ui/markdown-it": { ".": "0.2.1", "dompurify": "3.4.17" }
```

Strict-peer installation succeeds with44 packages. Markdown0.2.1 is now at the
application root (not only nested under React); both app and markdown's actual
DOMPurify resolution select3.4.17. The only logical lock changes are the root
markdown dependency, moving the unchanged markdown0.2.1 entry to the root, and
DOMPurify version/tarball/integrity3.4.11→3.4.17. Existing package versions and
notices otherwise remain unchanged. Markdown's core peer `^0.13.0` is satisfied;
no incompatible-peer override/core0.14/markdown0.2.2 upgrade is used.

This modifies the separately locked compatibility graph, **not** the production
plugin lock or live application. It provides explicit resolution for the existing
app's unchanged direct markdown import. Existing-UI integration remains separate.

## Actual proofs

`a2ui-runtime/evidence/dompurify-fix/` contains install output, complete npm ls,
parity TAP, real-browser JSON, typecheck receipt and fresh audit JSON.

- Fresh disposable `npm ci --ignore-scripts --strict-peer-deps --omit=peer
  --no-fund --no-audit`:44 packages. `npm ls --all --json`: exit0.
- Candidate19/19; original legacy36/36 against each Zod graph; both default and
  source-condition typechecks pass, including the explicit markdown import.
  SDK separately uses Zod4.6.6. Reviewed Zod artifact/manifest/patch/notices are
  byte-identical.
- Real headless Chromium131/Brave, disposable profile/HOME/cache, loopback-only
  fixture:9/9 runtime regressions. Actual A2UI markdown module imports the new
  DOMPurify ESM, whose version is asserted; Node/CJS resolution is also asserted.
  Browser markdown-it uses the installed package's UMD distribution through a
  small import-map adapter; raw outputs are compared against the installed Node
  renderer. Ordinary formatting/classes/Unicode/link output matches preserved
  DOMPurify3.4.11; unsafe attributes/protocols are removed with default options.
- Separate test-only non-default configurations exercise each of the six GHSA
  mechanisms. Rawtext-root removal **throws fail-closed TypeError**: the dirty
  input is not returned as sanitized output and must not be rendered after failure.
  Tests do not evaluate templates, activate SMIL links or execute event handlers.
  These are bounded structural regressions, not application exploit-reachability
  proofs or exhaustive DOMPurify coverage.
- All six saved public advisory ranges cover3.4.11 and exclude3.4.17, checked
  with npm's semver. Fresh audit: **0 critical,4 propagated Zod high, total4**;
  no DOMPurify entry. Audit exit1 remains expected. Local Zod provenance and
  mechanism evidence do not establish upstream/scanner clearance or risk acceptance.

## Portable repeat command

Run the copied-cache offline install/parity/typechecks from `README.md` first,
using a populated cache containing this corrected lock. Supply an absolute
installed Chromium executable and a preserved DOMPurify3.4.11 package directory
from the original reviewed graph. No existing browser profile is used.

```sh
: "${EXO_REVIEW_BROWSER:?Set absolute installed Chromium executable}"
: "${EXO_REVIEW_BASELINE_DOMPURIFY:?Set preserved DOMPurify3.4.11 package directory}"
run env EXO_REVIEW_BROWSER="$EXO_REVIEW_BROWSER" \
  EXO_REVIEW_BASELINE_DOMPURIFY="$EXO_REVIEW_BASELINE_DOMPURIFY" \
  EXO_REVIEW_NPM_CLI="$NPM" "$NODE" test/markdown-browser.mjs
run "$NODE" "$NPM" ls --all --json
```

The browser runner uses an isolated profile, mock keychain/basic password store,
disabled background features, an unreachable proxy for non-loopback traffic and
no provider credentials. This is same-account isolation, **not an OS sandbox**.
Fresh `npm audit --json` is a separate authorized registry read, not an offline
operation. No license/notice stripping or publish-guard bypass occurred.

The actual existing-UI textbox→press→independent owner→updated page→reopen
milestone is next. Real inference/authentication, clean-Mac install, minimum-Node,
lifecycle/reboot and release acceptance remain separate gates.

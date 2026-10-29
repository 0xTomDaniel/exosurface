# Existing-UI isolated browser round-trip (2026-10-29)

**`releaseReady:false`. Existing UI → production RPC → independent owner → MOCK Pi → durable page → fresh-browser reopen. NOT native BB, actual Pi extension loader, authentication or inference.**

## Scope and exact proof

`client.tsx` is a test-only mount/transport adapter, not another renderer. It uses
the existing, byte-identical `WorkspaceView`, draft store, official v0.9 React
`A2uiSurface`, basic/Exo catalogs/components, document style, theme and markdown
renderer. The report hashes every legacy source actually included by esbuild.
Only a synthetic light host palette and loopback RPC transport stand in for BB.
Neither spike, the production app/lock, reviewed Zod artifact/patch/notices nor the
reviewed sanitizer browser runner changed.

`src/page-renderer-adapter.ts` maps existing delivery/drafts/actions to the current
page RPC contracts. It does not parse/rewrite components, impose input limits,
trim/truncate values, invent event names, or seed pages. Edits are serialized and
acknowledged against current published data; an uncertain press blocks further
presses rather than retrying. It is not yet mounted in the production BB app.

The fixture uses **compiled production RPC handlers and Zod4 schemas**, plus the
unchanged owner service in a **separate Node process** and its real Unix socket /
`PiRpc` JSONL transport. Mock Pi manually registers the compiled page tools, reads
revision3 and edits the heading at revision4. It is not Pi's real loader. A
synthetic vault, binding and empty auth artifact are fixture-only, not bootstrap
or authentication proof. Page mutations require the existing socket; a separate
`launchctl` spawn tripwire makes any attempted service startup fail the run.

Chromium's real `Input.insertText` replaces the selected initial textarea value;
real pointer input presses the offered Send button. One edit and one press arrive
through the production contracts; all multiline Unicode/whitespace/literal HTML
text survives in browser, RPC, owner prompt and persisted data. There is exactly
one mock prompt and a `sent` dispatch receipt. The first browser exits completely;
a new profile/process reopens the same page, without changing its persisted bytes.

Latest final-source runs: `evidence/attempt-14` and `attempt-15`. Both browser
process groups and the independent owner exit0, without forced cleanup. The HTTP
server closes and temporary backend/browser profiles are removed. Browser:
Chromium131 via the explicitly supplied local executable. Evidence includes
screenshots, exact graph/runtime/source/bundle hashes and full synthetic payloads.
The copied-cache, offline strict-peer esbuild tool install succeeds (2 native
packages; other-platform optional packages are correctly absent). This tool-only
lock does not alter the compatibility or production graphs; no new audit result
or scanner clearance is claimed.

Adapter tests **5/5**; complete existing + adapter production tests **23/23**;
production typecheck and actual fixture-client/legacy imports typecheck pass.
Pinned browser sample: **901 UTF-16 code units /925 bytes**, NOT a >1000-character
browser acceptance case. Native follow-up must exercise >1000 characters with
exact end-to-end equality. The adapter unit fixture also preserves a much longer value independently of the
browser sample; this is not proof of every browser input bound or accepted input.

## Reproduce (no global/live state)

Use verified absolute paths, never an inherited Pi/BB/provider environment:

- `EXO_REVIEW_NODE`: Node24 executable; `EXO_REVIEW_NPM_CLI`: its npm CLI.
- `EXO_REVIEW_BROWSER`: installed Chromium executable (no live profile).
- `EXO_REVIEW_A2UI_RUNTIME`: disposable, offline installed corrected compatibility
  graph from `../README.md` / `../DOMPURIFY-FIX.md`, not an installed live plugin.
- `EXO_REVIEW_BACKEND`: disposable production package built with the existing
  isolated `bb plugin build` then `node build.mjs` route. Its `package*.json`,
  `server.ts`, `build.mjs` and existing `src/*.ts` must match this checkout; its
  production dependencies and `dist/server.js` are copied, never modified in place.
  Independent reproduction should rebuild that artifact, not infer provenance
  solely from the source-match guard. Full production tests also need `dist/host.js`.
- `EXO_REVIEW_NPM_CACHE`: an explicitly copied, prepopulated cache containing the
  pinned esbuild/native optional package. A cold offline cache must fail; do not
  silently enable network or run install scripts.

From this directory, with those variables configured:

```sh
set -eu
TASK=$(mktemp -d "${TMPDIR:-/tmp}/exo-ui-review.XXXXXX")
mkdir "$TASK/home" "$TASK/tmp" "$TASK/tools" "$TASK/evidence"
cp package.json package-lock.json "$TASK/tools/"
(cd "$TASK/tools"; env -i HOME="$TASK/home" TMPDIR="$TASK/tmp" \
  PATH="$(dirname "$EXO_REVIEW_NODE"):/usr/bin:/bin" \
  npm_config_userconfig=/dev/null npm_config_cache="$EXO_REVIEW_NPM_CACHE" \
  "$EXO_REVIEW_NODE" "$EXO_REVIEW_NPM_CLI" ci --offline --ignore-scripts \
  --strict-peer-deps --no-fund --no-audit)
env -i HOME="$TASK/home" TMPDIR="$TASK/tmp" \
  PATH="$(dirname "$EXO_REVIEW_NODE"):/usr/bin:/bin" \
  EXO_REVIEW_BROWSER="$EXO_REVIEW_BROWSER" \
  EXO_REVIEW_A2UI_RUNTIME="$EXO_REVIEW_A2UI_RUNTIME" \
  EXO_REVIEW_BACKEND="$EXO_REVIEW_BACKEND" \
  EXO_REVIEW_BROWSER_TOOLS="$TASK/tools" EXO_REVIEW_EVIDENCE="$TASK/evidence" \
  "$EXO_REVIEW_NODE" roundtrip.mjs
# Retain evidence before removing your disposable TASK. No automatic retry.
env -i HOME="$TASK/home" TMPDIR="$TASK/tmp" \
  PATH="$(dirname "$EXO_REVIEW_NODE"):/usr/bin:/bin" \
  "$EXO_REVIEW_NODE" --experimental-transform-types --test \
  ../../test/page-renderer-adapter.test.ts
```

The browser has a hard **20-second deadline including shutdown**. Timeout,
nonzero exit, a remaining process group or forced cleanup is a failure, even if
all UI assertions already passed. On failure the fixture writes `failure.json`
and/or `cleanup-failure.json`; do not discard a failure after a passing retry.
The wrapper owns and cleans only its disposable process groups, loopback server
and directories. Scrubbed same-account execution is **not an OS sandbox**.

Typechecks used an isolated production copy with current sources and
`node node_modules/typescript/bin/tsc --noEmit`. The client check copied the
fixture files plus byte-identical legacy `src/`/`lib/` under `legacy/`, added the
adapter and pure snapshot-data types, resolved only the corrected candidate graph,
and included `client.tsx` with strict/bundler/ES2022/DOM/react-jsx settings.

## Failures are evidence, not success

See `FAILURES.md`. Development attempts1–7 and startup-failure attempt9 are
retained alongside earlier passes8/10/11/12/13. Changes between those development runs
are explicitly described; they are not unmodified repetitions of final code.
Existing unit-test teardown also leaves state-only directories (recorded and
explicitly removed after capture); TAP23/23 is not directory-cleanup acceptance.
Initial adapter-unit and incompletely staged production-test failures are also
retained, not relabeled as product defects. Portable committed text mechanically
normalizes worktree/temp/home path prefixes only; `evidence/retained-files.json`
records original and committed SHA256 values. Original raw files remain in the
operator's disposable evidence root. No source/license/provenance notice was
removed. No merge, publication, guard bypass, live state or provider call occurred.

## Remaining boundaries / smallest next native proof

The production app still has its existing reply-page/ThreadChat shell. Native BB
slot/RPC/provider integration, actual Pi extension loading, inference/fresh-owner
authentication, lifecycle/reboot/minimum-Node/platform/layout and release gates
remain open. No native-BB or visual acceptance is inferred from these screenshots.

Next smallest proof: start a **fresh isolated BB instance** with the existing
production extension, synthetic project/thread/state and already-started mock
owner; invoke registered pageRead/edit/press through BB's real extension RPC
transport, observe the owner-written revision, then reopen its native slot. Keep
renderer and protocol unchanged. First determine the existing BB transport entry
and startup flags; stop if it requires live state, provider calls, installing a
second renderer or widening dependency adoption. Actual reused-renderer native-slot
mounting remains a further explicit gate, not something this loopback proof closes.

Separate test-only cleanup correction and exact affected tests/paths: `TEST-TEARDOWN.md`.

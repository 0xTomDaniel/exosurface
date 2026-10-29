# Command record

All commands below ran only in `/tmp/exo-native-source.RVkor2` and the two owned release worktrees. No network preparation, `ignore-scripts`, peer overrides, fake dependencies, launchctl invocation or real provider dispatch. `run-step.sh` captures stdout/stderr/exit, sets scrubbed env, explicit offline npm and guard, and changes to its supplied private cwd. Failed attempts are kept separately. Paths in these files are evidence, not portable commands to execute against a live HOME.

```sh
R=/tmp/exo-native-source.RVkor2
NODE=$NODE_PREFIX/bin/node
NPM=$NODE_PREFIX/lib/node_modules/npm/bin/npm-cli.js
SOURCE="$R/source/plugins/bb-plugin-exosurface"
TOOL=$RELEASE_BUNDLE_REPO/tools/release/exo-release.mjs
BB=/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb
```

The source clone was advanced using only local shared git objects to clean producer387acf9. No fetch/download. Initial supported build hit readonly source-clone dist; `chmod -R u+w "$SOURCE/dist"` applied only there, never to either sealed artifact/release. Actual BB build ran in scrubbed private HOME/TMPDIR/PATH with `NODE_OPTIONS=--require=$R/tripwire.cjs`, private `BB_DATA_DIR`, then:

```sh
"$NODE" "$BB" plugin build "$SOURCE"
"$R/run-step.sh" fixed-artifact-build "$SOURCE" "$NODE" "$TOOL" build --package-dir "$SOURCE" --out-dir "$R/fixed-artifacts"
"$R/run-step.sh" fixed-artifact-verify "$SOURCE" "$NODE" "$TOOL" verify --artifact "$R/fixed-artifacts/exosurface-0.1.0-dev"
"$R/run-step.sh" fixed-source-closure "$SOURCE" "$NODE" "$SOURCE/test/consolidation-source-closure.mjs" "$SOURCE" "$R/fixed-artifacts/exosurface-0.1.0-dev/plugin"
```

Install used a fresh private HOME/prefix, all three separate consents scoped to that stopped disposable fixture, existing approved private npm cache, real npm, and the inspected installer guard. No same-version immutable release overwrite:

```sh
env -i HOME="$R/fixed-home" TMPDIR="$R/tmp" \
 PATH=$NODE_PREFIX/bin:/usr/bin:/bin:/usr/sbin:/sbin \
 NODE_DISABLE_COMPILE_CACHE=1 EXO_NATIVE_ROOT="$R" NODE_OPTIONS="--require=$R/installer-tripwire.cjs" \
 "$NODE" "$TOOL" install --home "$R/fixed-home" \
 --artifact "$R/fixed-artifacts/exosurface-0.1.0-dev" --vault "$R/vault" --node "$NODE" \
 --accept-full-access --accept-build-scripts --bb-disabled --npm-cli "$NPM" --npm-cache "$R/cache"
```

`--bb-disabled` was not treated as stopped proof: the earlier failed server had exited0 and no fixture runtime processes/listener remained before this install. The copied `launch-fixed.py` records exact server argv/env and private loopback/data/profile settings; `ports.json` pins server49173 and reserved daemon. No host daemon or independent real owner was launched.

```sh
env -i HOME="$R/fixed-home" TMPDIR="$R/tmp" PATH=/usr/bin:/bin \
 /usr/bin/python3 -B "$R/launch-fixed.py" "$R"
# Native CLI: same scrubbed HOME/TMPDIR/PATH, tripwire.cjs, EXO_NATIVE_ROOT,
# BB_DATA_DIR=$R/bb-data and BB_SERVER_URL=http://127.0.0.1:49173:
"$NODE" "$BB" plugin install "$R/fixed-home/Library/Application Support/Exosurface/bb-source" --yes --json
"$NODE" "$BB" plugin list --json
"$NODE" "$BB" thread create --help # help only; no thread was created
```

Initial `ui-smoke.mjs` rendered the detached native shell; its copied `shell-ui-smoke.mjs` is retained. The final test adds only synthetic fixture files/Unix command mock and uses the actual served BB frontend/RPC. It does not create native DB rows, start a provider or invoke a valid action button. Browser path/hash/args are recorded in `browser-inspection.json`; `ui-tripwire.cjs` adds an exact pinned browser spawn to the unchanged network/write guards, not an arbitrary child exception. The guard does not mediate Chromium native internals.

```sh
env -i HOME="$R/fixed-home" TMPDIR="$R/tmp" \
 PATH=$NODE_PREFIX/bin:/usr/bin:/bin \
 NODE_DISABLE_COMPILE_CACHE=1 EXO_NATIVE_ROOT="$R" NODE_OPTIONS="--require=$R/ui-tripwire.cjs" \
 "$NODE" --experimental-transform-types "$R/ui-smoke.mjs"
"$R/run-step.sh" fixed-dispatch-focused-retry "$SOURCE" "$NODE" test/consolidation-dispatch.mjs "$SOURCE"
"$R/run-step.sh" fixed-input-regression "$SOURCE" "$NODE" --experimental-transform-types --test test/consolidation-input.test.ts
```

Configured tsc used source's actual `node_modules/typescript/bin/tsc --noEmit`; optional full declaration audit additionally `--skipLibCheck false`, exit2 retained. Actual-handler test's initial SDK helper import was replaced by a registration-only test API, not a dependency shim.

Graph and relocated test retries used scrubbed environment as `run-step.sh`, but `regression-tripwire.cjs`, `npm_config_offline=true` and exact inspected child-command allowances:

```sh
"$NODE" test/consolidation-graph.mjs "$SOURCE" "$R/fixed-artifacts/exosurface-0.1.0-dev/plugin"
"$NODE" test/consolidation-relocated.mjs "$R/fixed-artifacts/exosurface-0.1.0-dev/plugin"
"$R/run-step.sh" fixed-artifact-post-native-verify "$SOURCE" "$NODE" "$TOOL" verify --artifact "$R/fixed-artifacts/exosurface-0.1.0-dev"
```

After first loaded run, signal only recorded owned server PID, allow orderly shutdown, retain loaded-run logs, verify health refused and fixture processes absent. Restart the same pinned server/private BB DB; `plugin list --json` reports running; read-only native workspace RPC returns persisted synthetic revision2. No owner mock was restarted for that read. Signal only restarted owned server PID and verify exit0/refused health/no listener/no fixture runtime processes and absent owner socket.

```sh
kill -TERM "$(cat "$R/server.pid")"
curl --noproxy '*' --max-time 3 -sS http://127.0.0.1:49173/api/v1/health
/usr/sbin/lsof -nP -iTCP:49173 -sTCP:LISTEN
```

All waiting used short calls, not unbounded waits. `native-summary.json`, `native-input-equality.json` and `teardown.json` summarize the exact final observations; raw stdout/stderr, failure attempts and guards are retained adjacent.

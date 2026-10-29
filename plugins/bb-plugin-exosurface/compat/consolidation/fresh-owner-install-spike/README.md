# Bounded fresh-owner installation checkpoint

Author run, 2026-10-29. Source checkpoint `57819800fd466cdd270cfc25ba630d21d5778db7` on `spike/fresh-owner-install`, based on private main `819d07d1bdcdf318cc3dce9047ac148944b9eab3`. Original worktrees and raw evidence are preserved locally. This record describes the author's run; the subsequent focused independent review passed 24/24 targeted tests and six zero-native-call RPC refusals, not the broader author checks or real desktop interaction.

Integration copies replace personal absolute paths with `/work/exosurface`, `/work/pi-optchat`, `/opt/node` and `/home/operator`; raw originals remain local at the source checkpoint. These text records are not a newly sealed artifact or a rerun. Runtime source/tests are unchanged from that reviewed checkpoint.

## Implemented

- Only the explicit public setup RPC, after strict validation of literal `authorizeInitialization: true`, constructs an authorized public BB native adapter. The ordinary/default adapter remains false. UI availability is distinct from default dispatch permission and explains the native-conversation consent.
- Existing exact-operation setup/recovery, one-thread/session binding, normal-resume refusal, no-inference initialization, runtime-directory link protections, model IDs/order, input limits and renderer are retained.
- Preserve an explicitly configured isolated `ownerLabel`, rather than requiring the existing shared owner label.
- Replace the historical candidate guide with the actual consolidated schema/commands and an explicit human prerequisite: [`docs/release/first-run.md`](../../../../../docs/release/first-run.md).

## Performed checks

| Check | Result / scope |
|---|---|
| Locked offline root / nested installs | 272 / 45 packages; locks unchanged; existing approved npm cache |
| Focused canonical tests | 24/24, no skips; synthetic transport/files; default-deny + explicit BB adapter arguments + isolated label preservation |
| Public RPC registration/schema | Six unauthorized/malformed requests refused, native calls 0, state existence unchanged; `rpc-auth.*`; not a native host |
| Full synthetic tests | 52/52, no skips/cancellations; `full-unit-final.*`; existing exact-fixture subprocess allowlist |
| Configured strict TypeScript | Exit 0; `types-final.*` |
| Public BB plugin build | Exit 0; nine fresh server/app/host outputs/maps; `build-bb-final.*` |
| Owner/runtime build scripts | Exit 0; `build.*`, `build-runtime.*` |
| Actual isolated BB server and CLI registration | BB 0.45.0, SDK 0.6.15; plugin running, provider `exo-spike`, both stream services; `registration-summary.json` |

The first full-suite attempt used the setup-only guard and refused five existing synthetic fixture subprocesses (47/52 passed). That failure is retained as `full-unit-attempt-setup-guard.*`. The bounded rerun used the pre-existing regression guard's exact fixture source/literal checks; no broad subprocess/network permission was added. The local initial npm invocation from the repository rather than plugin root also failed; corrected root/nested commands passed. Initial registration refused checkout `dist` writes under a disposable-root-only guard; the approved selected checkout/build path was then explicitly included. These raw attempts remain in the local evidence root, not rewritten as passes.

Test command shapes (absolute Node 24.15.0, explicit HOME/TMPDIR/PATH/config, no inherited keys):

```sh
cd "$PLUGIN"
# PROOF_ROOT=$R; NODE_OPTIONS selects the retained setup/build or exact-fixture guard.
"$NODE" --experimental-transform-types --test test/canonical-setup.test.ts
"$NODE" --experimental-transform-types test/canonical-rpc-authorization.mjs "$PLUGIN"
"$NODE" --experimental-transform-types --test --test-isolation=none test/*.test.ts
"$NODE" node_modules/typescript/bin/tsc --noEmit
```

The updated `canonical-real-local.mjs` authorization assertions were not rerun as a new real-profile proof in this checkpoint. Earlier public-CLI/profile/mock-native proofs remain historical evidence, not real native-dispatch or provider inference evidence for this change.

## Exact stopping boundary

Local evidence root: `/private/tmp/exo-fresh.ZakOg7` (pointer `/tmp/exo-fresh-install-path`). Private selectors: HOME `h`, TMPDIR `t` (regressions `tmp`), BB data `bb`, canonical state `s`, OptChat home `o`, config `config.json`; backend ports 49203/49204. Configured owner label `app.exosurface.owner.ZakOg7`. Only approved OptChat source `/work/pi-optchat` was selected. No credential or private-memory source was copied.

The installed **headless server** started and public `plugin install <checkout> --yes --json` registered the plugin. The actual host-daemon entry then refused: `Missing host bootstrap material. Provide BB_HOST_ENROLL_KEY or populate .../bb/auth.json first.` No such material was manufactured. Public `machine create --provider manual --key exo-fresh-native-machine --json` failed: `Sign in to your bb account to use bb connect`. This left a failed machine record in this disposable server only; no enrollment key, successful machine enrollment or account login resulted. Do not publish any future private bootstrap output.

The desktop was **never launched**: no documented BB userData/single-instance profile selector could be established, and no guessed Chromium/Electron switch was used. No account login was initiated. The login/enrollment error belongs to this separate headless test route, **not an established desktop plugin installation requirement**. The current guide leads with normal desktop installation; it does not ask an installer to enroll a manual machine to accommodate our test. The loopback-only guard cannot perform external auth; any normal auth/network-policy transition requires explicit operator approval.

`guard.cjs` is a parameterized copy of the actual local server accident guard (`SPIKE_PLUGIN`, `SPIKE_OPTCHAT`, `EXO_NATIVE_ROOT`). It retains loopback-only networking, selected checkout/disposable writes, the pinned private BB compiler and exact no-inference initialization helper/CLI allowance. It does not bootstrap BB, permit account/provider login, or instrument every scrubbed child; it is not an OS sandbox. Build/regression guards and exact original invocations remain under the local evidence root.

## Not proved / deferred

No actual native setup dispatch/binding, retained owner for a new native binding, provider login, inference, conversation, Exosurface page action, or reopen smoke occurred. UI text/build inspection is not rendered UI evidence. No clean-Mac, launchd/reboot, new artifact sealing, distribution, licensing/security qualification, publication, deployment or merge was attempted. `releaseReady:false`.

The stopped checkpoint has no BB auth.json, no OptChat canonical home, and only an empty stream-created canonical state directory. The recorded server/daemon PIDs are gone and private ports 49203/49204 are closed (`checkpoint-teardown.json`). No owner or desktop was started; live BB was not restarted. Evidence and the failed disposable machine record remain for review. Account/server/machine cleanup would require normal BB actions and operator approval if login/enrollment is later authorized.

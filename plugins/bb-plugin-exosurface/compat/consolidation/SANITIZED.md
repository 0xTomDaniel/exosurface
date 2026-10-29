# Sanitized evidence derivatives

This private-repository copy is a single squashed import of local branch `release/first-run`
at `6f61ff2bb110be0dca21b2593c42f5f238fe9ddf` (tree otherwise byte-identical). The commit SHAs
cited in these notes (`387acf9`, `ca0d211`, `536d605`, `ebe66b0`, `6f61ff2`, ...) are that local
history; it is not uploaded because its raw evidence contains machine-specific paths.

The files below are **sanitized derivatives** of the original evidence. The originals, with
their original hashes, remain only in the local unsanitized branch/worktree. Changes are
limited to these mechanical substitutions:

| Original | Placeholder |
| --- | --- |
| local Node 24.15.0 install prefix | `$NODE_PREFIX` |
| local `first-run` worktree checkout | `$EXOSURFACE_REPO` |
| local `release-bundle` tooling worktree | `$RELEASE_BUNDLE_REPO` |
| local account name in `ls -l` output | `<user>` |
| disposable `bbSource.token` receipt UUIDs (throwaway `/tmp` fixture homes) | `<redacted-receipt-token>` |

Replay scripts now read the Node prefix from the environment: shell uses
`${NODE_PREFIX:?}`, Python `os.environ['NODE_PREFIX']`, tripwires `process.env.NODE_PREFIX`
(unset fails closed: tripwire comparisons stop matching and deny). Recorded outputs, exit codes,
timings and all other content are unchanged; `/tmp` fixture paths are retained.

Checksum lists that covered changed files (`native-hook-evidence/SHA256SUMS`,
`canonical-session-proof/SHA256SUMS`) were regenerated for the sanitized bytes and verify with
`shasum -a 256 -c`. Artifact manifests (`44cb0156…`, `ea25fb27…`) are unaffected: no shipped
payload changed. `esbuild-0.25.12-binary.sha256` refers to an external binary, as before.

| File (under `compat/consolidation/`) | Original sha256 (local `6f61ff2`) | Sanitized sha256 |
| --- | --- | --- |
| `README.md` | `a000410ce2161d4ad9f04cbeecee9f5d2efe48c319adb60707d572e910c562f9` | `2d8329c361cde3d385c14897a46e0e4f7f68925c88efb8498a9ee8ef7a11e528` |
| `REPAIR.md` | `f019d8187a5911a8e7a9adf870e1d266f9fd937aa8234191357c5dfb45927e2e` | `068d31229db976413df71fc436425c48d8858ebb12b866e0849b77a38426c8ac` |
| `canonical-session-proof/README.md` | `93849d5b8467435fe6ef9e848dca65798c8de445ae70bf533d73bab37877d7fb` | `d9c3a1235241a99207d8def0373a50d708b73376591f6c52fe92b23d2090e2db` |
| `canonical-session-proof/SHA256SUMS` | `2d4a577a6e3238d42f1f746a660d476196f02ca654379ed42eef531d3f51c7a4` | `f3da2764c8a21c6534606b245a2ef8788569f4e0330621779c3a7d23b30d6e82` |
| `canonical-session-proof/rpc-proof.py` | `79e96fbe606b68aaa9a38fcad4535bb00f2f75f679f8efe960c7630eded73227` | `7519ce560852d013910a6ffc7df5399f46344da743eef81d91e15bfaf9d00a81` |
| `evidence/typecheck-repeat.log` | `be9236bbb86254bae8e2d4a48b4ab250d85f6bebc715bdf48b8ab34618d807ff` | `7dcafb4688476c7aeb0ea9a3fbf335d026272781cfdcd2ed046d22a09308aca4` |
| `native-hook-evidence/SHA256SUMS` | `c77d12327f8be3040992226595c59468a83cb3194a2944ffbf8231ce2699e61c` | `7a00f42e755e06431bb6edf5f2c39c6c5867fe140278edeab0c8331b11cb24d3` |
| `native-hook-evidence/attempt-1-installer-npm-root-ci.json` | `bb2b481794839dbb9825ffbf25ea264f049d83ff29146ff30ddebc746a7c8760` | `752bf032942370978608d8877b73e4109fd8d255fac1f69473bc1272be6cdaf9` |
| `native-hook-evidence/attempt-1-native-server-invocation.json` | `2cff377a3b69465749f079a80e6c64a6b3b00d79428e3d6b27fd125e41496ef4` | `fd6ac5683c6500684996482c699224ddfb7484462f9e0e7abe7effb12f3985f5` |
| `native-hook-evidence/commands.md` | `85ba9cb6c60949181cb312b06bce47cf9774dccfdddadc41810bc69420755874` | `e40133b1668051d78f78b304dda253205393c4c6ed1de871b27584c5fccd626c` |
| `native-hook-evidence/fixed-graph.stderr` | `072068abba2e48fc1da0e0995da0e88a5978dbaece32edac1cf8cf13a438e113` | `b553dd5fbe9125e2e64695355ac1bc7228aa581f481a1d3cfbbfed83ef2cef0d` |
| `native-hook-evidence/fixed-install.stdout` | `b05aa48b6c591e9c0faa86940e4e5974b1aa7cf02504a9b8fd9a72dcb10c1d04` | `b0cc260130a59f6229089ef761d282e33dafc8d744c55cb2fa7d491a26aa196b` |
| `native-hook-evidence/fixed-relocated.stderr` | `aa79835b8e818cd26368608949d3d9d83179de983279daadf02b2d9cc2b415aa` | `e329fb1b05b6973bfbdaf9c7b52d81d0e831e8513df5e1c5d3a7a473aadc1142` |
| `native-hook-evidence/installer-npm-root-ci.json` | `6e4c09bbdd8a0d32ef12b2b4736c5b5c07e6943d44687e113ef78b8c64a945bf` | `3f509cab857792fe692d860c99aabbb6fef81cb279108daccbf00018533d5298` |
| `native-hook-evidence/installer-npm-root-ls.json` | `5f55a381cfa0762dbf1b9d3c1effe11f81b4ce0c3da7f6820044e2785259f0cc` | `bb71de2cb36b3879a039e94f0fa6e356590384f024c422a5ce00a28a845a7b55` |
| `native-hook-evidence/installer-npm-surface-ci.json` | `8616f73645ad0d577e5fd62e79f29be8061dbc18522a545f2ddd1749ca6b9f84` | `520c1d4cb93f246e85dd3cc297c46a532b28640a857eacaa9b92a1d01013686c` |
| `native-hook-evidence/installer-npm-surface-ls.json` | `c79c021126f66bd042f7ea2c95240e97aa85930b11dc8440e7bcaf81de7017e1` | `b21292d191382cc5e9c2c2c0b202934954f3180ed4711460d451e111a47f9db2` |
| `native-hook-evidence/installer-tripwire-attempt-1.cjs` | `f3f57d4afe2c01f3004b0f0b568fd06caabaa51e4b1835253ac45d9cca4b91ad` | `641ab73e23f5f9646d7b2cc2ae87379270ff15e539d5fb86e2916a608eec1bea` |
| `native-hook-evidence/installer-tripwire-attempt-2.cjs` | `44d66f3b81b67e46e3877f95bf53e918f27c8d19d986a9c13c2251e558fbfc7f` | `afdd632135e05f27ba27331d2f9131c57997a54221baa0bb33e624e4b3b9f72d` |
| `native-hook-evidence/installer-tripwire.cjs` | `44d66f3b81b67e46e3877f95bf53e918f27c8d19d986a9c13c2251e558fbfc7f` | `afdd632135e05f27ba27331d2f9131c57997a54221baa0bb33e624e4b3b9f72d` |
| `native-hook-evidence/launch-fixed.py` | `43a71252f849f3763473f3fd9c6e3f0749c71e35248addb48b1086477f853f4a` | `92bbca499f0852b7862485abe1a0c042ed691151cfdbc60573ea76132d0f4fd4` |
| `native-hook-evidence/launch.py` | `c6053971e546dbc43ad499d1ab6ca1ccacd73ef0a20781624c310b2bcada8a6c` | `2bcb3feeea2199a10ce4b6f3f93484a56e8f4153ef60252862da1650a1dff396` |
| `native-hook-evidence/loaded-run-native-server-invocation.json` | `7803cea76979afa0648f4e4910a1a8ac3f41ce88e9f2b3a21f799e5e28384c81` | `dce9a1d2077a932cf7ba65b4756bb6bc3a6894960eb2250b3fac5a420450f6e6` |
| `native-hook-evidence/native-server-invocation.json` | `7803cea76979afa0648f4e4910a1a8ac3f41ce88e9f2b3a21f799e5e28384c81` | `dce9a1d2077a932cf7ba65b4756bb6bc3a6894960eb2250b3fac5a420450f6e6` |
| `native-hook-evidence/pinned-install-retry.stdout` | `d6d7a904ceb4194440761bb7a692404123f512e98f3f27b7319ec42f9eb4bc92` | `fddcf40f2927f4dfa02ae2fb9cd3bcbb8acaf36a4a2706d2b5bee33eec437a92` |
| `native-hook-evidence/producer-5007e44-installer-npm-root-ci.json` | `58e27f0c677abab3961ae03870575ea95a8c594dbd4bf6d43b98cbe8ae017206` | `c42faa02c941e0414471d82b3f7699292067deff5e3248e5b3a21291e0f0f877` |
| `native-hook-evidence/producer-5007e44-installer-npm-root-ls.json` | `b1c46af39ffa5dd48c519261b79c7981835b59a7f313247cf18d06d01cd7f849` | `f8a514238b4e52254156b129a7f60a67f7c4d4e1f40e525837fdd7688b1adfdd` |
| `native-hook-evidence/producer-5007e44-installer-npm-surface-ci.json` | `f682b5d696b2a3bc2aa65fd41191631344357388bf0a446bbfcdad3a93a3fd36` | `61e6182c6774abb64267e5190f02e46ec2b47c19dbd0f2a076d03f804ff6cf53` |
| `native-hook-evidence/producer-5007e44-installer-npm-surface-ls.json` | `96ef2879d25bf7319d218dbae4d2ad843ee62473195f2fe206e57fdc2d1f0a1a` | `8358cb4722ed84761ebcb819609b409e11e26ffcec25f44728ff6e8194795c22` |
| `native-hook-evidence/regression-tripwire.cjs` | `d63e45341383d34f894e5fbf134c3ae76eed59a47002a4a39244fbf1f69c9f09` | `793010a9ba3a22cbd32bd041c564a4059f4273c5cb35d1a395beaed159aad429` |
| `native-hook-evidence/run-step.sh` | `b546ddd6d6eeab23aca44f1d4fa0ec62bdd640fb79f67e49898ee63420097c77` | `3ea997e8fdf3949ce2528c0967e061e91552861ab453b958323326f3fcf12d5c` |
| `native-hook-evidence/tripwire.jsonl` | `c5f975e0601e43a7216e1866a4efeb61aa9bcdfd86974d3776c5a071e8e2cc2c` | `63337d216c3396229a64d7c336460747149d236061b4ae0ec1741359fb032ce4` |
| `native-prerequisite-evidence/attempt-1-native-server-invocation.json` | `35d6fa4fccda0a7686d17711816218ea879df03d62ab23e503cf26ba92ef410d` | `324ea02b7ef071e0788b90570910f82fd6be0347e51d3a0f1a4f32acb416e6bc` |
| `native-prerequisite-evidence/attempt-2-native-server-invocation.json` | `35d6fa4fccda0a7686d17711816218ea879df03d62ab23e503cf26ba92ef410d` | `324ea02b7ef071e0788b90570910f82fd6be0347e51d3a0f1a4f32acb416e6bc` |
| `native-prerequisite-evidence/copied-artifact-modes-before.txt` | `17040c2edd39ad92babf7759e18a383f13b3f57b34198499af292d80dcb920a4` | `ddcf2fb2789d3c75fab1d9a7e9c2e220225680b0e0c52c31a24c663af45d29ba` |
| `native-prerequisite-evidence/launch.py` | `c6053971e546dbc43ad499d1ab6ca1ccacd73ef0a20781624c310b2bcada8a6c` | `2bcb3feeea2199a10ce4b6f3f93484a56e8f4153ef60252862da1650a1dff396` |
| `native-prerequisite-evidence/native-server-invocation.json` | `35d6fa4fccda0a7686d17711816218ea879df03d62ab23e503cf26ba92ef410d` | `324ea02b7ef071e0788b90570910f82fd6be0347e51d3a0f1a4f32acb416e6bc` |
| `native-prerequisite-evidence/plugin-install.stderr` | `9b417fe1bfbaa7eff39aadf1c5d4db8149cf47cc3853c0abce1b46c37ae3b3c0` | `6eafe283f80ea07fba8d4591982650363eb3243b808fb9534fc3cb6cf711f0b1` |
| `native-prerequisite-evidence/plugin-install.stdout` | `9f06be8645ea1b373253a664972951e07eedc6eb1fce279594c525cd211d9deb` | `acea54287b51c37eb5fb7ed49e8926b10234b48caa8b1fd44d7062ac8c468bc3` |
| `native-prerequisite-evidence/tripwire.jsonl` | `2add3d7c4f9a9ddbe2dea39c902bbae38df95fd2332ad4dca959a887151825c3` | `a06742bb006ed9d9acc9ff94b6bcb74f0204b5ec8c3850a4abd271cd89cf8b5c` |
| `repair-evidence/committed-fetch.log` | `2d4f4ad92df4f811650cd5f323bce96d8c00e07a1db97c9a4b345eba9a3328f9` | `82b4ffc8c328dc188c0866e230a0060cd3b5bf1ecbb05dd923525bc981c79a47` |
| `repair-evidence/relocated-exact-invocations.json` | `7a0cc3b2402dc02da86eb5a964ca3a3148dc1ac713441cf12e0f785e8ebc0adc` | `e78efa5e4c8957fc2f5c1a56bc599547ae2bf6cc586042cd6913cc49371e66bb` |
| `repair-evidence/run-clean.sh` | `6b5a69df485476e4e0e0e08d50b7a29265ec866ed4eb7f6fb0ef0ccade34bd8a` | `aeef6ed7643ea8f1d489a440419d2d3044c5087f86d966a90d0fb134ca749e3c` |
| `repair-evidence/run-committed.sh` | `b5e85e4a567190fd7a62ebc03153a415491da7dde1aa785aa262bec39c68fc45` | `34dc95230ce392c2f66f664507f04bd9e8af94c90108d9bbc4244b69332e0aaa` |
| `repair-evidence/run-step.sh` | `25cca22caa30dbca9522241a2deca248493e6a759e8a277981aa0f7471de2221` | `8246fef5444b0729530ed810af8fa44ee61d06513ea8229f19434d07e2fd2cbe` |

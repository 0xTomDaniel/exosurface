# Canonical setup prerequisite — partial proof, not owner acceptance

Baseline producer `387acf93138976559881b89b1d0a886f3cebb00b`, native evidence
`ca0d2110a3d461fe2e94236658f376cca90d5446`, tooling
`36816b2d711e5a2f7463c3428f9a51b2f46a0db0`, independent review
`c70add5b79a7eadb5222464ef0762c4f8323c07a` remain fixed. No production source,
lock, dependency graph or release artifact changed in this checkpoint.

## Observed

- Pi **1.1.0**, nested pi-codemode **1.4.0** exactly match the approved lock.
  Pi declares codemode `^1.1.0`; lock resolutions/integrities and exact inspected
  file hashes are retained in `provenance.json`. This is **not cache drift**.
- Importing the declared public SDK root (`dist/index.js`, export `.`) fails
  during module linking: `MCP_TYPESCRIPT_PREAMBLE` is absent from the installed
  public codemode declarations export. Same failure in source graph and actual
  receipt-owned installed graph; both exit1 before creating any session.
- Supported **bundled CLI** is different: it embeds the declarations (including
  that symbol), does not use the failing public SDK root, and `--help` exits0.
- With bundled CLI, an explicit test-only extension uses the documented public
  `ExtensionCommandContext.newSession({setup(manager)})` and
  `manager.appendMessage(...)`. The one user message is explicitly labelled
  disposable setup initialization, authorized by Tom; no assistant record is
  invented. The extension is not a model/provider/backend.
- Command-only RPC prompt `/canonical-setup-proof` returns `disposition:handled`.
  No BB provider dispatch occurred. A separate CLI process resumes the exact
  persisted session path and ID, reports messageCount1/pendingMessageCount0,
  and `get_entries` returns the exact initialization user record. The receipt,
  original journal and readback are retained. Both processes receive SIGTERM,
  exit143 (not exit0); no successful inference/startup-auth claim is made.
- Session ID: `01a187e5-b933-7378-a89c-20738f6a47df`.
  File: `/tmp/exo-canonical-proof.syqeus/sessions/2026-10-29T13-42-21-747Z_01a187e5-b933-7378-a89c-20738f6a47df.jsonl`.
- Scrubbed private HOME/TMPDIR/agent/session/vault; `--offline`, no discovered
  extensions/MCP/skills/context files/tools. Network and subprocess entry points
  are denied in the Node preload; `before_provider_request` records/refuses
  inference and never fires. No credentials/login/provider selected; reported
  model is `unknown`. These are same-account guards, not OS sandboxing.

**Not yet proved:** actual OptChat profile binding or startup/resume of the
retained canonical owner. No profile/binding/active-memory files were fabricated.
Full journaled first-run implementation is not represented by this checkpoint.

## Commands and scope

Absolute Node: `$NODE_PREFIX/bin/node`.
Approved installed Pi source graph:
`/tmp/exo-native-source.RVkor2/source/plugins/bb-plugin-exosurface/node_modules/@earendil-works/pi-coding-agent`.

`rpc-proof.py` records the exact argv/env for session creation; `reopen.py` uses
that same environment and CLI with `--session <receipt path>` and only get_state /
get_entries requests. Controllers run `/usr/bin/python3 -B`; they start only the
explicit Node/CLI command. Guard stays installed in the CLI. Neither command
runs the bundled package's public SDK index or any private module import.

SDK failure command (scrubbed env, private root, guard):
`$NODE $R/proof.mjs <declared-public-Pi-dist/index.js>`.
`installed-proof.*` uses the corresponding public entry inside the receipt-owned
BB source. `cli-help.*` uses `$NODE <Pi>/dist/bundle/cli.js --help`.

An initial EOF-fed RPC attempt ended before asynchronous initialization finished
and produced no receipt. Its stdout was overwritten by the controlled successful
run before preservation; do not claim its raw output is retained. The final
controllers keep stdin open, wait boundedly for receipt/readback, and stop only
their owned child. No downloads, graph edits, live state access or native BB
spawn/dispatch was attempted. Public SDK compatibility remains separately
unresolved even though the supported CLI persistence path works.

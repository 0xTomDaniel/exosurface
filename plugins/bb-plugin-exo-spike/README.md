# Exo entry point — BB provider plugin

Runs a personal agent — a [Pi](https://github.com/earendil-works/pi) coding agent with [OptChat](https://github.com/jonaslsaa/pi-optchat) (one growing chat session, summary-tree memory) — as a provider inside stock [BB](https://getbb.app), with no fork or bundled-provider patch. The agent keeps one growing thread as its single entry point; BB is a view onto it.

Status: **spike**, used daily by its author.

## What it does

- **Independent owner.** A per-user owner service (`src/owner-service.ts`, run by launchd) owns the Pi process and its OptChat profile lock. BB attaches and detaches; closing BB does not stop the agent, and the standalone terminal can take over after the owner is stopped.
- **Native history stays authoritative.** OptChat owns the conversation; BB's display is replayed from the Pi session journal with an acknowledgement cursor (`src/journal.ts`), so a reply produced while BB was detached reappears exactly.
- **Primary-only provider configuration.** Optional local keys `primaryAgentDir` (a provisioned Pi agent directory) and `primarySolProvider` (a provider defined there) route the primary without changing global Pi configuration or the isolated trial. Defaults preserve the existing shared agent directory and Codex route. Use standard Pi `models.json` endpoint/API/key-command configuration; keep credentials and deployment URLs outside the repo. Reverting the two keys and restarting the idle owner restores the previous route. Resource/auth links or settings in a separate directory must be deliberately provisioned and verified; the plugin does not copy credentials or auto-install packages.
- **Verified primary model selection.** The primary model picker offers Opus 5.5 and GPT-6.1 Sol, both at high reasoning, in the same session. Startup/resume input, normal turns and steering check Pi's actual model and thinking before sending. A failed switch never falls back silently; changing models while busy is rejected without stopping work or clearing queues. `main-model.json` remembers the verified choice for owner restarts. The picker alone is a next-message choice, not proof Pi already switched; a page-button send uses BB's saved thread choice, not an unsent composer draft.
- **Bounded projections.** Status and overview use a small latest-state store and cached, single-flight RPC instead of replaying whole history on startup.
- **Children as projections.** OptChat subagents appear as read-only projections with guidance mediated by the parent.

## Child limitations that matter

OptChat's inspected connected-window API starts a new connected child; it has no attach-to-existing-child operation, and socket disconnect finishes that connected child. This plugin instead uses a **read-only projection** of the owner's existing native child, with manager-mediated guidance through the owner's native `tell`. It does not claim direct connected-window parity.

BB also sends its own child-completion system summary to the parent, **in addition to OptChat's native report**. This redundant wake/report was observed in the live test. No supported suppression control was established by the inspected public declaration. This must be resolved or avoided before adopting native BB parent/child relationships for real Exo conversations; plugin-owned family links are a candidate, not an implemented decision.

Native children remain owned by the parent Pi process. They are not detached/durable jobs that survive its exit. Abrupt restart/recovery, simultaneous approvals/sends, standalone GUI exit, arbitrary attachments, dialogs, widgets, editor requests, custom TUI, native slash autocomplete, production models, vault-write concurrency and remote hosts remain unqualified.

## Public seams used

- `bb.providers.register`, `bb.host` / `experimental_providerBridge`.
- Public `@get-bb/plugin-sdk/provider-bridge` protocol and public assembler/conformance test kit; no private `@bb/*` imports.
- `navPanel`, native `ThreadChat`, public RPC and thread SDK.
- `experimental_hooks.on('message.dispatch')` binds a child projection **before** provider construction; `deriveProviderOptions` carries the attachment. BB may send initial input in `turn/start`, not `thread/start`.
- Status/notifications use the bounded local latest-state store, not `extension.state` or fake active turns (October13 repair). Public overview RPC is cached/single-flight. Canonical transport attaches to the independently supervised owner.

No BB fork or bundled-provider patch. BB still owns thread/turn/item grammar, queues, steering and parent/child completion. Several APIs are experimental; this owns adapter maintenance, not zero maintenance.

## Reproduce

From this directory, on a machine with Pi, OptChat and BB provisioned:

```sh
npm run typecheck
npm test
BB_SERVER_URL=http://127.0.0.1:38886 node "/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb" plugin reload exo-spike
node test/ui-proofs.mjs
```

The UI tests target an isolated test thread. Per-run markers and namespaced conformance thread IDs prevent prior evidence from falsely satisfying the tests. Playwright uses the already available local cache, not an installed new browser or cloud browser. Node's public capture kit requires `--test-isolation=none` so the test runner's binary transport does not contaminate captured JSONL.

Paths to Pi, the existing OptChat checkout, pi-fast and cached Playwright are explicit **local spike bindings**, not a portable install. BB's plugin installation is full-trust code; these checks are accident/regression guards, **not a security boundary** against a compromised agent.

## Reversal

Stop the independent owner (its launchd job) before using the agent in a terminal; disabling the plugin in BB only detaches. Disable or uninstall only this plugin through normal BB plugin management; its threads become provider-unavailable, which is not history migration or deletion. Back up the agent's state directory before changes.

`evidence/` (real conversations and receipts) is never committed. Paths in `src/state.ts` and the live scripts point at the author's machine.

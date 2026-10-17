# Evidence report — independent AG-UI + Pi spike

September 13, 2026. Base `ad4013d853a6b77fd94fc4c575143ba9e8002bb1`;
branch `spike/a2ui-agui-pi`; all new work is in `spikes/ag-ui-pi`.
No canonical architecture document was edited. No final protocol choice exists.

The spike demonstrates actual Chromium → AG-UI → custom Pi host → AG-UI →
A2UI/Lit interaction. Deterministic execution exercises lifecycle without model
variability; separate live proofs exercise the actual Pi SDK and model. Published
SDKs are unchanged. A reproducible source-write race **fails an essential gate**;
successes below do not compensate for it.

## Mandatory gates

| Gate                                                | Result                                          | Evidence and limit                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| G1 Independent work / idle observation              | PASS within the fixture scope                   | Server process starts work before any client, browser attaches without resubmission, detaches during work, returns during/after work, and receives idle file edits.                                                                                                                                                                              |
| G2 Recovery / bounded resources                     | UNKNOWN beyond the measured bounds              | Browser and process restart, snapshot-to-live, churn, slow/stalled consumers and malformed transport probes pass. A 100-cycle/40-publication Node run and a 20-cycle/6-publication browser run are not long-duration or saturated-network proof. Maximal history payloads, hard disk failures, power loss and fleet concurrency remain unproven. |
| G3 Complete multimodal conversation                 | PASS for the specified thin exchange            | Visual-only Pi tool use; combined selection/utterance; authored turns; preserved exact A2UI/source revision; actual model and browser recovery of original 11:00, accepted 13:00, external 14:30.                                                                                                                                                |
| G4 Authority / concurrent acceptance / cancellation | **FAIL for arbitrary concurrent vault writers** | Two independent HTTP/browser clients, duplicate acceptance, stale actions, explicit cancel and process crash receipts pass. The separate external-writer probe overwrites an intervening edit in the last filesystem write window. No production-safe arbitrary editor concurrency claim is made.                                                |
| G5 No dependency repairs / replacement SDK          | PASS for this implementation                    | Official schemas, verifier, accumulation and subscribers remain active through supported run/connect overrides. No dependency patches, forks, overrides, internal copies, A2A, or replacement SDK.                                                                                                                                               |
| G6 Product/source constraints                       | PASS within the fixture scope, subject to G4    | Actual Pi SDK, A2UI and Lit/basic catalog; copied Markdown/frontmatter/Bases; meaningful turns; agenda and simulated lamp; no hardware, live calendar writes, SQLite, migration or deployment.                                                                                                                                                   |

No weighted score or production-ready recommendation is issued for a path with
this G4 failure. The passing AG-UI/Pi/browser findings remain useful independent
of that shared host/source-write defect.

## Executed validation

Run the following from this package. Node was 26.0.0; npm was 12.0.1. Chromium is
local Playwright 1.58.2. Commands never read a sibling package.

| Command                                                             | Observed result                                                                                                                                                                                                                 |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup` / `npm install` + `npx playwright install chromium` | Independent dependency/browser installation succeeded.                                                                                                                                                                          |
| `npm run build`                                                     | Strict NodeNext TypeScript check and production Vite browser build passed. Bundle about 526 kB / 135 kB gzip; Vite reports its normal >500 kB chunk warning.                                                                    |
| `npm test`                                                          | Owned host/HTTP/public SDK integration and fault tests; final count recorded in `validation.json`.                                                                                                                              |
| `npm run test:browser`                                              | Deterministic browser journey, actual process restart, two clients, responsive/focus checks and browser churn; live model case explicitly skipped.                                                                              |
| `EXO_LIVE_PI=1 npm run test:browser`                                | Actual model case enabled: restored historical visual reference is explained through the real browser and AG-UI host.                                                                                                           |
| `npm run test:pi`                                                   | Two actual Pi model executions passed, using `openrouter/anthropic/claude-sonnet-4.6`; see `pi-proof.json`.                                                                                                                     |
| `npm run probe:source-race`                                         | **FAIL / exit 1:** observed intervening 14:30 external edit was overwritten by 13:00 acceptance. See `source-race.json`. If OS scheduling misses the narrow race, the probe reports UNKNOWN, never PASS by absence of evidence. |

The first host and transport slices recorded RED (missing implementation), then
GREEN. Runtime tests corrected the earlier metadata assumption. Adversarial browser
checks exposed and fixed two owned application defects: renewal of the local
session after process restart, and stale connection status when a fresh observer
received an already-applied snapshot. A browser Pi assertion was corrected to wait
for the newly admitted ask work rather than an earlier completed work item.

The setup audit initially reported findings in development tooling and YAML.
The package now pins published Vite 7.3.6, Vitest 4.1.11, tsx 4.23.13 and YAML
2.9.1; permitted transitive esbuild resolves to 0.28.1/0.28.2. No AG-UI, A2UI or Pi SDK
version or source changed. The final `npm audit --json` report is retained in
`npm-audit.json`; this registry check is not a general security certification.

## Architecture and support ownership

| Owner / Module                                                      | Supplied or maintained behavior                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Published AG-UI client/core                                         | Run input/event schemas; event transform/verification; text/activity/message/state accumulation; accepted-event metadata propagation; subscriber processing; public detach signal.                                                                                                                                                                                        |
| Published AG-UI encoder + SSE parser                                | Standard SSE encoding and framing parser. This package supplies bounded reading and disposal around them.                                                                                                                                                                                                                                                                 |
| Published A2UI web_core/Lit/basic catalog                           | A2UI v0.9 schemas, MessageProcessor, actual catalog components, surface/data processing, action dispatch, Lit rendering.                                                                                                                                                                                                                                                  |
| Ordinary Pi Adapter (`pi.ts`)                                       | In-memory session construction, existing credential/model resolution, restricted tool registration, prompt/context projection, event collection, abort and disposal. Fixed-schema `propose_agenda` returns official A2UI operations. This is not a Codex agent wrapper.                                                                                                   |
| Shared Exo host (`host.ts`, `domain.ts`, `surface.ts`)              | Semantic thread/turn/source/object identities, authorship, exact historical A2UI/source revisions, causal references, proposals, actor intents, single-writer command serialization, duplicate receipts, revision checks, vault watching, independent jobs, runtime checkpoints, effect reconciliation and catalog projection. Neither protocol supplies these semantics. |
| **Added AG-UI lifecycle support** (`transport.ts`)                  | Concrete run/connect POST transport, HTTP/content-type errors, abort on Observable teardown, reader cancellation, UTF-8/SSE/event limits, connection/event budget, stall deadline. Retains inherited official application/verification; no HTTP-transform repair was copied.                                                                                              |
| **Added AG-UI publication support** (`publication.ts`, `server.ts`) | Finite ordered run frames around snapshots; one current activity identity; explicit semantic metadata; server observer admission/lease/cleanup; heartbeats; writer bounds; one coalesced latest snapshot under backpressure; bounded messages; command acknowledgements with no current-surface publication.                                                              |
| **Added browser coordination** (`browser.ts`)                       | Separate command/observer agent instances; sequential lease renewal; local session renewal; monotonic snapshot sequence; duplicate suppression; explicit observation-side A2UI binding; current/historical MessageProcessors kept separate; selection retained at its original revision; connection/error display.                                                        |
| **Added work-control convention**                                   | Normal RunAgentInput.forwardedProps carries commands or documented A2UI actions. RunFinished.result carries admission/receipt/cancel-request acknowledgement. State snapshots expose current work/outcomes/history. `cancelling` is not `cancelled`: only executor completion reports stopped work. No custom AG-UI event or A2A control path is used.                    |

These are substantive owned responsibilities. “Unpatched” does not mean AG-UI
supplies background lifecycle. Maintaining them requires regression coverage for
abort/teardown, verifier framing, subscriber ordering, application metadata, A2UI
operation compatibility, renewal/auth, receipt/history projections and backpressure.
The no-copy rule was respected; no protected apply/verify method is overridden.

The default protected `connect()` throws `AGUIConnectNotImplementedError`. A new
exact-version source/runtime check also found that `connectAgent()` catches that
specific error and resolves an empty result. Thus awaiting the default wrapper
successfully does not establish any observation capability. The published client
hash in `dependencies.json` matches the corrected September 13 artifact.

## Scenario evidence

| Proposed validation scenario                       | Result                                          | Concrete evidence                                                                                                                                                                                                                                             |
| -------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Server starts work with zero clients               | PASS                                            | Host test and separate `--start-work` process used by browser restart test. Admission is persisted before execution; author is Exo for server-origin work.                                                                                                    |
| Close browser while work runs                      | PASS                                            | Browser detaches during `running`; reconnect observes completed pending proposal.                                                                                                                                                                             |
| Reconnect during and after work                    | PASS                                            | Actual Chromium during-work reattach, after-completion reattach, and fresh official HTTP observer; no action resubmission.                                                                                                                                    |
| Coherent snapshot-to-live / source during recovery | PASS for tested ordering                        | Observer installed synchronously with its initial host snapshot; source edit during active attachment appears as the next revision; stale action rejected. Fresh observer after 40 publications recovers revision 41.                                         |
| Idle external source updates                       | PASS                                            | Markdown revision/time edit appears in two idle browsers; focused textarea and text survive.                                                                                                                                                                  |
| Two-client concurrent / duplicate acceptance       | PASS for one host process                       | Two HTTP clients and two Chromium pages act from one revision; one acceptance turn, one source revision advance, one receipt. Repeat request ID returns the saved receipt; conflicting reuse rejects.                                                         |
| Stale / forged action                              | PASS                                            | Old surface/source rejects; catalog action checked against exact saved component/action context; wrong thread/session and oversize body reject.                                                                                                               |
| Detach versus cancellation                         | PASS for deterministic executor                 | Detach preserves other observer and running work. Cancel first acknowledges `cancelling`; terminal `cancelled` is published only after execution returns. Late cancel reports `completed`. Live Pi abort and provider billing/cancellation races are UNKNOWN. |
| Visual-only conversation                           | PASS                                            | No-utterance selection/move is a human turn; actual Pi tool creates the selected proposal. Visual response and preserved referent exist without chat.                                                                                                         |
| Combined utterance + selection                     | PASS                                            | Exact `sketch` revision 1 reference and utterance remain one authored turn. Pi/browser respond in the same temporal thread.                                                                                                                                   |
| Simultaneous external edit and write intent        | **FAIL at final write window**                  | Ordinary pre-command reconciliation/stale check passes. An independent writer in the final stage/rename window is overwritten; acceptance wrongly reports applied.                                                                                            |
| Historical decision / Pi grounding                 | PASS for tested history                         | Current 14:30 source and old 11:00 A2UI tree remain separate. Actual Pi explains original, accepted 13:00 and external 14:30, preserving title/object and causality.                                                                                          |
| Process restart / uncertain effect                 | PASS for tested crash windows                   | Exit 87 after preparation restores stale/unapplied; exit 88 after source write reconciles source marker as applied. Neither blindly replays. Running jobs restore as interrupted. Browser renews its local session and updates without reload.                |
| Slow/stalled/churning observers                    | PASS within recorded limits; saturation UNKNOWN | 100 HTTP cycles, 20 browser cycles, delayed SDK callbacks, paused socket reader, one-second browser main-thread stall, six concurrent publications; observers return to zero.                                                                                 |
| One ordered live publication                       | PASS                                            | Only observation applies current A2UI; command results contain acknowledgements or explicitly requested isolated history. Duplicate sequence is dropped. Stable IDs update the current processor instead of deleting/recreating its surface.                  |
| Agenda and simulated lights                        | PASS                                            | Shared intent/turn/receipt/current-observer path, distinct agenda proposal/application and lamp command/outcome. No hardware/provider side effects.                                                                                                           |
| Malformed stream / HTTP / stalls                   | PASS                                            | 503, unknown event, truncated SSE, >256 KiB frame and silent response stall all reject and release the connection through the public SDK path.                                                                                                                |

## All 25 comparison rows

The numbers follow `docs/a2a-vs-ag-ui-requirements.md` in order. PASS is restricted
to this fixture and thin client scope, never a claim of a finished product.

| Row | Requirement                         | Status / scope                                                                                                                                                                      |
| --- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Assemble/revise agenda              | PASS: three fixture tasks, proposal and accepted frontmatter move. Live calendars/preferences beyond the fixture UNKNOWN.                                                           |
| 2   | A2UI + Lit interactive surface      | PASS: actual upstream v0.9/basic catalog in Chromium.                                                                                                                               |
| 3   | Select/navigate/edit/direct intent  | PASS: selection and move buttons, historical reference, optional words. Drag gestures are not implemented.                                                                          |
| 4   | Custom Pi Exo                       | PASS: real Pi SDK + model; restricted custom tool, no Codex harness.                                                                                                                |
| 5   | Browser/voice share agent           | PASS for `actor:voice` linguistic intent on the same AG-UI host; actual audio/STT/TTS and existing voice migration UNKNOWN/out of scope.                                            |
| 6   | Obsidian/source authority           | **FAIL under arbitrary concurrent editor writes**; copied Markdown body/Bases retained, no competing authoritative database.                                                        |
| 7   | Reflect external source edits       | PASS for valid revision-advancing file updates; final concurrent acceptance race is the explicit G4 failure.                                                                        |
| 8   | Work with no client                 | PASS.                                                                                                                                                                               |
| 9   | Idle new activity                   | PASS with owned connect transport.                                                                                                                                                  |
| 10  | Thread/turn/surface identity        | PASS for bounded history: distinct IDs, associations and immutable saved revisions.                                                                                                 |
| 11  | Discover work/proposals/outcomes    | PASS for one known local thread via snapshot. Multi-user thread discovery/pagination UNKNOWN.                                                                                       |
| 12  | Reconnect during/after              | PASS.                                                                                                                                                                               |
| 13  | Avoid recovery gaps / stale replay  | PASS for monotonic full snapshots, recovery during a source change, duplicate suppression and current/history isolation; saturated network replay UNKNOWN.                          |
| 14  | Pending proposals / decisions       | PASS for a single pending agenda proposal without blocking independent lamp actions. Multiple simultaneous pending proposals/AG-UI interrupts UNKNOWN.                              |
| 15  | One logical concurrent acceptance   | PASS for inter-request concurrency on one host process; not cross-process source CAS.                                                                                               |
| 16  | Truthful explicit cancellation      | PASS for deterministic work and completed work; actual remote model cancellation races UNKNOWN.                                                                                     |
| 17  | Restart correctly                   | PASS for tested process crashes and lost client reply; power-loss durability UNKNOWN.                                                                                               |
| 18  | Bound observers/memory              | PASS at measured limits; long duration, saturated TCP buffers, maximum sized histories UNKNOWN.                                                                                     |
| 19  | Progress/multimodal history         | PASS: visible work, meaningful visual and linguistic turns, exact history and real Pi continuation. Fine-grained model token/tool-progress rendering is not claimed.                |
| 20  | Authority / generated UI / actions  | PASS for local session, origin check, schemas, fixed catalog/tool generation and exact offered actions; arbitrary vault-write concurrency FAIL. Multi-user production auth UNKNOWN. |
| 21  | Avoid upstream maintenance patches  | PASS unchanged published packages; owned support is explicitly inventoried. Upgrade burden UNKNOWN.                                                                                 |
| 22  | Compatible A2UI guidance / versions | PASS for selected fixed-schema mode. Dynamic generation, middleware runtime adoption and other A2UI versions UNKNOWN.                                                               |
| 23  | Simulated smart home                | PASS: lamp shared between clients.                                                                                                                                                  |
| 24  | Matter / future transports          | UNKNOWN / outside v1; no physical hardware or custom physical renderer.                                                                                                             |
| 25  | Proportional integration            | UNKNOWN comparative cost: independently implemented package; no shared executable code or combined protocol.                                                                        |

## Resource observations and retention policy

Machine-readable results are in `resources.json` and `browser-resources.json`.
The Node run measured a maximum of one accumulated current activity (text-free
stress), 73 received-ahead/not-yet-processed events with 15 ms subscriber delay,
about 18.7 KiB peak server writer buffering, zero remaining observers, a roughly
187 kB checkpoint and 3.93 MB cumulative checkpoint writes across 40 lamp updates.
RSS/heap samples include GC timing; they are reported, not interpreted as a
long-run leak verdict. The browser run explicitly collected garbage before/after
its 20 cycles and one-second stall; the final live-model journey kept six
accumulated messages and no page errors. Heap used after forced GC changed from
6,722,896 to 8,203,236 bytes; this finite observation is not a leak verdict.

Hard application limits: 16 observers; three-second or 16-publication leases;
512 KiB server writable-buffer ceiling; one additional latest complete snapshot
per blocked writer; 256 KiB maximum publication/request-frame budget; 64 KiB input
body; 4 MiB client connection budget; 256 client events per connection; six-second
no-byte timeout. The current client projection keeps one activity plus at most 12
utterance messages. A new observer instance is created after each finished lease;
there is no private SDK queue replacement or indefinite application event replay.

Host storage has schema caps of 256 turns/receipts, 128 historical revisions, 32
work records, 12 agenda tasks and 4 MiB checkpoint size, with earlier admission
stops. It does not silently discard significant history. This is a bounded spike
thread, not an implemented archive/compaction product. Repeated full checkpoint
writes amplify storage traffic. A source edit beyond capacity increments the
source error metric; user-facing archive/full-state recovery is incomplete.
Maximum-sized histories can exceed the smaller wire publication ceiling; that
capacity interaction is an explicit unresolved G2 gap. These facts prevent a
claim of general always-on readiness.

The stalled loopback probe did not saturate all operating-system socket buffers:
zero writer drops occurred. It proves cleanup and finite leases under that load,
not correctness for arbitrary network saturation. Browser heap growth after GC is
recorded in the JSON; no constant-memory claim follows from a finite run.

## Failure and unresolved work

The last source check and final rename are separate filesystem operations. The
adversarial worker changes the authoritative source between them. The host then
replaces it and publishes its acceptance as applied. This is not an AG-UI defect
and cannot be cured by replacing its transport. Production use needs an explicit
source mutation/concurrency contract that protects arbitrary external edits,
plus reconciliation tests at every acknowledged effect window. Silently adding
more last-moment reads would only narrow the race, not provide source CAS.

Other unproven behavior: process concurrency on one checkpoint directory;
shutdown/disk errors and power loss; maximum payload/capacity recovery; prolonged
or saturated slow consumers; actual Pi cancel/completion/provider errors; complete
multi-thread discovery/auth; several independent proposals; general model layout
or gesture generation; audio; real calendars and Matter; SDK upgrades. No
compulsory SQLite or service migration is introduced to disguise those gaps.

## Reviewable artifacts

- `dependencies.json`: exact package versions/integrity and published AG-UI client hash.
- `pi-proof.json`: two real model inputs/results, fixture source and exact visual referent.
- `source-race.json`: non-averaged failing source-authority proof.
- `resources.json`, `browser-resources.json`: raw measured counts, bytes and heap samples.
- `browser-agenda.png`, `browser-mobile.png`, `browser-pi-history.png`, `browser-restart.png`: actual Chromium evidence.
- `validation.json`: final commands/results/counts.
- Tests and source in the package are the reproductions; runtime directories, node_modules and build artifacts are not committed.

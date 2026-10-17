# A2UI over A2A + Pi: executed spike evidence

Recorded September 13, 2026. Package: `spikes/a2a-pi`, branch `spike/a2ui-a2a-pi`, based on `ad4013d853a6b77fd94fc4c575143ba9e8002bb1`. This report covers this independent implementation only. It neither evaluates the sibling's executable work nor chooses the project's final protocol.

**Result:** a real browser/host vertical slice works through unchanged published A2A, A2UI/Lit and Pi packages. Background execution, observation, recovery, fixture acceptance and historical model context pass the finite tests below. The result requires substantial owned lifecycle support. It is not evidence that the default A2A server route supplies that behavior or that this is a production-ready always-on service.

## Reproduce and inspect

Run from this package directory:

```sh
npm run setup
npm run validate
npm run test:model
npm audit
```

The final deterministic gate was also run immediately after **`npm ci`**, independently of any root workspace: **11/11 Node tests, 3/3 Chromium tests, strict TypeScript check and Vite build passed**. The installed tree audited **198 packages, zero reported vulnerabilities**. Node 26.0.0 / npm 12.0.1 / macOS arm64 / Playwright Chromium 145 were used. The resulting browser bundle was 367.25 kB, 88.19 kB gzip; that is a build measurement, not a performance benchmark.

`npm run test:model` separately executes two real Pi model sessions and actual browser rendering. It requires the operator's existing Pi provider configuration. Ports 61001/61011 must be free. The normal deterministic test suite has no credential prerequisite. Tests use temporary state, actual Markdown writes, real HTTP and the published client; no owned policy Module or SDK is mocked.

Artifacts are [observed/](observed/). Rerunning tests produces replacements under ignored `generated/`. The checked-in model proof contains fixture-only semantic context and the model's validated tool output, not provider credentials, hidden reasoning or raw network logs. Screenshots are inspected rendered output; assertions provide the behavior proof.

| Evidence ID | Executed test / artifact |
| --- | --- |
| N1 | `lifecycle.int.test.ts`: server-originated work finishes before any client exists; later SDK client discovers completion; taskless visual selection preserves authorship. |
| N2 | Same file: native cancel/get/list, terminal cancel refusal, pagination, unauthenticated access, outsider scoping. |
| N3 | Same file: 30 actual-wire attach/detach cycles with 350 ms observation leases; [resource-churn.json](observed/resource-churn.json). |
| N4 | Same file: 36 completion/cancellation races, both outcomes, oldest terminal work eviction at 32 records. |
| N5 | Same file: source file write overlaps subscription snapshot acquisition; the same live stream reaches the new value. |
| N6 | Same file: two concurrent SDK clients plus repeated delivery create one acceptance turn, one receipt and one Markdown plan; source/incarnation staleness rejected; combined utterance/response association recovered by second client. |
| N7 | Same file: native A2UI DataPart checkpoint through standard SSE and cleanup after client abort. |
| N8 | `resources.int.test.ts`: a real paused HTTP reader under large source updates is dropped; healthy SDK client still discovers; [resource-slow.json](observed/resource-slow.json). |
| N9 | Same file: published client rejects a complete ASCII SSE frame larger than its 4 MiB default; host rejects a command body larger than 64 KiB. |
| N10 | `restart.int.test.ts`: actual subprocess receives SIGKILL immediately after exclusive Markdown plan creation and before outcome persistence; restart reconciles one accepted plan/receipt and reports interrupted work through the UI snapshot and native GetTask FAILED. |
| N11 | `surface.int.test.ts`: actual catalog/schema boundary rejects incomplete, cyclic, duplicate, unreachable or unapproved generated component graphs and unknown text paths. |
| B1 | `lifecycle.browser.test.ts`: two Chromium pages and actual Lit renderer; zero-client completion, visual proposal/acceptance, shared simulated light, selected object, full detach, reconnect during work, idle source edit, completion reload, inert history, desktop and 390 px viewport. [Desktop](observed/agenda-history.png), [mobile](observed/mobile.png). |
| B2 | Same file: renew 600 ms observation leases for more than two leases, retain textarea value/focus through external edit, close/restart host on same port, recover interrupted work, explicitly cancel subsequent work, detach to zero streams. [Metrics](observed/browser-restart.json). |
| B3 | Same file: local forwarding proxy stops delivering bytes on an open SSE socket; the browser's watchdog reconnects and renders the external edit, then detaches to zero streams. [Metrics](observed/browser-stall.json). |
| M1/M2 | `model-proof.ts`: real Pi visual-only continuation, host restart, combined selection/utterance and acceptance, later external source edit, historical context restored to Pi and generated A2UI rendered in Chromium. [Proof](observed/pi-proof.json), [screenshot](observed/pi-historical-reference.png). |

## Mandatory gates

PASS means the stated finite fixture contract was executed successfully. UNKNOWN means the broader behavior remains unproven; it must not be treated as a passed production gate. No score averages these statuses.

| Gate | Status | Evidence and limit |
| --- | --- | --- |
| G1 — Independent work and idle observation | **PASS, bounded spike** | N1/N5/N7 and B1–B3. Admission and execution lifetime do not depend on browser attachment. |
| G2 — Recovery and bounded resources | **PASS for tested recovery/churn/stall bounds; UNKNOWN at retention saturation or long-duration operation** | N3/N5/N8–N10, B1–B3. No long soak, disk-full, archive-limit recovery, or browser heap plateau proof. Those remain mandatory follow-up before an always-on production claim. |
| G3 — Complete multimodal conversation | **PASS for the exercised thread** | N1/N6, B1, M1/M2 preserve authored turns, exact historical referents and actual Pi continuation. Live voice, arbitrary gestures and multi-thread navigation are UNKNOWN. |
| G4 — Authority, acceptance and truthful cancel | **PASS for one host, two clients and local fixture effects** | N2/N4/N6/N10, B1/B2. Real-provider write semantics, multi-host acceptance and actual live-model cancellation remain UNKNOWN. |
| G5 — No dependency repair/replacement | **PASS for delivered path** | Exact published lockfile; stock request handler, codecs, executor/event bus/store Interfaces, JSON-RPC transport handler, SSE formatter, client parser, A2UI processor and Lit renderer. All added support is inventoried below. |
| G6 — Product/source constraints | **PASS within assigned spike scope** | Actual Pi, A2UI/Lit basic catalog, temporary Markdown/frontmatter/Bases fixtures and simulated light. No hardware, live calendar, forced SQLite, existing-service migration or shared executable package. Full source integration is UNKNOWN. |

## Every comparison requirement

Numbers follow the 25 rows in the read-only `docs/a2a-vs-ag-ui-requirements.md`. Associated P/L labels cover the architecture constraints; the scenario table below covers Proposed validation explicitly.

| # / requirement | Status | Observation / unresolved part |
| --- | --- | --- |
| 1. Assemble/revise agenda | **PASS fixture workflow; UNKNOWN general planning** | Three fixture tasks, specific after-lunch proposal, acceptance and subsequent source reconciliation. The schedule proposal is deterministic; Pi genuinely explains/continues visual context but is not a full calendar planner. |
| 2. Actual A2UI + Lit surface | **PASS** | B1–B3, M1/M2. Published processor/catalog/components, no invented widget protocol. |
| 3. Direct intent and exact selection | **PASS tested selection/action; UNKNOWN other gestures** | N1/N6, B1. Similar task IDs disambiguated, original revision retained. Arbitrary drag, inline edit, keyboard/assistive-technology coverage are not implemented/tested. |
| 4. Custom Pi Exo host | **PASS exercised model contract** | M1/M2 use actual Pi AgentSession/tool, not a Codex agent process. General planning/tool workflows remain outside proof. |
| 5. Shared browser/voice personal agent | **UNKNOWN live voice** | Browser clients share host context and combined text/selection is proved. No microphone, ASR/TTS or current voice-service integration exercised. |
| 6. Obsidian/source authority | **PASS fixture; UNKNOWN live vault/provider** | Exclusive new plan Markdown, original Agenda.md preserved, whole-file source SHA and `.base` fixture. Private JSON stores execution/conversation context rather than replacing source records. |
| 7. Reflect external edits (L4/L5) | **PASS fixture** | N5/N6, B1/B2, M2. 100 ms polling, source-authored turns, pending proposals stale. Arbitrary concurrent external writers/providers are UNKNOWN. |
| 8. Continue without clients (L1) | **PASS** | N1/B1 include zero-client startup and all-observer detach. |
| 9. Observe idle server activity (L4) | **PASS** | B1/B2 receive new work and source edits without client submission. Finite observation Tasks are owned mapping. |
| 10. Distinct durable identities (L2) | **PASS tested single thread** | Context/thread, turn, utterance subexpression, surface incarnation/revision, source object, work Task and Pi session IDs have separate meanings. Work completion does not delete the surface. |
| 11. Discover work/proposals/outcomes (L3) | **PASS retained window** | Native ListTasks/GetTask plus taskless discovery Message and full checkpoint; N2/N6/N10. Multi-thread discovery and archive retrieval beyond configured retention are UNKNOWN. |
| 12. Reconnect during/after work (L3) | **PASS** | B1/B2; no resubmission, pending proposal/outcome recovery, retained transient selection and textarea focus on live updates. Reload intentionally creates a fresh local selection while durable turns remain. |
| 13. Snapshot/live coherence (L3/L5) | **PASS tested races** | N5/B2/B3. Initial Task checkpoint and subsequent artifact updates share one subscription. Full checkpoint on renewal; boot/revision filtering prevents regression. No durable event cursor is implemented. |
| 14. Review proposal in either client (L3/L6) | **PASS** | B1, N6. Proposals are durable domain objects, not input-required Tasks; accepting does not block other work. |
| 15. One logical concurrent acceptance (L6) | **PASS at two concurrent clients / one host** | N6/B1/N10. Exactly one receipt, person acceptance and exclusive plan file. No multi-host lock or generic third-party exactly-once claim. |
| 16. Truthful cancel (L7) | **PASS deterministic work; UNKNOWN live model stop race** | N2/N4/B2. Native CancelTask, completed cancellation refused, 36 races agree with persisted outcome. Pi abort wiring exists but its provider-side race was not tested. |
| 17. Restart (L8) | **PASS tested crash windows** | N10 and B2/M2 restore decisions/visual output. Interrupted work becomes interrupted/FAILED, never silently resumes. Disk power-loss/fsync and other provider uncertainty remain UNKNOWN. |
| 18. Bound observation (L9) | **PASS measured finite bounds; UNKNOWN saturation/soak** | N3/N8/N9/B2/B3. Exact limits below; no native queue-length introspection or long browser memory soak. |
| 19. Progress and historical exchange | **PASS bounded history** | Work status/outcome, authored turns, exact inert visual history and actual Pi explanation. Detailed token/tool progress UI and full archive navigation are UNKNOWN. |
| 20. Host authority / untrusted UI (L10/P3) | **PASS fixture boundary; UNKNOWN production auth** | Demo bearer checked before executor/store access; schema/catalog/action/revision checks. N2/N6/N11. Provider credentials stay host-side. No tenant/auth-provider implementation or security audit. |
| 21. No upstream repairs (P2–P5) | **PASS** | Unmodified SDKs and public Adapters. Observer lifetime, cleanup and recovery remain owned maintenance, not SDK features. |
| 22. Compatible guidance/versions (P1/P3) | **PASS selected combination** | Pinned published packages; official A2A binding and Python A2UI generation/skill sources inspected, catalog derived from the installed renderer. Actual model generation validates. |
| 23. Simulated smart home | **PASS** | B1 light command/outcome uses the same turn/action/publication concepts as agenda with a distinct domain command. |
| 24. Matter/future transports (P6) | **UNKNOWN future integration; PASS scope separation** | Light simulation is behind host semantics. No hardware, Matter commissioning or custom WebSocket protocol was added. |
| 25. Proportional integration (P4) | **UNKNOWN comparative cost** | One A2A-only path, supported seams, no AG-UI/CopilotKit dependency. Scope/ownership are explicit; relative maintenance and upgrade costs require review against the independent alternative, not line counts. |

P5 detail: no new RPC method, event type, transport protocol or private extension URI is introduced. Standard JSON DataParts carry the application-level thread/proposal/reference schema because the A2UI binding expresses surfaces/actions, while native Task history does not define immutable semantic turns, historical source authority or acceptance receipts. That application contract is additional owned work; standard data carrying does not supply its meaning.

## Proposed-validation scenarios

| Scenario from architecture | Status / exact proof |
| --- | --- |
| Start work, close browser | **PASS:** N1/B1; retained completion with no resubmission. |
| Reconnect during/after work | **PASS:** B1/B2; current view, decisions and actual interrupted outcome. |
| Sources change during recovery | **PASS:** N5 overlaps subscription acquisition with real Markdown write; B3 recovers the withheld update. |
| Idle server activity | **PASS:** B1/B2 source edits and server-started work. |
| Two concurrent clients | **PASS:** B1 plus N6 source-effect/receipt assertions. |
| Stale action | **PASS:** N6 whole-source revision and deleted/recreated surface incarnation rejection. |
| Cancel versus detach | **PASS fixture work:** N1/N2/N4/B1/B2. Live Pi cancellation **UNKNOWN**. |
| Entirely visual conversation | **PASS:** N1/B1 + M1 no utterance in the person or Exo contribution. |
| Selection plus language | **PASS:** N6/M2 exact research-review reference, optional utterance identity, associated visual/linguistic response and recovered second-client context. |
| Simultaneous contributions | **PASS tested ordering:** N5/N6 source change is reconciled before stale user action; authored references survive. An external file write within the final plan-file write window is **UNKNOWN**. |
| Revisit decisions/current revision | **PASS:** B1 historical processor is inert; M2 restores 11:00 original, 13:00 accepted and 14:15 current into actual Pi. |
| Host restart/uncertain effects | **PASS tested local window:** N10 verifies actual accepted Markdown and matches proposal/receipt/source/time before reconciliation. No blind reapplication; mismatched/absent receipt maps to uncertain in code, but that second branch is **UNKNOWN** by execution. |
| Repeated/churning/slow/stalled observation | **PASS finite tests:** N3/N8/B2/B3 and measured bounds below. Retention saturation/long soak **UNKNOWN**. |
| One ordered live publication | **PASS:** live Artifacts alone mutate the current processor. Direct command replies only acknowledge; history uses a second processor. B1/M2 demonstrate current and historical separation. |
| Agenda and simulated lights | **PASS:** B1; distinct actions, shared identity/turn/publication concepts. |

## Stock support versus added work

| Layer | Reused unchanged | Exo-owned responsibility and maintenance obligation |
| --- | --- | --- |
| Ordinary A2A communication | ClientFactory, AgentCard resolver, native multipart Message and Part codecs | Serialize one semantic contribution, preserve turn/ref/utterance IDs, interpret action context and direct response acknowledgments. Application DataPart schema is private product contract. |
| Work control | SendMessage admission, Task status, GetTask/ListTasks/CancelTask dispatch and schemas | Start work on the server with non-streaming `returnImmediately`; executor owns scheduling, pending abort handles, terminal truth and interrupted recovery. SendStreamingMessage is deliberately rejected with the standard unsupported-operation error because its consumer-dependent path is unsuitable here. |
| Task persistence | Supported TaskStore Interface and DefaultRequestHandler/ResultManager | ProjectedTaskStore owns authorization, pagination/filtering, retained-work selection, disk persistence and restart translation. SDK observation saves stay memory-only; work saves are durable. It is a second runtime projection, not a second agenda authority. |
| Event distribution | Stock DefaultExecutionEventBus and native task/artifact events | A public manager wraps creation/cleanup and measures on/off listener counts; the bus behavior is unchanged. No private queue fields, internal listener patches or copied stop logic are used. |
| Continuous observation | SubscribeToTask and initial saved Task / Artifact updates | **Added lifecycle support:** finite observation Tasks, discovery, readiness, lease renewal, terminal-race retry, retired-observer eviction, full snapshots and consistent context/surface mapping. This creates extra Tasks and round trips that generic A2A alone does not eliminate. |
| Standard-wire HTTP | JsonRpcTransportHandler.handle, stock codecs and formatSSEEvent | **Added lifecycle support:** Node route detects socket close and returns the iterator; 200 ms public task-status heartbeat unblocks a pending iterator so stock cleanup runs. Own frame/body limits, stream admission, drain deadline and HTTP error/close handling. Validate these assumptions on every SDK upgrade. |
| Client recovery | Stock A2A fetch/SSE parser | **Added lifecycle support:** idle watchdog, abort/retry, lease discovery, boot/revision deduplication and one current-publication path. No custom parser, SDK reducer replacement or replay queue. |
| Publication/retention | Native Artifact replacement | **Added lifecycle support:** coalesce publications, cap producer rate, checkpoint size, active work/streams and retired Tasks; disconnect laggards so they recover with a fresh checkpoint. Retention saturation and operational archive handling need further work. |
| Semantic thread | Native data carriers only | **Shared host responsibility:** authoritative vault reconciliation, turn meanings/authorship, exact visual checkpoints, proposals, duplicate receipts, exclusive writes and uncertain-write reconciliation. Neither A2A nor Pi provides those invariants. |
| Pi binding | Actual ModelRuntime, AgentSession, resource loader, tool registration, abort/dispose | **Ordinary Pi integration:** select existing configured provider, isolated capabilities, explicit projection, generated UI tool, errors and completion/cancellation mapping. **Shared semantic work:** choose relevant history and restore original referents; a stored UI is not automatically model context. |
| Rendering | Published A2UI schemas, basic catalog, MessageProcessor, Lit A2uiSurface | **Shared UI work:** agenda/lights projection, approved generated subset, semantic action validation, shell, focus/local selection, inert historical processor. No custom A2UI components were needed. |

The narrow default-route/streaming-submission defects were prior evidence in the read-only September 11 recheck. This package does not rerun or repair the default Express route. It validates a supported application route through actual standard-wire clients. “Unpatched” therefore means the dependency constraint is met, not that the SDK supplies the whole lifecycle.

## Measured resource limits

Configuration lives in `src/schema.ts`: at most **16** concurrent observer streams, **4** active work executions, **32** retained work Tasks, **2** retired observation Tasks plus the current one, **8** messages in a stored Task history, **256** semantic turns, **8 MiB** private thread checkpoint, **512 KiB** publication frame/checkpoint, **64 KiB** command body. Source fixtures allow **30** tasks with titles up to **2048** characters. Publication coalescing is **50 ms** (at most 20 checkpoint publications/sec); heartbeat is **200 ms**. Default observation lease is **5000 ms**, browser idle deadline **1600 ms**, retry **200 ms**, server drain deadline **100 ms**.

The Node writer's **64 KiB** pre-write threshold is not a maximum single-frame size. One permitted frame can raise the measured writable queue above that threshold; the tested large frame reached 139,510 bytes. It is then drained within the deadline or the observer is disconnected. No unbounded owned event queue is used.

| Measurement | Final recorded result |
| --- | --- |
| Churn scope | 30 subscriptions; 350 ms leases; 15 ms between iterations; 450 ms settling interval. |
| Churn sockets | 30 opened / 30 closed; 0 active; peak 11 temporarily overlapping closes. |
| Churn retained state | 1 live bus, 3 instrumented on/off listeners, 3 observer records; no work records. |
| Churn storage | 8 SDK save calls, **0 task-file writes**; 1 thread write / 1,348 bytes. Idle observer rotation/heartbeats do not rewrite the durable conversation. |
| Churn sizes / memory sample | 5,171-byte checkpoint; max 5,548-byte frame; 71,777,104-byte JS heap used / 267,239,424-byte process RSS. |
| Paused-reader scope | 1 real raw HTTP reader paused; 28 tasks with 2,000-character titles; 11 source updates, 110 ms spacing. |
| Paused-reader result | 1 slow drop, 0 active at measurement, healthy client still reads current state; max drain wait **100.643 ms**. |
| Paused-reader sizes / retention | Max frame 139,530 bytes; max writer queue 139,510 bytes; final checkpoint 139,647 bytes; 1 bus / 3 listeners / 1 observer record. |
| Paused-reader writes / memory | 12 thread writes totaling **4,531,692 bytes**, 0 task writes; heap used 66,040,040 bytes / RSS 276,185,088 bytes. Full historical JSON rewriting has measurable write amplification. |
| Work retention/cancel race | 36 work executions, alternating 0/8 ms cancel delays against 5 ms work; both completed and canceled outcomes verified; 32 retained work records. |
| Browser lease/stall | Multiple 600 ms renewals with preserved input focus; silent-open-socket test reconnects after 1,600 ms watchdog and 200 ms retry; 0 active streams after detach. |
| Frame rejection | Actual HTTP sends an oversized complete ASCII SSE frame; stock client rejects at its 4 MiB default. This is not a byte-exact arbitrary UTF-8 parser audit. |

The native EventTarget emits `MaxListenersExceededWarning` at 11 listeners during fast overlapping detach cycles. This warning was not suppressed. The measured final count returns to three and the route admits at most 16 streams. Instrumentation counts public on/off registrations; inherited once-listener internals and native queue lengths are not inspected. These finite process-memory samples include the SDK, Pi imports and test runtime, and do not establish a memory ceiling or a browser heap plateau.

## Actual model evidence

The already configured native Pi provider selected **`openai-codex/gpt-6-astra`**. That provider name describes Pi's authenticated model transport; no Codex agent CLI/session backs Exo. The custom host uses actual Pi SDK AgentSession with only `send_a2ui_json_to_client` exposed. Native shell/file tools and external extensions/context files are disabled for this execution. Credentials are resolved in place, never copied into this package.

M1 has a person selection/ask with **no utterance**, followed by an actual generated visual response with **no utterance**. M2 follows a host restart, accepted “move this after lunch” contribution and external Markdown time change. The projection includes exact historical A2UI structure, original source hash/object ID, current tasks/proposals/lights, relevant authored turns and causal references. The returned tool output identifies **research-review**, **11:00 original**, **13:00 accepted**, and **14:15 current**; Chromium renders it through the published Lit catalog. Both sessions produced one validated A2UI tool result. This demonstrates exercised semantic continuity, not general reasoning quality or reliable arbitrary model planning.

The final model rendered the equivalent readable times 11:00 AM, 1:00 PM and 2:15 PM. The test accepts either exact clock representation. Recorded semantic-projection sizes were 6,166 and 9,514 bytes; these exclude the system prompt/inline catalog and are not token or total provider-cost measurements.

Two earlier exploratory model choices, `gpt-5.4-mini` and `gpt-5.4`, were **FAIL**: the existing authenticated provider rejected those model IDs as unsupported for that account. The final runtime follows the operator's configured default, which passed. Those failures are model/account compatibility evidence; they were not relabeled as successful model calls or replaced with deterministic output.

## Remaining gaps and review decision

- **UNKNOWN / required before production:** long observation and browser-memory soak, concurrent cap admission under sustained overload, maximum-history/8 MiB/512 KiB saturation, operational archival, disk-full/partial checkpoint failures, power-loss/fsync guarantees and every malformed/UTF-8 frame boundary. The current file store's capacity checks are not a proved transaction rollback mechanism; exhausting them can leave an admitted in-memory mutation or an unpublished update. This is a real remaining hardening gap, not an always-on reliability pass.
- **UNKNOWN:** acceptance with multiple host writers, arbitrary external edits inside the final local write window, third-party provider uncertainty/idempotency, and live Pi cancellation races. The tested single-host event loop serializes local synchronous acceptance; the original source file is never overwritten. No third-party exactly-once claim follows.
- **UNKNOWN / outside spike integration:** real voice and cross-channel grouping, user's live Obsidian/Bases behavior, live calendar/task providers/preferences, general agenda planning, hardware/Matter and production authentication. The UI shows the most recent 12 turns; the bounded store retains all admitted turns, but there is no archive browser or multi-thread discovery.
- **Known design costs:** one complete checkpoint per publication; private JSON rewrite amplification; finite observation Tasks and readiness/renewal machinery; task and thread runtime projections requiring consistency on restart; deliberate model-context reconstruction; a specific generated-component subset. These obligations survive the no-patches constraint.

This A2A-only path is viable for further evaluation: native multipart Messages and standard work controls were reused successfully, and ordinary visual turns do not require Tasks. The bounded results do not prove lower total integration cost, eliminate the remaining G2 hardening gap, or authorize a final protocol choice. Review the observed behavior and ownership inventory alongside the independent alternative before changing canonical architecture.

---
status: proposed
---

# Compare agent protocols before choosing the client connection

Working discussion record, updated September 13, 2026. The `proposed` status is intentional: this file tracks alternatives and reasoning, not an accepted architecture decision. The open-questions table (kept private) is the current discussion index.

Exosurface requires independent background work, reconnect recovery, and shared actions across clients without dependency patches or a replacement SDK. The initial A2A preference relied too heavily on AG-UI integration defects: independent verification demonstrated a supported AG-UI Adapter and found A2A default-server lifecycle gaps too. The completed independent spikes and [post-spike debate](../research/2026-09-13-spike-debate.md) now support a narrow joint recommendation for A2UI over A2A. Both remain viable through supported integration; protocol adoption is still open.

Both alternatives use the same A2UI surface semantics and Lit renderer, including incremental updates and user actions. Compare protocol binding, work controls, execution-event conventions, and lifecycle integration cost; do not count shared UI capabilities as a distinguishing feature.

## Considered Options

- **A2UI over A2A:** Standard inspection, discovery, cancellation, subscription, and a documented A2UI binding reduce application-specific control conventions. Exo can use native multipart Messages for communication and Tasks for tracked work, projecting task state through a TaskStore Adapter. This need not create another authoritative database. The candidate uses non-streaming submission with separate observation and validates a route that handles disconnects.
- **A2UI over AG-UI:** Supported run/connect transport overrides can retain official event processing without patches. Message/event processing and a coherent snapshot can expose communication and current work; explicit turn associations, visual history, Pi meaning, and acknowledged cancellation remain host responsibilities. These application semantics must be documented; do not dismiss them as transport plumbing or inflate them into a mandatory duplicate of every A2A endpoint.
- **Replacement SDK:** Outside scope. Preserve upstream schemas and event/protocol machinery; use supported Adapters for application integration.
- **All three together:** Reopened as an alternative: A2A work controls and AG-UI client processing might save different work for the current product. Distinguish a split browser, an AG-UI-to-A2A host bridge, and sibling protocol Adapters over one Exo/Pi core. The last shares execution and domain behavior without serial protocol translation; each client may use one protocol. Account for identity/lifecycle mapping, control exposure and maintenance. No combined topology or score is selected.

## Implications and unresolved questions

The protocol choice remains open. The latest ratified review has both Astra and Fable narrowly recommending A2A. Scoped browser/Pi recovery is demonstrated on both paths; complete mandatory behavior and lower total integration cost remain unestablished. Historical changes of view are retained below.

Exo owns authority, durable storage, receipts, concurrent approval validation, source reconciliation, and surface reconstruction under either candidate. A2A input-required state does not itself implement those guarantees, and AG-UI's local abort is not an acknowledged remote cancellation. Surface identity outlives individual work executions. Allow full-snapshot recovery; do not mandate cursor replay or a permanent observation task without evidence.

## September 12 refinement

The [follow-up investigation](../research/2026-09-12-protocol-tradeoffs.md) identifies concrete AG-UI A2UI middleware/skill guidance and interrupt/resume conventions. A corrected SDK input resolves the earlier narrow ListTasks failure. A2A still standardizes active-work cancellation; AG-UI pause/resume is a different operation. Neither complete implementation nor lower maintenance cost is established.

The core product principle (kept private) is now adopted direction: visual interaction, language, and combined expressions constitute one temporal thread, including with no chat. Storage, semantic turn grouping, and protocol mapping remain open. This is a product principle, not a final protocol decision.

The [multimodal mapping investigation](../research/2026-09-12-protocol-tradeoffs.md#multimodal-thread-mapping) changes the assessment. Credit A2A for native multipart Messages and optional Task association. Credit AG-UI for text/activity processing relevant to the combined presentation, while accounting for its default activity exclusion from agent input and mutable current-view history. Both require Exo-owned meaning, referents, historical turns, and recovery. The subsequent ratified review below re-evaluates the prior weak preferences under this fuller criterion.

## Ratified thread and lifecycle review

The [September 12 adversarial review](../research/2026-09-12-thread-lifecycle-debate.md) explicitly preserved independent background execution and lifecycle reliability as essential alongside the full multimodal thread. Both agents accepted the same common statement. At that stage Astra weakly favored A2UI over A2A and Fable very narrowly favored A2UI over AG-UI, effectively even. That review established no shared winner or new executed reliability proof; the post-spike review below supersedes its ranking.

The comparison now includes supported AG-UI metadata carriers and explicit semantic association, native A2A task-bound history without treating it as a full thread archive, finite observer renewal/restart, complete checkpoint reconstruction, and resource/write-volume bounds. One ordered surface-publication path is a proposed mapping for the comparison. These refinements do not select a storage schema, permanent observation policy, or three-protocol topology.

## September 13 completed planning comparison

The [pre-spike weighted forecast](../research/2026-09-13-weighted-forecast.md) scored every criterion with estimates, ranges and confidence. At that stage its proposed baseline slightly favored A2UI over AG-UI (3.18/5 versus 3.13/5); small changes in priorities or observer costs reverse the order. This is a provisional first-path recommendation, not an accepted protocol decision or proof that mandatory behavior passes.

[Verified published source](../research/2026-09-13-weighted-forecast.md) also corrects the earlier metadata claim: client 0.0.59 merges event metadata into messages on the inspected text/activity paths. Exo still defines turn meaning and preserves historical referents. Middleware 0.0.10 publication was confirmed; complete Pi/Lit and lifecycle behavior was still unvalidated at that forecast stage. The historical debate's metadata assertions are superseded accordingly.

## Ratified post-spike recommendation and remaining gates

Both reviewers explicitly accepted the [same post-spike statement](../research/2026-09-13-spike-debate/common-statement.md): initial direction **A2UI over A2A**, low confidence and reversible. Agreed weighted scores are A2A **3.125** and AG-UI **3.075**. The small margin is within judgment uncertainty; useful standard work controls and a smaller demonstrated AG-UI processing saving support the recommendation, not numerical precision.

Both independent packages demonstrate bounded background/browser/Pi behavior with unchanged published SDKs. A2A uses owned observer Tasks, readiness/renewal, heartbeat-assisted release and a close-aware route. AG-UI implements run/connect/abort transport, publication and browser renewal while retaining official verification/application/subscribers. The protected default connect throws, but its public wrapper catches the specific error and returns an empty result. Neither result is a complete stock-SDK or CopilotKit solution.

AG-UI's rendered history/utterances come from Exo records; accumulated messages are only counted diagnostically. Its W5 score falls from 4 to 3. W2 and W6 remain tied because semantic meaning and generation policy belong to the host. A2A get/list are exercised through SDK clients; native cancel is used by the browser, whose thread discovery remains private. No universal SDK guarantee of stopped execution follows.

Neither implementation passes every mandatory requirement. AG-UI overwrites an arbitrary external edit during acceptance. A2A's exclusive plan strategy leaves final stale acceptance and later plan edits unresolved. Both need stronger forced-cut/backpressure and failure-atomic capacity proof. AG-UI's actual Pi Adapter requires an utterance, so fully chatless Pi interaction is unproved; its publication path can carry text-free turns.

No additional broad comparative spike is needed before an initial direction. The first mandatory lifecycle verification on the selected implementation should force snapshot cuts, renewal, interrupted publication and actual backpressure with healthy/paused observers and an asserted unique final revision. Needing an A2A SDK patch/private queue repair while AG-UI passes through supported extensions would reverse the recommendation. Resolve source/capacity and live-model outcome gaps before reliance.

The spikes demonstrate no current saving sufficient to justify combining protocols. Keep composition open only with explicit work removed versus mapping added. The [current weighted comparison](../a2a-vs-ag-ui-weighted-comparison.md) and [moderated evidence record](../research/2026-09-13-spike-debate.md) supersede earlier preferences and proof claims. This ADR remains **proposed**; reviewer ratification is not operator adoption.

## Follow-up: value of the private control convention

The [primary-agent control audit](../research/2026-09-13-private-control-convention.md) finds that both browsers use Exo-owned work snapshots and product actions. AG-UI adds a work-summary schema and one cancel command/result through existing paths; the current browser does not need a duplicate of A2A's query endpoints. A2A's standard types and handler/client machinery remain useful, but its query/store policy and product feedback remain owned. W4's net value for our clients is under review; the historical scores and exact reviewer statement remain unchanged.

Both callers need clearer result/error handling and receipt-versus-current-status rules. AG-UI's command/result typing and cancellation at capacity need work; A2A's owned task listing has source-confirmed ordering/pagination conformance gaps. Evaluate equivalent typed caller behavior and count shared semantics once. These are source findings and an open Interface proposal, not another consensus, executed gate result or new protocol selection. Background reliability, source authority and the full chat-optional thread remain essential.

## Follow-up: structured input and a shared Exo core

The [input/topology audit](../research/2026-09-13-a2ui-input-and-shared-core.md) traces A2UI renderer actions through A2A DataParts or AG-UI forwardedProps into Exo's own dispatch and deliberate Pi projection. Optional AG-UI middleware's synthetic tool messages are one model-input conversion; they do not replace the canonical person's turn. A2A's spike drops original action provenance during reconstruction; general input validation and active-session routing need fuller proof on both paths.

A shared Exo host built around Pi is a distinct proposed Module shape: one thread/history, receipt store, job registry, context builder and ordered publication source, with independently installed protocol Adapters. Pi extensions can supply tools/context hooks while process-level host code owns endpoint and observer lifetime. This can avoid a serial bridge, but two enabled Adapters still need separate lifecycle support and mixed-client validation. It does not require a browser to speak both protocols or select both for v1. The preference to explore this shape is primary-agent analysis, not an updated reviewer consensus.

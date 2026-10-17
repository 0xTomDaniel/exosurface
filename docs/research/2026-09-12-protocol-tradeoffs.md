# Protocol trade-offs and durable surface context

September 12, 2026. Follow-up investigation for the [requirements comparison](../a2a-vs-ag-ui-requirements.md). Three parallel subagents investigated A2UI bindings, lifecycle behavior, and durable context. This record separates source inspection, one newly executed discovery probe, and architectural proposals. No protocol or final storage design is selected.

**September 13 update:** [Verified package inspection and completed forecasts](2026-09-13-weighted-forecast.md) confirm publication of A2UI middleware 0.0.10 and correct the later debate's metadata-propagation claim. The dated inspections below retain their original scope.

## A2UI integration: concrete reuse, bounded examples

Both options have useful integration prior art. The cost question is adapting it to one Pi host, Lit renderer, persistent surface, and background observation path—not whether either can express an evolving UI.

| Source inspected | What it provides | What it does not establish |
| --- | --- | --- |
| A2UI Lit shell at `1c45c809b655878d06e3afc6dda22100afecc0a4` | A2A client and documented A2UI part/metadata mapping. | The sample uses non-streaming `sendMessage` and an SDK range of `^0.3.13`; it does not establish compatibility with the lifecycle probe’s SDK 1.1.0 or full background restoration. [Client](https://github.com/a2ui-project/a2ui/blob/1c45c809b655878d06e3afc6dda22100afecc0a4/samples/client/lit/shell/client.ts), [manifest](https://github.com/a2ui-project/a2ui/blob/1c45c809b655878d06e3afc6dda22100afecc0a4/samples/client/lit/shell/package.json). |
| Official AG-UI A2UI middleware at `747933694b05676203da7d5bb8d8e50432e59b75` | Progressive cumulative activity snapshots from A2UI-producing tool arguments, catalog context, and action conversion. | Its repository manifest says 0.0.10; registry availability was not checked in this September 12 investigation and was [confirmed September 13](2026-09-13-weighted-forecast.md). Tool-based activity identity is not automatically durable cross-run surface identity. Pi/Lit and observation integration are untested. [Source](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/middlewares/a2ui-middleware/src/index.ts), [manifest](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/middlewares/a2ui-middleware/package.json). |
| AG2 transport at `585dba87e13911527710db9c7b47346e74e4f54b` | Concrete `a2ui-surface` / `a2ui_operations` framing and forwarded action routing. | Inspected code collects operations and emits one snapshot after the turn with a new message ID. Its example is not evidence of per-operation streaming or persistent Lit recovery. Included tests use an in-process ASGI transport and mocked model; we inspected, not executed, them. [Source](https://github.com/ag2ai/ag2/blob/585dba87e13911527710db9c7b47346e74e4f54b/ag2/a2ui/transports/ag_ui.py), [test source](https://github.com/ag2ai/ag2/blob/585dba87e13911527710db9c7b47346e74e4f54b/test/a2ui/transports/test_e2e_ag_ui.py). |

The official developer skill **ag-ui-a2ui-integration 1.1.0** is identified and was read during this investigation. It distinguishes fixed-schema tool results from dynamic generation, preserves the existing agent architecture, and requires renderer/action verification. Its guidance informs the comparison; it does not select CopilotKit, install packages, or establish Exo’s Pi runtime generation skill. [Pinned SKILL.md](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/skills/ag-ui-a2ui-integration/SKILL.md).

AG-UI’s execution-event processing is a possible saving only when the product uses it. If Exo already publishes complete A2UI progress surfaces, duplicating that state in a generic chat/tool model can add mapping work. This is an architectural inference to measure with identical output, not a measured cost result.

## ListTasks: corrected probe, narrow discovery success

The lifecycle subagent found the original probe and executed a new real HTTP test with Node 26, `@a2a-js/sdk 1.1.0`, the stock JSON-RPC route, and InMemoryTaskStore. It created one completed task in one context.

| Request | Returned tasks |
| --- | ---: |
| SDK `listTasks({ contextId })` | 0 |
| SDK with `status: TASK_STATE_UNSPECIFIED` | 1 |
| SDK with explicit completed status | 1 |
| Raw JSON-RPC with omitted status and `A2A-Version: 1.0` | 1 |
| Raw JSON-RPC with `status: "UNRECOGNIZED"` | 0 |

The original JavaScript probe omitted `status`, which the generated TypeScript request requires. Its serializer turns that missing enum into `UNRECOGNIZED`; the store then filters for that state. Correctly initialized SDK input and a conforming raw request found the task. The earlier result is not evidence of missing discovery or a failure of valid typed input. [Generated request/serializer](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/types/pb/a2a.ts), [client transport](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/client/transports/json_rpc_transport.ts), [store filtering](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/store.ts).

This resolves the specific September 11 question. It does not validate multiple users, authorization, pagination, restart persistence, or complete surface discovery. The temporary probe uses synthetic executor output to exercise SDK discovery; its artifact payload is not a valid A2UI rendering test.

## Pending decisions, observation, and cancellation

AG-UI has interrupt/resume conventions, including correlation and response schemas. Its rules require a resume to cover all open interrupts and block unrelated new input on that thread while interrupts remain pending. That restriction needs assessment for a workspace containing multiple independent proposals. Equivalent resumes must be replay-safe by contract; Exo still implements atomic acceptance and source validation. Interrupt handling is present in the inspected 0.0.59 client, but neither our earlier tests nor this follow-up executed a two-client interrupt scenario. [Interrupt contract](https://docs.ag-ui.com/concepts/interrupts), [release client source](https://github.com/ag-ui-protocol/ag-ui/blob/release/2026-08-27/sdks/typescript/packages/client/src/agent/agent.ts).

An interrupt response marked `cancelled` abandons pending input. `HttpAgent.abortRun()` aborts a transport request. Neither establishes an acknowledged stop of independently running work. A2A’s cancellation operation remains a concrete standard-control benefit, while Exo must connect it to Pi and truthful outcomes. The inspected A2A handler’s no-live-bus branch also requires restart reconciliation. [AG-UI HTTP implementation](https://github.com/ag-ui-protocol/ag-ui/blob/release/2026-08-27/sdks/typescript/packages/client/src/agent/http.ts), [A2A handler](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/request_handler/default_request_handler.ts).

The inspected `connectAgent()` path bypasses run middleware while retaining chunk transformation, verification, event application, and subscribers. Therefore an A2UI bridge installed as middleware must explicitly cover observer publications too. This is a specific integration check, not a claim that connect loses all SDK processing. [AG-UI client source](https://github.com/ag-ui-protocol/ag-ui/blob/release/2026-08-27/sdks/typescript/packages/client/src/agent/agent.ts).

The previous version-scoped cleanup findings stand. No new full browser protocol, slow-consumer, restart, or concurrent-approval tests ran.

## Durable surface within a conversation: proposal

A meaningful surface should be a revisitable communication object associated with a conversation/context. Preserve its logical identity, current reconstructible state, and meaningful decision history. A browser instance is one presentation of it; an execution is one contributor to it. This is a proposed domain relationship, not an accepted storage design or a requirement to archive every UI update.

A2UI’s A2A binding associates related surfaces with a context. Its renderer surface ID and deletion rules do not specify a durable archive. A2A context grouping likewise does not guarantee complete message retention. [A2UI lifecycle/binding](https://a2ui.org/specification/v0.9-a2ui/#transport-bindings), [A2A context semantics](https://a2a-protocol.org/latest/specification/#341-context-identifier-semantics).

AG-UI thread identity and activity snapshots offer a structured conversational representation. Activity messages are frontend-facing and are not automatically forwarded to the agent. Exo must therefore supply relevant semantic surface state and decisions to Pi under either candidate; UI persistence and model memory are distinct responsibilities. [AG-UI activity messages](https://docs.ag-ui.com/concepts/messages#activity-messages).

Current documents may describe newer protocol capabilities than the tested packages. In particular, A2UI now labels v0.9.1 current and v1.0 candidate; the earlier v0.9 references do not select either for Exosurface. Package/renderer/catalog compatibility remains an explicit validation step.

See the architecture proposal and alternatives (kept private) for persistence choices and the cross-client history scenario.

## Multimodal thread mapping

A subsequent user clarification establishes the core product direction: visual presentations and direct interactions constitute conversational turns even with no chat; an utterance and visual interaction can jointly express one contribution. Two parallel source investigations examined the resulting protocol comparison. These are contract/source findings, not new execution or rendering results. Earlier lifecycle probes retain their stated versions and limits.

### A2A message support

A2A has native multipart Messages carrying language, media, and structured data. A direct Message response need not create a Task. Context membership can span Messages and Tasks. This corrects an overly task-focused account of the communication mapping. A message-only streaming response closes after one Message; ongoing incremental/background publication still needs an appropriate lifecycle/delivery mapping. [Message and Parts contract](https://a2a-protocol.org/latest/specification/#414-message), [streaming response semantics](https://a2a-protocol.org/latest/specification/#312-send-streaming-message).

The inspected SDK 1.1.0 types already include these message/part structures. Their existence does not prove the complete Exo client/host path. Optional task references must not become a requirement that every semantic turn create a Task. [Pinned generated types](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/types/pb/a2a.ts).

The current A2UI 0.9.1 extension describes structured client actions with surface/component references and action context. Optional data-model synchronization can provide further grounding input. Exo still owns the exact object/revision the user meant. The extension also distinguishes sequential operation processing from a transaction: packaging expressions together does not guarantee atomic rendering or domain acceptance. Its operation-list encoding and older overview/example encodings need a version compatibility check. [Extension source inspected September 12](https://github.com/a2ui-project/a2ui/blob/main/specification/v0_9_1/docs/a2ui_extension_specification.md).

A2A context grouping, GetTask/ListTasks, and task history do not constitute a complete conversational archive. In particular, listing Tasks cannot alone discover every direct-message exchange. Meaningful turns, historical visual references, and thread discovery remain host responsibilities. [Context semantics](https://a2a-protocol.org/latest/specification/#341-context-identifier-semantics), [history limitations](https://a2a-protocol.org/latest/specification/#37-messages-and-artifacts).

### AG-UI message processing

AG-UI text and structured activity messages can coexist in a thread. Mixed-media user input is already present in the published 0.0.59 core schema. These capabilities make message processing relevant to the combined product experience, beyond progress/tool displays. Media support alone does not identify a selected A2UI component at a historical revision. [Published core 0.0.59](https://unpkg.com/@ag-ui/core@0.0.59/dist/index.mjs).

The published 0.0.59 client filters activity messages from normal agent input. This is a default projection choice, not a prohibition on visual meaning: Exo can provide relevant meaning through supported input fields. Tool inputs/results may already supply some context, but do not guarantee later edits and historical referents are represented. [Published client 0.0.59](https://unpkg.com/@ag-ui/client@0.0.59/dist/index.mjs), [message guidance](https://docs.ag-ui.com/concepts/messages).

Text and activity use distinct message IDs. The inspected schemas do not define a semantic-turn identifier joining those expressions; a run ID identifies execution. Therefore an Exo association convention is a design inference to validate. Repeated activity snapshots replace current content and deltas mutate it; storing only the final client objects loses earlier visual states unless revisions are represented separately. Message snapshots containing any activity replace the activity set, whereas snapshots containing none preserve existing activity. This is current-view synchronization, not immutable history. [Event guidance](https://docs.ag-ui.com/concepts/events), [metadata guidance](https://docs.ag-ui.com/concepts/metadata).

The pinned A2UI middleware converts an action into synthetic assistant tool-call and tool-result messages, including surface, component, and action context. This is useful model adaptation. It does not define the canonical authorship, associated utterance, or observed revision of the user's contribution. [Middleware at 7479336](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/middlewares/a2ui-middleware/src/index.ts#L249).

### Consequences for the comparison

Native multipart packaging gives A2A a more direct representation to evaluate for one combined contribution. AG-UI's message/event processing gives it reusable current-presentation machinery to measure. Neither finding establishes lower total cost. Both still need Exo-owned semantic turn grouping, referents, meaningful history, and the model-input projection. Shared product semantics are counted once; candidate-specific projection and recovery work are compared separately.

The distinction between a turn and a protocol message/run also matters for pending decisions: an ordinary visual response need not put the entire conversation into an interrupt. The earlier interrupt constraints still need testing against independent proposals in the same thread.

Proposed common test: Exo presents a visualization and utterance together; the person selects a component and says “move this”; Exo transforms the surface. After reconnect, recover the current view and the original referent, and continue through Pi. Repeat without language, and with a source update arriving during the user's action. This must verify authored contributions, historical references, rendering, and model context separately. No such end-to-end test has run.

The earlier Astra/Fable weak preferences predate this fuller criterion. These investigations refine the evidence; they are not a new adversarial debate or a ratified consensus.

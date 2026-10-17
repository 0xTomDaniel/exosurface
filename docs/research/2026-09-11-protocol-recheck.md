# Independent protocol recheck and adversarial review

September 11, 2026. Codex gpt-6-astra and Claude fable-5.1, both at xhigh reasoning, independently investigated the audit claims before exchanging findings through four debate rounds. Neither a unanimous protocol winner nor a completed prototype validation is claimed.

**September 12 follow-up:** The empty ListTasks result below was traced to an omitted required enum default in the JavaScript probe. Corrected SDK and raw-wire requests found the expected task. See the [follow-up investigation](2026-09-12-protocol-tradeoffs.md) for the limited new discovery evidence and additional binding/interrupt findings. The original evidence record remains below.

## Outcome

Both independently verified published AG-UI lifecycle defects. Both also demonstrated that supported transport integration can preserve the official event-processing SDK while avoiding the tested detach behavior. The evidence therefore does not support rejecting AG-UI as incapable of background operation or necessarily requiring patches.

Both explicitly ratified a bounded comparison using one Exo host, durable fixture store, Lit/A2UI renderer, and common scenarios. Astra confirmed a weak A2A preference for standard work controls and the documented A2UI binding. Fable retains a weak AG-UI preference for the proven verifier/event pipeline and a smaller application model around persistent surfaces; Fable withdrew reducer reuse as a deciding rationale. No bundle-size or total implementation-cost advantage was measured.

## Evidence and limits

The executed probes used Node 26.0.0 with published AG-UI client 0.0.59. Fable additionally tested published a2a-js SDK 1.1.0 against HTTP loopback servers. Astra used instrumented WHATWG responses and inspected A2A tagged source; its acceptance of Fable's A2A results is shared evidence, not an independent execution of those probes. No browser or Lit rendering test was performed.

| Question | Evidence | Scope |
| --- | --- | --- |
| Is AG-UI's detach concern real? | Both reproduced a connection/source remaining active after unsubscribe or detach without explicit abort. | Published SDK path; not a protocol prohibition. |
| Can the connection be stopped without patching? | Explicit abort worked. Both tested a supported run/connect transport with owned abort handling while retaining SDK verification and event application. Fable observed the HTTP server connection close; Astra instrumented 100 attach/detach cycles with no active responses left. | Narrow cleanup proof; not complete browser or transport hardening. |
| Can native lifecycle framing carry repeated publications? | Astra processed 1,000 activity publications retaining one activity message. Fable processed 1,000 finite publication runs carrying CUSTOM payloads. | Framing and retention only; neither proves full native A2UI restoration or mandates CUSTOM. |
| Is A2A background continuation supported? | Fable observed execution continue after client abort; resubscription returned the Task first and then live events. GetTask returned completed state. Terminal-task subscription was rejected. | Actual SDK/HTTP test; application checkpoints still determine complete surface recovery. |
| Does A2A detach cleanly by default? | Repeated observation attach/detach on the stock JSON-RPC server accumulated listeners; after 20 cycles the bus held 22 event and 21 finished listeners. An unconsumed event queue held all 1,000 published events. | Stock server route and an in-process queue probe; no universal claim about A2A implementations. |
| Can A2A use an Adapter too? | Fable's application route around public resubscription kept listeners at baseline across 20 detaches. | Private route probe; standard-wire interoperability and stalled/slow subscribers still need validation. |
| Is streaming submission safe as the persistence owner? | Closing the A2A streaming-submit iterator let execution continue while stored state remained working with no artifacts. Non-streaming submission with immediate return independently persisted completion and the final artifact. | A2A SDK 1.1.0 tested paths; motivates separating submission/persistence from observation. |

AG-UI's upstream [PR 2627](https://github.com/ag-ui-protocol/ag-ui/pull/2627), merged September 9, added buffer and failure-cleanup improvements. These were absent from the published 0.0.59 package tested here. The rechecked source still did not settle consumer-unsubscribe teardown. Do not summarize this as either “nothing was fixed” or “background support is fixed pending release.” The [published transform](https://github.com/ag-ui-protocol/ag-ui/blob/release/2026-08-27/sdks/typescript/packages/client/src/transform/http.ts) and [supported AbstractAgent extension points](https://docs.ag-ui.com/sdk/js/client/abstract-agent) explain the distinction.

CopilotKit's [default runner](https://github.com/CopilotKit/CopilotKit/blob/v1.71.1/packages/runtime/src/v2/runtime/runner/in-memory.ts) observes its own execution state. Exosurface does not require that runner or CopilotKit. Its limitation must not be generalized to direct AG-UI with Pi.

The A2A probe findings correspond to its [released request handler](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/request_handler/default_request_handler.ts) and [Express route](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/express/json_rpc_handler.ts). The independent review distinguished client cancellation, server observer disposal, execution, and result persistence rather than treating them as one lifecycle.

## Remaining trade-off

A2A offers standard work-control operations and a documented [A2UI transport binding](https://a2ui.org/specification/v0.9-a2ui/#transport-bindings). Those can benefit first-party clients; external consumers are not a prerequisite. Its TaskStore can project the existing host store rather than introduce another authority.

AG-UI offers standardized event interpretation and message/tool/activity accumulation. Its minimal alternative need not clone every A2A endpoint: a coherent observation snapshot can expose work, pending proposals, and outcomes, with actions and acknowledged cancellation. A2UI already owns display data; durable provenance and receipts remain host responsibilities. The value of each approach must be measured against these minimal alternatives.

Still unvalidated: browser compatibility, actual A2UI restoration and interaction preservation, durable task/store behavior, concurrent acceptance, restart recovery, standard-wire cleanup, and resource bounds for stalled or slow clients. Fable's ListTasks probe returned zero results for an expected context and was not diagnosed; operation availability must not be reported as validated discovery. Neither protocol inherently guarantees cursor replay or removes source reconciliation and authorization work.

The architecture requirements (kept private) define the comparison and selection criteria. No upstream patches, copied SDK internals, replacement SDK, or three-protocol stack is authorized by these findings.

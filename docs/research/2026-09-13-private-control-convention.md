# Exo's private control convention: what A2A actually saves

September 13, 2026. Follow-up to the [ratified post-spike debate](2026-09-13-spike-debate.md), requested by the user. This is a source and existing-test audit by the primary agent, not another Astra/Fable consensus, a new runtime test result, or an accepted Interface design. Both spike packages remain unchanged.

**Finding:** For the current single-thread browser and Exo-owned voice direction, the additional AG-UI work-control convention is small in surface area: a work-summary schema and an explicit cancel command/result carried through the command and snapshot paths Exo already needs. It does not require implementing an A2A-shaped family of query endpoints. It still needs precise types, receipt semantics, caller behavior and failure coverage.

**Consequence:** A2A supplies useful standard contracts, but it does not remove Exo's private product Interface. Both delivered browsers show work from Exo snapshots; A2A's GetTask/ListTasks are exercised by tests, not used by that browser. The value of W4 as the deciding advantage is therefore under review. Preserve the ratified scores and historical recommendation, while distinguishing available standard contracts from demonstrated net work saved for our clients.

## The actual AG-UI convention

The browser sends commands through `runAgent({ forwardedProps: { command } })`. The supported AG-UI field carries an Exo object; AG-UI does not define its business meaning. A2UI actions also use this command route after validation against the exact saved surface. The command stream's `RUN_FINISHED.result` contains an acknowledgement or result; ongoing work appears in the separately observed thread snapshot. [Official AG-UI input types](https://docs.ag-ui.com/sdk/js/core/types).

One actual control request has this shape, using illustrative IDs:

```json
{
  "kind": "cancel",
  "requestId": "cancel-123",
  "actor": "person",
  "workId": "work-456"
}
```

| Part | Current contract | Who must understand it |
| --- | --- | --- |
| Thread identity | The command and observer target the known daily-agenda thread. | Host and client binding; neither prototype implements general multi-thread discovery. |
| Logical request identity | `requestId` identifies a command attempt that may be redelivered; a stored fingerprint rejects reuse with different contents. | Host receipt handling and a client that retries. AG-UI `runId` is a separate transport/publication identity. |
| Work identity | Admission returns `workId`; snapshots contain the associated work record. | Host and client control binding. |
| Cancel acknowledgement | Running work receives an abort request and returns `{ status: "cancelling", workId }`. | Caller must treat this as a request acknowledgement, not proof of stopped execution. |
| Terminal observation | The executor later publishes `cancelled`, `completed`, `failed` or `interrupted` in the work record. | Work UI and other clients observe the host's current truth. |
| Late or missing target | A new cancel request for terminal work returns its existing status/outcome; unknown work returns `not-found`. | Caller presents the outcome; permission/retention policy needs fuller design. |
| Detach | Closing an observer releases that connection; it does not invoke the cancel command. | Transport/observer binding. This support belongs to W1, not the incremental work-control convention. |

Most of the eight command kinds are product actions: `plan`, `move`, `select`, `accept`, `light`, `ask` and `history`. They express agenda, conversation or source decisions that A2A also needs Exo to define. Their exact division into verbs can change. `cancel` is the additional generic work-control verb. A small verb count does not establish low total cost: result meaning, retries, authorization and error handling are part of the Interface too.

## What each candidate removes, and what remains

This comparison uses the current owned clients and bounded work list. It does not assume an independent external A2A consumer or a future fleet-wide task query requirement.

| Product need | A2UI over AG-UI | A2UI over A2A | Incremental saving or obligation |
| --- | --- | --- | --- |
| Show current work | Browser reads `view.works` from Exo's state snapshot. | Browser reads `snapshot.work` from Exo's checkpoint. | Both already need this projection for the surface. AG-UI need not add GetTask/ListTasks equivalents just to render this list. |
| Discover and restore the thread | Owned observer endpoint sends current thread state. | Owned `discover` DataPart returns the thread checkpoint and current observer Task ID. | Both have Exo-specific thread discovery. Native task queries do not describe the complete surface/history. Recovery mechanics remain W1. |
| Stop selected work | One Exo cancel command; immediate acknowledgement, then authoritative work observation. | Published CancelTask request, Task response and semantic errors; the executor waits for the stop path before returning in this spike. | A2A supplies standard request/result types and handler behavior. Exo still handles stop execution, UI feedback, races and already-applied effects. |
| Inspect one task or page through tracked tasks independently of a surface | No standalone query in the delivered client; the bounded snapshot contains current retained work. | Published GetTask/ListTasks and client methods exist and are tested. | A2A has a real contract advantage if this independent query is needed. The current browser does not consume it. A future AG-UI query can be small and purpose-specific; it need not copy every A2A query feature. |
| Query implementation | Work list is part of the existing thread projection. | Exo implements TaskStore filtering, access scope, pagination, ordering, retention and storage. The handler performs some validation/history shaping. | Standard contracts supply obligations and reusable types/dispatch; they do not supply our query/store implementation. |
| Submit domain actions and read historical meaning | Exo command/result schemas, proposal receipts, exact surface references and history. | Exo action-context/DataPart schemas, proposal receipts, private discovery/history requests and acknowledgements. | A2A does not eliminate this product Interface. Charge the shared meaning once, then compare translation. |
| Render current status and control failures | Browser must join the acknowledgement with the observed work status. | Browser must map the returned Task or semantic error to the observed Exo work record. | A2A saves typed low-level contract work. Both require a coherent product-level result and error presentation. |

The A2A prototype also maintains native Task records and an Exo thread work projection. Keeping them consistent is an implementation responsibility; it is already charged to lifecycle/recovery rather than added again as a W4 penalty. Different Module shapes could change that cost.

## Receipts, execution and observations are different facts

The AG-UI prototype stores the original result against a request fingerprint. A duplicate admission after host restart can therefore return `accepted` while the current work record says `interrupted`. An existing test explicitly asserts both outcomes and checks that no second work item was created. This is coherent if `accepted` means the earlier command was admitted; it is misleading if the client interprets every response as current work status.

The same receipt mechanism predicts that replaying the identical cancel request can return its original `cancelling` acknowledgement after work has reached `cancelled`. That exact cancel replay was inferred from source, not newly executed. A new request ID returns the current terminal status. The client contract must say where to find present truth and how to retry the same logical request.

| Fact | Example | Current or proposed treatment |
| --- | --- | --- |
| Command receipt | “Your request was admitted” or “stop was requested.” | Preserve its request/work association; do not reinterpret it as a fresh execution report. This distinction is present in behavior but weakly expressed in result types. |
| Current work status | “The job is now cancelled” or “the host restarted and interrupted it.” | Read the authoritative work projection. Admission or publication completion alone is insufficient. |
| Domain effect | “This agenda proposal was applied” with a receipt/source revision. | Retain separately from job status. Stopping planning does not undo an accepted calendar/vault change. |
| Connection status | “This browser is attached/reconnecting/detached.” | Keep separate from work and effect status under both protocols. |

A2A provides a standard Task state and cancellation exchange, but Exo still needs command/effect receipts and semantic thread state. Message submission deduplication is not automatically guaranteed by the protocol; the specification permits implementations to use message IDs for it. [A2A operation semantics](https://a2a-protocol.org/latest/specification/#331-idempotency).

## Concrete unfinished work revealed by the audit

| Finding | Evidence and scope | What follows |
| --- | --- | --- |
| AG-UI command/result typing is loose | `CommandSchema` makes verb-specific fields optional; a cancel without workId can pass structural parsing and return not-found. Results are `Record<string, unknown>` plus a status string, and clients cast them rather than validate a per-command result. | A small private Interface should validate required fields and typed outcomes once. This is real owned work, not a reason to reimplement a general protocol SDK. |
| Both Stop buttons omit complete result/error presentation | AG-UI calls `command(cancel)` without consuming its result or displaying failures. A2A awaits native CancelTask without mapping its response/errors into local feedback. Both rely mainly on subsequent snapshots. | Native types do not deliver the whole control UX. Test refused/unknown/late cancellation and connection failure at the actual caller. These are source findings, not newly observed browser failures. |
| Receipt replay and current status need explicit caller rules | AG-UI's restart test preserves the original accepted receipt while work is interrupted. Generic request receipts exist there; A2A's local intent path primarily deduplicates accepted proposals, not every command admission. | Define stable request IDs across retries, correlation and reconciliation after lost responses under both paths. Do not infer arbitrary admission idempotency from the earlier two-client acceptance test. |
| Cancellation at capacity needs coverage | AG-UI's generic history/receipt capacity check precedes its cancel branch. Source therefore permits rejection before the abort request at those limits. | Control availability under saturation belongs in the mandatory capacity check; current bounded cancel passes do not settle it. |
| A2A query conformance needs correction/validation | The supplied TaskStore sorts by ID and treats pageToken as a numeric offset. The existing page test counts three returned tasks but does not check required ordering or cursor behavior. | The pinned v1.0 specification requires descending status-time ordering and cursor pagination. This is a source-confirmed mismatch in owned store code, not a missing SDK capability or a newly executed failing test. Broader ListTasks conformance is not established. |
| Broader query and access needs remain unspecified | Both clients start from one known thread and small retained work lists. Actual voice identity, cross-thread queries, fine-grained permission scopes and independent consumers were not exercised. | Do not award speculative saved implementation for query features with no present caller. Revisit when an actual consumer needs them. |

The ordering/pagination requirements were checked in the [pinned A2A v1.0 document](https://github.com/a2aproject/A2A/blob/v1.0.0/docs/specification.md#314-list-tasks), and against the current official specification. The owned store implements a different ordering/token policy. SDK-client test success demonstrates exercised exchanges and narrow scoping; it is not complete standards conformance.

## A bounded Interface proposal to evaluate

One Exo client Module could expose intent submission, thread observation, cancellation and exact historical lookup while hiding wire envelopes and normalizing acknowledgements/errors. This is a proposal to inspect, not a selected package, new runtime layer or accepted method naming.

| Client-facing responsibility | Behavior to centralize | What it must keep separate |
| --- | --- | --- |
| Submit intent | Validate the product command, assign/preserve a logical request ID, and return a typed receipt with any work/turn association. | Admission versus current work versus source effect. |
| Observe the thread | Restore current state and follow ordered publications, expose work/proposals/history references, and release the observer. | Connection lifecycle versus execution lifecycle; full observation support is W1. |
| Request cancellation | Target a work ID, normalize requested/already-terminal/unknown/refused results and expose a way to observe terminal truth. | Abort of the client's transport versus an explicit stop request to Exo. |
| Inspect historical context | Return the exact saved surface/reference or a typed absence result. | Historical presentation versus authoritative current source data. |

The same product-facing shape is possible over either candidate. An AG-UI Adapter can preserve official event processing; an A2A Adapter can preserve standard task controls. A typed helper is worthwhile only if it concentrates behavior and removes repeated caller knowledge. Moving the same casts into another file without owning the result semantics would not achieve that.

For v1, an entire generic work-management SDK is unnecessary unless actual clients require independent task queries, richer lifecycle operations or external interoperability. Equally, calling a private convention “one small command” does not waive retries, validation, access checks, stop outcomes or maintenance.

## Implication for W4 and the recommendation

The ratified W4 rubric measures useful available work-control contracts. On that definition the agreed 4.0 versus 2.5 scores remain a historical reviewer judgment. This audit asks a more specific adoption question: **how much additional maintained behavior does A2A remove for the clients we are actually building, after both paths expose the Exo product Interface?**

The current evidence does not support treating AG-UI as requiring a large replacement control system. Both work lists already use host projections; much of both command vocabulary is shared product work. A2A's strongest concrete incremental contribution is its typed cancel/query contracts and handler/client machinery. Its store/query and product-result obligations remain owned.

**Primary-agent assessment:** This weakens reliance on W4 as the tie-breaker and strengthens the case for a small Exo control convention over AG-UI. It does not establish a new protocol winner, measured engineering cost or a new consensus. Keep the central scorecard intact but prominently mark its deciding assumption as under review. The existing sensitivity already shows that reducing A2A W4 from 4 to 3.5 changes the totals to 3.050 versus 3.075 and reverses the order; this is a scenario, not an adopted re-score.

The useful next comparison is bounded: give the actual caller equivalent typed cancellation/result handling on each path, then compare owned responsibilities and verify concurrent/repeated cancellation, lost acknowledgements, completed/unknown/denied targets, restart and capacity. Count common source/receipt behavior once. Include query conformance only to the extent those published operations are provided or an actual client needs them. This can extend the existing packages when authorized; it does not require another broad pair of products or adding A2A to the AG-UI client.

All previous essential background, source-authority and chat-optional requirements remain. The existing arbitrary external-write failure, forced-cut/backpressure gaps, capacity hazards and live Pi cancellation uncertainty are unaffected by this source audit.

## Evidence pins

Both worktrees were clean at the start of this audit and their commits matched the prior debate. No package, test or model execution occurred in this follow-up. Package paths below resolve at the named commits, as described in the [spike evidence provenance](2026-09-13-spike-debate.md#evidence-provenance).

| Evidence | Pin and files |
| --- | --- |
| AG-UI private commands, states and results | `add66812b20bcf20e6189cfd9c1c1c8b4bb2e2fa:spikes/ag-ui-pi/src/domain.ts` and `src/host.ts` |
| AG-UI caller and wire envelopes | Same package: `src/browser.ts`, `src/server.ts`, `src/publication.ts` |
| AG-UI recorded cancellation/receipt proof scope | Same package: `test/lifecycle.int.test.ts`, specifically deterministic cancel, late cancel and restart receipt assertions; earlier recorded results, no new run |
| A2A private product contract and browser use | `8af5351d896adcc22f8046e58521d3692f3be53a:spikes/a2a-pi/src/client.ts`, `client/app.ts`, `src/schema.ts`, `src/thread.ts`, `src/host.ts` |
| A2A query implementation and narrow test | Same package: `src/task-store.ts`, `tests/lifecycle.int.test.ts` |
| A2A supplied handler behavior | Installed unchanged `@a2a-js/sdk` 1.1.0, `dist/server/index.js`, sendMessage/getTask/listTasks/cancelTask; cross-reference [tagged handler source](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/request_handler/default_request_handler.ts) |

No final protocol selection, replacement SDK, shared implementation package, new command schema or production deployment is adopted by this note.

## Documentation validation

The HTML was regenerated from the canonical comparisons. Checks passed for all 25 requirements, seven weighted tables with 184 header/body cells, six scores and weight profiles, and two joint scenarios. Chromium checks passed at 320, 390 and 1440 pixels, including keyboard table scrolling and readable content without JavaScript. Desktop/mobile screenshots were inspected. All 50 annotation anchors, styling classes, interaction logic and 12 styling/vendor/Spec Chat asset hashes were preserved; 112 local Markdown link targets resolved. Both spike worktrees remained clean at the reviewed commits. These documentation checks add no protocol, model or production reliability evidence.

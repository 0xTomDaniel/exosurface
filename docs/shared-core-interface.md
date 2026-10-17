# Revised shared Exo Interface

Working revision 2, September 14, 2026. This revises the shared-core proposal (kept private) using the [25-requirement coverage check](shared-core-protocol-mapping.md) and runtime borrowing review (kept private). It defines proposed caller-visible behavior, internal collaboration contracts and record families. It is not an accepted specification, implemented package, storage selection or protocol verdict. Names and declarations are illustrative; the behavior tables are part of the proposed Interface.

**Direction:** Keep four main capabilities, with explicit contribution, execution, output and outcome contracts. Conversation remains the authored exchange of Surface, Utterance or both; Work Runtime owns execution and blocking input; Workspace owns proposals, sources and effects; Observation owns coherent views and live delivery. Exo Host coordinates admission and committed change.

This revision supplies proposed representations for the gaps. It does not repair either spike, demonstrate the new behavior, or make every optional native protocol feature part of v1.

Revision 2 adds host-owned trigger admission, effective execution profiles and exact tool authority, derived-context lineage, optional executable continuation, work-wide budgets and host supervision. These deepen the existing five Modules and four public capabilities. The [revision crosswalk](#revision-coverage-and-remaining-decisions) distinguishes the new proposal from prior source evidence and remaining decisions.

**Follow-up outside revision 2:** The new provider-portability requirement and harness-selection brief (kept private) adds requirement 26 / gate G7 beyond the historical 25-row mapping. Pi references remain the spike baseline while harness selection is reviewed. Actual provider/model identity, capability compatibility, vendor-independent credentials and safe switching require an explicit profile/context/continuation amendment; this revision does not yet prove that coverage. The related new-thread agent/routine automation contract is also still a proposed follow-up (kept private).

## The four public capabilities

This is the process-local Interface between an enabled protocol Adapter and Exo Host. The host binds it to authenticated caller scope; a browser payload cannot choose its own principal or permissions. Runtime triggers use the private, host-authorized admission Seam defined below, sharing commit and execution rules with public submissions. A2A Tasks, AG-UI runs and transport connections remain Adapter associations rather than core authority.

```typescript
interface Exo {
  submit(command: Submission, call?: CallOptions): Promise<AdmissionReply>;
  read(query: ReadQuery, call?: CallOptions): Promise<ReadReply>;
  observe(request: ObserveRequest, call?: CallOptions): Promise<ObserveReply>;
  cancel(command: CancelCommand, call?: StopWaitOptions): Promise<StopReply>;
}
```

| Capability | Explicit proposed contract | Successful return establishes | It does not establish |
| --- | --- | --- | --- |
| submit | Validate a typed contribution or targeted input; resolve references and request identity; coordinate a recoverable receipt, meaningful turn and any admitted work or immediate domain resolution. | The recorded admission/handling disposition and stable associated identities. | Model completion, successful source application or delivery of queued steering to Pi. |
| read | Read a typed current, historical, request, trigger, work, input, effect, discovery or capability view under current authorization and bounded retention. | The named view at its stated revision/time, or a typed absence/failure, including supported cause/profile/usage information. | Infinite history, source freshness beyond its declared observation, executable state supplied by a viewer, or a refreshed outcome when only an original receipt was requested. |
| observe | Establish one coherent checkpoint, including reconstructible active output, then deliver ordered publications; return an independently releasable handle. | The checkpoint cut and delivery contract for that observer. | Ownership of work, unlimited replay, or bounded downstream SDK/HTTP queues without Adapter proof. |
| cancel | Record one logical stop command for a specific work identity/generation; optionally wait for a terminal observation within a per-call deadline. | A stop receipt and separately labelled current work observation, or a typed refusal/unknown result. | That an accepted stop has finished, that a timeout means stopped, or that source effects were rolled back. |

CallOptions contains a bounded wait deadline and optional caller-detach signal. These govern the call's wait, not admitted execution. For observe, detaching the handle releases only that observer. After mutation admission, a dropped response or caller deadline cannot silently withdraw the request. Query work/receipts or retry the same logical request when its retry scope remains valid.

For observe, the call deadline bounds initial attachment; the declared observer lease separately bounds its lifetime. A supplied detach signal remains associated with the returned handle. Per-call detachment never changes the work's stop or input-resolution state.

## Contributions and targeted input

Every admitted meaningful contribution retains its original expression alongside the host's normalized interpretation. An authored turn can contain visual interaction alone, language alone, or both. It is not defined by a protocol message, model session or transport publication.

```typescript
type RequestKey = {
  threadId: ThreadId;
  retryScope: RetryScopeId;
  requestId: RequestId;
};

type Submission = RequestKey & (
  | { kind: "contribute"; contribution: Contribution }
  | { kind: "follow-up"; afterWorkId: WorkId; contribution: Contribution }
  | { kind: "steer"; workId: WorkId; generation: number;
      contribution: Contribution }
  | { kind: "respond"; inputRequestId: InputRequestId;
      expectedVersion: number; response: InputResponse;
      contribution?: Contribution }
);
```

An ID denotes one domain identity, not an arbitrary interchange with another ID family. For example, a SurfaceRef contains thread, surface identity/incarnation and exact surface revision; a SourceRef separately identifies the provider record and its version. Work generation identifies a particular execution attempt. The declarations use named record families defined below rather than raw protocol envelopes.

| Record or operation | Required meaning | Owner and validation |
| --- | --- | --- |
| Contribution | Non-empty ordered expression parts: original A2UI action, utterance, or both. Include exact references and optional respondsTo/relatedTurn association. An utterance records written/spoken mode; optional submitted A2UI data model stays associated with its surface. | Conversation retains original action name, surface/component IDs, original timestamp, resolved context and associated language. Authorship and received/committed ordering come from Host. Normalized intent never replaces original provenance. |
| Action and reference validation | Original action must resolve against the retained surface/catalog and permitted input bindings. Submitted values are validated against the allowed action and value schema. A binding expression is not compared literally with its resolved value. | Conversation establishes what was offered and selected; Workspace checks present source authority. Missing historical data is a typed unavailable-reference outcome, never substitution with the current surface. |
| contribute | Admit the meaningful input and choose deterministic handling or new model work according to the host's declared action policy. A proposal acceptance includes exact proposal identity/version and recorded dependency references. | Callers do not select a hidden Pi session or duplicate routing rules. Validly recorded input can later resolve to a domain conflict/refusal; acceptance of input is not acceptance of its requested effect. |
| follow-up | Record a contribution explicitly related to afterWorkId. If execution is needed, admit a distinct successor work identity and queue it according to policy. Terminal work is not reopened. | Runtime exposes queued/delivered/not-delivered resolution. Proposed first policy: a follow-up waits for the target to become terminal, then evaluates current facts and the target outcome before starting. A user may cancel the queued successor by its own work ID. |
| steer | Address the specified active work generation. Queue delivery to that execution's supported input point; do not silently convert it into follow-up or redirect it to a replacement session. | Runtime declares whether steering is supported for that work. If the target ends before delivery, publish not-delivered with the reason. Queued, delivered and incorporated into a model's behavior are different claims; receipt alone proves only queue admission. |
| respond | Address one InputRequest version with a typed answer or explicit abandonment. The structured response is itself a meaningful contribution even without language or another A2UI action. | Runtime atomically resolves the request and records the responding turn. Concurrent responses to the same version yield one resolution; other callers see the existing resolution or a typed conflict. A negative answer is distinct from abandonment. |
| RequestView | Original immutable admission receipt, plus separately versioned current handling: queued, delivered, resolved, refused or not-delivered, with reason and associated work/effect/input identities. | Host coordinates the record; Runtime or Workspace supplies the current result. A read of an original receipt does not rewrite it to look like current execution state. |

Proposed first grouping policy: expressions submitted together form one contribution. A later separate delivery creates another causally linked contribution; it does not silently rewrite the earlier one based on timing proximity. Live speech/gesture composition may introduce explicit amendments later. Browser drafts and navigation remain local until submitted; that policy does not make every keystroke a turn.

## Host-owned trigger admission

Work Runtime delivers configured schedule/source causes through a private Host admission Seam. It shares the commit, routing, capacity and outcome rules of public submit, while the public Submission union remains limited to participant input. The Host binds trigger authority and validates the configured source; a browser cannot choose this identity by setting a payload field. A configured daily timer and source-change bindings are enough for the first prototype; arbitrary trigger creation is not exposed.

```typescript
type TriggerKey = {
  threadId: ThreadId;
  triggerId: TriggerId;
  occurrenceId: OccurrenceId;
};

type TriggerAdmission = TriggerKey & {
  bindingVersion: number;
  cause:
    | { kind: "schedule"; scheduledFor: Instant }
    | { kind: "source-change"; source: SourceRef; eventId: string };
};
```

These are internal record families. A trusted binding supplies the permitted thread/source, effective-profile selection and acceptance policy. Occurrence identity survives delivery retries, configuration renewal and process restart. Changing a binding must not reissue the same occurrence as fresh work. A source model message may use a provider's user role; canonical authorship still records a host/source cause. An Exo response can create a later authored turn without a fabricated human contribution.

First admission freezes the binding version, cause fingerprint and disposition. Under current disclosure authority, replay recovers that original disposition; a newer delivery/configuration version cannot reinterpret it or create a second admission. Changed cause under the same occurrence conflicts. Renewal never makes a retired occurrence eligible again. For an occurrence without a prior receipt, Host must establish eligibility under its retained binding policy before admitting it.

| Trigger contract | Required behavior | Observable result |
| --- | --- | --- |
| Admission and disposition | Atomically record the cause/fingerprint, original trigger receipt, disposition and any work before acknowledgement. Identical occurrence replay returns its receipt; changed cause under the same key conflicts. | created-work, coalesced-with-work or skipped under the declared binding policy, with exact cause/work references. Not-admitted, indeterminate, unavailable and denied retain the meanings of the common admission results. |
| Bounded occurrence retention | Retain fingerprints/dispositions throughout the declared acceptance horizon. Prune only when durable eligibility metadata will reject the forgotten occurrence; absence of a receipt never proves freshness. | Expired/unverifiable replay returns trigger-expired/unavailable, with prior admission unknown if its receipt is gone. Expiry does not stop admitted work or remove unresolved work/effect obligations. |
| Source ordering and scheduling | A binding declares acceptance horizon, ordering, overlap and missed-occurrence policy; schedules also declare time zone and repeated/skipped local-time behavior. A monotonic watermark is valid only for ordered identities under an explicit late-event policy; unordered sources need verifiable expiry/epoch eligibility and retained identities. | Skip/coalescing must be discoverable, with retained cause references or a bounded complete range explanation. If the source cannot support safe occurrence identity/eligibility, declare the binding unsupported. |

Exact timing, horizons and skip/queue/coalescing choices remain required binding configuration to resolve before implementation. A missing policy is a configuration failure, never an unlimited backlog or implicit rerun. The first proposal avoids changing the inputs of already-dispatched work when newer source events arrive; reconcile or queue later work under the binding policy. Re-reading current facts does not erase what originally triggered the work.

## Admission, retries and bounded retention

The host coordinates one recoverable local admission before acknowledging it: original/normalized contribution or trusted trigger record, receipt, handling/disposition record, any admitted-work record and committed revision. A contribution includes its authored turn; a trigger does not require one. Long-running model/provider work occurs outside the short commit section. A valid contribution can be recorded even when the resulting domain decision is a refusal or conflict; malformed or unauthorized input is not automatically part of the conversation.

| Result | Caller may conclude | Retry and identity rule |
| --- | --- | --- |
| admitted | The supplied original receipt identifies a recoverable admission. Current handling may still be queued or pending. | An identical retry returns that receipt, with any current view labelled separately. Different normalized command content under an already-recorded key is a conflict. |
| not-admitted | The host can establish that this logical request has no committed admission and this attempt left no partial turn/work/effect. Failure includes its reason and retry guidance. | This result does not reserve the ID. Retry the same content only when permitted; a corrected or deliberately new intent uses a new request ID. Capacity/backoff is distinct from invalid content. |
| indeterminate | The host cannot establish whether admission committed, for example after an uncertain storage outcome. | Read the RequestView or retry the same key. Do not mint a new request automatically or report definite non-admission. Fail closed on effects until local recovery establishes the record. |
| unavailable | Prior admission cannot be established within retained history. An expired/unknown scope cannot authorize execution, even if a receipt was once recorded. | Report expired-scope/receipt-unavailable with prior admission explicitly unknown. Inspect associated history/work/effects where available; never classify this as not-admitted or automatically issue new intent. |
| denied | Current authorization does not permit the call or disclosure of a prior request. | This does not disclose whether the request previously existed. Authorization is rechecked before receipt replay; it never triggers re-execution. |

**Proposed bounded retry mechanism:** read/observe of an authorized thread supplies a core-issued opaque retry scope with a validity limit. Combine it with a client-generated request ID; both Adapters preserve those values. Scope issuance/admission and retention are bounded. Store the normalized fingerprint and original compact receipt for at least the remaining validity of the scope, with capacity reserved before acceptance. An expired or unknown scope cannot authorize fresh execution, including after restart; an available prior receipt may still be read under current authorization.

This avoids treating a forgotten old ID as a new action. If an expired receipt is no longer retained, report receipt-unavailable/expired-scope rather than run the command again. Expiry does not stop admitted work or erase an effect. A new scope and new ID represent a deliberate new intent, never an automatic recovery from an uncertain acknowledgement. The scope's issuance/verification/storage mechanism and numeric horizon remain implementation decisions to prove; it is not a new user authentication mechanism.

For public requests, the logical key is scoped to authenticated principal, thread, retry scope and request ID; triggers use their separately defined TriggerKey and eligibility rules. Public-request equality includes the operation, target, expected versions, original expression and submitted values. Ignore serialization key ordering and Adapter-only request/run/connection IDs; preserve semantically ordered lists and original timestamps/component IDs. Per-call wait preferences, deadlines and tracing are excluded. Normalization is versioned and stable for the lifetime of a retry scope, including upgrades.

Admission capacity is distinct from control capacity. Reserve bounded capacity for stopping, responding to existing input, reconciling effects and recording terminal work before admitting new work. If storage cannot safely record a control outcome, return a truthful failure/indeterminate result; do not acknowledge a durable stop that was never recorded. Hard resource limits and numeric deadlines remain required configuration, not unlimited defaults.

## Effective execution profile and tool authority

Host selects an authorized, immutable effective-profile reference for each work generation. Runtime materializes it through Pi and records which context projection it consumed. A saved profile is provenance, not a permanent permission grant: current authority and source validity are checked before dispatch and after reconstruction. Profile changes require an explicit version transition; an incompatible retained invocation must be refused or ask a new exact question.

| Record or rule | Required meaning | Owner and invariant |
| --- | --- | --- |
| ExecutionProfile | Model/settings, skill/catalog versions, resolved tool implementation/resource version or digest separately from argument-schema version, tool availability, execution limits and policy revision used by a generation. Keep credentials out of the record and public view. | Host chooses permitted configuration; Runtime materializes it. Missing tools/guidance or incompatible/unverifiable tool behavior yields an explicit failure/unsupported continuation. Unchanged argument schema alone cannot authorize restored invocation or approval transfer. No silent widening during reload. |
| ToolInvocation | Stable invocation ID within Work, canonical tool/argument/schema fingerprint, intended effect identity/targets when relevant, profile reference and current dispatch generation/phase. | Runtime owns dispatch; Workspace owns the effect. Tool discovery or a generated skill does not authorize invocation. Every effect-producing path uses the source/effect Seam. |
| Invocation decision | Allowed by current policy, denied, or waiting for a versioned InputRequest. A required approval records exact invocation/effect identity, arguments/targets and grant scope. | Proposed first grant scope is one invocation; broader persistent grants are optional and need expiry/revocation rules. No viewer implies no approval. A durable question can be answered later through either enabled client. |
| Continuation after approval | Resolve the InputRequest once, then transfer the same invocation's dispatch ownership to an eligible generation through a serialized transition. Preserve Work/effect identity and decision provenance. | Stop/terminal fences, current authority, compatible profile and source checks apply. The old generation cannot also dispatch. Already-issued or uncertain effects are reconciled first; identical arguments do not authorize a second effect. |

A negative answer, explicit abandonment, revoked authority, incompatible profile and source conflict remain different outcomes. A decision authorizes only the bound invocation; changing the arguments, tool/schema or intended effect requires a new decision where policy requires one. Once resolved, a question is not reopened to conceal a changed invocation. Tools may execute concurrently only under the declared Runtime policy; one active Pi session does not imply sequential tools.

## Execution, blocking questions and source effects

| Record | Proposed states and required association | Invariant |
| --- | --- | --- |
| Work | queued, running, waiting-input, waiting-authorization, stopping; terminal completed, stopped, failed, interrupted or rejected. Include work/thread identity, cause references and originating turn when present, generation, effective-profile/context references, budget/usage, status time, dependencies, input delivery and retained results. | Work outlives observers. Terminal execution is not reopened; any later execution gets an explicit identity/association. A host restart marks lost execution interrupted unless supported resumption is demonstrated. Triggered work need not originate in a human turn. |
| InputRequest | Open, resolved, abandoned, expired or closed because its work ended. Include identity/version, work/generation and optional exact invocation binding, expected response schema, question/authorization kind, expiry and resolution. | It blocks only the identified work in the proposed first policy. Resolve once against the expected version. Questions and answers participate in Conversation; credentials themselves are not conversational content. Approval binds the invocation and grant scope defined below, not arbitrary later tool arguments. |
| Proposal | Independently addressable suggestion, exact intended change/dependencies, version, pending/accepted/stale/declined state and effect association. | A pending proposal does not by itself suspend execution or thread input. Several proposals can coexist; acceptance does not prove source application. |
| Effect | Intent recorded, pending, confirmed, conflict/not-applied, failed or uncertain, with exact source targets, conditional-write capability and observed result. | Concurrent accepts of one proposal/version share one effect identity, even with different request IDs. Uncertain external outcome cannot be reported as not applied merely because a local completion record is absent. |

**Proposed first scheduling policy:** at most one active Pi execution per thread, with bounded independent scheduling across threads. Waiting for input/authorization releases that active-execution slot; other contributions, deterministic controls and observations remain available. A valid response makes the blocked work eligible to continue under the same work identity and an explicit execution-generation policy. It does not promise preservation of a suspended Pi coroutine. Exact Pi continuation/reconstruction remains to be proved and declared as a capability.

The first concurrent-tool policy reaches a quiescent suspension point before opening a blocking InputRequest, entering waiting-input/authorization and releasing the active-execution slot. No sibling tool remains executing at that transition. Until then, keep truthful running/stopping state and progress; do not expose a terminally expirable question that could declare a live worker ended. Already-issued source effects may remain uncertain and independently require reconciliation. This suspension policy must be supported by the selected Pi/tool integration before advertising concurrent blocking tools.

InputResponse distinguishes an answered value, including a negative decision, from abandonment. Authorization requests resolve through a verified host/provider authorization reference; declaring the capability does not implement a provider login flow. Response validity, including expiry, is checked at the authoritative serialized transition; a delayed expiry callback cannot make a stale response valid. Expiry, response and cancellation race through that same order. Whichever valid transition commits first governs; later attempts receive the current resolution/conflict.

Proposed first limit: one open blocking InputRequest per work generation, with independently blocked work permitted within configured capacity. Several independent Workspace Proposals remain supported. The request retains its question turn/exact presentation reference and expected answer. A resolved request makes work eligible only when its declared blockers are cleared and no stop is admitted. Expiry or abandonment concludes that waiting work as interrupted with an explicit input-expired/input-abandoned reason; it does not leave work permanently waiting or silently authorize an effect. A later contribution may start related new work. Multiple simultaneous blockers within one work generation are unsupported until their resolution policy is added explicitly. Stopping work closes its unresolved InputRequest without silently declining unrelated Proposals.

For proposal acceptance, the second concurrent caller reads the already claimed pending/confirmed/uncertain effect instead of starting another write. Workspace revalidates at the real source-write Seam. All enabled effect-producing tools and callbacks use that same authority, including writes to learned preferences. Where the source lacks conditional writes, use a supported alternative or return unsupported/conflict without claiming a safe overwrite. A further reread or an in-process lock does not protect against arbitrary Obsidian editors. Actual source-write strategy remains open; this Interface exposes that limitation rather than resolving it through a local transaction.

## Context preparation and distinct recovery records

| State family | Owner and purpose | Authority and recovery limit |
| --- | --- | --- |
| Authored conversation | Conversation retains meaningful visual/language turns, exact original actions, decisions and surface references. | Canonical authored meaning under declared retention; model summaries cannot replace an original or authorize an effect. |
| ContextProjection | Conversation derives model input from retained history, current facts, trusted instructions and relevant references. | A versioned, lossy view for Pi. Record source turn/surface/source revisions, summary coverage/lineage, transformation version, omissions and budget. It can be rebuilt without changing authored history. |
| ExecutionCheckpoint | Work Runtime optionally retains private executable continuation state tied to a particular work/generation. | Usable only under a supported compatibility/replay policy. Conversation history or a viewer checkpoint cannot substitute for it. |
| Observation checkpoint | Observation reconstructs the authorized view and active output at its checkpoint-to-live cut. | Restores what a viewer sees. It grants neither execution ownership nor permission to restore executable state. |

Context preparation keeps unresolved questions, exact proposal/selection references and completed decisions available across compaction. Summaries are labelled as derived, including any synthetic model-user envelope; they never become human authorship or new user preferences automatically. If an exact referent is unavailable, retrieve its retained original or return context-unavailable rather than guess from the current source. Long-term preference writes remain ordinary Workspace effects.

A prepared projection identifies the committed input cut it used. Concurrent contributions do not silently mutate that cut: retain its lineage and apply the declared steering/follow-up/revalidation policy. An asynchronously produced summary is used only with matching source coverage/version, or is explicitly rebased; stale summaries cannot overwrite newer context. Model/tool-result pairing and exact unresolved references survive token trimming. Bound compaction attempts, input/output size and auxiliary model usage; failure has a typed work outcome.

The pinned Pi SDK already supplies compaction, session records, context/tool hooks and resource loading. Use those supported facilities behind these contracts before introducing replacement machinery. Pi's model turn and session history remain execution representations. The source review (kept private) documents availability without claiming either spike implements this full contract.

## Optional executable continuation

The first proposal retains lost execution as interrupted unless a compatible continuation strategy is explicitly supported and demonstrated. A versioned InputRequest can survive as part of conversation/work recovery; that alone does not guarantee a suspended coroutine survives. If work is conclusively ended as interrupted, close its outstanding InputRequest with that outcome; later input can begin explicitly related new work.

An enabled ExecutionCheckpoint binds schema/runtime compatibility, work/generation, effective profile, ContextProjection revision, execution phase, pending/completed invocation identities, input decisions, effect references and remaining work budget. Restore only Host-owned records; reacquire exclusive execution ownership, check stop/terminal fences and current authority, then atomically claim the eligible generation. A new checkpoint cannot reset consumed budget or duplicate a resolved invocation. Incompatible restoration returns profile/checkpoint-incompatible and follows the declared interruption policy.

Each executable tool path declares its replay behavior: pure/recomputable, safely repeatable with the same effect identity under a proven source contract, or requiring reconciliation/explicit new work. Re-running a model is not permission to repeat its tools. A crash after an external write but before local persistence remains an uncertain effect until Workspace reconciles it. Checkpoint serialization, rewind and saved session history do not establish external rollback or exactly-once application. Concrete checkpoint storage, versions and supported Pi resume points remain open.

## Work-wide budgets

| Budget rule | Proposed contract | Exposed outcome |
| --- | --- | --- |
| Scope and accounting | Work owns limits/consumption across generations, answers, retries and compaction: model/tool steps, elapsed work time, token/cost where available, output size and tool concurrency. Attribute auxiliary model work. | read(work) exposes safe limits/usage, whether estimated or measured, and remaining/unknown quantities. No automatic reset on resume or a new SDK invocation. |
| Reservation and unknown usage | Reserve bounded capacity before concurrent calls; reconcile measured use afterward. Declare worst-case per-call overshoot and what can actually be enforced. Persist enough usage/reservations that restart cannot reset an uncertain allowance to zero. | Unknown consumption is conservative/explicit and can block further execution; a per-cycle check is not an exact mid-call ceiling. Numeric limits and reservation strategy remain to be proved. |
| Exhaustion and control | Exhaustion prevents new model/tool dispatch and records budget-exhausted. In-flight execution follows truthful stop/settlement rules; source reconciliation and essential control/terminal recording retain separate capacity. | An unsettled worker can remain stopping. Once actual execution ends, terminal failure/interruption records its budget reason and preserves any uncertain effect; it is not automatically successful cancellation. |

A binding/profile declares whether waiting for input counts toward elapsed time and how tool/model retries are charged; missing policy is not unlimited execution. Child agents remain optional. If enabled later, their lineage, aggregate budget ownership, authority and cancellation propagation must be defined before a child can run.

## Host supervision and resource lifetime

Host lifecycle is recovering, accepting, draining or stopped. Recovery establishes admission identities, retained obligations and execution ownership before allowing fresh work. Draining serializes with admission: previously committed work/receipts remain recoverable; fresh work receives host-draining without partial admission. Record one finite policy for finishing, suspending or stopping admitted work before process exit.

During drain, retain current-authorized reads, existing-receipt replay, stop requests, reconciliation and truthful output/terminal recording while their supporting resources are available. Responding to an existing InputRequest may record its answer, but cannot bypass the drain's prohibition on starting/resuming execution. Expose the resolved input separately from work still queued with a host-draining reason, or an explicit unavailable-continuation outcome if that work subsequently ends. A caller deadline, observer detach or drain deadline cannot establish stopped work. If a response would require unavailable durable storage, return the common failure/unknown admission result.

Each active execution has task-local principal, thread, work/generation, profile and resource ownership. A shared mutable Pi Agent or process-global identity cannot silently serve independent concurrent works. Runtime consumes the execution stream; Observation consumes committed/live publications through its own handles. Unload requires no execution or pending resource obligation, not just zero subscribers. Completion routes to its durable thread/work association; voice sockets and tabs can reattach later. Outbound notifications remain a separate optional delivery capability.

The actual worker owns resource teardown until it has stopped using them. If a tool ignores cooperative abort, retain ownership and fence new dispatch/output; use a declared bounded termination/isolation strategy or truthful interruption on process loss. Do not close its storage handle while it can still write. Already-issued effects remain subject to reconciliation. Host readiness/control availability is reported truthfully; an unreachable process is not observed stopped work.

Diagnostics correlate trigger/request, turn, work/generation, invocation/effect, context/profile and publication IDs, with bounded safe payloads and declared retention. They are derived operational evidence, not a second authoritative conversation. Generic hooks, a hosted tracing backend and a multi-agent workflow engine remain optional.

## Stop request and observed completion

```typescript
type CancelCommand = RequestKey & {
  workId: WorkId;
  generation: number;
};

type StopWaitOptions = CallOptions & {
  until: "acknowledged" | "terminal";
};
```

The target generation prevents a delayed stop from silently targeting a later resumed execution. A caller wanting to stop the current generation first reads its identity. Proposed default when wait options are omitted: return after durable acknowledgement. Awaiting terminal state requires a finite deadline and does not consume another logical stop identity.

Validate the target generation atomically with stop admission. A stale generation returns target-conflict and never retargets current execution. Once stopping is admitted, no later generation of that work may start; an already-recorded response does not bypass this restriction. Terminal waiting reports the named work/target outcome and cannot succeed by observing an unrelated replacement generation. A terminal work fence also rejects late output or new effects from its ended generation; reconciliation of effects already issued remains permitted.

| StopReply fact | Meaning |
| --- | --- |
| Original stop receipt | Stop requested, already terminal or refused for the named target, recorded once where admission occurs. Repeated calls preserve this original fact. Admission failures use the common not-admitted/indeterminate/unavailable/denied rules. |
| Current work observation | Current state/generation and observation revision/time, separately labelled. Completed work can win a race against cancellation; that outcome is not rewritten to stopped. |
| Wait resolution | acknowledged, terminal-observed or deadline-reached. A reached deadline can coexist with an admitted stop and still-running work. Transport loss can also leave the caller without a result. |
| Effect reference | Any associated applied/pending/uncertain source effect remains independently queryable. Stopping work does not roll it back. |

A2A's Adapter can request terminal observation before producing its native cancellation response. It must map terminal/refused/timeout cases to the native contract truthfully; an acknowledged request cannot become a successful cancelled Task. Its request-handler/no-event-bus behavior must not overwrite core truth. AG-UI's Adapter can return the Exo stop receipt immediately and publish subsequent work state. Neither transport abort nor native interrupt abandonment is the shared work-stop operation. These remain supported-integration obligations, with live Pi/provider and race proof outstanding.

## Output and the checkpoint-to-live cut

The revised proposal permits useful incremental output without requiring durable storage of every token. Runtime must supply actual output lifecycle information; an Adapter must not reconstruct a purported original stream from a completed snapshot.

| Representation | Required fields/meaning | Retention and recovery |
| --- | --- | --- |
| Output | Stable output ID; work/generation and authored response-turn association; kind utterance, A2UI surface update, user-visible progress or tool; output version and provisional/final/failed/interrupted status. | Conversation creates/associates the response turn before publishing its output. Meaningful final content and significant decisions remain in retained history. |
| Output update | Kind-specific append or replacement, previous/new output version and its publication position. Tool updates retain invocation identity, argument-complete, execution outcome and error/result association separately. | Provisional accumulation may be transient. A tool's argument completion does not prove execution; a message ending does not complete work. Do not relabel partial output as final after interruption. |
| Checkpoint | Authorized current view at durable thread revision, publication epoch/position, retained history references, pending inputs/proposals/effects and reconstructed active-output versions/state. | One coherent cut covers committed state and active output. The first subsequent publication is strictly after that cut. This is stronger than reading state and subscribing separately. |
| Publication | Ordered within its epoch: committed view replacement, typed output update/replacement, or explicit checkpoint reset/closure. Include relevant committed revision and output version. | Durable thread revision advances on committed changes; publication position also orders transient updates. A restart creates a new epoch. They are distinct counters with distinct meaning. |
| Observer handle | Initial checkpoint, bounded publication iteration and explicit detach. Include selected thread/work view and declared renderer/output capabilities. | Detach is idempotent and releases only this observer. Slow-viewer replacement or closure cannot stall work or another viewer. |

Host commit and Observation sequencing coordinate the cut and publication order, including transient accumulation. A viewer ignores already-applied positions, never appends a delta to an unexpected base version, and replaces its state on an explicit checkpoint reset. If recovery requires a new checkpoint, the Adapter obtains one through the same Interface; it does not repair state by guessing from missing deltas.

Publish final, failed or interrupted output only after its reconstructible content and terminal status have committed. Later transient updates cannot modify that terminal output identity/version; continuation or correction requires an explicit new output/version transition recorded in Conversation. Only provisional content may be discarded under the stated restart reset policy. A terminal work result closes its remaining outputs truthfully before or with the committed terminal observation.

For a slow observer, coalesce to a complete checkpoint/output replacement or close with a reason and reattachment guidance. Do not drop a delta while retaining dependent later appends. Meaningful decisions and unresolved questions remain available through retained core records even if intermediate renderings are coalesced. Stream replay is optional; complete current reconstruction is required for the view being offered.

After restart, reconstruct durable content and reconcile work. Provisional content that was not durably recoverable is explicitly reset/interrupted; no claim of uninterrupted token delivery follows. Historical read returns retained exact meaning or a typed retention absence. Output selection, archive policy, concrete queue/checkpoint size limits and actual SDK/HTTP bounds still need validation.

## Typed reads, failures and capabilities

ReadQuery is a discriminated request for one of the following views. The reply repeats its kind and contains a typed value or typed failure/absence. Every page is bounded; every historical reference is exact. Optional queries are explicitly advertised and return unsupported when absent.

| ReadQuery kind | Caller supplies | Typed view returned |
| --- | --- | --- |
| thread | Thread identity and bounded current-view selection | Current surfaces, work/proposals/input/effect summaries, meaningful recent turns and retry-scope information with their revisions. |
| history / surface-revision | Thread and exact turn/reference, or a bounded historical page | Exact retained turn/expression or surface incarnation/revision, associated references and declared retention limits. Explicit completeness distinguishes a full/partial/unloaded view from absent history; derived summaries are labelled separately. |
| request | Logical RequestKey; choose original receipt or full RequestView | Immutable original receipt, and only when requested separately labelled current handling/outcome. |
| trigger | Authorized TriggerKey or a trigger reference retained on work | Original trigger receipt/disposition, cause and linked work or typed expiry/absence; read access does not grant trigger admission authority. |
| work / input / effect | Authorized identity, with exact version where needed | State, associations, retained outcome and observation version/time; safe cause/profile/context provenance, work usage/exhaustion, exact invocation/grant binding and declared continuation support where relevant. |
| threads / work-list | Supported filters and opaque page cursor under caller scope | Bounded records, documented ordering and continuation. Work ordering uses status time with a stable tie rule; retention/page invalidation is explicit. |
| capabilities | Host or authorized thread/work scope | What this host and work actually support, limits/version information and explicit unknown/unsupported distinctions. |

The initial host can provide a configured personal thread without exposing arbitrary thread creation/sharing/deletion. Discovery still returns the threads the caller may use. Broader thread lifecycle, uploads/downloads and client-supplied tools are not implicitly promised by this Interface.

Failure includes a stable category, affected request/target where disclosure is allowed, retry guidance and safe explanatory detail. Categories distinguish invalid-input, unavailable-reference/history, request-conflict, target-conflict, expired-scope/receipt-unavailable, trigger-expired/unavailable, expired/closed-input, unsupported-capability, profile/checkpoint-incompatible, context-unavailable, budget-exhausted, host-draining/unavailable, capacity, denied, source-conflict, execution-failure and indeterminate admission/effect. The accompanying result determines whether an admission exists; a generic string must not stand for all of these. A retained-but-forbidden record is not disclosed by a richer error than policy permits.

Capabilities describe actual support for visual-only/mixed contributions, catalog/input modes, current/history reads, background observation, live output kinds, targeted control/continuation and real source-write strategies. They also declare schema/normalization versions, retention limits, enabled trigger behavior, effective tool/approval modes and bounded execution/call/observer/admission policies. Safe work views expose applicable values; private policy/configuration and credentials are not dumped to clients. Discovery does not grant authority. Clients may request only supported rendering/output modes; incompatible required modes return a typed unsupported result rather than silently dropping meaning.

## Protocol projection obligations

| Contract family | A2UI over A2A | A2UI over AG-UI | Deliberately retained distinction |
| --- | --- | --- | --- |
| Contribution and retry identity | Preserve the full original action and Exo request/reference fields in supported Parts/metadata. Native IDs remain explicitly associated. | Preserve the same fields through forwardedProps, validation and canonical recording; optional synthetic-tool middleware stays a model projection. | Original human authorship survives normalization and protocol wrappers. A native message/run ID alone is not Exo idempotency. |
| Work, discovery and results | Faithful Task/status/result projection and declared native query ordering/pagination. Never let observer Tasks masquerade as new core work. | Exo work/current handling in state and explicit control results; add broader queries only for supported callers. | Work state differs from a publication run completing. Native Task result retrieval requires actual result mapping, not only a thread checkpoint Artifact. |
| Blocking input | Map eligible work suspension/continuation to native task states and targeted messages, preserving exact InputRequest association. | Proposed first mapping: Exo InputRequests in state/A2UI actions, with typed responses through submit. Native interrupt reuse remains optional and undeclared until its different scope is deliberately supported. | Job-scoped questions do not automatically adopt AG-UI's thread blocking/all-open-response rules or retained-client connect restriction. No new-client reset is an authoritative workaround. |
| Incremental output | Use supported status/artifact carriers for the chosen observer path; the inspected resubscribe path ignores standalone executor Message events. Exo supplies detailed tool/output semantics. | Map actual Runtime output to supported text/tool/activity/state events and retain stock processing where used. Account for connect bypassing run middleware. | Available wire events are not proof that Pi produced live output or that final snapshots preserve the original sequence. |
| Stop and failures | Native cancellation/error semantics must reflect the selected wait result and core execution truth, including no-bus and late-terminal cases. | Typed Exo cancellation/results and current work remain explicit; transport abort and input abandonment have their own meanings. | A stop receipt, current work observation, source effect and connection status remain separate facts. |
| Capabilities and bounds | Agent Card/security/native operation declarations combine truthful core support with Adapter support. | Optional native capability discovery combines the same facts with the supported integration; omission is unknown. | Each Adapter proves its advertised SDK/HTTP/browser path, budgets and closure behavior. Core proof cannot replace it. |
| Host-originated work | Project actual tracked work and its cause through supported Task/result/Exo metadata and observation. A scheduler occurrence is not a fabricated human Message. | Project cause and work state through Exo publications; a model-user envelope or publication run does not establish human authorship. | Neither client binding may impersonate private trigger admission. Durable cause/receipt discovery remains Host behavior. |
| Profile, context and continuation | Preserve authorized work/profile/context references in native/Exo results; declare only supported continuation. | Preserve the same references in Exo state/results; do not consume client state as executable RunState. | Full authored history, derived model context, private executable state and viewer state remain distinct. Protocol feature availability does not choose a Pi resume policy. |
| Budget and host lifecycle | Native status/errors plus Exo details express deferred/exhausted/draining state without falsely reporting cancellation. | Exo control/work results and progress express the same facts; a transport abort or finished publication cannot replace them. | Caller deadline, work budget, draining, actual worker termination and source-effect outcome remain separate. |

These mappings use the [pinned source findings](shared-core-protocol-mapping.md#evidence-and-inspection-scope). No newer SDK behavior is assumed. Proposed job-scoped InputRequests are a core policy for discussion, not a decision against AG-UI. Both protocols can carry Exo's intended behavior; preserving all of their native conveniences is a separate, conditional goal.

## Revision coverage and remaining decisions

| Mapping gap | Revision response | Still required |
| --- | --- | --- |
| Original contribution / R03 | Retain original expression beside normalized interpretation, typed exact references and permitted bound values. | Correct both spike paths in a future implementation and prove equivalent cross-Adapter input/context. |
| C01 — Progressive output | Output identity/lifecycle plus coherent active-output checkpoint, transient positions and durable final meaning. | Choose useful live detail; implement real Pi event projection, interruption/reconnect and resource proof. |
| C02 — Blocking input | Versioned InputRequest, separate Proposal, proposed job scope and explicit response/scheduling policy. | Pi continuation strategy; actual simultaneous questions/responders; any later native AG-UI interrupt profile. |
| C03 — Retry/continue/stop | Retry scope and admission-result rules, current handling separate from receipt, targeted generation and bounded terminal waiting. | Retention/capacity implementation, lost-response/restart proof, live steering and actual stop outcomes. |
| C04 — Capabilities/query/failure | Typed reads/failures, truthful optional capabilities and native projection obligations. | Pin exact schemas/budgets, implement actual query/capability callers and validate native conformance. |
| Runtime review — trigger cause | Private host-authorized trigger admission, stable occurrence identity/disposition, bounded eligibility and no fabricated human turn. | Choose configured schedule/source policies and demonstrate concurrent occurrence delivery, expired history and cause discovery. |
| Runtime review — effective profile/tool authority | Versioned profile and exact invocation/argument/effect approval with serialized ownership transfer and current policy checks. | Actual tool enforcement, safe profile changes, revocation, unattended questions and competing continuation/stop. |
| Runtime review — context and recovery state | Explicit authored/context/executable/view state families, ContextProjection lineage and optional compatible ExecutionCheckpoint. | Pi compaction with exact visual references; stale projections, unsupported/incompatible resume and uncertain tool effects. |
| Runtime review — budgets and supervision | Work-wide usage/reservations, truthful exhaustion, recovering/accepting/draining/stopped Host and worker-owned teardown. | Numerical policies, resource isolation, continuation accounting, uncooperative tools and bounded drain/recovery. |

The working defaults remain explicit proposals: one active Pi execution per thread; one open job-scoped InputRequest per work generation, with expiry/abandonment concluding that work as interrupted; separately linked late contributions; no automatic retargeting of steering/stop; core-issued bounded retry scopes; and immediate stop acknowledgement unless a caller requests bounded terminal waiting. Revision 2 adds configured host-only triggers, one-invocation approval scope, explicit profile/context lineage and work-wide accounting. Automatic crash resume, child execution, broad grants, generic workflow authoring and memory-provider/plugin frameworks remain optional. These choices are revisable; storage, source-write strategy, protocol and deployment remain open.

Before implementation, resolve trigger time-zone/occurrence/overlap/misfire and retention eligibility policies; profile/version compatibility and exact tool enforcement; summary/retrieval limits; supported Pi continuation points and replay classes; work/tool/compaction budgets and wait accounting; and shutdown/isolation deadlines. Missing required configuration fails explicitly. Source evidence inspired the contracts; no framework dependency is adopted.

The next proof should exercise this Interface with at least two concurrent callers, then the real enabled SDK/HTTP/browser paths. Include identical action delivery through both Adapters; same-ID changed content; retry before/after scope expiry; response/expiry/stop races; target completion before queued input; two distinct accepts of one proposal; uncertain external writes; checkpoint cut during live output; restart with provisional output; and paused/advancing observers at capacity. These are proposed validation cases, not newly executed tests or passing gates.

Revision 2 adds concurrent trigger deliveries across binding renewal and retired occurrence history; compaction across an old visual decision while the source changes; exact invocation approval after profile change/revocation; same-invocation generation transfer racing stop; incompatible executable state and unknown effects after restart; budget persistence across answers/retries/compaction; and drain with zero viewers or a tool that ignores abort. All proofs must preserve exact authored meaning and independently truthful work/effect outcomes. The internal trigger Seam also requires at least two concurrent deliveries; shared-method naming is not its proof.

No ADR is created: this is a reversible Interface revision with unresolved tradeoffs, preserving the user's living-discussion format. The existing protocol scores and ratified recommendation remain unchanged. The independent spikes and recorded evidence are not edited by this revision.

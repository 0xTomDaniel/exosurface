# Fable Round2 — captured reviewer response

September 13, 2026. Public final response captured from the assigned Herdr session. This is a historical position, not the current architecture decision. Earlier claims are qualified or superseded by the [ratified common statement](common-statement.md) and [moderated evidence record](../2026-09-13-spike-debate.md). No test was rerun during this review.

⏺ I have everything needed; the disputed facts Astra raises are all in source I already read, so no further checks are required. Here is my
  Round 2 response.

  Corrections to my Round 1. Three of my claims do not survive cross-examination. My W2 half-point charged an author mapping choice to the
  protocol. My W4 deduction leaked a W5 criterion into a contract criterion. My "decision-reversing remap" was withdrawn in the clarification
  and stays withdrawn. Astra's six qualifications are accurate against source, and I add one Astra missed: the AG-UI host ignores any vault edit
  that does not manually advance the revision: field at src/host.ts:257, while A2A hashes the whole file. That is a host source-contract
  difference and scores zero for protocol.



  1. W2 normalized to 3.5 / 3.5. The four named sub-items are grouping, referents, history discovery, and model-context projection. On every
  one, both hosts own the semantics and the protocol supplies only a thin carrier: A2A's contextId plus multipart parts, AG-UI's threadId plus
  forwardedProps and metadata slots. The residual difference is real but small: A2A's Message.parts natively carries a typed data part with a
  media type for a structured visual-only human contribution, whereas AG-UI has no first-class user-message part for that and needs a private
  envelope such as forwardedProps or an activity convention. That is a few lines of translation either way and does not reach a half-point at
  this granularity. I record it as an asymmetric range, A2A 3.0 to 4.0 and AG-UI 2.5 to 4.0, not a score difference.

  2. W4 normalized to A2A 4.0, AG-UI 2.5, and my answer to Astra's first question. The consistent basis is the criterion's own carve-outs:
  semantic archive discovery belongs to W2 and recovery mechanics to W1. The A2A browser's private discover message returns the thread snapshot
  with turns, proposals, and surface. That is thread discovery, a W2 item, not a work-control contract. What W4 measures is whether the standard
  contract saved Exo from defining work-control conventions, and it did: the wire schema, request and response shapes, terminal-state error

  semantics, and client methods for get, list, and cancel came from the SDK, exercised through the published client in tests and, for cancel, by
  the browser. Owned glue is the store filter and pagination at src/task-store.ts:46-55 and the executor cancel at src/host.ts:160-166. That is
  the rubric's "strong useful reuse with bounded glue." AG-UI defines its own cancel kind, cancelling versus terminal convention, and snapshot
  work list. It works and was trivial, but it is private. The honest caveat: the sign of the total flips on this definitional half-point. Under
  the definition, A2A 3.125 versus 3.075. If a reader insists on browser use as the bar for W4 too, A2A 3.05 versus 3.075. Both are inside the
  noise band and I will say so in any common statement.

  3. W6 and G3. W6 stays 3.5 each. On G3, Astra is right and I under-read it. The AG-UI Pi Adapter throws when the model returns no visible text
  at src/pi.ts:139, and the recorded visual-first proof's first model result carries an Exo utterance, which the host then attaches to the

  proposal turn at src/host.ts:536-543. So the AG-UI spike's fully utterance-free model exchange fails the current Pi Adapter contract as
  written and is UNKNOWN for the protocol, because the wire path itself emits text events only when an utterance exists at
  src/publication.ts:38-59, and the deterministic executor does produce utterance-free visual responses at src/host.ts:487-493. Corrected AG-UI
  G3: PASS for visually initiated, mixed, and historical Pi interaction; utterance-free Pi exchange not demonstrated. A2A's G3 stays PASS for
  the exercised thread, since its first model proof asserts no person or Exo utterance. This is a Pi Adapter policy, not an AG-UI prohibition,
  and it does not move W6.


  4. Lifecycle evidence, and Astra's third question. I accept each point. The six-toggle assertion checks the original lamp value and would pass
  with zero updates; the recorded applied: 7 and dropped: 20 are consistent with all six publications arriving, but that is circumstantial, not
  asserted. AG-UI recorded zero writer drops, so it proved lease-capped cleanup under a stalled reader, not backpressure-driven disconnection;
  A2A proved the drop and drain path but its healthy-client check is a discovery RPC, not a companion observer that kept advancing. Neither

  snapshot-acquisition test forces the cut. Both mutate state before persistence checks and both can throw on the publish path, in A2A as an
  uncaught timer exception at src/host.ts:79 and in AG-UI as an unhandled rejection from void this.execute at src/host.ts:458. These are
  test-design and host differences, not protocol burden differences, so W1 stays 2.5 versus 3.0 and W3 stays tied. The observation that would
  falsify my W1 edge for AG-UI: after any interleaving of stall, drop, and renewal, an AG-UI observer that ends below the host's final revision
  with no reconnect pending, while the A2A observer under the same interleaving reaches it. Astra's "renewal to a uniquely identified final
  revision" is the right pass criterion, and full-snapshot design makes lease-boundary loss harmless in both.

  5. Experiment versus verification. The upgrade dry run is moot; W3 stays tied at low confidence. Astra's matched observer-fault probe is the
  next mandatory verification on the chosen implementation, not a prerequisite for a direction. My reason is specific: every A2A property the
  spike relies on is either verified stock behavior, the attach-before-load ordering, the cancel drain, and the queue returning at the next
  event, or owned route code. I find no A2A path whose repair would require touching the SDK. The one concrete dependency that could still
  reverse the choice is Astra's stated criterion, an A2A observer failure under forced cuts and real backpressure that cannot be fixed inside
  the owned route, executor, and store while AG-UI passes through supported extensions. I endorse that as the standing reversal condition. I add
  one implementation flag for the probe: A2A's 64 KiB writer threshold is smaller than its recorded 139 KB checkpoint frame, so a realistic
  link could trip the 100 ms drain deadline routinely. That is tuning, not protocol.

  Answer to Astra's second question. No delivered browser caller benefits from accumulated text or activity state beyond the diagnostic count.
  Verifier, state apply, subscriber dispatch, and the detach signal justify 3.0. Nothing justifies more.

  6. Final scores and recommendation.

  ┌───────────┬───────────────┬───────────────┬────────────────────────┐
  │ Criterion │      A2A      │     AG-UI     │ Change from my Round 1 │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W1 · 25%  │ 2.5 (2.0–3.0) │ 3.0 (2.5–3.5) │ none                   │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W2 · 20%  │ 3.5 (3.0–4.0) │ 3.5 (2.5–4.0) │ AG-UI +0.5             │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W3 · 20%  │ 3.0 (2.5–3.5) │ 3.0 (2.0–3.5) │ none                   │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W4 · 15%  │ 4.0 (3.5–4.5) │ 2.5 (2.0–3.0) │ A2A +0.5               │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W5 · 10%  │ 2.5 (2.0–3.0) │ 3.0 (2.5–3.5) │ none                   │
  ├───────────┼───────────────┼───────────────┼────────────────────────┤
  │ W6 · 10%  │ 3.5 (3.0–4.0) │ 3.5 (3.0–4.0) │ AG-UI +0.5             │
  └───────────┴───────────────┴───────────────┴────────────────────────┘

  Totals: A2A (62.5+70+60+60+25+35)/100 = 3.125; AG-UI (75+70+60+37.5+30+35)/100 = 3.075. Confidence in the ranking is low; the lead is one
  definitional half-point.

  The strongest statement I can endorse: initial direction A2UI over A2A, effectively even, reversible, chosen on qualitative grounds rather
  than the arithmetic, namely verified stock cancel truthfulness, source-verified SDK couplings that behave as documented, and an AG-UI
  processing advantage smaller than forecast. Neither spike is adopted unchanged. No combined topology, because no present saving was
  demonstrated. The matched observer-fault probe is the first mandatory verification on the A2A implementation, with Astra's reversal criterion
  standing. My one narrow disagreement with Astra is on framing, not numbers: the 0.05 lead should be presented as within noise, and the common
  statement should say the direction rests on the qualitative findings above, not on which side of 3.1 the total lands.


# Fable Round1 — captured reviewer response

September 13, 2026. Public final response captured from the assigned Herdr session. This is a historical position, not the current architecture decision. Earlier claims are qualified or superseded by the [ratified common statement](common-statement.md) and [moderated evidence record](../2026-09-13-spike-debate.md). No test was rerun during this review.

# Fable — independent post-spike review, round 1

Captured verbatim from the existing Herdr Fable 5.1 xhigh session. This is the independent position before cross-examination; statements may be corrected in later rounds.

⏺ Audit complete. I read all six canonical docs, both READMEs and reports, every source and test file in both packages, the recorded JSON
  artifacts, the commit file lists, and the installed SDK code for the A2A cancel and resubscribe paths and the AG-UI connect and verifier
  paths. Nothing was rerun or modified.

  Position in one line: both spikes are genuine, honest, and pass their stated bounded gates, but the evidence as built moves me from "very
  narrow AG-UI" to "effectively even with a narrow A2A lean." The lead is 0.125 and reverses under one plausible remap of the AG-UI spike.

  Evidence audit

  Confirmed by execution and source. Both commits touch only their own spikes/ directory, pin exact versions, and carry no overrides, patches,
  or forks. G5 holds for both. A2A's CancelTask is truthful on the standard wire: the SDK awaits the executor's cancel, drains the bus, and
  returns the stored task at node_modules/@a2a-js/sdk/dist/server/index.js:2978-3036, and the executor awaits completion at src/host.ts:160-166.
  A2A's resubscribe attaches its queue before loading the task at index.js:3095-3101, so the first yield is the stock-persisted checkpoint
  artifact. The AG-UI verifier explicitly permits a new RUN_STARTED after RUN_FINISHED, so the multi-run observer framing at
  src/publication.ts:19-71 is a supported path. The AG-UI connectAgent swallowing AGUIConnectNotImplementedError is confirmed at
  test/sdk.int.test.ts:21-28. Both two-client acceptances, both restart recoveries, both real Pi proofs, and both browser journeys are backed by

  tests that assert what the reports claim.

  Disputed or shaded claims.
  - A2A's cleanup depends on SDK internals. The stock queue generator awaits a bare promise at index.js:1645-1647, so a socket close cannot
    return it until the next event. The 200 ms heartbeat at src/host.ts:97 exists only to unblock it. The report says this plainly, but it is a
    W3 coupling, not neutral inventoried support.
  - A2A's browser discovery is a private convention. The client finds the thread through a taskless discover DataPart at client/app.ts:41 and
    src/client.ts:26-29. ListTasks and GetTask are exercised only in Node tests. Only CancelTask reaches the standard wire from the actual
    client.
  - A2A's lease rotation is an exceptional path. The churn test tolerates up to 5 of 30 attach failures from observer Task rotation at
    tests/lifecycle.int.test.ts:62-69. Observer-as-Task also produces two runtime stores that must agree on restart.
  - AG-UI's "reused accumulation" is computed but not consumed. The Lit client renders utterances and history from the state snapshot's turns at
    src/browser.ts:526-547. The accumulated agent.messages are only counted at line 587. Inbound contributions bypass AG-UI messages entirely
    via forwardedProps at src/browser.ts:356-364, with messages: [].
  - AG-UI's writer-bound drop path never fired. evidence/resources.json shows dropped: 0 and 18.7 KB peak buffering; the 3 s lease ended the

    stalled stream first. A2A's paused-reader test did exercise its drop path with one slow drop and a 100.6 ms drain.

  Unequal scenarios worth naming. AG-UI covers two crash windows at test/crash.int.test.ts:9-10; A2A covers only the post-write window and
  admits the pre-write branch is unexecuted. A2A's Pi authored validated A2UI dynamically at src/pi.ts:49-61; AG-UI's Pi only chose parameters
  for a host-built fixed-schema surface at src/pi.ts:54-90. Neither "snapshot during acquisition" test is a true concurrent race; both rely on
  single-threaded ordering. Neither churn test ran concurrent with publications. Models differ, so no performance comparison is valid.

  Gates. A2A: G1 PASS bounded, G2 PASS at tested bounds and UNKNOWN at saturation, G3 PASS thin, G4 PASS at two clients on one host, G5 and G6
  PASS. AG-UI: G1 PASS, G2 UNKNOWN beyond bounds, G3 PASS thin, G4 FAIL on the external-writer race, G5 PASS, G6 PASS subject to G4. The G4
  asymmetry is a host source-write strategy, not protocol. A2A never rewrites the agenda file and creates a plan record exclusively at
  src/thread.ts:116-125, then lets the next poll reset task times and flag "source changed since acceptance" at src/surface.ts:26. By source
  inference the overwrite class cannot occur there, but a different class can: an acceptance recorded against a revision that went stale during

  the synchronous window. That remains UNKNOWN by execution and scores zero for protocol comparison.

  Rescored weights

  ┌───────────┬────────────┬────────────┬───────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ Criterion │ A2UI over  │ A2UI over  │                                     Rationale and confidence                                      │
  │           │    A2A     │   AG-UI    │                                                                                                   │
  ├───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │           │ 2.5        │ 3.0        │ A2A pays observer-Task ceremony: rotation, private discovery, retention, heartbeat-for-cleanup,   │

  │ W1 · 25%  │ (2.0–3.0)  │ (2.5–3.5)  │ two stores. It gets stock persistence and client library in return. AG-UI owns its whole          │
  │           │            │            │ transport and route but has no SDK timing dependency. Medium confidence, now executed on both.    │
  ├───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │           │ 3.5        │ 3.0        │ A2A's real client uses native multipart both ways at src/client.ts:30-39 and src/host.ts:131-136. │
  │ W2 · 20%  │ (3.0–4.0)  │ (2.5–3.5)  │  AG-UI's real client bypasses the message model inbound and ignores it outbound. Both own all     │
  │           │            │            │ turn, reference, receipt, and Pi-projection semantics. Medium.                                    │
  ├───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤

  │           │ 3.0        │ 3.0        │ A2A couples to queue internals and ResultManager save semantics. AG-UI couples to connect         │
  │ W3 · 20%  │ (2.5–3.5)  │ (2.0–3.5)  │ swallowing, verifier multi-run rules, and apply metadata behavior that this project already       │
  │           │            │            │ mis-stated once. Reasoned tie, low confidence.                                                    │

  │           │ 3.5        │ 2.5        │ A2A's standard cancel is verified truthful at the SDK level and used by the browser; list and get │
  │ W4 · 15%  │ (3.0–4.0)  │ (2.0–3.0)  │  are demonstrated but unused by the client. AG-UI's cancel convention works and was trivial.      │

  │           │            │            │ Medium.                                                                                           │
  ├───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ W5 · 10%  │ 2.5        │ 3.0        │ AG-UI materially reuses verifier, state apply, subscriber dispatch, and the detach signal.        │
  │           │ (2.0–3.0)  │ (2.5–3.5)  │ Message accumulation is unused. A2A reuses transport-level client code only. Medium.              │
  ├───────────┼────────────┼────────────┼───────────────────────────────────────────────────────────────────────────────────────────────────┤
  │           │ 3.5        │ 3.0        │ A2A followed the documented extension binding end to end including model-generated UI. AG-UI used │
  │ W6 · 10%  │ (3.0–4.0)  │ (2.5–3.5)  │  the documented activity convention but skipped middleware and never had the model author A2UI.   │
  │           │            │            │ Medium-low.                                                                                       │
  └───────────┴────────────┴────────────┴───────────────────────────────────────────────────────────────────────────────────────────────────┘

  Totals: A2A (62.5+70+60+52.5+25+35)/100 = 3.05; AG-UI (75+60+60+37.5+30+30)/100 = 2.925.

  Sensitivity: raising AG-UI W2 and W5 to 3.5 each, which a message-model remap could justify, gives AG-UI 3.075 and flips the lead. Dropping
  A2A W1 to 2.0 for the rotation and heartbeat paths gives 2.925, a tie. The order is fragile in both directions.

  Protocol-specific support that discriminates. A2A: observer Task lifecycle and its exceptional paths, heartbeat-dependent cleanup, dual store
  reconciliation, versus free persistence, standard truthful cancel, and documented binding. AG-UI: fully owned client transport and observe
  route, run-frame convention, versus verifier and state apply that did real work, and a message model that did none.

  Common host blockers that do not discriminate. Source-write concurrency contract. Capacity checks that are not failure-atomic, and in both
  hosts a capacity throw on the publish path is an uncaught exception or unhandled rejection at src/host.ts:79 and src/host.ts:458 respectively.
  Full-snapshot write amplification. No long soak, no live Pi cancel race, no multi-host, no multi-thread discovery, no production auth.

  Recommendation and challenges

  Single protocol, A2UI over A2A, narrow and reversible. Confidence is low-moderate. A combined topology is not justified: the AG-UI component
  it would borrow is client message processing, which the AG-UI spike itself did not use for anything the Lit client rendered. This is a
  protocol recommendation, not a gate pass; G2 saturation and the source-write contract block production under either choice.

  Decision-reversing probe for the moderator: on the AG-UI branch only, no SDK changes, one bounded day. Route the person's contribution through
  RunAgentInput.messages with turn metadata and render utterances and history from agent.messages instead of view.turns. Report the net
  owned-line delta in publication.ts, browser.ts, and host.ts with the existing browser tests still green. A net reduction in host-side history
  projection raises AG-UI W2 and W5 to 3.5 and flips the lead. No reduction confirms A2A's lean.

  Three challenges for the other reviewer.
  1. Strongest case against my own recommendation. The heartbeat-for-cleanup and lease-rotation retries are protocol-imposed exceptional paths
     that the A2A author inventoried as support. If you charge them to W1 and W3 rather than treating them as neutral, A2A's W1 drops to 2.0 and
     the totals tie. What upgrade evidence would you accept that ExecutionEventQueue behavior is stable, given the spike depends on it?
  2. The A2A browser client never calls ListTasks or GetTask; discovery is a private DataPart message identical in kind to AG-UI's state
     snapshot. With no external consumer, what does the product gain from pagination and outsider scoping that justifies keeping W4 above 3.5?
  3. A2A's exclusive-create plan strategy avoids the overwrite class but can record an acceptance against a revision that went stale inside the
     synchronous window, and the agenda then silently reverts to the vault's time with only a flag. Do you agree this is a domain choice
     available to both hosts, scores zero for protocol, and needs the same external-writer probe before either G4 can be called PASS at the
     required inter-request concurrency level?



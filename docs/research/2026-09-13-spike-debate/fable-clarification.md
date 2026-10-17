# Fable Clarification — captured reviewer response

September 13, 2026. Public final response captured from the assigned Herdr session. This is a historical position, not the current architecture decision. Earlier claims are qualified or superseded by the [ratified common statement](common-statement.md) and [moderated evidence record](../2026-09-13-spike-debate.md). No test was rerun during this review.

# Fable — moderator clarification before peer exchange

Captured verbatim; supersedes the identified Round 1 claims. No new execution.

⏺ 1. W6 normalization. Conceded. Fixed-schema tools versus model-authored component trees is a Pi generation policy, and the AG-UI skill itself
  recommends fixed-schema when the application already knows the tree. Either spike could have chosen either mode under either binding, so the
  difference is not a binding property. With generation mode removed, both bindings were exercised through documented conventions with
  comparable glue. A2A used the extension URI, the A2UI media type on DataParts, and capability metadata. AG-UI used the a2ui-surface activity
  convention with a2ui_operations content. Neither reused the asset the forecast credited to it, the Lit shell sample or middleware 0.0.10, and
  both rendered through the same unchanged Lit 0.11.0 processor. Revised W6: 3.5 each, range 3.0 to 4.0. The residual fact that only A2A carried
  model-generated trees through catalog validation is evidence about generation scope and belongs in the G3 scope notes, not in W6.

  Revised totals: A2A 3.05, AG-UI 2.975. The lead narrows to 0.075.

  2. The remap and W2. On reflection, no W2 responsibility disappears. Whether the person's contribution arrives in forwardedProps or in
  RunAgentInput.messages, the host must still validate the offered action against the exact saved surface revision, mint the turn, attach the
  reference and source revision, and record the causal link. Whether history renders from view.turns or from agent.messages, the host still owns
  the archive for restart, historical retrieval, receipts, and Pi projection, and would have to add a message projection carrying the same
  metadata it already carries in the state snapshot. A visual-only human turn becomes a message with no text and Exo-defined metadata, so its
  meaning still comes from what Exo supplies. Historical Pi context is untouched, because agent.messages is a client-side accumulation and never
  a Pi input.

  The remap therefore adds one projection on the host and one caller obligation on the client to construct metadata-bearing messages, in
  exchange for removing one client render path. That is a W5 change of at most 0.5 and a W2 change of zero or slightly negative. I withdraw the
  claim that it is decision-reversing. AG-UI W5 at 3.5 yields 3.025, still below 3.05.

  3. Narrowing the two phrases. Accepted on both. "Free persistence" should read: A2A supplies stock event-to-task accumulation and the
  store-call sequencing that lets resubscribe yield the current checkpoint artifact. Exo owns durable storage, the atomic write, retention,
  access scoping, and restart translation in task-store.ts. "No SDK timing dependency" should read: AG-UI does not depend on when a suspended
  generator can be returned, but it does depend on behavioral contracts. Those are verifier acceptance of sequential runs in one connect stream,
  connectAgent resolving on stream completion and swallowing the not-implemented error, subscriber hook dispatch, and the apply path's metadata
  merge. Both narrowings were already inside my W1 and W3 rationale, so W1 stays 2.5 versus 3.0 and W3 stays a tie with AG-UI carrying the
  wider downside range.

  Effect on recommendation and experiment. The recommendation stands: single protocol, narrow A2A lean, effectively even, reversible. Confidence
  is slightly lower because the margin shrank. The required experiment changes. With W2 now argued stable under either mapping and W1 measured
  by both spikes, W3 is the only criterion where a half-point remains at stake and no test has touched it. A half-point on W3 moves the total by
  0.1, which flips or firms a 0.075 lead.

  Replacement probe for the moderator: a paired upgrade dry run. Bump each spike's protocol SDK to the latest published version within its
  pinned major line, run that package's own suite unchanged, and record which tests break and the lines changed to restore green with no SDK
  patches. If no newer version exists for one side, record that and hold W3 tied. The moderator coordinates this; I do not run it.



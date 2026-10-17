# Completing the weighted architecture forecast

**Historical forecast:** The [post-spike debate](2026-09-13-spike-debate.md) now supersedes the planning preference and runtime-evidence limits below. Preserve this record as the assessment before the independent implementations. The [current weighted comparison](../a2a-vs-ag-ui-weighted-comparison.md) contains the revised scores and scoped gates.

September 13, 2026. The user requested a completed planning comparison after the first version left 75% unscored. Two independently tasked Codex gpt-6-astra agents at high reasoning investigated lifecycle/maintenance and semantic mapping/binding. The primary agent assessed work controls/client processing and synthesized the result; the lifecycle investigator cross-checked the full scorecard and the metadata correction below. This is not a new Astra/Fable debate or a ratified protocol decision.

The [completed scorecard](../a2a-vs-ag-ui-weighted-comparison.md) uses explicit forecasts, plausible ranges, and confidence for all six criteria. The original weights are unchanged. Unknown runtime behavior remains unknown in the mandatory requirements; it no longer prevents an engineering estimate of likely integration effort. No new SDK execution, browser/Pi integration, restart or concurrency test was run in this investigation.

## Corrected AG-UI metadata evidence

**Our earlier blanket assertion that AG-UI client 0.0.59 does not propagate event metadata into accumulated messages is incorrect for the verified published artifact inspected here.** Its apply Implementation merges event metadata into messages on the accepted text-start, activity-snapshot and activity-delta paths. A subscriber can still intercept an event, and semantic turn IDs must still be supplied by Exo. This correction removes an unnecessary proposed metadata-copying workaround; it does not create authored-turn semantics or a historical archive. [Exact published client](https://unpkg.com/@ag-ui/client@0.0.59/dist/index.mjs).

The semantic investigator downloaded exact-version registry metadata and the npm tarball, checked its SHA-1 and SHA-512 against registry metadata, extracted the distribution, and compared it with the exact-version unpkg download. The primary agent independently repeated the integrity and extraction checks. The lifecycle investigator independently inspected the relevant apply paths and compared the registry distribution with its separate unpkg download. These are byte/source checks, not runtime tests. [Registry version metadata](https://registry.npmjs.org/@ag-ui%2fclient/0.0.59), [versioned tarball](https://registry.npmjs.org/@ag-ui/client/-/client-0.0.59.tgz).

| Evidence locator | Verified value or observation |
| --- | --- |
| Tarball SHA-256 | `7e1ca440073add3c0c49d6e5de5c6314ac416d92699dd976839526c5565f3403` |
| Extracted `package/dist/index.mjs` SHA-256 | `3d42ef9a0c41fe680a04eff14f0ff23c98d2828a79328272c6fc640f2d557be2` |
| Metadata helper | `R(e,t)` merges cloned event metadata into message metadata; character offset 3539 in the inspected minified distribution. |
| Text-start / activity-snapshot / activity-delta | Calls to the merge helper at offsets 4774 / 10634 / 11141. |
| Default agent-input projection | Activity messages remain filtered from ordinary input at offset 51994. Exo still supplies relevant visual meaning to Pi deliberately. |

The [September 12 debate record](2026-09-12-thread-lifecycle-debate.md) preserves what its participants accepted, with a prominent superseding correction. The earlier record does not provide enough artifact provenance to explain the discrepancy. We do not infer an upstream release change, identify the earlier bytes, or retroactively claim that the earlier probes tested these paths. Other lifecycle findings retain their original scope.

## Published binding evidence

`@ag-ui/a2ui-middleware` 0.0.10 is published. Its manifest declares client `>=0.0.40`, RxJS `7.8.1`, and toolkit `0.0.4`; the client range includes the inspected 0.0.59. The downloaded package contains schema-context injection, action conversion and cumulative v0.9 operation/activity generation. Publication and a declared peer range establish available integration material, not a compatible running Pi/Lit stack. [Version metadata](https://registry.npmjs.org/@ag-ui%2fa2ui-middleware/0.0.10), [published package](https://registry.npmjs.org/@ag-ui/a2ui-middleware/-/a2ui-middleware-0.0.10.tgz).

A2A retains a documented A2UI binding and directly relevant Lit prior art. The inspected Lit shell uses an older SDK representation, non-streaming submission and a task-shaped response assumption, so its code needs adaptation for the proposed complete conversation. The AG-UI developer skill provides useful guidance but does not supply a Pi-specific runtime generation skill. This supports comparable initial binding forecasts, with different reusable assets. [Pinned Lit client](https://github.com/a2ui-project/a2ui/blob/1c45c809b655878d06e3afc6dda22100afecc0a4/samples/client/lit/shell/client.ts), [pinned AG-UI integration skill](https://github.com/ag-ui-protocol/ag-ui/blob/747933694b05676203da7d5bb8d8e50432e59b75/skills/ag-ui-a2ui-integration/SKILL.md).

## Forecast rationale and ownership

| Criterion | Forecast rationale | Review responsibility |
| --- | --- | --- |
| W1 Observation/recovery | AG-UI's direct connect path avoids an additional observation Task lifecycle. Its framing, separate client instances and cleanup remain substantive work. A2A's stored Task/subscription machinery offsets part of its lease/readiness/renewal mapping. | Lifecycle Astra high investigator; full-scorecard cross-check. |
| W2 Semantic mapping | A2A multipart packaging is useful; AG-UI's supported metadata propagation makes association a bounded mapping. Both retain the same authored history, exact referents and Pi projection. Comparable expected translation burden. | Semantic/binding Astra high investigator; metadata independently verified. |
| W3 Recurring maintenance | Both offer public Seams and plausible Locality. Standard work semantics and observer-lifecycle coupling on A2A balance supported client processing and application conventions on AG-UI. No version-number or popularity penalty. | Lifecycle investigator. |
| W4 Work controls | A2A supplies tracked-work retrieval/listing and remote cancellation contracts; AG-UI needs Exo conventions for the same work controls. Correctness of the effect is assessed separately. | Primary agent; lifecycle investigator challenged scope. |
| W5 Client processing | AG-UI supplies useful event verification and current-message accumulation. A2A needs more presentation conventions. Neither gets unique A2UI rendering or semantic archive credit. | Primary agent; lifecycle investigator challenged applicability. |
| W6 Initial binding | A2A binding/Lit prior art and published AG-UI middleware each save bounded setup work. Both still need compatible catalog and Pi/Lit wiring. | Semantic/binding investigator. |

Relevant primary code: [A2A 1.1.0 request handler](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/request_handler/default_request_handler.ts), [TaskStore Interface](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/store.ts), [event-bus manager](https://github.com/a2aproject/a2a-js/blob/v1.1.0/src/server/events/execution_event_bus_manager.ts), [AG-UI AbstractAgent Interface](https://docs.ag-ui.com/sdk/js/client/abstract-agent), [released event application](https://github.com/ag-ui-protocol/ag-ui/blob/release/2026-08-27/sdks/typescript/packages/client/src/apply/default.ts), and the exact published distribution identified above.

The A2A handler's no-live-bus cancellation path can mark saved state canceled without waiting for execution to stop. AG-UI local abort likewise is not an acknowledged remote stop. These facts limit correctness claims; they do not erase the value of A2A's standard exchange. On AG-UI, connect bypasses run middleware while retaining transform/verification/application/subscribers, so observer integration must cover its binding explicitly. That cost belongs to W1, not again to W5 or W6.

## How to use the result

The completed central scores are A2A **3.125/5** and AG-UI **3.175/5** with the proposed weights. This is a slight planning preference for A2UI over AG-UI, not a robust superiority claim. Moving two percentage points of weight from client processing to standard work controls reverses the lead. Plausible changes in observation complexity also reverse it.

Keep initial protocol mechanics, semantic translation, recurring maintenance, standard control contracts, current-message processing and binding setup distinct. Shared host/domain work is counted once. Ranges are judgment bounds, not statistical confidence intervals; correlated lifecycle/maintenance scenarios are evaluated together in the scorecard. No Monte Carlo probabilities, measured engineering hours or reliability percentages are inferred.

If choosing which path to try first today, the baseline supports AG-UI. A2A remains a credible alternative when work controls matter more or AG-UI observation proves harder than forecast. Essential background execution, lifecycle reliability, full conversational continuity and the no-repairs constraint remain requirements under either choice. No implementation, deployment, storage selection or final architecture adoption is authorized by the arithmetic.

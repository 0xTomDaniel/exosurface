# Post-spike protocol debate: a narrow A2A recommendation

September 13, 2026. Astra (gpt-6-astra, xhigh) and Fable (Fable 5.1, xhigh) reviewed the two completed, independent Pi/browser spikes, cross-examined their findings, and explicitly accepted the same [eight-clause common statement](2026-09-13-spike-debate/common-statement.md). **Both recommend A2UI over A2A as the initial direction, with low confidence in the ranking.** This is a reviewer recommendation, not an accepted architecture decision or permission to deploy either spike unchanged.

Another broad comparative spike is unnecessary before an initial direction. The next mandatory lifecycle verification should stress the selected implementation's observers under matched faults. Source-write safety and failure-atomic capacity handling also remain unresolved. Background reliability and a complete chat-optional temporal conversation remain essential; neither can be traded away for a weighted advantage.

**Subsequent follow-up:** The [private control-convention audit](2026-09-13-private-control-convention.md) questions W4's net implementation saving for the current owned clients. Both browsers render Exo work projections, and AG-UI's bounded cancel contract does not require replicating A2A queries. The follow-up records additional source findings and an open comparison, not a new reviewer consensus. This document preserves the ratified statement and scores as the historical review result.

## Why the recommendation changed

| Finding | Effect on the comparison |
| --- | --- |
| Both implemented background observation using unchanged published SDKs and supported application Adapters. | The no-patches constraint alone does not distinguish them. AG-UI is viable with added support; the result does not show that stock HttpAgent or CopilotKit now supplies that support. |
| AG-UI's verifier, state application, subscribers and detach behavior are useful. Its accumulated messages are only counted diagnostically in the delivered UI. History and utterances render from Exo's `view.turns`; raw activity operations feed A2UI. | Reduce W5 from the forecast's 4 to 3. Do not credit unused text/tool/activity accumulation as saved product work. A future client that actually uses more processing could change this judgment. |
| A2A supplies standard GetTask/ListTasks/CancelTask request/result contracts and event-to-task/store-call sequencing. | Retain W4 = 4. Native get/list are exercised by SDK-client tests; native cancel is used by the browser. Browser thread discovery remains private. Durable storage, authorization and actual execution outcomes are still Exo work. |
| Both own turn meaning, exact historical references, receipts and deliberate Pi-context projection. | W2 remains tied at 3.5. Replacing a rendering array with `agent.messages` does not delete the semantic archive or model-context responsibilities. |
| Both render through actual A2UI/Lit and use actual Pi. Their generation policies differ. | W6 remains tied at 3.5. Model-authored component trees versus a fixed-schema tool is an application choice available to either path, not a protocol advantage. |
| A2A has more observer-Task lifecycle machinery; AG-UI still owns a complete run/connect transport, publication framing and browser renewal. | W1 retains a modest AG-UI advantage, 3 versus 2.5. This is a cost judgment, not proof that AG-UI is more reliable. |
| No comparable SDK upgrade was available, and short independent implementations do not measure recurring maintenance. | W3 stays tied at 3 with low confidence. Neither source-reading mistakes nor unequal test counts constitute an upgrade-cost measurement. |

The agreed weighted scores are **A2A 3.125/5 and AG-UI 3.075/5**, using W1–W6 weights of 25/20/20/15/10/10. The 0.05 margin is within judgment uncertainty. Reducing A2A W4 by half a point reverses the order; increasing AG-UI W5 by half a point ties it. The recommendation rests on useful standard controls and the smaller demonstrated processing saving, not on decimal precision. See the [updated weighted comparison](../a2a-vs-ag-ui-weighted-comparison.md).

## Evidence provenance

The reviewers inspected source, tests, committed artifacts and rendered screenshots. **They did not rerun either package's tests or model calls during this debate.** Counts below are the spike authors' recorded results, audited against their source and limitations. The moderator separately checked package registry versions and documentation generation; those are not new runtime gate passes.

| Evidence pin | A2UI over A2A + Pi | A2UI over AG-UI + Pi |
| --- | --- | --- |
| Independent branch | `spike/a2ui-a2a-pi` | `spike/a2ui-agui-pi` |
| Reviewed commit | `8af5351d896adcc22f8046e58521d3692f3be53a` | `add66812b20bcf20e6189cfd9c1c1c8b4bb2e2fa` |
| Package | `spikes/a2a-pi` | `spikes/ag-ui-pi` |
| Main evidence | `evidence/REPORT.md`, `evidence/observed/` | `evidence/REPORT.md`, machine-readable files in `evidence/` |
| Recorded validation | 11 Node tests, 3 deterministic Chromium scenarios, strict TypeScript and browser build | 18 integration tests, 5 Chromium scenarios including the enabled live-model case, strict TypeScript and browser build |
| Recorded actual Pi evidence | Two gpt-6-astra sessions through Pi's configured provider; generated A2UI rendered in Chromium | Two standalone Sonnet 4.6 sessions through Pi/OpenRouter; an additional live-model browser journey |
| Protocol SDK | A2A JS 1.1.0 | AG-UI client/core 0.0.59 |
| Shared stack versions | Pi 0.85.1; A2UI/Lit 0.11.0 using v0.9/basic catalog | Pi 0.85.1; A2UI/Lit 0.11.0 using v0.9/basic catalog |
| SDK constraint | Published SDKs unchanged; public executor/store/transport integration | Published SDKs unchanged; public run/connect/abort overrides retain official processing |

Both branches started from `ad4013d853a6b77fd94fc4c575143ba9e8002bb1`. They share requirements, not executable host code. Different source-write strategies, model providers, generation policies, resource budgets and test interleavings limit direct comparison. No speed, bundle-size, test-count or total-cost winner follows from these unlike runs.

The package commits exist in the local repository object database and independent sibling worktrees; this debate does not publish or merge those branches. To inspect the exact evidence from a checkout containing those commits:

```sh
git show 8af5351d896adcc22f8046e58521d3692f3be53a:spikes/a2a-pi/evidence/REPORT.md
git show add66812b20bcf20e6189cfd9c1c1c8b4bb2e2fa:spikes/ag-ui-pi/evidence/REPORT.md
```

All package-relative references below are pinned to that table. A clone without the unpublished branch objects cannot yet reproduce the package inspection from main alone; this durable note and the captured reviewer reports preserve the moderated findings.

## Normalized behavior and corrected claims

| Requirement / evidence | A2A result | AG-UI result | Meaning and remaining check |
| --- | --- | --- | --- |
| G1: no-client execution, idle attachment and updates | Recorded fixture pass through published client, HTTP and Chromium | Recorded fixture pass through supported observer, HTTP and Chromium | Both work with owned lifecycle support. Neither stock default path receives credit for the added behavior. |
| G2: restart, reconnect and bounded churn | Recorded browser restart, silent-socket recovery, 30 wire detach cycles and lease renewal | Recorded browser/process restart, 100 HTTP cycles, 20 browser cycles and session renewal | Useful bounded proof. Overall G2 remains incomplete: saturation, sustained operation and controlled recovery cuts are not established. |
| Real backpressure and a healthy companion | Paused reader actually dropped at about 100 ms; companion checked discovery by RPC | Recorded zero writer drops; leases and explicit teardown bounded the exercised connection | Neither proves one slow observer cannot impede a continuously advancing companion under the same stress. Do not rank protocol reliability from unequal loads. |
| Browser stall assertion | A silent-open-socket test asserts the later external value after reconnect | Six light toggles return to the original value; the final assertion does not name the final sequence | AG-UI's assertion can pass without proving catch-up. Other AG-UI recovery tests remain valid; this specifically limits the browser-stall claim. |
| Snapshot/subscription boundary | Source write overlaps subscription acquisition without forcing the server-side cut | Source changes after initial state is observed | Neither forces the critical cut. Test uniquely identified final revisions across cut, renewal and interrupted publication. |
| G3: fully chatless actual Pi exchange | Model proof M1 explicitly asserts no person or Exo utterance | Human visual initiation and visual tool output pass, but `src/pi.ts` requires nonempty model text | Narrow the AG-UI report's fully visual model claim. Utterance-free Pi interaction is unproved and conflicts with its current Adapter policy; the publication path itself permits no utterance. |
| G3: mixed and historical Pi context | Original 11:00, accepted 13:00 and later source 14:15 retained and rendered | Original 11:00, accepted 13:00 and later source 14:30 retained and rendered | Both demonstrate exact history/current separation and actual Pi continuation for a thin exchange. Live voice and broader gestures/thread navigation remain open. |
| G4: simultaneous local acceptance | Two SDK clients plus duplicate delivery produce one acceptance/receipt/new plan on one host | Two HTTP/browser clients plus duplicate delivery produce one acceptance/receipt/source update on one host | Recorded local inter-request safety does not imply atomicity against arbitrary external writers or multiple hosts. |
| G4: arbitrary source writer | Exclusive new-file creation avoids overwriting the original; final stale-acceptance window remains unknown | Reproduced failure: intervening external 14:30 edit overwritten by 13:00 acceptance | The AG-UI implementation fails this mandatory source-authority requirement. A2A's different strategy is not a proof that the broader requirement passes. This is shared host work, not a protocol penalty. |
| External source contract | Watches the whole `Agenda.md` hash; later accepted `Plans/*.md` edits are not generally reconciled | Watches explicit frontmatter revision; edits without advancing it are ignored | Neither is complete normal-Obsidian editing support. A2A's accepted time changes only when its source hash changes, not on every poll. |
| G4: cancellation | Native cancel exercised against deterministic work/completion and restart mapping | Private explicit stop reports cancelling until execution actually returns; deterministic races pass | Actual live-Pi/provider cancellation races remain unknown. SDK cancellation is not universally proof of stopped execution, especially without a live bus. |
| Capacity and failure atomicity | State can change before size/save checks; a publication-cap exception can escape a timer callback | State can change before checkpoint checks; publication limit can reject an admitted state via an unhandled async path | Source-inferred hazards, not executed saturation results. Admission/publication/storage failure must leave recoverable, truthful state before either is relied on. |
| G5 / G6 | No SDK repairs in the delivered path; actual Pi/Lit, temporary Markdown/Bases and lights | Same, subject to the G4 source failure and narrowed G3 claim | Supported ownership is demonstrated. Full source integration, production auth and deployment are not. Neither spike is ready for adoption unchanged. |

Critical source locations: A2A `src/host.ts` (heartbeat, route, publication and executor), `src/thread.ts` (hash reconciliation, acceptance and capacity), `src/task-store.ts` (storage/control mapping), `client/app.ts` (discovery, native cancel and history), `tests/lifecycle.int.test.ts`, `tests/resources.int.test.ts` and `tests/model-proof.ts`. AG-UI `src/browser.ts` (subscriber paths, `view.turns`, diagnostic message count), `src/publication.ts` (state/message/activity framing), `src/transport.ts` (supported overrides and bounded reads), `src/host.ts` (source revisions, final write window and admission), `src/pi.ts` (required utterance), `test/workspace.browser.test.ts` (six-toggle assertion), `evidence/source-race.json` and `evidence/pi-proof.json`. Exact files and observations are discussed in both Round 2 reports (kept private) and [Fable's normalization](2026-09-13-spike-debate/fable-round2.md).

## Ownership and what the spike does not establish

| Concern | A2A-specific support | AG-UI-specific support | Shared Exo work |
| --- | --- | --- | --- |
| Observation | Renewable observer Tasks, readiness/discovery, heartbeat-assisted iterator release, socket closure, terminal-race retry, retention and store reconciliation | Bounded run/connect transport, observer endpoint, finite publication framing, abort/teardown and browser lease/session renewal | Independent execution, coherent current snapshot, admission limits, operational recovery policy |
| Communication | Multipart/data/Task/Artifact mapping into one thread | Command envelope and text/activity/state mapping into one thread | Meaningful turns, Surface/Utterance identity, exact references, history and Pi input |
| Work controls | Published get/list/cancel contracts; Exo store scoping and executor outcomes | Private work-summary/cancel conventions; Exo executor outcomes | Source authority, receipt semantics and actual stopped/completed/interrupted truth |
| A2UI and Pi | Documented A2A binding used; no turnkey Pi host supplied | Documented activity convention used; runtime middleware adoption not demonstrated | Catalog/generation policy, Lit shell, model tool, validation and historical rendering |

AG-UI's protected default `connect()` throws the not-implemented error, but its public `connectAgent()` wrapper catches that specific error and resolves an empty result. A successful await therefore does not prove any observation occurred. This refines earlier shorthand saying the wrapper simply throws. Neither that fact nor the custom spike demonstrates an upstream CopilotKit fix.

The moderator queried the primary npm registry on September 13 with `npm view @a2a-js/sdk version --json` and `npm view @ag-ui/client version --json`: latest stable versions matched 1.1.0 and 0.0.59. Fable's proposed upgrade dry run was therefore unavailable. No version bump or compatibility test occurred.

## How cross-examination changed the positions

| Stage | Astra | Fable | Resolution |
| --- | --- | --- | --- |
| Independent Round 1 | Weak A2A; 3.125 versus 3.075 | Narrow A2A; 3.05 versus 2.925 | Both lowered AG-UI processing credit from the forecast. Fable initially also penalized semantic mapping and generation policy. |
| Moderator clarification | Independent audit continued | Equalized W6, narrowed SDK claims, withdrew a message-remap experiment as decision-reversing | A rendering change does not remove semantic archive/model-context ownership; model-authored versus fixed UI is not a protocol binding difference. |
| Peer Round 2 | Kept scores; narrowed evidence and cancellation claims | Equalized W2; restored A2A W4 to 4 using the criterion's work-contract scope | Avoid charging unused client accumulation twice in W2 and W5. Standard control contracts are useful even though the browser currently uses only native cancel. |
| Exact ratification | ACCEPT, no required correction | ACCEPT, no required correction | Same eight clauses, central scores and low-confidence recommendation. Distinct uncertainty ranges remain recorded below. |

| Criterion | Agreed central A2A / AG-UI | Astra ranges A2A / AG-UI | Fable ranges A2A / AG-UI |
| --- | --- | --- | --- |
| W1 · 25% | 2.5 / 3 | 2–3.5 / 2–3.5 | 2–3 / 2.5–3.5 |
| W2 · 20% | 3.5 / 3.5 | 2.5–4 / 2.5–4 | 3–4 / 2.5–4 |
| W3 · 20% | 3 / 3 | 2–4 / 2–4 | 2.5–3.5 / 2–3.5 |
| W4 · 15% | 4 / 2.5 | 3–4.5 / 2–3 | 3.5–4.5 / 2–3 |
| W5 · 10% | 2.5 / 3 | 2–3 / 2.5–3.5 | 2–3 / 2.5–3.5 |
| W6 · 10% | 3.5 / 3.5 | 3–4 / 3–4 | 3–4 / 3–4 |

The main comparison uses the envelope of these reviewer ranges, not a statistical interval or averaged vote. Historical reports preserve withdrawn assertions for audit: Astra Round 1 (kept private), [Fable Round 1](2026-09-13-spike-debate/fable-round1.md), [Fable clarification](2026-09-13-spike-debate/fable-clarification.md), Astra Round 2 (kept private), [Fable Round 2](2026-09-13-spike-debate/fable-round2.md).

## Next verification and standing reversal condition

Use a matched observer-fault probe as the first mandatory lifecycle verification on the implementation selected for further work: keep one observer continuously advancing while another stops reading; force source changes at snapshot cuts and lease renewal; exercise actual backpressure and interrupted publication; assert bounded release and a uniquely identified final revision. Full snapshots are allowed. Tune deadlines against realistic frame sizes instead of treating finite local timings as production budgets.

**Reverse the A2A recommendation if this contract requires an SDK patch or private queue repair on A2A while AG-UI satisfies it through supported extension points.** A2A's present source and recorded behavior do not demonstrate that need. Ordinary host bugs call for repair; failure alone does not automatically favor the other protocol. Source-write concurrency, normal vault-edit detection, capacity failure atomicity and live Pi cancellation also need resolution before reliance.

No combined topology currently demonstrates a saving worth its extra identity/lifecycle mapping. A2UI over AG-UI over A2A, a split browser, and a host bridge remain open alternatives only if concrete work removed exceeds work introduced. Another full pair of products or a cosmetic message remap would not resolve the present mandatory gaps.

The architecture, requirements table, weighted comparison and generated HTML should reflect this record while remaining working discussion documents. No storage choice, production deployment, Matter integration, voice migration or final protocol adoption follows from reviewer consensus.

## Documentation validation

The moderator regenerated the HTML from the two canonical comparison files and validated all six scores, six weight profiles, two joint scenarios and 184 header/body cells across seven weighted tables. Chromium checks passed at 320, 390 and 1440 pixels, including keyboard table scrolling, readable content without JavaScript, unique IDs and no page errors. Desktop/mobile screenshots were inspected as temporary QA artifacts.

All 50 annotation anchors, CSS class attributes, document interaction code, and 12 styling/vendor/Spec Chat file hashes were preserved. Local Markdown link targets and the final diff check passed. Both spike worktrees remained clean; no spike code, tests or dependency versions changed. These are documentation checks, separate from the recorded protocol/model execution above.

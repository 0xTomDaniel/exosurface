# Exo plugin verification map

This directory is the maintained source for verifying the user-facing behavior of the Exo BB plugin (`plugins/bb-plugin-exosurface`). Read the index before driving, then use the matching feature file as the recipe. Paths below are relative to `plugins/bb-plugin-exosurface/` unless they start with `docs/`.

## Baseline preconditions

- This repo's tools on PATH (`just setup`: node at the plugin's `engines.node`, pnpm, python 3.11+ for `tomllib`); `verify-app launch` has run and printed `ready`.
- `verify-app doctor` exits 0 for this checkout (owner and runtime builds present and current, Pi CLI installed).
- Each case runs in its own empty working directory under `$VERIFY_APP_RUN_DIR/scratch`, as its own process group.
- Never drive a BB app, BB daemon, OptChat install, model provider or another box from this skill: no live evaluation is authorized.

## Driving conventions

- Drive through the helper: `.agents/skills/verify-app/scripts/verify-app drive <feature>`.
- Assert on the scenario's stdout lines and exit code; its stderr carries jsdom's React `act(...)` notices.
- One heavy job at a time on this box, under the gate's bounds (AGENTS.md; the contract's entry applies them).

## Proof and skip reporting

- Proof is the command, stdout, stderr, exit code, the files left in its cwd (none expected) and the processes left in its group (none expected), per case, under `$VERIFY_APP_EVIDENCE_DIR/<feature>/`, plus the evidence store record the drive prints.
- Report an unreachable case with the attempted command and the unmet precondition.
- Do not report a live-BB-only behavior as verified through the offline surface, and do not report a skipped entry point as verified through a different path.

## Acceptance criteria

What each feature must do lives in this repo's specs: [pages-and-activity.spec.html](../../../../docs/specs/pages-and-activity.spec.html) (user-facing), [page-bounds.spec.html](../../../../docs/specs/page-bounds.spec.html) (planned) and [quality-gate.spec.html](../../../../docs/specs/quality-gate.spec.html) (the gate, not a user feature). Feature files link their criteria by anchor. A drive's evidence record changes no status file.

## Feature entry contract

Each feature file has an H1 title, its criteria links, then exactly four H2s in order: `Sub-features`, `How to get to it (user POV)`, `Driving it with verify-app`, `Gotchas`. Criteria are linked by anchor, never restated. One line, ``Drive criterion: `<spec>#<anchor>` ``, after the criteria links names the criterion the feature's drive serves, its evidence record's criterion id.

## What the offline surface is

`demo/surfaces <scenario>` (ADR 0002 fallback: BB is not on this box; scenarios: `SCENARIOS` in `demo/surfaces.ts`). Real: `server.ts` RPCs and `message.dispatch` hook, `host.ts` bridge, the release owner (`legacy/primary/release-owner.ts` from `dist/`), the Pi 1.1 CLI, the rendered `app.tsx`. Faked at the boundary by the existing harness `test/mock-bb.ts`: BB, OptChat and the model. jsdom has no layout or paint: anything about true layout, paint, motion or BB's own window is live-BB-only.

## Features

Offline-provable: the scenario drives the feature on the real plugin code; "file" marks a feature with a feature file and a helper drive. The others run by hand (`<run state>/bin/surfaces <scenario>`, see SKILL.md Drive) until a ticket maps them.

| Feature | Criteria (`docs/specs/pages-and-activity.spec.html#...`) | Scenario | Source |
| --- | --- | --- | --- |
| [new-surface](./new-surface.md) (file) | `acceptance-new-surface` | `new-surface` | `legacy/surface/src/thread-sidebar.tsx` (button), `legacy/primary/server.ts` (`thread_new`, `thread_list`) |
| Exo block, latest reply only, no chat | `acceptance-no-chat`, `acceptance-exo-block-latest` | `exo-block` | `legacy/surface/src/exo-turn.tsx`, `legacy/surface/app.tsx` |
| Parallel surfaces, each its own Exo | `acceptance-parallel-second`, `acceptance-parallel-first` | `parallel`, `parallel-threads` | `legacy/primary/server.ts` (`thread_bind`), `legacy/primary/src/thread-profiles.ts` |
| Opening and the name on top | `acceptance-opening`, `acceptance-name-header` | `opening` | `legacy/surface/src/surface-title.tsx`, `legacy/surface/src/exo-turn.tsx` |
| One page in view, page strip | `acceptance-one-page-in-view` | `one-page` | `legacy/surface/src/stage.ts`, `legacy/surface/app.tsx` |
| Each page's own Exo block; Keep | `acceptance-exo-block-own-page`, `acceptance-exo-block-sent-page`, `acceptance-keep` | `exo-block-own-page`, `exo-block-sent-page` | `legacy/surface/src/exo-turn.tsx`, `legacy/surface/app.tsx` (Keep) |
| Input floats over the page (computed styles only) | `acceptance-input-floats` | `input-floats` | `legacy/surface/src/exo-turn.tsx` (input form), `legacy/surface/lib/exo-theme.ts` (styles) |
| Surface auto-name (fake namer model over HTTP) | `acceptance-auto-name` | `auto-name` | `legacy/primary/src/surface-name.ts`, `legacy/primary/src/local-config.ts` |
| Rename | `acceptance-rename` | `rename` | `legacy/surface/src/surface-rename.tsx`, `legacy/primary/server.ts` (`thread_rename`) |
| Live activity line while Exo works | `acceptance-live-activity`, `acceptance-live-activity-ends` | `activity-line`, `activity-block` | `legacy/primary/src/activity.ts`, `legacy/primary/src/first-step.ts`, `legacy/surface/src/exo-turn.tsx` |
| Press: to top, bubble, long notes (requested scroll only) | `acceptance-press-to-top` | `press-to-top`, `press-bubble`, `press-notes` | `legacy/surface/app.tsx`, `legacy/surface/src/press-line.ts` |
| One Exo tab, plugin named Exo, opens on Home | `acceptance-one-tab`, `acceptance-tab-opens-home`, `acceptance-plugin-name` | `one-tab` | `app.tsx`, `package.json` (`bb.name`) |
| Settings | `acceptance-settings-shows`, `acceptance-settings-close` | `settings` | `legacy/surface/src/settings.tsx` |
| First run and set-up | `acceptance-first-run`, `acceptance-set-up` | `first-run` | `legacy/surface/src/settings.tsx`, `legacy/primary/src/canonical-setup.ts` |
| Sidebar order and pinned controls | `acceptance-tree-newest-first`, `acceptance-tree-new-first`, `acceptance-sidebar-pinned` | `sidebar-layout` | `legacy/surface/src/thread-sidebar.tsx`, `legacy/primary/src/last-activity.ts` |
| Plain-word errors for Exo's page tool arguments (Exo-facing, #108) | none | `bad-arguments` | `legacy/surface/src/tool-contract.ts`, `src/update-arguments.ts` |
| A reinstalled app bundle in BB's long-lived window (PR #89) | none | `second-bundle` | `legacy/surface/src/bundle-tags.ts` |

Live-BB-only: needs the real BB app or daemon, a real OptChat, or a real model or provider. Not driven by this skill; no live evaluation is authorized.

| Feature or part | Why the offline surface cannot prove it | Source |
| --- | --- | --- |
| Native packaging, install and load in BB | `bb plugin build` and BB loading `host.ts`, `server.ts`, `app.tsx`; the demo imports them directly | `package.json` (`bb`, `scripts.build`), `host.ts`, `server.ts`, `app.tsx` |
| BB's tab bar and installed-plugins list as shown | the demo reads `app.navPanels` and `bb.name`, not BB's own UI | `app.tsx`, `package.json` (`bb.name`) |
| BB starting a spawned thread and its conversation | the scenario calls `host.start` itself as BB would; BB's ThreadChat is a stub | `server.ts` (`message.dispatch`), `legacy/primary/host.ts` |
| Real OptChat profiles, lock and instructions | OptChat is a fake Pi extension and profile API | `src/optchat-init.ts`, `legacy/primary/src/thread-profiles.ts` |
| What a real model answers: pages drawn, topic and scope choices, real tool steps (reading notes, web search), names a real namer picks | the model is an offline scripted stream; the namer's model a fake over HTTP | `src/model.ts`, `legacy/primary/src/model-selection.ts`, `legacy/primary/src/surface-name.ts` |
| True layout, paint and motion (floating input, fade, easing, sidebar scroll, bubble alignment as seen) | jsdom has no layout or animation; scenarios print computed styles and requested scrolls; the owner's RDP walkthrough covers the rest | `legacy/surface/lib/exo-theme.ts`, `legacy/surface/app.tsx`, `legacy/surface/src/thread-sidebar.tsx` |
| BB realtime delivery to the open panel | the harness relays channel payloads (`f.realtime`) | `legacy/primary/server.ts`, `legacy/surface/src/thread-sidebar.tsx` |

Not built yet (planned criteria, no feature in source to classify or drive): the activity view (`acceptance-activity-*`), topic and scope routing (`acceptance-topic-*`, `acceptance-out-of-scope-*`), follow (`acceptance-follow-*`), Needs you and Working (`acceptance-parallel-needs-you`, `acceptance-parallel-active`, `acceptance-sidebar-parts`, `acceptance-settle`, `acceptance-needs-you-empty`), the tree beyond order (`acceptance-tree-new-surface`, `acceptance-tree-nest`, `acceptance-tree-kept`), kept-page management beyond Keep (`acceptance-keep-refresh`, `acceptance-keep-versions`, `acceptance-unkeep`, `acceptance-reorder`, `acceptance-kept-to-surface`), the trunk (`acceptance-child-reads-parent`, `acceptance-trunk-shared`, `acceptance-parent-knows-child`, `acceptance-commit-linked`), and `docs/specs/page-bounds.spec.html`. Classify each here when it is built.

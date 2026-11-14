# new-surface

Criteria:

- [pages-and-activity#acceptance-new-surface](../../../../docs/specs/pages-and-activity.spec.html#acceptance-new-surface)

Drive criterion: `pages-and-activity#acceptance-new-surface`

## Sub-features

- `new-surface` the person presses New surface in the rendered Exo panel: the new surface is in view with one empty page, the input shown and empty, no Exo message, and the sidebar lists Home then the new surface, each bound to its own thread and its own Exo (OptChat profile, Pi run).

## How to get to it (user POV)

- In BB: open the Exo tab; in its sidebar (`nav` "Surfaces") press the `New surface` button above the tree.
- On this box (no BB): `plugins/bb-plugin-exosurface/demo/surfaces new-surface` renders the same panel (package.json `bb.app`, `app.tsx` > `legacy/surface/app.tsx`, sidebar `legacy/surface/src/thread-sidebar.tsx`) in jsdom on the real server RPCs (`thread_list`, `thread_new`, `workspace`, `exo_block`, `exo_send`, `canonical_setup_status`) and presses the button with Testing Library (`fireEvent.click` on the button named `New surface`).

## Driving it with verify-app

Preconditions:

- `verify-app launch` printed `ready`; `verify-app doctor` exits 0 (owner and runtime builds present, Pi CLI installed, `surfaces` usage lists `new-surface`).

Run: `.agents/skills/verify-app/scripts/verify-app drive new-surface`. Evidence: `$VERIFY_APP_EVIDENCE_DIR/new-surface/new-surface.{cmd,stdout,stderr,exit,files,procs}` and `summary.txt`.

- **New surface pressed** (`new-surface`). Run `surfaces new-surface`. Observe exit 0 and, on stdout: `surface in view: <values.new_surface> (thread ...)`, `  page: one empty page`, `  input: shown, empty`, `  activity: 0 Exo message(s)`, `sidebar: <values.home>, <values.new_surface>`, then each surface's thread and the Exo runs (one Pi per surface).
- **Side effects.** `.files` is empty (the scenario writes nothing in its cwd; its fixture is a temp dir it removes) and `.procs` is empty (no process of the scenario's group, bridge, owner or Pi, outlives it).

What is real and what is faked on this path: [README.md](./README.md#what-the-offline-surface-is).

## Gotchas

- The scenario's spawned thread is started by the scenario itself (`host.start` with the spawn's first message), as BB does after spawn; a real BB doing that is not proven here (live-BB-only).
- React prints `not wrapped in act(...)` notices on stderr from jsdom; they are expected and not checked. Assert on stdout only.
- `verify-app run` and `launch` rerun the qc.toml setup (`./scripts/build`), so a run drives fresh builds. A standalone `drive` after a source change needs `launch` (or `setup`) first: doctor fails on a missing owner build or one older than `src/`, and on a missing runtime bundle, but does not see a runtime bundle older than its source (`legacy/`), which the scenario would then run stale.
- The fixture lives under `$TMPDIR` (`exo-live-*`); Pi's OptChat lock socket sits in it, so a very long `TMPDIR` can exceed the unix socket path limit. Keep the default temp dir.

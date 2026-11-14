# exo-block-sent-page

Criteria:

- [pages-and-activity#acceptance-exo-block-sent-page](../../../../docs/specs/pages-and-activity.spec.html#acceptance-exo-block-sent-page)
- Clause [pages-and-activity#exo-block-sent-page](../../../../docs/specs/pages-and-activity.spec.html#exo-block-sent-page) (E10)

Drive criterion: `pages-and-activity#acceptance-exo-block-sent-page`

## Sub-features

- `exo-block-sent-page` Exo draws a kept page with a button (Plum plan), then a later page (Pear plan). The person opens the kept page from the page strip, sends a question Exo answers without changing any page, then presses the kept page's button. The kept page is made current before Exo's context is built (model and native stage name it), each turn shows in the kept page's Exo block, and the later page keeps its own exchange.

## How to get to it (user POV)

- In BB: on a surface with two pages, open the earlier one from the page strip, type in the input and press Send, or press a button on that page.
- On this box (no BB): `plugins/bb-plugin-exosurface/demo/surfaces exo-block-sent-page` renders the panel (`legacy/surface/app.tsx`) on the real server RPCs (`exo_send`, `action`, `exo_block`, `workspace`), the release owner's `canvas-press` (`legacy/primary/src/owner-service.ts`) and the page extension's `workspace-press` (`legacy/surface/src/workspace-extension.ts`), which makes the sent-from page current before the message.

## Driving it with verify-app

Preconditions: `verify-app launch` printed `ready`; `verify-app doctor` exits 0.

Run: `.agents/skills/verify-app/scripts/verify-app drive exo-block-sent-page`. Evidence: `$VERIFY_APP_EVIDENCE_DIR/exo-block-sent-page/exo-block-sent-page.{cmd,stdout,stderr,exit,files,procs}` and `summary.txt`.

- **Earlier page made current.** Observe exit 0 and on stdout `current page before Exo's context: model stage "plum", native stage "plum"`.
- **Question and press on the kept page.** `after the question (draws nothing): page in view "Plum plan"` with bubble `"which plums are ripe?"`; `after the press: page in view "Plum plan"` with bubble `"Pick plums"`.
- **Later page keeps its own.** `later page opened from the page strip: page in view "Pear plan"` with bubble `"draw pear: Pear plan"`.
- **Side effects.** `.files` and `.procs` are empty.

What is real and what is faked on this path: [README.md](./README.md#what-the-offline-surface-is).

## Gotchas

- The model is an offline stream: the stage it reads is the page-state context the pages extension attaches, not a real model's choice.
- A send while Exo works is not journaled with its page (as on main); this drive sends only while Exo is idle.
- stderr carries jsdom's React `act(...)` notices; assert on stdout only.

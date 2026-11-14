# exo-block-own-page

Criteria:

- [pages-and-activity#acceptance-exo-block-own-page](../../../../docs/specs/pages-and-activity.spec.html#acceptance-exo-block-own-page)
- Clause [pages-and-activity#exo-block-sent-page](../../../../docs/specs/pages-and-activity.spec.html#exo-block-sent-page) (E10)

Drive criterion: `pages-and-activity#acceptance-exo-block-own-page`

## Sub-features

- `exo-block-own-page` turns on Home that draw a week page, then a garden page, then a message on the garden page that draws nothing; the earlier page opened from the page strip and back; Exo withdraws the garden page and a message that draws nothing lands on the week page; then, from that earlier page, a message about another topic: the orchard page Exo draws carries that exchange, and the week page, opened again from the strip, keeps its own.

## How to get to it (user POV)

- In BB: send messages that make pages, open an earlier page from the page strip, read each page's Exo block (bubble and reply above its content).
- On this box (no BB): `plugins/bb-plugin-exosurface/demo/surfaces exo-block-own-page` renders the panel (`legacy/surface/app.tsx`, page strip `legacy/surface/src/stage.ts`) on the real `exo_block` RPC (`legacy/primary/server.ts`, `legacy/primary/src/exo-turn.ts` `latestTurn`).

## Driving it with verify-app

Preconditions: `verify-app launch` printed `ready`; `verify-app doctor` exits 0.

Run: `.agents/skills/verify-app/scripts/verify-app drive exo-block-own-page`. Evidence: `$VERIFY_APP_EVIDENCE_DIR/exo-block-own-page/exo-block-own-page.{cmd,stdout,stderr,exit,files,procs}` and `summary.txt`.

- **Each page its own.** Observe exit 0, every `another page's turn in the block: none`, and no `SHOWN`.
- **New topic from an earlier page.** `a new topic sent from the earlier page: page in view "Orchard plan"` with bubble `"draw orchard: Orchard plan"`; then `the earlier page opened again from the page strip: page in view "Week plan"` with bubble `"and the hedge along the path"`.
- **Side effects.** `.files` and `.procs` are empty.

What is real and what is faked on this path: [README.md](./README.md#what-the-offline-surface-is).

## Gotchas

- Which topic a message is about is the model's choice; the offline stream's `draw <id>: <title>` prompt stands for Exo choosing to draw a new page.
- stderr carries jsdom's React `act(...)` notices; assert on stdout only.

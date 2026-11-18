# exo-block-own-page

Criteria:

- [pages-and-activity#acceptance-exo-block-own-page](../../../../docs/specs/pages-and-activity.spec.html#acceptance-exo-block-own-page)
- Clause [pages-and-activity#exo-block-sent-page](../../../../docs/specs/pages-and-activity.spec.html#exo-block-sent-page) (E10)

Drive criterion: `pages-and-activity#acceptance-exo-block-own-page`

## Sub-features

- `exo-block-own-page` the criterion's journey: Exo draws a week page in reply to one message and the person presses Keep on it; the person sends messages about another topic (a garden page, then a message on it that draws nothing) and waits for Exo's finished turns; the person opens the kept week page from the page strip: its Exo block shows only its own message and reply. Then back to the current topic; Exo withdraws the garden page and a message that draws nothing lands on the week page; from that earlier page, a message about another topic: the orchard page Exo draws carries that exchange, and the week page, opened again from the strip, keeps its own.

## How to get to it (user POV)

- In BB: send a message that makes a page, press Keep on it, send a message about another topic, wait for Exo to finish, open the kept page from the page strip, read its Exo block (bubble and reply above its content).
- On this box (no BB): `plugins/bb-plugin-exosurface/demo/surfaces exo-block-own-page` renders the panel (`legacy/surface/app.tsx`, page strip `legacy/surface/src/stage.ts`) on the real `exo_block` RPC (`legacy/primary/server.ts`, `legacy/primary/src/exo-turn.ts` `latestTurn`).

## Driving it with verify-app

Preconditions: `verify-app launch` printed `ready`; `verify-app doctor` exits 0.

Run: `.agents/skills/verify-app/scripts/verify-app drive exo-block-own-page`. Evidence: `$VERIFY_APP_EVIDENCE_DIR/exo-block-own-page/exo-block-own-page.{cmd,stdout,stderr,exit,files,procs}` and `summary.txt`.

- **Kept page.** Observe `pressed Keep on "Week plan"; canonical kept refs: [week]; the strip marks Week plan kept`, then after the garden turns `kept page opened from the page strip: page in view "Week plan"` with bubble `"draw week: Week plan"` and reply `"Exo (<profile>): draw week: Week plan"`.
- **Each page its own.** Observe exit 0, every `another page's turn in the block: none`, and no `SHOWN`.
- **New topic from an earlier page.** `a new topic sent from the earlier page: page in view "Orchard plan"` with bubble `"draw orchard: Orchard plan"`; then `the earlier page opened again from the page strip: page in view "Week plan"` with bubble `"and the hedge along the path"`.
- **Side effects.** `.files` and `.procs` are empty.

What is real and what is faked on this path: [README.md](./README.md#what-the-offline-surface-is).

## Gotchas

- Which topic a message is about is the model's choice; the offline stream's `draw <id>: <title>` prompt stands for Exo choosing to draw a new page.
- stderr carries jsdom's React `act(...)` notices; assert on stdout only.

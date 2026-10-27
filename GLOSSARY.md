# Exosurface

What the person and Exo share: one surface of pages, each with its own activity, and one input. Words, visuals and presses are senses of one exchange, and every one of them is kept as faithfully as the others. The behaviour is specified in [pages and activity](docs/specs/pages-and-activity.spec.html).

## The surface

**Surface** (Exosurface in full):
The whole screen the person and Exo share: the page in view and one input, with no separate chat column.
_Avoid_: canvas, workspace, board, panel area

**Page**:
A general, first-class object made of blocks, with its own activity and any number of child pages. A page can become anything; none is specific to plans or weeks. Pages are revisited, edited and versioned.
_Avoid_: surface (A2UI's protocol word, used only inside the code), panel, card, document, module, view, chat, thread (a thread is a page's activity)

**Block**:
One general element of a page, from the visual catalog: text, a note, a table, a chart and the like.
_Avoid_: widget, component (the renderer's word)

**Exo block**:
The one block on every page that shows Exo's words from its latest turn there. Each turn replaces it; earlier words stay in the page's activity.
_Avoid_: chat reply, message bubble

**Input**:
The one place, always shown, where the person types to Exo. What they send goes to the page in view.
_Avoid_: composer, chat box

**Child page**:
A page made from another page, its parent, for work on the side or in parallel. It reads its parent as it is now; the parent lists it and knows its commits.
_Avoid_: subthread, errand, new chat

**Stage**:
The place on the surface for the page in view. Only the person moves between pages; Exo's turn on a page never changes which page is in view.
_Avoid_: focus, main view

**Beside**:
Up to two small pages of supporting context shown next to the stage.
_Avoid_: sidebar, context panel

**Shelf**:
The recent pages that have left the stage, one click away.
_Avoid_: earlier list, tabs

## Pages over time

**Activity**:
A page's own agent thread, in time order: what the person sent and pressed, what Exo said, each version and each commit. It never records typing or unsent drafts. The page shows the work now; its activity shows how it got here: one record, two views.
_Avoid_: chat history, transcript, page history (pages moved off the surface)

**Version**:
A page as it was after one change. Every version is kept; the conversation's history of pages is append-only.
_Avoid_: snapshot (that is the format), revision (that is the whole surface's counter)

**Page history**:
The pages the system has moved off the surface to keep it tidy. Nothing is deleted; any page can come back. The system manages it, never the agent.
_Avoid_: archive, retired surfaces

**Page card**:
The entry in a page's activity marking where Exo drew or edited the page. Opening it shows that version.
_Avoid_: tool row, surface card

**Bring back**:
Making an earlier version, or a page not on stage, the current page on stage again, carried with the person's next message or press.
_Avoid_: restore, rewind (the view of an earlier version before it is brought back)

**Withdraw**:
Removing a page because it was wrong. Never used for tidying.
_Avoid_: delete, retire

## Talking through pages

**Snapshot format**:
The one-line-per-element language the agent uses to draw, read and edit pages, modelled on Playwright's aria snapshots.
_Avoid_: DSL, markup, A2UI (the renderer's wire format)

**Ref**:
A stable name for a page or an element on it, used to edit or point at it.
_Avoid_: id, key

**Outline**:
The page a turn is on and, for a child page, its parent, shown to Exo with each request in the snapshot format. Current state, never history.
_Avoid_: canvas state, frame

**Page edits**:
Values the person changes on a page; they reach the agent with the person's next message as state, not as speech.
_Avoid_: canvas edits, form input

**Press**:
The person pressing a button on a page, which starts the agent's turn with a readable line.
_Avoid_: action, event, click

## One Exo across pages

**Trunk**:
The one shared record of commits for all of the person's pages. Every turn on every page reads it; no page reads another page's activity.
_Avoid_: main thread, shared chat, memory (the vault)

**Commit**:
One line Exo adds to the trunk when a page decides or finishes something, linked to the activity entry it came from.
_Avoid_: summary, note

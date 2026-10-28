# Exosurface

What the person and Exo share: surfaces of pages and one input, where each surface's activity is its thread. Words, visuals and presses are senses of one exchange, and every one of them is kept as faithfully as the others. The behaviour is specified in [pages and activity](docs/specs/pages-and-activity.spec.html).

## The surface

**Surface** (Exosurface in full):
The place the person and Exo work on one thing together: its pages, the page in view and one input, with no separate chat column. A surface and its thread are the same thing, and surface is the person-facing word: its activity is the conversation, across all of its pages. Parallel work is another surface, started with New surface.
_Avoid_: canvas, workspace, board, panel area, thread (the internal word for a surface's activity), chat, new chat, new agent

**Page**:
A general, first-class object made of blocks, on one surface. A page can become anything; none is specific to plans or weeks. Pages are revisited, edited and versioned, and each keeps its own versions, so it can be rewound; its conversation belongs to its surface's activity.
_Avoid_: surface (a surface holds pages; in the code also A2UI's protocol word), panel, card, document, module, view, chat, thread (a thread is a surface's activity)

**Block**:
One general element of a page, from the visual catalog: text, a note, a table, a chart and the like.
_Avoid_: widget, component (the renderer's word)

**Exo block**:
The one block on every page that shows Exo's words from its latest turn there. Each turn replaces it; earlier words stay in the surface's activity.
_Avoid_: chat reply, message bubble

**Input**:
The one place, always shown, where the person types to Exo. What they send is a turn in the activity of the surface in view.
_Avoid_: composer, chat box

**Child page**:
A page made from another page, its parent, for work on the side or in parallel. It reads its parent as it is now; the parent lists it and knows its commits. Whether child pages stay, and what a child reads, is open in the brainstorm on surfaces.
_Avoid_: subthread, errand, new chat

**Stage**:
The place on a surface for its page in view. A turn on a surface that is not in view never changes which surface is in view.
_Avoid_: focus, main view

**Beside**:
Up to two small pages of supporting context shown next to the stage.
_Avoid_: sidebar, context panel

**Shelf**:
The recent pages that have left the stage, one click away.
_Avoid_: earlier list, tabs

## Pages over time

**Activity**:
A surface's thread, in time order, across all of its pages: what the person sent and pressed, what Exo said, each page version and each commit. It never records typing or unsent drafts. The pages show the work now; the activity shows how it got here: one record, two views.
_Avoid_: chat history, transcript, page history (pages moved off the surface)

**Version**:
A page as it was after one change. Every version is kept; the conversation's history of pages is append-only.
_Avoid_: snapshot (that is the format), revision (that is the whole surface's counter)

**Page history**:
The pages the system has moved off the surface to keep it tidy. Nothing is deleted; any page can come back. The system manages it, never the agent.
_Avoid_: archive, retired surfaces

**Page card**:
The entry in a surface's activity marking where Exo drew or edited a page. Opening it shows that version.
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
The page in view on the surface a turn is on, shown to Exo with each request in the snapshot format; whether it also holds a parent page is open in the brainstorm on surfaces. Current state, never history.
_Avoid_: canvas state, frame

**Page edits**:
Values the person changes on a page; they reach the agent with the person's next message as state, not as speech.
_Avoid_: canvas edits, form input

**Press**:
The person pressing a button on a page, which starts the agent's turn with a readable line.
_Avoid_: action, event, click

## One Exo across surfaces

**Trunk**:
The one shared record of commits for all of the person's surfaces. Every turn on every surface reads it.
_Avoid_: main thread, shared chat, memory (the vault)

**Commit**:
A one-line record Exo writes to the trunk when a surface decides or finishes something, such as "Weekend trip: booked the lake cabin for Friday and Saturday", linked to the activity entry it came from.
_Avoid_: summary, note

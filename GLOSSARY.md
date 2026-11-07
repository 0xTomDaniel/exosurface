# Exosurface

What the person and Exo share: surfaces of pages and one input, where each surface's activity is its thread. Words, visuals and presses are senses of one exchange, and every one of them is kept as faithfully as the others. The behaviour is specified in [pages and activity](docs/specs/pages-and-activity.spec.html).

## The Exo tab

**Exo tab**:
The one tab in BB where the person works with Exo: the sidebar, the surface in view, and settings. Exo is its surfaces and the memory behind them.
_Avoid_: Exosurface tab, proof tab

**Settings**:
The screen, opened from the sidebar, where the person sets Exo up and sees how it runs: whether it is set up, its model, whether it is running, and its owner profile. Not a surface; it has no input.
_Avoid_: diagnostics, proof page, debug panel

## The surface

**Surface** (Exosurface in full):
The place the person and Exo work on one thing together: one or more pages, the page in view and one input, with no separate chat column. A surface and its thread are the same thing, and surface is the person-facing word: its activity is the conversation, across all of its pages. Parallel work is another surface; New surface is the only button for starting new work.
_Avoid_: canvas, workspace, board, panel area, thread (the internal word for a surface's activity), chat, new chat, new agent

**Home**:
The one surface that is always at the top of the sidebar, for anything general. It has no scope, so topics change freely there; like every surface, it gives a new topic a new page.
_Avoid_: main chat, inbox

**Child surface**:
A surface nested under another, its parent, in the tree. It reads its parent's pages as they are now; the parent knows its commits.
_Avoid_: subthread, errand, child page, new chat

**Page**:
A general, first-class object made of blocks, on one surface. Exo makes pages as the topic moves; the person never makes one. A page can become anything; none is specific to plans or weeks. Each page keeps its own versions, so it can be rewound; its conversation belongs to its surface's activity.
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

**Message page**:
The default kind of page: a snapshot Exo changes only while it is the topic. When the topic moves, it slides into the surface's page history, one click back.
_Avoid_: draft page, temporary page

**Kept page**:
A page the person kept, by pressing Keep, unprompted or when Exo suggests it. It stays in the page strip and Exo refreshes it in place; its earlier versions are its history, never extra pages. The person can unkeep it, reorder it, or move it into its own surface.
_Avoid_: pinned page, saved page

**Page strip**:
The row of a surface's pages: its kept pages in the person's order and its current message page, with the page history one click away. The only place pages are listed.
_Avoid_: tabs, shelf

**Follow mode**:
While the person is following, from a send until they next scroll, click or type, Exo moving to a new page puts it in view. Otherwise the view stays put and the new page gets a dot in the page strip; the next send resumes following.
_Avoid_: auto-scroll, focus stealing

**Stage**:
The place on a surface for its page in view. Exo never switches which surface the person is in; within it, follow mode decides when a new page comes into view.
_Avoid_: focus, main view

**Beside**:
Up to two small pages of supporting context shown next to the stage.
_Avoid_: context panel

**Sidebar**:
The list of surfaces, never pages, in three parts: Home at the top, Needs you, and the tree; the New surface button stays in view above it and the Settings gear below it.
_Avoid_: chat list, history

**Needs you**:
The sidebar part for surfaces, other than the one the person is in, that finished a turn or wait on the person. A surface rises into it on its own and leaves when the person settles it; it can be empty. Surfaces Exo is working on fold into a Working group beside it.
_Avoid_: inbox, unread

**Tree**:
Every surface, nested like Notion pages, most recent first at each level. The person nests, moves, renames and settles surfaces; Exo may add a child surface but never rearranges the tree.
_Avoid_: folders, projects

**Settle**:
The person marking a surface done for now: it leaves Needs you and keeps its place in the tree.
_Avoid_: archive, close, delete

## Pages over time

**Activity**:
A surface's thread, in time order, across all of its pages: what the person sent and pressed, what Exo said, each page version and each commit. It never records typing or unsent drafts. The pages show the work now; the activity shows how it got here: one record, two views.
_Avoid_: chat history, transcript, page history (pages moved off the surface)

**Version**:
A page as it was after one change. Every version is kept; the conversation's history of pages is append-only.
_Avoid_: snapshot (that is the format), revision (that is the whole surface's counter)

**Page history**:
A surface's earlier message pages, which slid out of the page strip when the topic moved. Nothing is deleted; any page can come back, one click from the page strip. The system manages it, never the agent.
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
The current message page and kept pages of the surface a turn is on and, for a child surface, of its parent, shown to Exo with each request in the snapshot format. Current state, never history.
_Avoid_: canvas state, frame

**Page edits**:
Values the person changes on a page; they reach the agent with the person's next message as state, not as speech.
_Avoid_: canvas edits, form input

**Press**:
The person pressing a button on a page, which starts the agent's turn with a readable line.
_Avoid_: action, event, click

## One Exo across surfaces

**Trunk**:
The one shared record of commits for all of the person's surfaces. Every turn on every surface reads it; no surface reads another surface's activity.
_Avoid_: main thread, shared chat, memory (the vault)

**Commit**:
A one-line record Exo writes to the trunk when a surface decides or finishes something, such as "Weekend trip: booked the lake cabin for Friday and Saturday", linked to the activity entry it came from.
_Avoid_: summary, note

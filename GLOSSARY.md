# Exosurface

The visual half of Exo: what the agent shows beside the chat. Chat and surface are two senses of one conversation, and the visual track is kept as faithfully as the text.

## The surface

**Surface** (Exosurface in full):
The whole area beside the chat, where the agent shows pages. On a dedicated device it is the screen itself.
_Avoid_: canvas, workspace, board, panel area

**Page**:
One visual unit the agent draws for a topic: the visual counterpart of a message. Pages are revisited, edited and versioned.
_Avoid_: surface (A2UI's protocol word, used only inside the code), panel, card, document, module, view

**Stage**:
The place on the surface for the page the conversation is about now; by default the page the agent last drew or redesigned.
_Avoid_: focus, main view

**Beside**:
Up to two small pages of supporting context shown next to the stage.
_Avoid_: sidebar, context panel

**Shelf**:
The recent pages that have left the stage, one click away.
_Avoid_: earlier list, tabs

## Pages over time

**Version**:
A page as it was after one change. Every version is kept; the conversation's history of pages is append-only.
_Avoid_: snapshot (that is the format), revision (that is the whole surface's counter)

**Page history**:
The pages the system has moved off the surface to keep it tidy. Nothing is deleted; any page can come back. The system manages it, never the agent.
_Avoid_: archive, retired surfaces

**Page card**:
The item in the chat history marking where the agent drew or edited a page. Opening it shows that version.
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
The current surface, shown to the agent with each request in the snapshot format. Current state, never history.
_Avoid_: canvas state, frame

**Page edits**:
Values the person changes on a page; they reach the agent with the person's next message as state, not as speech.
_Avoid_: canvas edits, form input

**Press**:
The person pressing a button on a page, which starts the agent's turn with a readable line.
_Avoid_: action, event, click

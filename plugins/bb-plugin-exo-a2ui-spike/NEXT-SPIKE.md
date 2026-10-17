# Next spike: the canvas as an equal channel

Status: **planned**, not started. Starts after the owner's current test session. Implemented in the canvas plugin on the isolated clone; graduation to the main agent session follows separately.

## Minimum promotion spike (revised 2026-10-16, evening)

Supersedes the three-arm comparison below. The owner rejected any after-the-fact rewriting of the agent's messages, so both summary-based arms are out; and browsing agents show a cleaner answer than verbatim A2UI.

**Lesson from browsing agents.** Tools that put web pages into model context (Playwright MCP, playwright-cli, agent-browser, a11y-tree; Browser Use with its own variant) never send HTML. They send the accessibility tree as compact text: role, accessible name, value and state, with a short ref per element (Playwright's aria snapshot YAML, e.g. `- button "Submit" [ref=e3]`). The model acts through refs ("click e5") and never writes markup; each action returns the new snapshot; the better tools mark or send only what changed. The same YAML is also written by hand as Playwright test templates, so the format works in both directions. Charts are where it is weak: a chart appears only as `img "name"`, and its data is lost. The accessibility answer for complex images is a short text alternative plus the data, usually as a table. Playwright's `/property` child lines (for example `- /url: …`) give a standard slot for extra properties.

**Design: one canvas language.** The agent draws, reads, remembers and edits the canvas in a line-per-component snapshot format modelled on Playwright's aria snapshot YAML. Component ids are refs, and roles map onto the catalog (Callout → `note`, Timeline and Flow → `list`, Disclosure → `group [expanded]`, Tabs → `tablist`/`tab`, inputs → `textbox`/`checkbox`/`radiogroup` with values inline). Charts and Metrics follow the accessibility pattern: a `figure` with a chart attribute and its data as a child table. Layout groups and button actions need explicit attributes. Code translates to and from standard A2UI, which the renderer keeps receiving. No layout JSON in context, and no editing of history: what the agent writes is already the compact form.

```yaml
- region "Weekend trip: three cabins" [ref=trip]:
  - note "Prices are from last week" [ref=stale] [tone=warning]:
    - text: Two of the three listings may have changed; check before booking.
  - figure "Price per night" [ref=prices] [chart=bar]:
    - table:
      - row: Lake cabin | 180
      - row: Forest lodge | 145
  - button "Book the lake cabin" [ref=book]
```

0. **Drawing test — passed 2026-10-16.** Eight real canvas turns, each drawn once in A2UI and once in the snapshot format by the same model and prompt (only the format contract differed), rendered in the real canvas and graded blind by a different model family. Snapshot format won 6 of 8; mean scores (1–5) usefulness 4.00 vs 3.63, faithfulness 3.75 vs 3.50, visual 4.13 vs 3.75; valid on the first try 8/8 vs 7/8; median size 2.3 KB vs 3.2 KB; median 24 s vs 26 s. Small sample, one run, one grader: it shows the format draws at least as well, not that it is better. The grader's reasons were mostly about content, so run-to-run variation is large. Translator: `src/snapshot-format.ts`; harness: `test/drawing-eval.mts` (real cases and outputs kept private). Earlier wording follows.
   **Drawing test first.** Can the agent draw as well in this format as in A2UI? Same real prompts, both formats, graded blind on usefulness, correctness and visual quality, plus size. If drawing in the format falls short, keep A2UI for drawing and use the format for reading, history and diffs only.
**Built and live on the clone (2026-10-16, items 1–5):** `update_exosurface` (snapshot, edits by ref, delete, focus/beside) and `read_exosurface` replace the A2UI tools, which stay registered only so earlier history replays. The per-request outline is in the same format: stage and beside surfaces in full with refs and current values, shelf surfaces by title. The `message_end` rewrite is gone: what the agent writes is what history keeps. The person's canvas edits arrive with their next message as a `[canvas-edits]` message. Streaming previews each complete line. Surfaces drawn earlier in A2UI read back in the snapshot format and can be edited by ref. One labelled verification turn: drew a surface in one call, changed its title with a 163-byte edit by ref, zero canvas JSON in requests and in OptChat memory, zero re-reads. Original item text follows.
1. **The agent's view in the same format:** the per-request outline of the current canvas (current state, not history).
2. **Each update returns the new snapshot of the affected surface, or only what changed,** as browsing tools do after an action. OptChat then summarizes plain text, never JSON.
3. **Edits by ref:** small operations on component ids, checked against the current revision. Nothing needs re-reading; the read tool stays targeted for rare cases.
4. **Remove the `message_end` rewrite.** Canvas calls stay exactly as the agent wrote them, and OptChat handles them like any other message.
5. **The person's canvas edits reach the agent with their next message,** as a labelled line in the same format.
6. **Streaming is already per component** (done 2026-10-16); one line per component maps onto it directly.
7. **Proof on the clone through real use,** using the gate script: history added per canvas turn, re-reads (target zero), no layout JSON anywhere in memory, and how OptChat summarizes canvas turns. Then reliability re-runs, rename at migration, and five real-use sessions.

**Main stays untouched until the clone proves the context is clean** (owner, 2026-10-16). Only then: the main session on upstream OptChat with the same extension order.

**Deferred until use earns them:** historical revision reads, the screenshot tool and render facts. Mobile stays a separate, urgent priority.

## Surfaces as conversation history (owner design, 2026-10-17)

Surfaces work like messages: no limit, every version kept, the past managed by the system.

- **No surface limit; the system manages the past.** The 8-surface cap and the guidance to delete stale surfaces go. The live canvas is only what is in view (stage, beside, a few recent shelf items); the system moves older surfaces out of view automatically, deleting nothing. The agent never does housekeeping and never sees a housekeeping error. It can still reopen or redesign any earlier surface by ref, and `read_exosurface` reads any surface, past or present. `delete` remains only for withdrawing a surface that was wrong. The outline shows stage and beside in full, recent shelf titles, and how many more are in history.
- **Surface cards in the chat.** Each draw or edit appears in the conversation, where it happened, as a card with the surface title, injected by the plugin into the displayed assistant message (a BB `messageDirective`; display-only, never in the agent's context). The plain tool row is suppressed. **Clicking the card opens that surface on the canvas as it was at that moment** (no expansion), marked as an earlier version, with a ✕ to return to the latest canvas.
- **Editing an earlier version prepares a bring-back.** Edits to a past version are held as pending, and a card appears with the composer ("Bringing back: <title> (<time>) ✕", via BB's composer banner slot; BB offers banners above the input, not attachment chips inside it). When the person sends a message or presses a button on that surface, code first restores the surface with their edits as the current version on stage; the agent's turn then carries a labelled line ("Tom brought back <surface> (<time> version) and changed: …"). ✕ cancels.
- **One cancel.** The ✕ on the rewind view and the ✕ on the composer card do the same thing: return the canvas to the latest version and discard the pending bring-back, including any edits made to the earlier version. Nothing is committed and the agent is not told.
- **Context unchanged:** cards and rewinding are UI only; the agent's history already holds its calls verbatim.
- **Risk:** the BB slots used (`messageDirective`, composer banners, tool presentation) are experimental; if they change, the chat falls back to BB's plain display with nothing lost. Main gets this when the two plugins merge at graduation.

## Earlier minimum spike (superseded)

Kept for the record: a three-arm comparison of summaries, verbatim A2UI with a receipt, and summaries with minimal edits. Superseded because the owner ruled out rewriting the agent's messages and the snapshot format above replaces verbatim A2UI.

## Original plan (longer direction)

## Goal

Visuals and text are equal communication channels. The agent should think in terms of the surface as naturally as it thinks in text: author it, remember it, revisit it, see it, and read the person's actions on it, with good context coming from well-designed tools rather than context surgery.

## Principles

- **Design for good context; don't edit it afterwards.** Other tools (file reads, shell, search) are not pruned; OptChat treats them uniformly (output cap, previous-exchange replay, summary tree). The canvas should be no different.
- **Lossless visual record.** What the agent drew stays in its history exactly, like its words.
- **Current state is state, not history.** A compact outline of the live canvas goes with each request.
- **Standard on the wire.** The renderer always receives standard A2UI; ergonomic agent-side forms are translated by code.

## Where we are

| | Text | Canvas today | Canvas after this spike |
|---|---|---|---|
| Authoring | Prose | Full A2UI per changed component | A2UI for new surfaces; JSON Patch for edits |
| Own history | Exact words | Lossy "Showed on canvas" summary (call rewritten at `message_end`) | Exact A2UI, plus a meaning line in the tool result |
| Going back | `zoom` to originals | Not possible (summary only) | Read any past revision |
| Current state | Recent turns | Outline per request | Unchanged |
| Seeing the result | Reads what it wrote | Never sees the render | Screenshot tool and render facts |
| Person's side | Messages in history | Edits only as current values | Edits recorded with the person's next message |
| Streaming | Token by token | Per completed component (since 2026-10-16) | Unchanged |

## Work items

1. **Remove canvas-specific context handling.** Drop the `message_end` rewrite of canvas calls; keep A2UI verbatim. Keep the per-request outline (current state). No pruning of earlier reads or calls.
2. **Meaning in the tool result.** The update tool returns a deterministic plain-language line of what was shown (all visible text, structure, what took the stage) next to its result, so the summarizer and the agent get exact form and meaning together.
3. **JSON Patch edits.** The update tool also accepts RFC 6902 operations against component ids (for example `replace /components/lean/title`); code applies them and emits standard A2UI. Edits become small, and the agent edits from the outline instead of re-reading.
4. **Targeted reads, including the past.** The read tool returns specific components, or the canvas as it was at revision N (rebuilt from the native session): the visual equivalent of `zoom`. No whole-canvas dumps.
5. **Seeing what it drew.** A tool that returns a screenshot of the rendered canvas, plus optional render facts after each commit (clipped or overflowing content, what is out of view).
6. **The person's canvas actions as communication.** Edits made since the agent's last turn arrive with the person's next message as one line ("You changed: pick → Lake cabin; checked Rain jackets"), persisted like anything else they say.
7. **Per-component streaming — done 2026-10-16.** The stream parser emits each component inside an `updateComponents` message as soon as its JSON closes, so the canvas fills in while the model generates. The tool contract asks for `surfaceId` before `components`.
8. **Measure.** History bytes per canvas turn (verbatim + meaning line versus today's summaries), summarizer quality on canvas turns, how often reads are still needed, reply overlap with the canvas, and the owner's judgement of whether the agent now treats the surface as a first-class channel.
9. **Rename at graduation.** "Workspace" is a leftover from the first spike: tools become `update_exosurface` / `read_exosurface` (plus the screenshot tool) when moving to the main session, which starts with no canvas history. The clone keeps decoding the old names for its own history.

## Open question

A2UI is a machine wire format; models know prose, HTML and JSX far better. If the agent still treats the canvas as secondary after this spike, test a compact authoring format closer to how models already think about UI (one component per line), translated to standard A2UI by code. Measure before adopting.

## Prerequisites for graduation (unchanged)

- Main session on upstream OptChat (pending [jonaslsaa/pi-optchat#187](https://github.com/jonaslsaa/pi-optchat/pull/187) or approval of the interim commit).
- Same extension order on main: the canvas extension before OptChat, the context extension after.
- The owner's judgement after real use; code-only migration, no history merge.

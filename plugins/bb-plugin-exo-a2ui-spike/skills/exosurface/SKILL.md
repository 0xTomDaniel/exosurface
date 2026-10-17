---
name: exosurface
description: Reference for composing Exosurface canvas surfaces with update_exosurface in the snapshot format — encoding choices, worked line shapes, edits by ref and how to morph the stage across turns. Read when composing something unusual (diagrams, charts, dense comparisons, multi-surface context) or after a canvas error. The always-on presentation guide and tool contract are already in your system prompt; this is optional depth.
---

# Exosurface composition reference

The presentation guide (system prompt) says *what* good presentation is; the `update_exosurface` description says *what is valid*. This file shows *how* the pieces look in practice. Examples are shapes to adapt, not templates to reuse: compose for the conversation in front of you.

## Choosing an encoding

| The content is… | Use | Notes |
|---|---|---|
| The one thing to notice, decide or watch | `note` | `tone` decision/caution/good/note. One per view is usually enough. |
| Ordered in time or sequence | `list [timeline]` | `state` now/next/done/later/blocked; exactly one `now` when there is a present moment. |
| Options against the same criteria | `table` | Options as columns, criteria as rows; `[highlight=n]` for your recommendation; `[tone=…]` on a row. |
| Amounts to compare | `figure [chart=bar]` | Sorted when order carries no meaning. Write the unit. |
| Change over time | `figure [chart=line]` | ≥3 points; say in words if the axis does not start at zero. |
| A few headline numbers or progress | `meter` lines in a `group [layout=row]` | The value is text, so "2 of 3" or "≈ 40 h" works. Mark estimates. |
| How things connect or flow | `list [flow]` | ≤12 nodes; `[to=…]` names the next nodes; loops are fine. |
| Depth the person may want later | `group "Title" [collapsible]` | Title says what is inside; `/summary` previews it. |
| A real question for the person | `radiogroup`/`listbox`/`textbox` + one primary `button` | Only when their answer changes what happens next. |

## Line shapes

```
- region "Book club format" [ref=club]:
  - note "My lean: weekly" [ref=lean] [tone=decision]: Fast and slow readers stay **in sync** when the chunks are small.
  - group [ref=numbers] [layout=row]:
    - meter "Readers" [ref=readers]: 6
      - /detail: 3 fast, 3 slow
    - meter "Book length" [ref=length]: ≈ 400 pages
  - table "Two formats" [ref=cmp] [highlight=1]:
    - row [header]:  | Weekly | Monthly
    - row: Pace | Small chunks | Whole book
    - row [tone=caution]: Risk | Fatigue | Drop-off
  - list [ref=when] [timeline]:
    - listitem "Draft agenda" [when=Mon] [state=done]
    - listitem "First meetup" [when=Thu 7pm] [state=now]
    - listitem "Review format" [when=Week 4] [state=later]: Switch to monthly if attendance drops
  - figure "Estimated hours this week" [ref=hours] [chart=bar] [unit=h]:
    - row [tone=caution]: Errands | 12
    - row: Reading | 6
  - list "How a meetup runs" [ref=loop] [flow] [direction=right]:
    - listitem "Read" [ref=read] [to=talk]
    - listitem "Talk" [ref=talk] [to=pick] [tone=accent]
    - listitem "Pick next book" [ref=pick]
  - group "Why weekly" [ref=why] [collapsible]:
    - /summary: Three reasons
    - text [ref=why1]: Smaller chunks, steadier attendance, easier catch-up.
  - radiogroup "Format" [ref=format] [chips]:
    - radio "Weekly" [checked] [value=weekly]
    - radio "Monthly" [value=monthly]
  - button "Use this format" [ref=go] [primary] [sends=format]
```

Table rows need as many cells as the header; flow `[to=…]` must name declared nodes; chart values are numbers (units go in `[unit=…]`).

## Morphing across turns

- **Topic continues:** edit the stage surface by ref instead of redrawing it: `replace` a line that changed, `insertAfter`/`insertInto` new lines, `remove` what is settled, or collapse settled parts into a `group [collapsible]`. Keep refs for things that persist.
- **Topic shifts:** draw a new region (it takes the stage). The previous one recedes on its own; the system moves older surfaces into history, and you can bring any back by editing or redrawing its ref.
- **Supporting context:** a small surface named in `beside` (≤2), e.g. a timeline of the week while discussing one day.
- **Button press or canvas edits:** the values are already saved and appear in the outline (and a `[canvas-edits]` message lists what the person changed). Show what changes because of them; don't redraw the whole surface to acknowledge a click.

## Common errors

| Error | Fix |
|---|---|
| `region needs [ref=surface_id]` | Every top-level region line needs a ref. |
| `No surface … on the canvas or in its history` | Check the ref in the outline's shelf or history list. |
| `stale baseRevision` | Use the revision in the current canvas outline. |
| `No ref … in surface …` | Edit refs come from the outline; read_exosurface shows a shelf or history surface in full. |
| `duplicate ref` | Refs are unique within a surface. |
| `line N: unknown role` / `expected "- role …"` | Use the roles in the tool description; each line starts with `- `. |
| `Table rows must match columns` | Same number of cells as the header row. |

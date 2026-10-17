---
name: exosurface
description: Reference for composing Exosurface canvas surfaces with apply_workspace — component examples, encoding choices and how to morph the stage across turns. Read when composing something unusual (diagrams, charts, dense comparisons, multi-surface context) or after a canvas validation error. The always-on presentation guide and tool contract are already in your system prompt; this is optional depth.
---

# Exosurface composition reference

The presentation guide (system prompt) says *what* good presentation is; the `apply_workspace` description says *what is valid*. This file shows *how* the Exo components look in practice. Examples are shapes to adapt, not templates to reuse: compose for the conversation in front of you.

## Choosing an encoding

| The content is… | Use | Notes |
|---|---|---|
| The one thing to notice, decide or watch | `Callout` | `tone` decision/caution/good/note. One per view is usually enough. |
| Ordered in time or sequence | `Timeline` | `state` now/next/done/later/blocked; exactly one `now` when there is a present moment. |
| Options against the same criteria | `Table` | Options as columns, criteria as rows; `highlightColumn` for your recommendation; `tone` on a row (e.g. risk). |
| Amounts to compare | `Chart` `bar` | Sorted when order carries no meaning. Write the unit. |
| Change over time | `Chart` `line` | ≥3 points; say in words if the axis does not start at zero. |
| A few headline numbers or progress | `Metric` in a `Row` | `value` is a string so you can write "2 of 3", "≈ 40 h". Mark estimates. |
| How things connect or flow | `Flow` | ≤12 nodes; label only the edges that need it; loops are fine. |
| Depth the person may want later | `Disclosure` | Title says what is inside; `summary` previews it. |
| A real question for the person | `ChoicePicker`/`TextField` + one primary `Button` | Only when their answer changes what happens next. |

## Component shapes

```json
{"id":"lean","component":"Callout","tone":"decision","title":"My lean: weekly","text":"Fast and slow readers stay **in sync** when the chunks are small."}
{"id":"when","component":"Timeline","items":[{"label":"Draft agenda","when":"Mon","state":"done"},{"label":"First meetup","when":"Thu 7pm","state":"now"},{"label":"Review format","when":"Week 4","state":"later","detail":"Switch to monthly if attendance drops"}]}
{"id":"cmp","component":"Table","columns":["","Weekly","Monthly"],"highlightColumn":1,"rows":[{"cells":["Pace","Small chunks","Whole book"]},{"cells":["Risk","Fatigue","Drop-off"],"tone":"caution"}]}
{"id":"hours","component":"Chart","kind":"bar","unit":"h","caption":"Estimated hours this week","points":[{"label":"Errands","value":12,"tone":"caution"},{"label":"Build","value":6}]}
{"id":"m1","component":"Metric","label":"Readers","value":"6","detail":"3 fast, 3 slow"}
{"id":"loop","component":"Flow","nodes":[{"id":"a","label":"You click"},{"id":"b","label":"Exo replies","tone":"accent"}],"edges":[{"from":"a","to":"b","label":"event"}]}
{"id":"more","component":"Disclosure","title":"Why weekly","summary":"Three reasons","child":"moreCol"}
```

Exo components need a surface created with catalog `urn:exosurface:catalog:exo-visual:v1`. Table rows must have as many cells as there are columns; Flow edges must join two different declared nodes; Chart values must not exceed `max`.

## Morphing across turns

- **Topic continues:** update the stage surface in place — replace changed components by ID, keep IDs that persist, collapse settled parts into a `Disclosure` or remove them.
- **Topic shifts:** create a new surface (it takes the stage). Delete the previous one if it is finished; otherwise let it recede.
- **Supporting context:** a small surface named in `layout.beside` (≤2), e.g. a timeline of the week while discussing one day.
- **Button press:** apply the submitted values at the revision given in the event, then show what changes because of them. Don't redraw the whole surface to acknowledge a click.

## Common validation errors

| Error | Fix |
|---|---|
| `requires a surface created with catalogId` | Exo component in a basic-catalog surface: delete and recreate it with the Exo catalog. |
| `Stale/nonsequential delta` | Use the exact current revision from the machine-state frame. |
| `Workspace exceeds 40KB bound` | Delete stale surfaces or retire unused component definitions. |
| `Cycle/shared child/depth violation` | Each component has one parent; depth ≤ 8. |
| `layout.focus/beside must name existing surfaces` | Create the surface in the same patch before naming it, or drop the layout. |

// Internal size ceilings (#23, option B). They are not page bounds and are never stated to Exo: they only guard
// storage and the wire. Each is derived here from the stated bounds (page-bounds.ts), so that no call within every
// stated bound can reach it, and it follows those bounds if they change. Sizes are UTF-8 bytes, which are never fewer
// than the UTF-16 characters applyDelta counts. test/page-bounds.test.ts checks pageBytes() against the real
// translation of generated pages, and that the ceilings exceed a constructed worst case.
import {PAGE_BOUNDS as B} from './page-bounds.ts';
import {EXO_CATALOG} from './exo-catalog.ts';

const json = (v: unknown) => JSON.stringify(v).length, T = '', V = 'v0.9.1';

// 1. Content. A character the pageLength bound counts is copied into the translation at most twice (a selected
//    option's [value] is in the options and in the data) and each copy is at most 6 bytes (JSON writes a control
//    character or a lone surrogate as \uXXXX; any other character is at most 3 UTF-8 bytes). Characters that are not
//    copied (role words, brackets, separators) pay at the same rate for the JSON wrapper of the item their line makes
//    (an option, a row, a cell, a timeline or flow listitem, a [sends] entry): never more than 12 bytes per character.
const CONTENT_COPIES = 2;
export const ESCAPED_BYTES = 6, BYTES_PER_CHAR = CONTENT_COPIES * ESCAPED_BYTES;

// 2. Ids. Refs are not counted by pageLength. A component id (written ref, assigned id or part, at most the ref
//    form's length) appears at most ID_COPIES times: its own id, its parent's reference, and for an input its data key
//    and binding path (a button without [action] uses its id as event name instead). Each copy adds quotes, a
//    separator and the path's slash.
const ID_COPIES = 4, ID_BYTES = B.refForm.limit.max + 4;

// 3. Component wrappers: the fixed JSON of each component the translation makes, with the longest defaults it fills
//    in (Details, OK, borderless, multipleSelection, checkbox, slider 0..10), plus one data entry.
const WRAPPERS = [
  {id: T, component: 'Text', text: 'Details', variant: 'caption'}, {id: T, component: 'Divider'}, {id: T, component: 'Card', child: T},
  {id: T, component: 'Column', children: []}, {id: T, component: 'Disclosure', title: 'Details', summary: T, open: false, child: T},
  {id: T, component: 'List', children: []}, {id: T, component: 'Timeline', items: []}, {id: T, component: 'Flow', caption: T, direction: T, nodes: [], edges: []},
  {id: T, component: 'Tabs', tabs: []}, {id: T, component: 'Callout', title: T, tone: T, text: T},
  {id: T, component: 'Metric', label: T, value: T, detail: T, tone: T, progress: 0}, {id: T, component: 'Table', caption: T, columns: [], rows: [], highlightColumn: 0},
  {id: T, component: 'Chart', kind: 'line', caption: T, unit: T, max: 0, points: []}, {id: T, component: 'TextField', label: T, value: {path: '/'}, variant: 'shortText'},
  {id: T, component: 'CheckBox', label: T, value: {path: '/'}}, {id: T, component: 'Slider', label: T, min: 0, max: 10, value: {path: '/'}},
  {id: T, component: 'ChoicePicker', label: T, options: [], value: {path: '/'}, variant: 'multipleSelection', displayStyle: 'checkbox'},
  {id: T, component: 'Button', child: T, variant: 'borderless', action: {event: {name: T, context: {}}}},
];
const COMPONENT_BYTES = Math.max(...WRAPPERS.map(json)) + 1 + json({[T]: false}) + 1;

// 4. Flow links: a link's "from" is its listitem's [ref], which pageLength does not count.
const LINK_BYTES = json({from: T, to: T}) + 1 + B.flowRefForm.limit.max;

// 5. What the person types: each textbox value may later hold up to the textbox bound, escaped.
const TYPED_BYTES = B.textboxValue.limit.max * ESCAPED_BYTES;

// 6. One page's messages around its components (delete when redrawn, create, components, data), with its id.
const ENVELOPE = json([{version: V, deleteSurface: {surfaceId: T}}, {version: V, createSurface: {surfaceId: T, catalogId: EXO_CATALOG}},
  {version: V, updateComponents: {surfaceId: T, components: []}}, {version: V, updateDataModel: {surfaceId: T, path: '/', value: {}}}]) + 4 * B.refForm.limit.max;

/** The most bytes one page can translate to: chars counted by pageLength, components, flow links, typed textboxes. */
export const pageBytes = (chars: number, components: number, links: number, typed: number) =>
  BYTES_PER_CHAR * chars + components * (COMPONENT_BYTES + ID_COPIES * ID_BYTES) + links * LINK_BYTES + typed * TYPED_BYTES + ENVELOPE;
const C = B.pageComponents.limit.max;
export const PAGE_BYTES = pageBytes(B.pageLength.limit.max, C, C * B.flowLinks.limit.max, C);

// The surface: at most callPages pages (the surface's page count), its revision and layout (focus, beside, and the
// legacy columns and wide that old history may carry).
const FRAME = json({revision: Number.MAX_SAFE_INTEGER, incremental: true, incomplete: false, layout: {columns: 3, focus: T, beside: [T, T], wide: Array<string>(B.callPages.limit.max).fill(T)}})
  + (1 + B.besidePages.limit.max + B.callPages.limit.max) * B.refForm.limit.max;
export const SURFACE_CEILING = B.callPages.limit.max * PAGE_BYTES + FRAME;

// A call: at most callPages pages drawn or edited, and at most callChanges delete messages (withdrawn or retired pages).
const DELETE = json({version: V, deleteSurface: {surfaceId: T}}) + 1 + B.refForm.limit.max;
export const DELTA_CEILING = B.callPages.limit.max * PAGE_BYTES + B.callChanges.limit.max * DELETE + FRAME;

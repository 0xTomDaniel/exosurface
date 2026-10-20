// The bounds definition (docs/specs/page-bounds.spec.html): every page bound update_exosurface enforces,
// with its value, declared once and in the snapshot format's words. The page validator, the tool contract
// and the rejection text all read it; no other code or agent-facing text holds a bound's value (B4).
// It depends on nothing else in the package.

type Family = 'text length' | 'item count' | 'allowed values' | 'number ranges' | 'page shape' | 'agreement between parts' | 'call size';
const FAMILIES: readonly Family[] = ['text length', 'item count', 'allowed values', 'number ranges', 'page shape', 'agreement between parts', 'call size'];

/** What a bound applies to, in snapshot-format words (a role, a role in a list kind, the page or the call). */
export type Subject =
  | 'any line' | 'note' | 'meter' | 'list [timeline]' | 'timeline listitem' | 'table' | 'table row' | 'figure' | 'figure row'
  | 'list [flow]' | 'flow listitem' | 'group [collapsible]' | 'tablist' | 'textbox' | 'slider' | 'radiogroup' | 'listbox'
  | 'radio or option' | 'button' | 'page' | 'call';

export type Limit =
  | {readonly kind: 'length'; readonly min: number; readonly max: number}
  | {readonly kind: 'count'; readonly min: number; readonly max: number | null; readonly unit: string}
  | {readonly kind: 'choice'; readonly values: readonly string[]}
  | {readonly kind: 'range'; readonly min: number; readonly max: number; readonly integer: boolean}
  | {readonly kind: 'form'; readonly chars: string; readonly pattern: string; readonly min: number; readonly max: number}
  | {readonly kind: 'size'; readonly max: number; readonly unit: string}
  | {readonly kind: 'reserved'; readonly names: readonly string[]; readonly part: string; readonly inputNames: readonly string[]}
  | {readonly kind: 'rule'; readonly rule: string};

export interface Bound {
  readonly family: Family;
  readonly on: readonly Subject[];
  /** The attribute, as the snapshot format writes it ("title", [tone], /detail, value…), or what is counted. */
  readonly attribute: string;
  readonly limit: Limit;
}

const length = (min: number, max: number) => ({kind: 'length', min, max}) as const;
const count = (min: number, max: number, unit = '') => ({kind: 'count', min, max, unit}) as const;
const atLeast = (min: number) => ({kind: 'count', min, max: null, unit: ''}) as const;
const choice = <const V extends readonly [string, ...string[]]>(...values: V) => ({kind: 'choice', values}) as const;
const rule = (text: string) => ({kind: 'rule', rule: text}) as const;
// The owner's one number for how much Exo writes (#23, option B): a call's snapshot, and each page a call draws or edits.
const SNAPSHOT_CHARS = 40000;
const TONES = choice('neutral', 'accent', 'good', 'caution', 'risk');

export const PAGE_BOUNDS = {
  // Text length (characters)
  noteTitle: {family: 'text length', on: ['note'], attribute: '"title"', limit: length(1, 120)},
  meterLabel: {family: 'text length', on: ['meter'], attribute: '"label"', limit: length(1, 120)},
  meterValue: {family: 'text length', on: ['meter'], attribute: 'value', limit: length(1, 40)},
  meterDetail: {family: 'text length', on: ['meter'], attribute: '/detail', limit: length(0, 400)},
  timelineLabel: {family: 'text length', on: ['timeline listitem'], attribute: '"label"', limit: length(1, 120)},
  timelineWhen: {family: 'text length', on: ['timeline listitem'], attribute: '[when]', limit: length(0, 40)},
  timelineDetail: {family: 'text length', on: ['timeline listitem'], attribute: 'detail', limit: length(0, 400)},
  tableCaption: {family: 'text length', on: ['table'], attribute: '"caption"', limit: length(1, 120)},
  tableHeaderCell: {family: 'text length', on: ['table'], attribute: 'header row cell', limit: length(0, 60)},
  tableCell: {family: 'text length', on: ['table row'], attribute: 'cell', limit: length(0, 200)},
  figureCaption: {family: 'text length', on: ['figure'], attribute: '"caption"', limit: length(1, 120)},
  figureUnit: {family: 'text length', on: ['figure'], attribute: '[unit]', limit: length(0, 16)},
  figureRowLabel: {family: 'text length', on: ['figure row'], attribute: 'label', limit: length(1, 40)},
  figureRowNote: {family: 'text length', on: ['figure row'], attribute: 'optional note', limit: length(0, 80)},
  flowCaption: {family: 'text length', on: ['list [flow]'], attribute: '"caption"', limit: length(1, 120)},
  flowLabel: {family: 'text length', on: ['flow listitem'], attribute: '"label"', limit: length(1, 48)},
  flowDetail: {family: 'text length', on: ['flow listitem'], attribute: 'detail', limit: length(0, 90)},
  groupTitle: {family: 'text length', on: ['group [collapsible]'], attribute: '"title"', limit: length(1, 120)},
  groupSummary: {family: 'text length', on: ['group [collapsible]'], attribute: '/summary', limit: length(0, 120)},
  textboxValue: {family: 'text length', on: ['textbox'], attribute: 'current value', limit: length(0, 2000)},
  optionValue: {family: 'text length', on: ['radio or option'], attribute: '[value]', limit: length(0, 160)},
  // Item count
  timelineItems: {family: 'item count', on: ['list [timeline]'], attribute: 'listitems', limit: count(1, 12)},
  tableColumns: {family: 'item count', on: ['table'], attribute: 'columns', limit: count(1, 6)},
  tableRows: {family: 'item count', on: ['table'], attribute: 'rows after the header', limit: count(1, 14)},
  figureRows: {family: 'item count', on: ['figure'], attribute: 'rows with a number', limit: count(1, 16)},
  flowNodes: {family: 'item count', on: ['list [flow]'], attribute: 'listitems', limit: count(1, 12)},
  flowLinks: {family: 'item count', on: ['list [flow]'], attribute: 'links ([to] names, all listitems together)', limit: count(0, 20)},
  tablistTabs: {family: 'item count', on: ['tablist'], attribute: 'tabs', limit: atLeast(1)},
  buttonSends: {family: 'item count', on: ['button'], attribute: '[sends]', limit: count(0, 24, 'inputs')},
  radiogroupChecked: {family: 'item count', on: ['radiogroup'], attribute: 'radios [checked]', limit: count(0, 1)},
  listboxSelected: {family: 'item count', on: ['listbox'], attribute: 'options [selected]', limit: count(0, 24)},
  // Allowed values
  noteTone: {family: 'allowed values', on: ['note'], attribute: '[tone]', limit: choice('note', 'decision', 'caution', 'good')},
  tone: {family: 'allowed values', on: ['meter', 'table row', 'figure row', 'flow listitem'], attribute: '[tone]', limit: TONES},
  timelineState: {family: 'allowed values', on: ['timeline listitem'], attribute: '[state]', limit: choice('done', 'now', 'next', 'later', 'blocked')},
  chartKind: {family: 'allowed values', on: ['figure'], attribute: '[chart]', limit: choice('bar', 'line')},
  flowDirection: {family: 'allowed values', on: ['list [flow]'], attribute: '[direction]', limit: choice('right', 'down')},
  // Number ranges
  meterProgress: {family: 'number ranges', on: ['meter'], attribute: '[progress]', limit: {kind: 'range', min: 0, max: 1, integer: false}},
  tableHighlight: {family: 'number ranges', on: ['table'], attribute: '[highlight] (a column index from 0)', limit: {kind: 'range', min: 0, max: 5, integer: true}},
  // Page shape
  pageComponents: {family: 'page shape', on: ['page'], attribute: 'components (about one per line; a title, a button label, a card or collapsible body, each list item and tab add one)', limit: count(0, 64)},
  pageDepth: {family: 'page shape', on: ['page'], attribute: 'nesting depth (in components)', limit: count(0, 8, 'levels')},
  pageRef: {family: 'page shape', on: ['page'], attribute: 'ref', limit: rule('every page (top-level region line) has [ref=page_id]')},
  refForm: {family: 'page shape', on: ['any line'], attribute: '[ref], [sends] names and button [action]', limit: {kind: 'form', chars: 'letters, digits, _ and -', pattern: 'a-zA-Z0-9_-', min: 1, max: 80}},
  flowRefForm: {family: 'page shape', on: ['flow listitem'], attribute: '[ref] and [to] names', limit: {kind: 'form', chars: 'letters, digits, _ and -', pattern: 'a-zA-Z0-9_-', min: 1, max: 40}},
  refsUnique: {family: 'page shape', on: ['page'], attribute: 'refs', limit: rule('each ref is used once within a page')},
  // Only what the system refuses: root is the renderer's root id; __ is how reading a page back tells the page's own
  // parts (a title, a body, a button label) from written refs; an input's ref is its data key and binding path,
  // where these words are refused as path segments (prototype safety).
  refReserved: {family: 'page shape', on: ['page'], attribute: 'refs of the lines inside it', limit: {kind: 'reserved', names: ['root'], part: '__', inputNames: ['constructor', 'prototype', '__proto__']}},
  // Agreement between parts
  tableRowsMatchHeader: {family: 'agreement between parts', on: ['table'], attribute: 'rows', limit: rule('every row has as many cells as the header row')},
  tableHighlightInColumns: {family: 'agreement between parts', on: ['table'], attribute: '[highlight]', limit: rule('names one of the header row\'s columns')},
  flowLinksJoinNodes: {family: 'agreement between parts', on: ['list [flow]'], attribute: '[to]', limit: rule('names other listitems of the same flow, each [ref] used once')},
  chartWithinMax: {family: 'agreement between parts', on: ['figure'], attribute: 'row numbers', limit: rule('none above the figure\'s [max]')},
  sliderWithinRange: {family: 'agreement between parts', on: ['slider'], attribute: 'current number', limit: rule('within its [min] and [max] (with no current number, [min] is used)')},
  listboxSelectedDistinct: {family: 'agreement between parts', on: ['listbox'], attribute: 'options [selected]', limit: rule('have different [value]s (an option without [value] gets its own one)')},
  sendsNameInputs: {family: 'agreement between parts', on: ['button'], attribute: '[sends]', limit: rule('names the [ref]s of textbox, checkbox, slider, radiogroup or listbox lines on the same page')},
  // Call size
  snapshotLength: {family: 'call size', on: ['call'], attribute: 'snapshot', limit: {kind: 'size', max: SNAPSHOT_CHARS, unit: 'characters'}},
  // Measured on the page the call produces, so a draw is judged on what it wrote and an edit on the whole page it leaves.
  pageLength: {family: 'call size', on: ['call'], attribute: 'each page drawn or edited, as it then reads in the snapshot format without [ref=…] and without indentation', limit: {kind: 'size', max: SNAPSHOT_CHARS, unit: 'characters'}},
  editsPerCall: {family: 'call size', on: ['call'], attribute: 'edits', limit: count(0, 24)},
  editLines: {family: 'call size', on: ['call'], attribute: 'lines of one edit', limit: {kind: 'size', max: 20000, unit: 'characters'}},
  deletePerCall: {family: 'call size', on: ['call'], attribute: 'delete', limit: count(0, 8, 'pages')},
  besidePages: {family: 'call size', on: ['call'], attribute: 'beside', limit: count(0, 2, 'pages')},
  callPages: {family: 'call size', on: ['call'], attribute: 'pages drawn or edited (the surface holds this many; older pages move into history)', limit: count(0, 8)},
  // Within every other call bound only withdrawing a page the same call draws or edits can exceed this one.
  callChanges: {family: 'call size', on: ['call'], attribute: 'page changes (a page drawn or edited counts 3, plus 1 when it replaces a page on the surface; a page withdrawn, or moved into history by the system, counts 1)', limit: count(0, 32)},
} as const satisfies Record<string, Bound>;

export type BoundKey = keyof typeof PAGE_BOUNDS;
export const BOUND_KEYS = Object.keys(PAGE_BOUNDS) as BoundKey[];
const bound = (key: BoundKey): Bound => PAGE_BOUNDS[key];

/** A ref-form bound as a regular expression (the same one every reader uses). */
export const formPattern = (key: 'refForm' | 'flowRefForm') => {
  const f = PAGE_BOUNDS[key].limit;
  return new RegExp(`^[${f.pattern}]{${String(f.min)},${String(f.max)}}$`);
};

const n = (x: number) => String(x);
function limitWords(l: Limit): string {
  switch (l.kind) {
    case 'length': return l.min > 0 ? `${n(l.min)} to ${n(l.max)} characters` : `at most ${n(l.max)} characters`;
    case 'count': {
      const unit = l.unit ? ` ${l.unit}` : '';
      if (l.max === null) return `at least ${n(l.min)}${unit}`;
      return l.min > 0 ? `${n(l.min)} to ${n(l.max)}${unit}` : `at most ${n(l.max)}${unit}`;
    }
    case 'choice': return `one of ${l.values.join(', ')}`;
    case 'range': return `${l.integer ? 'a whole number ' : ''}${n(l.min)} to ${n(l.max)}`;
    case 'form': return `${l.chars}, ${n(l.min)} to ${n(l.max)} characters`;
    case 'size': return `at most ${n(l.max)} ${l.unit}`;
    case 'rule': return l.rule;
    case 'reserved': return `none is ${l.names.join(', ')} or contains ${l.part} (the page's own parts use them); the ref of a textbox, checkbox, slider, radiogroup or listbox is also none of ${l.inputNames.join(', ')}`;
  }
}

/** One bound in the tool contract's words; a rejection quotes the same words. */
export function statement(key: BoundKey): string {
  const b = bound(key);
  return `${b.on.join(', ')} ${b.attribute}: ${limitWords(b.limit)}`;
}

/** The bounds section of the update_exosurface contract: every bound, grouped by family. */
export function boundsSection(): string {
  const lines = FAMILIES.map(f => `  ${f}: ${BOUND_KEYS.filter(k => bound(k).family === f).map(statement).join('; ')}`);
  return `Bounds (a call outside one is rejected, naming the bound, where it broke it and the value):\n${lines.join('\n')}`;
}

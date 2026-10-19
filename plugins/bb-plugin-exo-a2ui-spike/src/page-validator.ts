// The page validator (docs/specs/page-bounds.spec.html): accepts or rejects an update_exosurface call against
// the bounds definition (page-bounds.ts). It holds no bound value of its own: CHECKS has one measurement per
// bound in the definition (the type makes it total), and every limit and every word of a rejection comes
// from the definition. A rejection names the page or call, the element by its ref, the attribute and the
// bound in the tool contract's words.
import {PAGE_BOUNDS, BOUND_KEYS, statement, formPattern, kilobytes, type BoundKey, type Subject, type Limit} from './page-bounds.ts';
import {cells, prop, tableParts, chartRows, sliderRange, type Line} from './snapshot-format.ts';

interface Measured {value: string | number | undefined; where?: string}
interface Element {subject: Subject; line: Line; who: string}
interface PageFacts {sid: string; components: readonly ComponentNode[]}
interface ComponentNode {id: string; children?: readonly string[]; child?: string; tabs?: readonly {child: string}[]}
export interface CallFacts {snapshot?: string | undefined; edits?: readonly {lines?: string | undefined}[] | undefined; delete?: readonly string[] | undefined; beside?: readonly string[] | undefined; pages?: number; bytes?: number}

type Check =
  | {at: 'line'; measure: (l: Line) => Measured[]}
  | {at: 'rule'; violation: (l: Line) => string | undefined}
  | {at: 'page'; measure: (p: PageFacts) => Measured[]}
  | {at: 'call'; measure: (c: CallFacts) => Measured[]};

const str = (v: string | true | undefined) => typeof v === 'string' ? v : undefined;
const one = (value: string | number | undefined): Measured[] => value === undefined ? [] : [{value}];
const name = (l: Line) => one(l.name);
const listitems = (l: Line) => l.children.filter(k => k.role === 'listitem');
const label = (l: Line) => [{value: l.name ?? l.text ?? ''}];
const detail = (l: Line) => one(l.name !== undefined ? l.text : undefined);
const numberAttr = (l: Line, key: string) => { const v = str(l.attrs[key]); const x = v === undefined ? NaN : Number(v.replace(/[,\s]/g, '')); return Number.isFinite(x) ? [{value: x}] : []; };
const names = (v: string | true | undefined) => (str(v) ?? '').split(',').map(s => s.trim()).filter(Boolean);
const checked = (l: Line) => l.children.filter(k => (k.role === 'radio' || k.role === 'option') && Boolean(k.attrs['checked'] || k.attrs['selected'])).length;
const lineOf = (l: Line) => l.at ? ` on line ${String(l.at)}` : '';

const CHECKS: {[K in BoundKey]: Check} = {
  noteTitle: {at: 'line', measure: name},
  meterLabel: {at: 'line', measure: l => [{value: l.name ?? ''}]},
  meterValue: {at: 'line', measure: l => [{value: l.text ?? ''}]},
  meterDetail: {at: 'line', measure: l => one(prop(l, 'detail'))},
  timelineLabel: {at: 'line', measure: label},
  timelineWhen: {at: 'line', measure: l => one(str(l.attrs['when']))},
  timelineDetail: {at: 'line', measure: detail},
  tableCaption: {at: 'line', measure: name},
  tableHeaderCell: {at: 'line', measure: l => tableParts(l).columns.map((value, i) => ({value, where: ` ${String(i + 1)}`}))},
  tableCell: {at: 'line', measure: l => cells(l.text).map((value, i) => ({value, where: ` ${String(i + 1)}`}))},
  figureCaption: {at: 'line', measure: name},
  figureUnit: {at: 'line', measure: l => one(str(l.attrs['unit']))},
  figureRowLabel: {at: 'line', measure: l => [{value: cells(l.text)[0] ?? ''}]},
  figureRowNote: {at: 'line', measure: l => one(cells(l.text)[2] || undefined)},
  flowCaption: {at: 'line', measure: name},
  flowLabel: {at: 'line', measure: label},
  flowDetail: {at: 'line', measure: detail},
  groupTitle: {at: 'line', measure: name},
  groupSummary: {at: 'line', measure: l => one(prop(l, 'summary'))},
  textboxValue: {at: 'line', measure: l => one(l.text)},
  optionValue: {at: 'line', measure: l => one(str(l.attrs['value']))},
  timelineItems: {at: 'line', measure: l => one(listitems(l).length)},
  tableColumns: {at: 'line', measure: l => one(tableParts(l).columns.length)},
  tableRows: {at: 'line', measure: l => one(tableParts(l).rows.length)},
  figureRows: {at: 'line', measure: l => one(chartRows(l).length)},
  flowNodes: {at: 'line', measure: l => one(listitems(l).length)},
  flowLinks: {at: 'line', measure: l => one(listitems(l).reduce((sum, k) => sum + names(k.attrs['to']).length, 0))},
  tablistTabs: {at: 'line', measure: l => one(l.children.filter(k => k.role === 'tab').length)},
  buttonSends: {at: 'line', measure: l => one(names(l.attrs['sends']).length)},
  radiogroupChecked: {at: 'line', measure: l => one(checked(l))},
  listboxSelected: {at: 'line', measure: l => one(checked(l))},
  noteTone: {at: 'line', measure: l => one(str(l.attrs['tone']))},
  tone: {at: 'line', measure: l => one(str(l.attrs['tone']))},
  timelineState: {at: 'line', measure: l => one(str(l.attrs['state']))},
  chartKind: {at: 'line', measure: l => one(str(l.attrs['chart']))},
  flowDirection: {at: 'line', measure: l => one(str(l.attrs['direction']))},
  meterProgress: {at: 'line', measure: l => numberAttr(l, 'progress')},
  tableHighlight: {at: 'line', measure: l => numberAttr(l, 'highlight')},
  pageComponents: {at: 'page', measure: p => [{value: p.components.length}]},
  pageDepth: {at: 'page', measure: p => [{value: depth(p.components)}]},
  pageRef: {at: 'rule', violation: l => str(l.attrs['ref']) === undefined ? 'has no [ref=page_id]' : undefined},
  refForm: {at: 'line', measure: l => [...one(str(l.attrs['ref'])), ...(l.role === 'button' ? [...one(str(l.attrs['action'])), ...names(l.attrs['sends']).map(value => ({value}))] : [])]},
  flowRefForm: {at: 'line', measure: l => [...one(str(l.attrs['ref'])), ...names(l.attrs['to']).map(value => ({value}))]},
  refsUnique: {at: 'rule', violation: l => { const seen = new Set<string>(); for (const ref of builtRefs(l)) { if (seen.has(ref)) return `uses [ref=${ref}] more than once`; seen.add(ref); } return undefined; }},
  tableRowsMatchHeader: {at: 'rule', violation: l => {
    const {columns, rows} = tableParts(l), bad = rows.find(r => cells(r.text).length !== columns.length);
    return bad ? `has a row${lineOf(bad)} with ${String(cells(bad.text).length)} cells; its header row has ${String(columns.length)}` : undefined;
  }},
  tableHighlightInColumns: {at: 'rule', violation: l => {
    const h = numberAttr(l, 'highlight')[0]?.value, columns = tableParts(l).columns.length;
    return typeof h === 'number' && h >= columns ? `has [highlight=${String(h)}] but ${String(columns)} columns` : undefined;
  }},
  flowLinksJoinNodes: {at: 'rule', violation: l => {
    const items = listitems(l), ids = items.map((k, j) => str(k.attrs['ref']) ?? `n${String(j + 1)}`);
    const twice = ids.find((id, j) => ids.indexOf(id) !== j);
    if (twice !== undefined) return `uses [ref=${twice}] for two listitems`;
    for (const [j, k] of items.entries()) for (const to of names(k.attrs['to'])) {
      if (to === ids[j]) return `has listitem [ref=${to}] linking to itself`;
      if (!ids.includes(to)) return `has [to=${to}], which names no listitem of this flow`;
    }
    return undefined;
  }},
  chartWithinMax: {at: 'rule', violation: l => {
    const max = numberAttr(l, 'max')[0]?.value;
    if (typeof max !== 'number') return undefined;
    const over = chartRows(l).find(r => Number((cells(r.text)[1] ?? '').replace(/[,\s$%]/g, '')) > max);
    return over ? `has a row${lineOf(over)} of ${cells(over.text)[1] ?? ''}, above [max=${String(max)}]` : undefined;
  }},
  sliderWithinRange: {at: 'rule', violation: l => {
    const v = l.text === undefined ? NaN : Number(l.text.replace(/[,\s]/g, ''));
    if (!Number.isFinite(v)) return undefined;
    const {min, max} = sliderRange(l);
    return v < min || v > max ? `has ${String(v)}, outside [min=${String(min)}] and [max=${String(max)}]` : undefined;
  }},
  snapshotLength: {at: 'call', measure: c => one(c.snapshot?.length)},
  editsPerCall: {at: 'call', measure: c => one(c.edits?.length)},
  editLines: {at: 'call', measure: c => (c.edits ?? []).flatMap((e, i) => e.lines === undefined ? [] : [{value: e.lines.length, where: ` (edit ${String(i + 1)})`}])},
  deletePerCall: {at: 'call', measure: c => one(c.delete?.length)},
  besidePages: {at: 'call', measure: c => one(c.beside?.length)},
  callPages: {at: 'call', measure: c => one(c.pages)},
  callSize: {at: 'call', measure: c => one(c.bytes)},
};

// Max nesting below the root, counted like the A2UI validator counts it.
function depth(components: readonly ComponentNode[]): number {
  const byId = new Map(components.map(c => [c.id, c])), seen = new Set<string>();
  const height = (id: string): number => {
    const c = byId.get(id);
    if (!c || seen.has(id)) return 0;
    seen.add(id);
    const kids = [...(c.children ?? []), ...(c.child ? [c.child] : []), ...(c.tabs?.map(t => t.child) ?? [])];
    return kids.length ? 1 + Math.max(...kids.map(height)) : 0;
  };
  return height('root');
}

const shortAttr = (key: BoundKey) => PAGE_BOUNDS[key].attribute.split(' (')[0] ?? '';
const withValue = (attr: string, v: string | number) => /^\[\w+\]$/.test(attr) ? `${attr.slice(0, -1)}=${String(v)}]` : `${attr} ${JSON.stringify(v)}`;

/** The words of one broken bound, or undefined when the measured value is within it. */
function broken(key: BoundKey, who: string, m: Measured): string | undefined {
  const l: Limit = PAGE_BOUNDS[key].limit, attr = shortAttr(key), where = m.where ?? '', v = m.value;
  switch (l.kind) {
    case 'length': return typeof v === 'string' && (v.length < l.min || v.length > l.max) ? `${who}: ${attr}${where} is ${String(v.length)} characters` : undefined;
    case 'count': return typeof v === 'number' && (v < l.min || (l.max !== null && v > l.max)) ? (l.unit ? `${who} has ${String(v)} ${l.unit} in ${attr}` : `${who} has ${String(v)} ${attr}`) : undefined;
    case 'choice': return typeof v === 'string' && !l.values.includes(v) ? `${who} has ${withValue(attr, v)}` : undefined;
    case 'range': return typeof v === 'number' && (v < l.min || v > l.max || (l.integer && !Number.isInteger(v))) ? `${who} has ${withValue(attr, v)}` : undefined;
    case 'form': return typeof v === 'string' && !formPattern(key === 'flowRefForm' ? 'flowRefForm' : 'refForm').test(v) ? `${who} has the name ${JSON.stringify(v)}` : undefined;
    case 'size': return typeof v === 'number' && v > (l.unit === 'KB' ? kilobytes(l.max) : l.max) ? `${who}: ${attr}${where} is ${l.unit === 'KB' ? `${(v / 1024).toFixed(1)} KB` : `${String(v)} ${l.unit}`}` : undefined;
    case 'rule': return undefined;
  }
}

const sentence = (key: BoundKey, said: string) => `${said}. Bound: ${statement(key)}.`;
const MAX_REPORTED = 5;
const NAME_SHOWN = 40; // how much of an element's quoted name a rejection repeats (not a page bound)
const reject = (head: string, said: string[]) => { if (said.length) throw Error(`${head} rejected: ${said.slice(0, MAX_REPORTED).join(' ')}`); };

/** Every element of a page the translation builds, with its subject in the contract's words. */
function elements(region: Line, sid: string): Element[] {
  const out: Element[] = [], page = `page ${sid}`;
  const who = (subject: string, l: Line, index?: number, parent?: string) => {
    const ref = str(l.attrs['ref']), called = l.name ? ` ${JSON.stringify(l.name.length > NAME_SHOWN ? `${l.name.slice(0, NAME_SHOWN - 1)}…` : l.name)}` : '';
    if (ref !== undefined) return `${subject}${called} [ref=${ref}]${lineOf(l)}`;
    return `${subject}${index !== undefined ? ` ${String(index + 1)}` : ''}${called}${lineOf(l)}${parent ? ` in ${parent}` : ` in ${page}`}`;
  };
  const add = (subject: Subject, line: Line, w: string) => { out.push({subject, line, who: w}); };
  const visit = (l: Line): void => {
    if (l.role.startsWith('/')) return;
    const w = who(l.role === 'list' ? (l.attrs['timeline'] ? 'list [timeline]' : l.attrs['flow'] ? 'list [flow]' : 'list') : l.role, l);
    add('any line', l, w);
    const a = l.attrs;
    switch (l.role) {
      case 'tablist': add('tablist', l, w); l.children.forEach(t => { if (t.role === 'tab') t.children.forEach(visit); }); break;
      case 'note': case 'meter': case 'textbox': case 'slider': case 'button': add(l.role, l, w); break;
      case 'radiogroup': case 'listbox': add(l.role, l, w); l.children.forEach((k, j) => { if (k.role === 'radio' || k.role === 'option') add('radio or option', k, who(k.role, k, j, w)); }); break;
      case 'table': add('table', l, w); tableParts(l).rows.forEach((r, j) => { add('table row', r, who('table row', r, j, w)); }); break;
      case 'figure': add('figure', l, w); chartRows(l).forEach((r, j) => { add('figure row', r, who('figure row', r, j, w)); }); break;
      case 'group': if (a['collapsible'] ? true : 'expanded' in a) add('group [collapsible]', l, w); l.children.forEach(visit); break;
      case 'list':
        if (a['timeline']) { add('list [timeline]', l, w); listitems(l).forEach((k, j) => { add('timeline listitem', k, who('timeline listitem', k, j, w)); }); }
        else if (a['flow']) { add('list [flow]', l, w); listitems(l).forEach((k, j) => { add('flow listitem', k, who('flow listitem', k, j, w)); }); }
        else listitems(l).forEach(k => { k.children.forEach(visit); });
        break;
      default: l.children.forEach(visit);
    }
  };
  out.push({subject: 'page', line: region, who: page}, {subject: 'any line', line: region, who: page});
  region.children.forEach(visit);
  return out;
}

/** Refs the translation turns into component ids (page-wide; flow listitem refs are the flow's own). */
function builtRefs(region: Line): string[] {
  return elements(region, '').filter(e => e.subject === 'any line' && e.line !== region).flatMap(e => one(str(e.line.attrs['ref'])).map(m => String(m.value)));
}

/** Checks every element bound of one page (a region line) before it is translated. */
export function checkLines(region: Line): void {
  const sid = str(region.attrs['ref']) ?? `on line ${String(region.at)}`, said: string[] = [];
  const all = elements(region, sid);
  for (const key of BOUND_KEYS) {
    const check = CHECKS[key], on: readonly Subject[] = PAGE_BOUNDS[key].on;
    if (check.at !== 'line' && check.at !== 'rule') continue;
    for (const e of all) {
      if (!on.includes(e.subject)) continue;
      if (check.at === 'rule') { const v = check.violation(e.line); if (v !== undefined) said.push(sentence(key, `${e.who} ${v}`)); continue; }
      for (const m of check.measure(e.line)) { const b = broken(key, e.who, m); if (b !== undefined) said.push(sentence(key, b)); }
    }
  }
  reject(`Page ${sid}`, said);
}

/** Checks the page bounds measured on the translated page (components, depth). */
export function checkComponents(sid: string, components: readonly ComponentNode[]): void {
  const said: string[] = [];
  for (const key of BOUND_KEYS) {
    const check = CHECKS[key];
    if (check.at !== 'page') continue;
    for (const m of check.measure({sid, components})) { const b = broken(key, `page ${sid}`, m); if (b !== undefined) said.push(sentence(key, b)); }
  }
  reject(`Page ${sid}`, said);
}

/** Checks the call bounds; facts not yet known (pages, bytes before translation) are skipped. */
export function checkCall(facts: CallFacts): void {
  const said: string[] = [];
  for (const key of BOUND_KEYS) {
    const check = CHECKS[key];
    if (check.at !== 'call') continue;
    for (const m of check.measure(facts)) { const b = broken(key, 'this call', m); if (b !== undefined) said.push(sentence(key, b)); }
  }
  reject('Call', said);
}

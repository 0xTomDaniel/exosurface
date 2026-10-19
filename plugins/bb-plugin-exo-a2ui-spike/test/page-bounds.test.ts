// docs/specs/page-bounds.spec.html: every page bound is declared once (src/page-bounds.ts); the update_exosurface
// contract states each one and a rejection names it in the contract's words.
import './clone-home.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_BOUNDS, BOUND_KEYS, statement, type Limit} from '../src/page-bounds.ts';
import {SURFACE_DESCRIPTION, contractMisses} from '../src/tool-contract.ts';
import {COMPONENTS} from '../src/workspace.ts';
import {CANONICAL_HOME} from '../src/state.ts';

interface Tool {description: string; execute: (id: string, args: Record<string, unknown>) => Promise<unknown>}
async function updateTool(): Promise<Tool> {
  process.env['EXO_A2UI_SPIKE'] = '1';
  process.env['OPTCHAT_HOME'] = CANONICAL_HOME;
  const {default: workspace} = await import('../src/workspace-extension.ts');
  const tools = new Map<string, Tool>();
  const pi = {getAllTools: () => [], on: () => () => undefined, registerTool: (t: Tool & {name: string}) => tools.set(t.name, t), registerCommand: () => undefined, appendEntry: () => undefined, setActiveTools: () => undefined, getActiveTools: () => []};
  workspace(pi as never);
  const t = tools.get('update_exosurface');
  assert.ok(t);
  return t;
}
async function rejection(args: Record<string, unknown>): Promise<string> {
  const t = await updateTool();
  try { await t.execute('c1', {baseRevision: 0, ...args}); } catch (e) { return (e as Error).message; }
  assert.fail('call was accepted');
}
const valueWords = (l: Limit): string[] => {
  switch (l.kind) {
    // A minimum of 0 is no minimum: the contract says "at most".
    case 'length': case 'count': return [...(l.min > 0 ? [String(l.min)] : []), ...(l.max === null ? [] : [String(l.max)])];
    case 'range': case 'form': return [String(l.min), String(l.max)];
    case 'choice': return [...l.values];
    case 'size': return [String(l.max), l.unit];
    case 'rule': return [l.rule];
  }
};
const PLAIN = (said: string) => { assert.ok(!/[{}]|too_big|invalid_type|"code"|\bpath\b/.test(said), `plain words: ${said}`); };

void test('acceptance-contract-complete: the contract states every bound, its value and what it applies to, in snapshot-format words', async () => {
  const t = await updateTool();
  assert.equal(t.description, SURFACE_DESCRIPTION, 'the contract Exo reads is the generated one');
  for (const key of BOUND_KEYS) {
    const b = PAGE_BOUNDS[key], said = statement(key);
    assert.ok(SURFACE_DESCRIPTION.includes(said), `contract states ${key}: ${said}`);
    for (const on of b.on) assert.ok(said.startsWith(b.on.join(', ')) && said.includes(on), `${key} names what it applies to (${on})`);
    assert.ok(said.includes(b.attribute), `${key} names its attribute`);
    for (const w of valueWords(b.limit)) assert.ok(said.includes(w), `${key} states its value ${w}`);
  }
  // T1: snapshot-format words, never the renderer's component names (role placeholders like heading "Text" aside).
  const renderer = COMPONENTS.filter(c => c !== 'Text');
  for (const c of renderer) assert.ok(!new RegExp(`\\b${c}\\b`).test(SURFACE_DESCRIPTION), `contract never says ${c}`);
  for (const key of BOUND_KEYS) assert.ok(!COMPONENTS.some(c => new RegExp(`\\b${c}\\b`).test(statement(key))), `${key} in snapshot words`);
});

void test('acceptance-missing-bound-fails: a bound the validator enforces but the contract does not state fails, naming it', () => {
  assert.deepEqual(contractMisses(SURFACE_DESCRIPTION), [], 'bounds the validator enforces that the update_exosurface contract does not state');
  // The enforced set is the bounds definition itself (the validator's checks are typed against its keys), so
  // dropping any one bound's statement from the contract is caught and named.
  for (const key of BOUND_KEYS) assert.ok(contractMisses(SURFACE_DESCRIPTION.replaceAll(statement(key), '')).includes(key), key);
});

void test('acceptance-rejection-length: text over its bound names the page, the ref, the attribute and the value, in the contract\'s words', async () => {
  const max = PAGE_BOUNDS.noteTitle.limit.max, title = 'x'.repeat(max + 10);
  const said = await rejection({snapshot: `- region "Trip" [ref=trip]:\n  - note "${title}" [ref=lean] [tone=decision]: Rain at noon.`});
  assert.match(said, /^Page trip rejected: /);
  assert.ok(said.includes('[ref=lean]') && said.includes('"title"') && said.includes(String(max)), said);
  assert.ok(said.includes(`"title" is ${String(max + 10)} characters`), said);
  assert.ok(said.includes(statement('noteTitle')) && SURFACE_DESCRIPTION.includes(statement('noteTitle')), 'same words as the contract');
  PLAIN(said);
  // A cell, far down a table, is located by its table's ref and its row.
  const cell = 'y'.repeat(PAGE_BOUNDS.tableCell.limit.max + 1);
  const t2 = await rejection({snapshot: `- region "Compare" [ref=cmp]:\n  - table "Cabins" [ref=tb]:\n    - row [header]: A | B\n    - row: a | ${cell}`});
  assert.ok(t2.includes('Page cmp') && t2.includes('[ref=tb]') && t2.includes('line 4') && t2.includes(statement('tableCell')), t2);
});

void test('acceptance-rejection-choice: a note with a tone only other elements accept lists the tones a note accepts', async () => {
  const other = PAGE_BOUNDS.tone.limit.values.find(t => !(PAGE_BOUNDS.noteTone.limit.values as readonly string[]).includes(t));
  assert.ok(other);
  const said = await rejection({snapshot: `- region "Trip" [ref=trip]:\n  - note "Watch" [ref=warn] [tone=${other}]: Rain.`});
  assert.ok(said.includes('Page trip') && said.includes('note "Watch" [ref=warn]') && said.includes(`[tone=${other}]`), said);
  for (const tone of PAGE_BOUNDS.noteTone.limit.values) assert.ok(said.includes(tone), `lists ${tone}: ${said}`);
  assert.ok(said.includes(statement('noteTone')));
  PLAIN(said);
});

void test('acceptance-rejection-page: more components than a page may hold names the page, the bound, its value and the count', async () => {
  const max = PAGE_BOUNDS.pageComponents.limit.max, lines = max + 5;
  const body = Array.from({length: lines}, (_, i) => `  - text: line ${String(i)}`).join('\n');
  const said = await rejection({snapshot: `- region "Big" [ref=big]:\n  - heading "Big"\n${body}`});
  // root + heading + one per text line
  assert.ok(said.includes(`Page big rejected: page big has ${String(lines + 2)} components.`), said);
  assert.ok(said.includes(statement('pageComponents')) && said.includes(`at most ${String(max)}`), said);
  PLAIN(said);
});

void test('Call bounds are named on the call, before anything is drawn', async () => {
  const n = PAGE_BOUNDS.editsPerCall.limit.max + 1;
  const said = await rejection({edits: Array.from({length: n}, () => ({page: 'p', ref: 'r', op: 'remove'}))});
  assert.ok(said.startsWith(`Call rejected: this call has ${String(n)} edits.`) && said.includes(statement('editsPerCall')), said);
});

void test('Agreement and form bounds reject with the element and the contract words', async () => {
  const flow = await rejection({snapshot: '- region "F" [ref=f]:\n  - list [ref=fl] [flow]:\n    - listitem "A" [ref=a] [to=z]'});
  assert.ok(flow.includes('list [flow] [ref=fl]') && flow.includes('[to=z]') && flow.includes(statement('flowLinksJoinNodes')), flow);
  const kind = await rejection({snapshot: '- region "C" [ref=c]:\n  - figure "Pies" [ref=pie] [chart=pie]:\n    - row: a | 1'});
  assert.ok(kind.includes('[chart=pie]') && kind.includes(statement('chartKind')), kind);
  const ref = await rejection({snapshot: '- region "R" [ref=r]:\n  - text [ref=bad.ref]: hi'});
  assert.ok(ref.includes('"bad.ref"') && ref.includes(statement('refForm')), ref);
});

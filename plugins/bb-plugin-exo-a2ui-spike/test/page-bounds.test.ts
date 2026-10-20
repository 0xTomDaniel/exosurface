// docs/specs/page-bounds.spec.html: every page bound is declared once (src/page-bounds.ts); the update_exosurface
// contract states each one and a rejection names it in the contract's words.
import './clone-home.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {PAGE_BOUNDS, BOUND_KEYS, statement, type Limit} from '../src/page-bounds.ts';
import {SURFACE_DESCRIPTION, contractMisses} from '../src/tool-contract.ts';
import {COMPONENTS} from '../src/workspace.ts';
import {CANONICAL_HOME} from '../src/state.ts';
import {assertContractStatesEveryBound} from './contract-bounds.ts';

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
    case 'reserved': return [...l.names, l.part, ...l.inputNames];
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
  assertContractStatesEveryBound(SURFACE_DESCRIPTION);
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

// A live extension with a committed surface: execute computes a call against it without committing, so one
// surface serves many probes.
interface Handlers {on: Map<string, ((e: unknown, ctx: unknown) => unknown)[]>; tool: Tool & {parameters: unknown}}
async function liveExtension(): Promise<Handlers> {
  process.env['EXO_A2UI_SPIKE'] = '1';
  process.env['OPTCHAT_HOME'] = CANONICAL_HOME;
  const {default: workspace} = await import('../src/workspace-extension.ts');
  const tools = new Map<string, Tool & {parameters: unknown}>(), on = new Map<string, ((e: unknown, ctx: unknown) => unknown)[]>();
  let active: string[] = [];
  const pi = {getAllTools: () => [...tools.keys()].map(name => ({name})), on: (n: string, h: (e: unknown, ctx: unknown) => unknown) => { on.set(n, [...(on.get(n) ?? []), h]); return () => undefined; },
    registerTool: (t: Tool & {name: string; parameters: unknown}) => tools.set(t.name, t), registerCommand: () => undefined, appendEntry: () => undefined, setActiveTools: (t: string[]) => { active = t; }, getActiveTools: () => active};
  workspace(pi as never);
  const tool = tools.get('update_exosurface');
  assert.ok(tool);
  const ctx = {sessionManager: {getBranch: () => [], getSessionId: () => 'bounds'}};
  for (const h of on.get('session_start') ?? []) h({}, ctx);
  return {on, tool};
}
async function commit(x: Handlers, id: string, args: Record<string, unknown>) {
  const result = await x.tool.execute(id, args) as {details: unknown};
  const ctx = {sessionManager: {getBranch: () => [], getSessionId: () => 'bounds'}};
  for (const h of x.on.get('message_end') ?? []) h({message: {role: 'toolResult', toolName: 'update_exosurface', isError: false, toolCallId: id, details: result.details}}, ctx);
}
const page = (ref: string) => `- region "Page ${ref}" [ref=${ref}]:\n  - text [ref=${ref}_t]: ${ref}`;
const changes = (r: unknown) => (r as {details: {delta: {messages: unknown[]}}}).details.delta.messages.length;

void test('callChanges: no call within every other bound exceeds it; withdrawing a page the call also draws is named when it does', async () => {
  const pages = PAGE_BOUNDS.callPages.limit.max, max = PAGE_BOUNDS.callChanges.limit.max;
  const x = await liveExtension(), on = Array.from({length: pages}, (_, i) => `p${String(i)}`);
  await commit(x, 'setup', {baseRevision: 0, snapshot: on.map(page).join('\n')});
  // Every split of the call-size bound on pages drawn or edited (k pages already on the surface redrawn,
  // m new), with the rest of the surface withdrawn (delete) or left for the system to move into history.
  let worst = 0;
  for (let k = 0; k <= pages; k++) for (let m = 0; k + m <= pages; m++) for (const withdraw of [true, false]) {
    const drawn = [...on.slice(0, k), ...Array.from({length: m}, (_, i) => `n${String(i)}`)];
    const r = await x.tool.execute('probe', {baseRevision: 1, snapshot: drawn.map(page).join('\n') || undefined, ...(withdraw && k < pages ? {delete: on.slice(k)} : {}), ...(drawn.length ? {} : {delete: on})});
    worst = Math.max(worst, changes(r));
  }
  // Edits at their bound, spread over every page on the surface.
  const edits = Array.from({length: PAGE_BOUNDS.editsPerCall.limit.max}, (_, i) => ({page: on[i % pages], ref: `${on[i % pages] ?? ''}_t`, op: 'replace', lines: `- text [ref=${on[i % pages] ?? ''}_t]: edit ${String(i)}`}));
  worst = Math.max(worst, changes(await x.tool.execute('edits', {baseRevision: 1, edits: edits.slice(0, pages), beside: on.slice(0, PAGE_BOUNDS.besidePages.limit.max)})));
  assert.equal(worst, max, `the worst call within every other bound has exactly ${String(max)} page changes`);
  // Beyond it only by withdrawing a page the same call redraws: rejected in the contract's words.
  const said = await x.tool.execute('over', {baseRevision: 1, snapshot: on.map(page).join('\n'), delete: [on[0]]}).then(() => '', (e: unknown) => (e as Error).message);
  assert.ok(said.startsWith(`Call rejected: this call has ${String(max + 1)} page changes.`) && said.includes(statement('callChanges')), said);
  PLAIN(said);
});

void test('T4: pi validates tool arguments against the schema before execute, so no page bound lives in the schema', async () => {
  const {Compile} = await import('typebox/compile');
  const x = await liveExtension(), schema = x.tool.parameters as Parameters<typeof Compile>[0];
  const limits = (v: unknown): string[] => v && typeof v === 'object' ? Object.entries(v).flatMap(([k, w]) => [...(/^(max|min)(Length|Items|imum)$/.test(k) && k !== 'minimum' ? [k] : []), ...limits(w)]) : [];
  assert.deepEqual(limits(schema), [], 'no length or count limits in the update_exosurface schema');
  // Over every call bound at once: the schema (pi's validator, Compile like pi-ai validateToolArguments) lets it
  // through, and execute names the bounds in plain words.
  const B = PAGE_BOUNDS, over = {baseRevision: 0, snapshot: 'x'.repeat(B.snapshotLength.limit.max + 1),
    edits: Array.from({length: B.editsPerCall.limit.max + 1}, () => ({page: 'p', ref: 'r', op: 'replace', lines: 'y'.repeat(B.editLines.limit.max + 1)})),
    delete: Array.from({length: B.deletePerCall.limit.max + 1}, (_, i) => `d${String(i)}`), beside: Array.from({length: B.besidePages.limit.max + 1}, (_, i) => `b${String(i)}`)};
  assert.ok(Compile(schema).Check(over), 'pi would pass these arguments to execute');
  const said = await x.tool.execute('t4', over).then(() => '', (e: unknown) => (e as Error).message);
  assert.match(said, /^Call rejected: /);
  for (const k of ['snapshotLength', 'editsPerCall', 'editLines', 'deletePerCall', 'besidePages'] as const) assert.ok(said.includes(statement(k)), `${k}: ${said.slice(0, 300)}`);
  PLAIN(said);
});

// ---- Final review (#23): the translation's own names, selected values, and downstream checks ----
const DEFECT = 'does not state';
async function accepted(snapshot: string): Promise<void> {
  const t = await updateTool();
  await t.execute('ok', {baseRevision: 0, snapshot}).catch((e: unknown) => { assert.fail(`rejected a page within every stated bound: ${(e as Error).message.slice(0, 400)}\n${snapshot.slice(0, 300)}`); });
}
const longRef = (tag: string, max: number = PAGE_BOUNDS.refForm.limit.max) => `${tag}${'r'.repeat(max - tag.length)}`;

void test('review 1: refs at their longest never collide with or overflow the parts the translation names', async () => {
  const R = (t: string) => longRef(t);
  // Titled page, card, group, collapsible group, list, tablist and a button, every ref at the form's length.
  await accepted(`- region "Titled" [ref=${R('p')}]:
  - text [ref=${R('a')}]: first line is not a heading, so the page title is a part
  - article "Card" [ref=${R('b')}]:
    - text [ref=${R('c')}]: in a card
  - group "Group" [ref=${R('d')}]:
    - text [ref=${R('e')}]: in a group
  - group "More" [ref=${R('f')}] [collapsible]:
    - text [ref=${R('g')}]: hidden
  - list "List" [ref=${R('h')}]:
    - listitem: one
    - listitem: two
      - text [ref=${R('i')}]: nested
  - tablist [ref=${R('j')}]:
    - tab "One":
      - text [ref=${R('k')}]: tab
  - checkbox "Pick" [ref=${R('l')}]
  - button "Go" [ref=${R('m')}] [sends=${R('l')}]`);
  // Read back, a page with the longest refs shows them (never its parts) and redraws to the same components.
  const {snapshotToA2ui, surfaceSnapshot} = await import('../src/snapshot-format.ts'), {applyDelta, moduleNodes} = await import('../src/workspace.ts');
  const src = `- region "T" [ref=${R('p')}]:\n  - text [ref=${R('a')}]: x\n  - list "L" [ref=${R('h')}]:\n    - listitem: one\n  - button "Go" [ref=${R('m')}]`;
  const drawn = applyDelta(null, {baseRevision: 0, revision: 1, messages: snapshotToA2ui(src)}), text = surfaceSnapshot(drawn, R('p'));
  assert.ok(!text.includes(PAGE_BOUNDS.refReserved.limit.part) && text.includes(`[ref=${R('m')}]`), text);
  assert.deepEqual(moduleNodes(applyDelta(null, {baseRevision: 0, revision: 1, messages: snapshotToA2ui(text)}), R('p')), moduleNodes(drawn, R('p')));
  // An assigned id never takes a ref written later on the page; a flow's default node id never takes a declared one.
  await accepted('- region "Auto" [ref=auto]:\n  - heading "Untitled"\n  - text [ref=h1]: written after the heading that would have been h1\n  - list [ref=fl] [flow]:\n    - listitem "First" [to=n1]\n    - listitem "Second" [ref=n1]');
});

void test('review 1 (again): parts are allocated against every id on the page, never a hash assumed unique', async () => {
  const max = PAGE_BOUNDS.refForm.limit.max;
  // The reviewer's pair: equal 32-bit FNV hashes of two legal 80-character refs.
  const pair = ['0000000000009vl8', '000000000000apd6'].map(t => `${'r'.repeat(max - t.length)}${t}`);
  await accepted(`- region "P" [ref=p]:\n${pair.map((r, i) => `  - article "${String(i)}" [ref=${r}]:\n    - text: one`).join('\n')}`);
  // General: refs that differ only past where every part cuts them, on every role that has parts.
  const R = (i: number) => `${'q'.repeat(max - 2)}${String(i).padStart(2, '0')}`;
  const roles = (i: number) => [`- article "A" [ref=${R(i)}]:\n    - text: a`, `- group "G" [ref=${R(i + 1)}]:\n    - text: g`, `- group "C" [ref=${R(i + 2)}] [collapsible]:\n    - text: c`,
    `- list "L" [ref=${R(i + 3)}]:\n    - listitem: x\n      - text: nested`, `- tablist [ref=${R(i + 4)}]:\n    - tab "T":\n      - text: t`, `- button "B" [ref=${R(i + 5)}]`];
  await accepted(`- region "Same prefix" [ref=${R(99)}]:\n  - text: first\n${[0, 6].flatMap(roles).map(l => `  ${l}`).join('\n')}`);
});

void test('review 1: refs the page itself needs are a declared bound, named in the contract\'s words', async () => {
  const {names, part, inputNames} = PAGE_BOUNDS.refReserved.limit;
  for (const [line, ref] of [...names.map(r => ['text', r]), ['text', `a${part}b`], ...inputNames.map(r => ['textbox "Field"', r])] as const) {
    const said = await rejection({snapshot: `- region "R" [ref=r]:\n  - ${line} [ref=${ref}]: x`});
    assert.ok(said.startsWith('Page r rejected:') && said.includes(`[ref=${ref}]`) && said.includes(statement('refReserved')), said);
    PLAIN(said);
  }
});

void test('review 2/3: every word inspect or checkPath reads, and every Object.prototype name, is a legal input ref unless the definition reserves it', async () => {
  const {INSPECT_WORDS} = await import('../src/workspace.ts');
  const {names, part, inputNames} = PAGE_BOUNDS.refReserved.limit, words0: readonly string[] = [...names, ...inputNames], reserved = (w: string) => words0.includes(w) || w.includes(part);
  const words = [...new Set([...INSPECT_WORDS, ...Object.getOwnPropertyNames(Object.prototype), ...names, ...inputNames])];
  const inputs = (w: string) => [`- checkbox "C" [ref=${w}] [checked]`, `- textbox "T" [ref=${w}]: hello`, `- slider "S" [ref=${w}] [min=0] [max=4]: 2`,
    `- radiogroup "R" [ref=${w}]:\n    - radio "A" [checked]`, `- listbox "L" [ref=${w}]:\n    - option "A" [selected]`];
  for (const w of words) for (const input of inputs(w)) {
    const snapshot = `- region "P" [ref=p]:\n  ${input}\n  - button "Go" [ref=go] [sends=${w}]`;
    if (reserved(w)) { const said = await rejection({snapshot}); assert.ok(said.includes(statement('refReserved')), `${w}: ${said}`); continue; }
    await accepted(snapshot);
  }
  // Data-key words are refused only where the ref becomes a data key: on other lines they are ordinary refs.
  for (const w of INSPECT_WORDS.filter(x => !reserved(x))) await accepted(`- region "P" [ref=p]:\n  - text [ref=${w}]: x`);
});

void test('review 2: a listbox whose [selected] options share a [value] is named; values made from labels never clash', async () => {
  const said = await rejection({snapshot: '- region "P" [ref=p]:\n  - listbox "Pick" [ref=pick]:\n    - option "A" [selected] [value=a]\n    - option "Again" [selected] [value=a]'});
  assert.ok(said.includes('listbox "Pick" [ref=pick]') && said.includes('[value=a]') && said.includes(statement('listboxSelectedDistinct')), said);
  PLAIN(said);
  await accepted('- region "P" [ref=p]:\n  - listbox "Pick" [ref=pick]:\n    - option "Yes!" [selected]\n    - option "Yes?" [selected]');
});

void test('review 2 (B1 search): other downstream checks a snapshot call could break are declared and named', async () => {
  const sends = await rejection({snapshot: '- region "S" [ref=s]:\n  - text [ref=note]: not an input\n  - button "Go" [ref=go] [sends=note]'});
  assert.ok(sends.includes('[ref=go]') && sends.includes(statement('sendsNameInputs')), sends);
  const slider = await rejection({snapshot: '- region "S" [ref=s]:\n  - slider "Level" [ref=lvl] [min=5] [max=1]'});
  assert.ok(slider.includes('[ref=lvl]') && slider.includes(statement('sliderWithinRange')), slider);
  const focus = await rejection({snapshot: '- region "S" [ref=s]:\n  - text: x', focus: 'gone'});
  assert.equal(focus, 'Call rejected: focus names page gone, which is not on the surface after this call.');
  for (const said of [sends, slider, focus]) { PLAIN(said); assert.ok(!said.includes(DEFECT), said); }
});

void test('review 3A (option B): a snapshot within its length is accepted end to end, however large its translation', async () => {
  const lines = 40, perLine = Math.floor((PAGE_BOUNDS.snapshotLength.limit.max - 40) / lines) - 14;
  const snapshot = `- region "Long" [ref=long]:\n${Array.from({length: lines}, (_, i) => `  - text: ${String(i).padStart(2, '0')}${'x'.repeat(perLine)}`).join('\n')}`;
  assert.ok(snapshot.length <= PAGE_BOUNDS.snapshotLength.limit.max, String(snapshot.length));
  // Translated well over the former 40 KB, it was rejected before option B.
  const {snapshotToA2ui} = await import('../src/snapshot-format.ts');
  assert.ok(JSON.stringify(snapshotToA2ui(snapshot)).length > 40 * 1024);
  await accepted(snapshot);
});

void test('review 3B: an empty name in [to] is ignored by the validator and the translation alike', async () => {
  await accepted('- region "F" [ref=f]:\n  - list [ref=fl] [flow]:\n    - listitem "A" [ref=a] [to=b,]\n    - listitem "B" [ref=b]');
});

// General guard: one page per role at every element bound's limit, built from the definition, every ref at its
// longest. A call within every stated bound is accepted; one step over a bound is named in the contract's words.
void test('guard: pages at every element bound are accepted; a call within every stated bound never hits an unstated check', async () => {
  const B = PAGE_BOUNDS, s = (n: number, c = 'w') => c.repeat(n), R = (t: string) => longRef(t), F = (t: string) => longRef(t, B.flowRefForm.limit.max);
  const page = (tag: string, body: string[]) => `- region "${s(B.noteTitle.limit.max)}" [ref=${R(tag)}]:\n${body.map(l => `  ${l}`).join('\n')}`;
  const cycle = (vals: readonly string[], i: number) => vals[i % vals.length] ?? '';
  const pages = [
    page('note', B.noteTone.limit.values.map((t, i) => `- note "${s(B.noteTitle.limit.max)}" [ref=${R(`n${String(i)}`)}] [tone=${t}]: ${s(500)}`)),
    page('meter', B.tone.limit.values.map((t, i) => `- meter "${s(B.meterLabel.limit.max)}" [ref=${R(`m${String(i)}`)}] [tone=${t}] [progress=${String(B.meterProgress.limit.max)}]: ${s(B.meterValue.limit.max)}\n    - /detail: ${s(B.meterDetail.limit.max)}`)),
    page('timeline', [`- list [ref=${R('tl')}] [timeline]:`, ...Array.from({length: B.timelineItems.limit.max}, (_, i) => `  - listitem "${s(B.timelineLabel.limit.max)}" [when=${s(B.timelineWhen.limit.max)}] [state=${cycle(B.timelineState.limit.values, i)}]: ${s(B.timelineDetail.limit.max)}`)]),
    page('table', [`- table "${s(B.tableCaption.limit.max)}" [ref=${R('tb')}] [highlight=${String(B.tableHighlight.limit.max)}]:`, `  - row [header]: ${Array.from({length: B.tableColumns.limit.max}, () => s(B.tableHeaderCell.limit.max)).join(' | ')}`,
      ...Array.from({length: B.tableRows.limit.max}, (_, i) => `  - row [tone=${cycle(B.tone.limit.values, i)}]: ${Array.from({length: B.tableColumns.limit.max}, () => s(B.tableCell.limit.max / 2)).join(' | ')}`)]),
    page('figure', B.chartKind.limit.values.flatMap((k, j) => [`- figure "${s(B.figureCaption.limit.max)}" [ref=${R(`f${String(j)}`)}] [chart=${k}] [unit=${s(B.figureUnit.limit.max)}] [max=${String(B.figureRows.limit.max)}]:`,
      ...Array.from({length: B.figureRows.limit.max}, (_, i) => `  - row [tone=${cycle(B.tone.limit.values, i)}]: ${s(B.figureRowLabel.limit.max)} | ${String(i + 1)} | ${s(B.figureRowNote.limit.max)}`)])),
    page('flow', B.flowDirection.limit.values.flatMap((d, j) => {
      const ids = Array.from({length: B.flowNodes.limit.max}, (_, i) => F(`x${String(j)}${String(i).padStart(2, '0')}`));
      let links = B.flowLinks.limit.max;
      return [`- list "${s(B.flowCaption.limit.max)}" [ref=${R(`fl${String(j)}`)}] [flow] [direction=${d}]:`, ...ids.map((id, i) => {
        const to = ids.filter((_, k) => k !== i).slice(0, Math.min(2, links)); links -= to.length;
        return `  - listitem "${s(B.flowLabel.limit.max)}" [ref=${id}]${to.length ? ` [to=${to.join(',')}]` : ''} [tone=${cycle(B.tone.limit.values, i)}]: ${s(B.flowDetail.limit.max)}`;
      })];
    })),
    page('inputs', [
      `- group "${s(B.groupTitle.limit.max)}" [ref=${R('gr')}] [collapsible]:`, `  - /summary: ${s(B.groupSummary.limit.max)}`, `  - textbox "Long" [ref=${R('tx')}] [multiline]: ${s(B.textboxValue.limit.max)}`,
      `- listbox "Many" [ref=${R('lb')}]:`, ...Array.from({length: B.listboxSelected.limit.max}, (_, i) => `  - option "O${String(i)}" [selected] [value=${String(i).padStart(2, '0')}${s(B.optionValue.limit.max - 2, 'v')}]`),
      `- radiogroup "One" [ref=${R('rg')}]:`, '  - radio "A" [checked]', '  - radio "B"',
      `- slider "Level" [ref=${R('sl')}] [min=0] [max=10]: 10`,
      `- tablist [ref=${R('tabs')}]:`, '  - tab "Only":', '    - text: one',
      ...Array.from({length: B.buttonSends.limit.max}, (_, i) => `- checkbox "C${String(i)}" [ref=${R(`c${String(i)}`)}] [checked]`),
      `- button "Send" [ref=${R('go')}] [action=${R('act')}] [sends=${Array.from({length: B.buttonSends.limit.max}, (_, i) => R(`c${String(i)}`)).join(',')}]`]),
    page('deep', [...Array.from({length: B.pageDepth.limit.max - 1}, (_, i) => `${'  '.repeat(i)}- group [ref=${R(`d${String(i)}`)}]:`), `${'  '.repeat(B.pageDepth.limit.max - 1)}- text: at the bottom`]),
    page('wide', Array.from({length: B.pageComponents.limit.max - 2}, (_, i) => `- text [ref=${R(`w${String(i)}`)}]: ${String(i)}`)),
  ];
  for (const p of pages) await accepted(p);
  // One step over: depth and components are named, never "Cycle/shared child/depth violation" or a schema error.
  const deeper = page('deeper', [...Array.from({length: B.pageDepth.limit.max}, (_, i) => `${'  '.repeat(i)}- group:`), `${'  '.repeat(B.pageDepth.limit.max)}- text: too deep`]);
  const said = await rejection({snapshot: deeper});
  assert.ok(said.includes(statement('pageDepth')) && !said.includes(DEFECT), said);
});

// ---- Option B (#23): the page bound in snapshot words, the band it leaves, and the derived internal ceilings ----
const OLD_CAP = 40 * 1024; // the former translated limit, for the no-regression claims only
const snapshotFormat = () => import('../src/snapshot-format.ts');

void test('pageLength: an edit that leaves a page over the bound is named on the page, in the contract\'s words', async () => {
  const x = await liveExtension();
  await commit(x, 'draw', {baseRevision: 0, snapshot: `- region "Long" [ref=long]:\n  - text [ref=a]: ${'y'.repeat(30000)}`});
  const said = await x.tool.execute('grow', {baseRevision: 1, edits: [{page: 'long', ref: 'a', op: 'insertAfter', lines: `- text [ref=b]: ${'z'.repeat(15000)}`}]}).then(() => '', (e: unknown) => (e as Error).message);
  assert.match(said, /^Call rejected: this call: each page drawn or edited, .* \(page long\) is \d+ characters\. Bound: /);
  assert.ok(said.includes(statement('pageLength')) && !said.includes(DEFECT), said);
});

void test('the band (accepted 1d trade-off): a page built by edits to 40,000-40,960 measured chars was accepted before; its next edit is now rejected', async () => {
  const {changeMessages, pageChars, surfaceLines} = await snapshotFormat(), {applyDelta} = await import('../src/workspace.ts');
  const x = await liveExtension();
  await commit(x, 'draw', {baseRevision: 0, snapshot: '- region "P" [ref=p]:\n  - text [ref=a]: x'});
  let s = applyDelta(null, {baseRevision: 0, revision: 1, messages: changeMessages(null, {snapshot: '- region "P" [ref=p]:\n  - text [ref=a]: x'}).messages});
  // Three edits of 13,420 characters, each translated under the former 40 KB cap: all accepted before option B.
  for (const ref of ['b', 'c', 'e']) {
    const {messages} = changeMessages(s, {edits: [{surface: 'p', ref: 'a', op: 'insertAfter', lines: `- text [ref=${ref}]: ${'y'.repeat(13420)}`}]});
    const delta = {baseRevision: s.revision, revision: s.revision + 1, messages};
    assert.ok(JSON.stringify(delta).length <= OLD_CAP, `edit ${ref} was within the former cap`);
    s = applyDelta(s, delta);
    await commit(x, `old-${ref}`, {baseRevision: delta.baseRevision, snapshot: undefined, edits: [{page: 'p', ref: 'a', op: 'insertAfter', lines: `- text [ref=${ref}]: ${'y'.repeat(13420)}`}]}).catch(() => {
      // Under option B this third edit is itself over the page bound; old history holds it, so replay it as committed.
      for (const h of x.on.get('message_end') ?? []) h({message: {role: 'toolResult', toolName: 'update_exosurface', isError: false, toolCallId: `old-${ref}`, details: {delta}}}, {sessionManager: {getBranch: () => [], getSessionId: () => 'bounds'}});
    });
  }
  const measured = pageChars(surfaceLines(s, 'p'));
  assert.ok(measured > PAGE_BOUNDS.pageLength.limit.max && measured < OLD_CAP, `in the band: ${String(measured)}`);
  const said = await x.tool.execute('next', {baseRevision: s.revision, edits: [{page: 'p', ref: 'a', op: 'replace', lines: '- text [ref=a]: w'}]}).then(() => '', (e: unknown) => (e as Error).message);
  assert.ok(said.includes(`(page p) is ${String(measured)} characters`) && said.includes(statement('pageLength')), said);
  PLAIN(said);
});

// Seeded pages over every role in the contract, with long refs, escapes, CJK, astral and control characters.
function rng(seed: number) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function pages(seed: number, count: number): string[] {
  const r = rng(seed), B = PAGE_BOUNDS, int = (lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1)), pick = <X>(xs: readonly X[]): X => xs.at(int(0, xs.length - 1)) as X;
  // Every character the snapshot format escapes or treats specially, in every text field: | (cell separator), \n (line
  // break), " and \ (names), [ ] (attributes), : (text), # (comments), plus = , { } and control, CJK and astral characters.
  const ALPHA = ['a', 'b', ' ', '"', '\\', '語', '\u0001', '\t', '😀', 'Z', '|', '[', ']', ':', '#', ',', '=', '{', '}', '\n'], CELL = ALPHA;
  // Each page leans on one character (half the characters of every field), so an escape that costs more in the
  // snapshot than in the JSON dominates some pages.
  // Half the pages hold one element with every count and length at its bound, so no other element dilutes it.
  let heavy = 'a', big = false;
  const ROLES = ['heading', 'text', 'separator', 'group', 'article', 'collapsible', 'list', 'timeline', 'flow', 'tablist', 'note', 'meter', 'table', 'figure', 'textbox', 'checkbox', 'slider', 'radiogroup', 'listbox', 'button'];
  const str = (max: number, alpha = ALPHA) => { let o = ''; const n = big ? Math.max(1, max) : int(1, Math.max(1, max)); while (o.length < n) o += r() < 0.5 && alpha.includes(heavy) ? heavy : pick(alpha); return o.slice(0, n).replace(/[\uD800-\uDBFF]$/, 'a').trim() || 'a'; };
  const many = (hi: number) => big ? hi : int(1, hi);
  const name = (max: number) => JSON.stringify(str(max)), ATTR = ['a', 'b', '語', '"', '\u0001', '-', '|', ':', '[', '\\', ',', '=', ' ', '#'];
  // Text after ": " writes a line break as \n; a cell also writes | as \|.
  const text = (max: number, alpha = ALPHA) => str(max, alpha).replace(/\n/g, '\\n'), cell = (max: number) => text(max, CELL).replace(/\|/g, '\\|');
  let n = 0; const ref = (max: number = B.refForm.limit.max) => { n++; return `r${String(n)}${'k'.repeat(int(0, max - 1 - String(n).length))}`; };
  const out: string[] = [];
  for (let p = 0; p < count; p++) {
    const inputs: string[] = [], lines: string[] = [];
    // Odd pages: every (role, heavy character) pair in turn, one element at its bounds.
    big = p % 2 === 1; const combo = Math.floor(p / 2);
    heavy = big ? ALPHA[Math.floor(combo / ROLES.length) % ALPHA.length] ?? 'a' : pick(ALPHA);
    const el = (d: number, role = pick(ROLES)): string[] => {
      const i = '  '.repeat(d);
      const kids = () => d < 4 ? Array.from({length: int(1, 2)}, () => el(d + 1)).flat() : [`${i}  - text: leaf`];
      switch (role) {
        case 'heading': return [`${i}- heading ${name(60)} [ref=${ref()}] [level=${String(int(1, 3))}]`];
        case 'text': return [`${i}- text [ref=${ref()}]${r() < 0.3 ? ' [caption]' : ''}: ${text(int(1, 600))}`];
        case 'separator': return [`${i}- separator`];
        case 'group': return [`${i}- group ${r() < 0.5 ? name(30) + ' ' : ''}[ref=${ref()}]${r() < 0.5 ? ' [layout=row]' : ''}:`, ...kids()];
        case 'article': return [`${i}- article ${r() < 0.5 ? name(30) + ' ' : ''}[ref=${ref()}]:`, ...kids()];
        case 'collapsible': return [`${i}- group ${name(B.groupTitle.limit.max)} [ref=${ref()}] [collapsible]${r() < 0.5 ? ' [expanded]' : ''}:`, `${i}  - /summary: ${text(B.groupSummary.limit.max)}`, ...kids()];
        case 'list': return [`${i}- list ${r() < 0.5 ? name(30) + ' ' : ''}[ref=${ref()}]:`, ...Array.from({length: int(1, 4)}, () => `${i}  - listitem: ${text(40)}`)];
        case 'timeline': return [`${i}- list [ref=${ref()}] [timeline]:`, ...Array.from({length: many(B.timelineItems.limit.max)}, () => `${i}  - listitem ${name(B.timelineLabel.limit.max)} [when=${str(B.timelineWhen.limit.max, ATTR)}] [state=${pick(B.timelineState.limit.values)}]: ${text(B.timelineDetail.limit.max)}`)];
        case 'flow': { const ids = Array.from({length: many(B.flowNodes.limit.max)}, () => ref(B.flowRefForm.limit.max)); let links = B.flowLinks.limit.max;
          return [`${i}- list ${name(B.flowCaption.limit.max)} [ref=${ref()}] [flow] [direction=${pick(B.flowDirection.limit.values)}]:`, ...ids.map((id, k) => { const to = ids.filter((_, j) => j !== k && r() < 0.3).slice(0, links); links -= to.length;
            return `${i}  - listitem ${name(B.flowLabel.limit.max)} [ref=${id}]${to.length ? ` [to=${to.join(',')}]` : ''} [tone=${pick(B.tone.limit.values)}]: ${text(B.flowDetail.limit.max)}`; })]; }
        case 'tablist': return [`${i}- tablist [ref=${ref()}]:`, ...Array.from({length: int(1, 2)}, () => [`${i}  - tab ${name(20)}:`, `${i}    - text: ${text(30)}`]).flat()];
        case 'note': return [`${i}- note ${name(B.noteTitle.limit.max)} [ref=${ref()}] [tone=${pick(B.noteTone.limit.values)}]: ${text(800)}`];
        case 'meter': return [`${i}- meter ${name(B.meterLabel.limit.max)} [ref=${ref()}] [tone=${pick(B.tone.limit.values)}] [progress=${String(r())}]: ${text(B.meterValue.limit.max)}`, `${i}  - /detail: ${text(B.meterDetail.limit.max)}`];
        case 'table': { const cols = many(B.tableColumns.limit.max), cells = (max: number) => Array.from({length: cols}, () => cell(max)).join(' | ');
          return [`${i}- table ${name(B.tableCaption.limit.max)} [ref=${ref()}] [highlight=${String(int(0, cols - 1))}]:`, `${i}  - row [header]: ${cells(B.tableHeaderCell.limit.max)}`, ...Array.from({length: many(B.tableRows.limit.max)}, () => `${i}  - row [tone=${pick(B.tone.limit.values)}]: ${cells(B.tableCell.limit.max)}`)]; }
        case 'figure': return [`${i}- figure ${name(B.figureCaption.limit.max)} [ref=${ref()}] [chart=${pick(B.chartKind.limit.values)}] [unit=${str(B.figureUnit.limit.max, ATTR)}] [max=1e9]:`,
          ...Array.from({length: many(B.figureRows.limit.max)}, () => `${i}  - row [tone=${pick(B.tone.limit.values)}]: ${cell(B.figureRowLabel.limit.max)} | ${pick(['1e8', '7', '0.5', '12,000'])} | ${cell(B.figureRowNote.limit.max)}`)];
        case 'textbox': { const id = ref(); inputs.push(id); return [`${i}- textbox ${name(40)} [ref=${id}]${r() < 0.5 ? ' [multiline]' : ''}: ${text(B.textboxValue.limit.max)}`]; }
        case 'checkbox': { const id = ref(); inputs.push(id); return [`${i}- checkbox ${name(40)} [ref=${id}]${r() < 0.5 ? ' [checked]' : ''}`]; }
        case 'slider': { const id = ref(); inputs.push(id); return [`${i}- slider ${name(40)} [ref=${id}] [min=1e1] [max=1e9]: ${String(int(10, 1e9))}`]; }
        case 'radiogroup': case 'listbox': { const id = ref(), single = role === 'radiogroup', item = single ? 'radio' : 'option'; inputs.push(id); let picked = 0;
          return [`${i}- ${role} ${name(40)} [ref=${id}]${r() < 0.5 ? ' [chips]' : ''}:`, ...Array.from({length: int(1, 30)}, (_, k) => {
            const pickIt = (single ? picked < 1 : picked < B.listboxSelected.limit.max) && r() < 0.5; if (pickIt) picked++;
            return `${i}  - ${item} ${name(30)}${pickIt ? (single ? ' [checked]' : ' [selected]') : ''}${r() < 0.6 ? ` [value=${String(k)}${str(B.optionValue.limit.max - 3, ATTR)}]` : ''}`; })]; }
        default: { const sends = inputs.filter(() => r() < 0.5).slice(0, B.buttonSends.limit.max);
          return [`${i}- button ${name(40)} [ref=${ref()}]${r() < 0.5 ? ` [action=${ref()}]` : ''}${r() < 0.5 ? ' [borderless]' : ''}${sends.length ? ` [sends=${sends.join(',')}]` : ''}`]; }
      }
    };
    if (big) lines.push(...el(1, ROLES[combo % ROLES.length]));
    else for (let k = int(1, 6); k > 0; k--) lines.push(...el(1));
    out.push(`- region ${name(60)} [ref=${ref()}]:\n${lines.join('\n')}`);
  }
  return out;
}

void test('no regression and derivation: over seeded pages of every role, the page measure never exceeds the former translated size, and pageBytes bounds the translation', async () => {
  const {snapshotToA2ui, parseLines, surfaceLines, pageChars, SNAPSHOT_FORMAT} = await snapshotFormat(), {applyDelta, moduleIds, moduleNodes} = await import('../src/workspace.ts');
  const {pageBytes} = await import('../src/internal-limits.ts');
  // Every role the contract lists is generated (heading … button; list kinds and the collapsible group included).
  const roles = new Set(SNAPSHOT_FORMAT.split('Roles:')[1]?.split('Bounds')[0]?.split('\n').map(l => /^ {2}([a-z]+)\b/.exec(l)?.[1]).filter((x): x is string => x !== undefined));
  const sample = pages(23, 2 * 20 * 20), seen = new Set<string>(), utf8 = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;
  let accepted = 0;
  for (const snap of sample) {
    for (const l of snap.split('\n')) { const role = /^\s*- ([a-z]+)/.exec(l)?.[1]; if (role) seen.add(role); }
    let s; let messages;
    try { messages = snapshotToA2ui(snap); s = applyDelta(null, {baseRevision: 0, revision: 1, messages}); } catch { continue; }
    accepted++;
    const sid = moduleIds(s).at(0) ?? '', translated = JSON.stringify(messages).length, first = parseLines(snap).at(0);
    if (!first) continue;
    const drawn = pageChars(first), back = pageChars(surfaceLines(s, sid));
    // Edits are judged on the page read back: never more than its translation, so nothing within the former cap
    // measures over it (the band 40,000 to the former cap is the one accepted trade-off). A draw never measures more than it wrote.
    assert.ok(back <= translated, `read back ${String(back)} > translated ${String(translated)}\n${snap.slice(0, 400)}`);
    assert.ok(drawn <= snap.length, `drawn ${String(drawn)} > written ${String(snap.length)}`);
    const nodes = moduleNodes(s, sid) as unknown[], links = nodes.reduce((k: number, c) => k + ((c as {edges?: unknown[]}).edges?.length ?? 0), 0);
    assert.ok(utf8(messages) <= pageBytes(Math.min(drawn, back), nodes.length, links, 0), `pageBytes under the translation: ${String(utf8(messages))}`);
  }
  for (const role of roles) assert.ok(seen.has(role), `generated ${role}`);
  assert.ok(accepted >= 600, `accepted ${String(accepted)} of ${String(sample.length)}`);
});

void test('worst case: a 40,000-character snapshot built for translated size passes execute, and the internal ceilings exceed it', async () => {
  const B = PAGE_BOUNDS, L = await import('../src/internal-limits.ts'), {MAX_BYTES} = await import('../src/workspace.ts');
  const R = (t: string) => longRef(t), ctl = '\u0001';
  // Structure: buttons with the longest refs sending the longest-ref inputs (about 11.6x). Content: selected option
  // values of control characters (escaped to 6 bytes, stored twice: 12 bytes per character).
  const buttons = (p: number) => `- region "B" [ref=${R(`pb${String(p)}`)}]:\n${Array.from({length: 20}, (_, k) => `  - checkbox "c" [ref=${R(`c${String(p)}_${String(k)}`)}] [checked]`).join('\n')}\n${Array.from({length: 20}, (_, k) => `  - button "b" [ref=${R(`b${String(p)}_${String(k)}`)}] [sends=${R(`c${String(p)}_${String(k)}`)}]`).join('\n')}`;
  const values = (p: number, per: number) => `- region "V" [ref=${R(`pv${String(p)}`)}]:\n${Array.from({length: 2}, (_, l) => `  - listbox "L" [ref=${R(`l${String(p)}_${String(l)}`)}]:\n${Array.from({length: B.listboxSelected.limit.max}, (_, k) => `    - option "o" [selected] [value=${String(k).padStart(2, '0')}${ctl.repeat(per)}]`).join('\n')}`).join('\n')}`;
  const head = [0, 1, 2, 3].map(buttons).join('\n');
  const build = (per: number) => `${head}\n${[0, 1, 2, 3].map(p => values(p, per)).join('\n')}`;
  let per = B.optionValue.limit.max - 2;
  while (build(per).length > B.snapshotLength.limit.max) per--;
  const snapshot = build(per);
  assert.ok(snapshot.length <= B.snapshotLength.limit.max && snapshot.length > B.snapshotLength.limit.max * 0.95, String(snapshot.length));
  const t = await updateTool(), result = await t.execute('worst', {baseRevision: 0, snapshot}) as {details: {delta: unknown}};
  const bytes = new TextEncoder().encode(JSON.stringify(result.details.delta)).length;
  assert.ok(bytes > 4 * 40 * 1024, `built for size: ${String(bytes)} bytes from ${String(snapshot.length)} characters`);
  assert.ok(L.DELTA_CEILING > bytes && L.SURFACE_CEILING > bytes && MAX_BYTES === L.SURFACE_CEILING, `ceilings ${String(L.DELTA_CEILING)} / ${String(L.SURFACE_CEILING)} over ${String(bytes)}`);
  // The ceilings cover the bound's own worst case: every page at its limits, the surface full, a call's deletes.
  assert.ok(L.PAGE_BYTES >= L.BYTES_PER_CHAR * B.pageLength.limit.max && L.SURFACE_CEILING >= B.callPages.limit.max * L.PAGE_BYTES && L.DELTA_CEILING > L.SURFACE_CEILING);
  // The live preview never stops before a valid call's arguments end: escaped snapshot and edits at their bounds.
  assert.ok(2 * MAX_BYTES > L.ESCAPED_BYTES * (B.snapshotLength.limit.max + B.editsPerCall.limit.max * B.editLines.limit.max) + 1024);
});

void test('retirement: a call whose own pages are larger than today\'s threshold is accepted, and older pages still move into history', async () => {
  const x = await liveExtension();
  await commit(x, 'small', {baseRevision: 0, snapshot: ['a', 'b', 'c'].map(p => `- region "${p}" [ref=${p}]:\n  - text: ${p}`).join('\n')});
  const big = `- region "Big" [ref=big]:\n${Array.from({length: 40}, () => `  - text: ${'"'.repeat(900)}`).join('\n')}`;
  const r = await x.tool.execute('big', {baseRevision: 1, snapshot: big}) as {details: {retired: string[]; delta: unknown}};
  assert.ok(JSON.stringify(r.details.delta).length > 36864, 'over today\'s retirement threshold');
  assert.deepEqual(r.details.retired, ['a', 'b', 'c'], 'retirement by bytes still runs as today');
});

void test('review (option A): two 6 x 14 tables of 200-pipe cells built by 4 edits are accepted; each \\| counts as the one | it stands for', async () => {
  const x = await liveExtension(), cell = '\\|'.repeat(200), row = `- row: ${Array.from({length: 6}, () => cell).join(' | ')}`;
  const rows = (n: number) => Array.from({length: n}, () => row).join('\n'), header = '- row [header]: a | b | c | d | e | f';
  await commit(x, 'draw', {baseRevision: 0, snapshot: '- region "Pipes" [ref=t]:\n  - text [ref=a]: x'});
  const edits = [
    {page: 't', ref: 'a', op: 'insertAfter', lines: `- table [ref=tb1]:\n  ${header}\n${rows(7).replace(/^/gm, '  ')}`},
    {page: 't', ref: 'tb1', op: 'insertInto', lines: rows(7)},
    {page: 't', ref: 'tb1', op: 'insertAfter', lines: `- table [ref=tb2]:\n  ${header}\n${rows(7).replace(/^/gm, '  ')}`},
    {page: 't', ref: 'tb2', op: 'insertInto', lines: rows(7)},
  ];
  for (const [k, e] of edits.entries()) {
    assert.ok(e.lines.length <= PAGE_BOUNDS.editLines.limit.max, String(e.lines.length));
    await commit(x, `edit${String(k)}`, {baseRevision: k + 1, edits: [e]});
  }
  // The page as read back, refs and indentation dropped, written escapes and all, is over the bound; counted with
  // each escape as one character, it is within it (and within the former translated size).
  const {surfaceLines, formatLines, pageChars} = await snapshotFormat();
  const r = await x.tool.execute('read', {baseRevision: 5, edits: [{page: 't', ref: 'a', op: 'replace', lines: '- text [ref=a]: y'}]}) as {details: {delta: {messages: unknown[]}}};
  const {applyDelta} = await import('../src/workspace.ts'), s = applyDelta(null, {baseRevision: 0, revision: 1, messages: r.details.delta.messages.filter(m => !(m as {deleteSurface?: unknown}).deleteSurface)});
  const region = surfaceLines(s, 't'), bare = (l: typeof region): typeof region => ({...l, attrs: Object.fromEntries(Object.entries(l.attrs).filter(([k]) => k !== 'ref')), children: l.children.map(bare)});
  const written = formatLines([bare(region)]).split('\n').map(l => l.trimStart()).join('\n').length;
  assert.ok(written > PAGE_BOUNDS.pageLength.limit.max && pageChars(region) <= PAGE_BOUNDS.pageLength.limit.max, `written ${String(written)}, counted ${String(pageChars(region))}`);
});

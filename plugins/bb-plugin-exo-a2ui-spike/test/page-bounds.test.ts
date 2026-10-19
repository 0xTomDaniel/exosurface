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
    case 'reserved': return [...l.names, l.part];
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

void test('review 1: refs the page itself needs are a declared bound, named in the contract\'s words', async () => {
  for (const ref of [...PAGE_BOUNDS.refReserved.limit.names, `a${PAGE_BOUNDS.refReserved.limit.part}b`]) {
    const said = await rejection({snapshot: `- region "R" [ref=r]:\n  - textbox "Field" [ref=${ref}]`});
    assert.ok(said.startsWith('Page r rejected:') && said.includes(`[ref=${ref}]`) && said.includes(statement('refReserved')), said);
    PLAIN(said);
  }
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

void test('review 3A: a snapshot within its length whose translation is over the call size is named, not "Delta exceeds bound"', async () => {
  const lines = 40, perLine = Math.floor((PAGE_BOUNDS.snapshotLength.limit.max - 40) / lines) - 14;
  const snapshot = `- region "Long" [ref=long]:\n${Array.from({length: lines}, (_, i) => `  - text: ${String(i).padStart(2, '0')}${'x'.repeat(perLine)}`).join('\n')}`;
  assert.ok(snapshot.length <= PAGE_BOUNDS.snapshotLength.limit.max, String(snapshot.length));
  const said = await rejection({snapshot});
  assert.match(said, /^Call rejected: this call: page changes, together, once translated is \d+ characters, over 40960 \(40 KB\)\. Bound: /);
  assert.ok(said.includes(statement('callSize')) && !said.includes(DEFECT), said);
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

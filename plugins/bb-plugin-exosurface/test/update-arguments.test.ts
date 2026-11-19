// #108: update_exosurface argument-format errors reach Exo in plain words, on both registrations (the release owner's
// legacy surface extension and the fresh-owner page tools). The boundary is the one Pi runs a call through: its own
// validateToolArguments (pinned pi-coding-agent's pi-ai), then execute; a throw from either is the text Exo receives.
import { required } from './required.ts';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixtureCleanup } from './fixture-cleanup.ts';

type Tool = { name: string; parameters: unknown; execute: (id: string, args: unknown) => Promise<{ content: { type: string; text: string }[] }> };
const { validateToolArguments } = await import('@earendil-works/pi-ai') as { validateToolArguments: (tool: Tool, call: object) => unknown };

/** What Exo receives for one update_exosurface call, as Pi runs it. */
async function call(tool: Tool, args: object) {
  try { return required((await tool.execute('call', validateToolArguments(tool, { type: 'toolCall', id: 'call', name: tool.name, arguments: args }))).content[0], "Expected (await tool.execute('call', validateToolArguments(tool, { type: 'to... to be non-null").text; }
  catch (error) { return (error as Error).message; }
}

const snapshot = '- region "Week" [ref=week]:\n  - heading "Week" [ref=title]';
const ACCEPTS = { revision: /whole number 0 or more/, op: /replace, insertAfter, insertInto or remove/ };
/** The format errors of the ticket on a registration whose edit names its page `page`: [case, args, argument, accepts]. */
function cases(page: string, extra: object): [string, object, RegExp, RegExp][] {
  const edit = (e: object) => ({ baseRevision: 0, ...extra, edits: [e] });
  return [
    ['baseRevision missing', { ...extra, snapshot }, /baseRevision/, ACCEPTS.revision],
    ['baseRevision negative', { baseRevision: -1, ...extra, snapshot }, /baseRevision/, ACCEPTS.revision],
    ['baseRevision fractional', { baseRevision: 1.5, ...extra, snapshot }, /baseRevision/, ACCEPTS.revision],
    ['op not an operation', edit({ [page]: 'week', ref: 'title', op: 'bogus', lines: '- heading "x" [ref=title]' }), /edit 1 \(ref title on page week\): op "bogus"/, ACCEPTS.op],
    ['op missing', edit({ [page]: 'week', ref: 'title' }), /edit 1 \(ref title on page week\): op is missing/, ACCEPTS.op],
    ['ref missing', edit({ [page]: 'week', op: 'remove' }), /edit 1 \(on page week\): ref is missing/, /ref accepts/],
    [`${page} missing`, edit({ ref: 'title', op: 'remove' }), new RegExp(`edit 1 \\(ref title\\): ${page} is missing`), new RegExp(`${page} accepts`)],
  ];
}
function assertPlain(text: string, args: object, argument: RegExp, accepts: RegExp) {
  assert.doesNotMatch(text, /Validation failed|Received arguments|must be|must have/);
  assert.ok(!text.includes(JSON.stringify(args)) && !text.includes(JSON.stringify(args, null, 2)), `echoed arguments: ${text}`);
  assert.match(text, argument); assert.match(text, accepts);
}

void test('fresh-owner page tools: each format error reaches Exo in plain words; well-formed draw and edit save', async t => {
  const state = mkdtempSync(join(tmpdir(), 'exo-args-')); fixtureCleanup(t, state);
  process.env["EXO_PAGE_STATE"] = state;
  const tools = new Map<string, Tool>();
  (await import('../src/page-tools.ts')).default({ registerTool: (tool: Tool) => tools.set(tool.name, tool) });
  const tool = required(tools.get('update_exosurface'), "Expected tools.get('update_exosurface') to be non-null");
  for (const [name, args, argument, accepts] of cases('surface', { mutationId: 'bad' })) await t.test(name, async () => assertPlain(await call(tool, args), args, argument, accepts));
  assert.equal(await call(tool, { baseRevision: '0', mutationId: 'draw', snapshot }), 'Pages saved at revision 1.');
  assert.equal(await call(tool, { baseRevision: 1, mutationId: 'edit', edits: [{ surface: 'week', ref: 'title', op: 'replace', lines: '- heading "Plan" [ref=title]' }] }), 'Pages saved at revision 2.');
});

void test('release owner surface extension: each format error reaches Exo in plain words; a well-formed draw saves', async t => {
  const root = mkdtempSync(join(tmpdir(), 'exo-args-')); fixtureCleanup(t, root);
  const home = join(root, 'exo'), optchat = join(root, 'oc');
  mkdirSync(join(home, 'owner'), { recursive: true }); mkdirSync(optchat); writeFileSync(join(home, 'owner', 'state.json'), '{}');
  // The primary's main-mode deployment, as its launcher sets it (read once, at import).
  Object.assign(process.env, { HOME: root, EXO_CONFIG: join(root, 'exosurface.json'), EXOSURFACE_MODE: 'main', EXOSURFACE_HOME: home, EXOSURFACE_OPTCHAT_HOME: optchat, OPTCHAT_HOME: optchat });
  const tools = new Map<string, Tool>();
  const pi = new Proxy({}, { get: (_t, key) => key === 'registerTool' ? (tool: Tool) => tools.set(tool.name, tool) : () => {} });
  (await import('../legacy/surface/src/workspace-extension.ts')).default(pi as never);
  const tool = required(tools.get('update_exosurface'), "Expected tools.get('update_exosurface') to be non-null");
  for (const [name, args, argument, accepts] of cases('page', {})) await t.test(name, async () => assertPlain(await call(tool, args), args, argument, accepts));
  assert.equal(await call(tool, { baseRevision: '0', snapshot }), 'Surface revision 1: drew page week. On stage: week.');
});

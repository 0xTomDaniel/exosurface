// #68 (spec pages-and-activity S2, S3, S7, S10, N1; acceptance-new-surface): New surface starts a top-level Exo thread with
// its own empty pages; the sidebar lists Home then every other surface; sends and presses reach only their own surface.
// Through the live entry points: server.ts RPCs and dispatch hook, host.ts provider bridge, the release owner, real Pi.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { liveFixture, owner, bridge, INSTRUCTIONS } from './mock-bb.ts';
import { settled } from './wait.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
after(async () => {
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 500));
  rmSync(f.root, { recursive: true, force: true });
});
const CATALOG = 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json';
const pages = (threadId?: string) => f.rpc.workspace({ deployment: 'main', ...(threadId ? { threadId } : {}), cursor: null });
const until = async (check: () => Promise<boolean>, what: string) => { if (!(await settled(check, 10000, 25))) throw new Error(`timed out: ${what}`); };
/** BB's dispatch of a sent message: the turn/start it hands the provider bridge. */
const deliver = (sent: any) => host.send(sent.threadId, sent.input.map((i: any) => i.text).join(''));

let made = '';
void test('New surface starts a top-level Exo thread like Home, listed after Home, with one empty page and an empty activity', async () => {
  const before = (await f.rpc.thread_list(null)).threads;
  assert.deepEqual(before, [{ threadId: 'primary', title: 'Home', home: true }]);

  made = (await f.rpc.thread_new(null)).threadId;
  const spawn = f.spawns.at(-1), home = f.spawns[0];
  assert.equal(spawn.parentThreadId, undefined, 'top-level');
  // S10: the same Exo provider, model, project and environment as Home.
  assert.deepEqual([spawn.providerId, spawn.model, spawn.projectId, spawn.environment], ['exo-spike', 'exo-opus-5-5', home.projectId, { type: 'reuse', environmentId: 'env' }]);
  assert.deepEqual((await f.rpc.thread_list(null)).threads, [{ threadId: 'primary', title: 'Home', home: true }, { threadId: made, title: 'New surface', home: false }]);

  // BB starts the spawned thread with its first message: no Exo turn, no reply.
  const started = await host.start(made, [{ type: 'text', text: spawn.prompt }]);
  assert.ok(started.result?.providerThreadId, JSON.stringify(started));
  await until(async () => host.deltas(made).some(d => d.kind === 'turn.boundary'), 'start settles');
  assert.deepEqual(host.deltas(made).filter(d => d.kind === 'item.open' || d.kind === 'item.textClose'), []);
  await until(async () => (await pages(made)).ready, 'the new surface is ready');
  const view = await pages(made);
  assert.deepEqual([view.threadId, view.revision, view.delivery.checkpoint], [made, 0, null], 'one empty page');

  // S10: its own Pi and profile, the same instructions, model and vault; pages extensions on both.
  const runs = f.piRuns();
  assert.equal(runs.length, 2);
  assert.notEqual(runs[1].profile, f.setup.profile);
  for (const r of runs) assert.deepEqual([r.instructions, r.model, realpathSync(r.cwd), r.pageExtensions], [INSTRUCTIONS, 'anthropic/claude-opus-5-5/high', f.vault, true]);
});

void test('a send on a surface is a turn in that surface only; a press on its page reaches only its own thread and page state', async () => {
  assert.ok(made, 'needs the new surface');
  assert.equal((await host.start('primary')).error, undefined);
  const newProfile = f.piRuns()[1].profile;

  host.send(made, 'draw: Cabin trip');
  await host.settled([made]);
  const replies = () => host.deltas(made).filter(d => d.kind === 'item.textClose').map(d => d.text);
  assert.ok(replies().includes('::exo-surface{surface="trip" revision="1" action="drew"}'), JSON.stringify(replies()));
  assert.ok(replies().at(-1).startsWith(`Exo (${newProfile}): `));
  assert.deepEqual(host.deltas('primary').filter(d => d.kind === 'item.textClose'), [], 'Home saw nothing');
  await until(async () => (await pages(made)).revision === 1, 'the drawn page reaches the new surface');
  assert.equal((await pages()).revision, 0, 'Home pages untouched');

  // The person presses Book on the new surface's page.
  const drawn = (await pages(made)).delivery.checkpoint;
  const nodes = drawn.messages.flatMap((m: any) => m.updateComponents?.components ?? []);
  const button = nodes.find((n: any) => n.action?.event);
  const surfaceId = drawn.messages.find((m: any) => m.createSurface).createSurface.surfaceId;
  const context = Object.fromEntries(Object.keys(button.action.event.context).map(k => [k, 'Grace']));
  assert.deepEqual(await f.rpc.action({ threadId: made, revision: 1, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: [CATALOG] } } } }), { accepted: true });
  // The press's values were committed to the new surface's pages only, then its words were sent to its own thread.
  assert.equal((await pages(made)).revision, 2);
  assert.equal((await pages()).revision, 0);
  assert.deepEqual(f.sends.map(s => s.threadId), [made]);
  assert.match(f.sends[0].input[0].text, /^▸ Cabin trip · Book/);
  const boundaries = () => host.deltas(made).filter(d => d.kind === 'turn.boundary').length, settledTurns = boundaries(), seen = replies().length;
  deliver(f.sends[0]);
  await until(async () => boundaries() > settledTurns, 'the press turn');
  assert.ok(replies().length > seen && replies().at(-1).startsWith(`Exo (${newProfile}): `));

  // A send on Home is a turn on Home only.
  const seenAll = replies().length;
  host.send('primary', 'hello Home');
  await host.settled(['primary']);
  assert.deepEqual(host.turn('primary').replies, [`Exo (${f.setup.profile}): hello Home`]);
  assert.equal(replies().length, seenAll);
});

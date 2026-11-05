// #83 (spec pages-and-activity N5 amended, N7; acceptance-rename): the person renames any surface but Home from the flat
// sidebar, any time; a surface the person renamed is never named again by Exo, even before its first turn, and a rename that
// lands while Exo's naming call is in flight wins. Rendered sidebar (package.json bb.app) on the live entry points (server.ts
// RPCs and events, host.ts bridge, the release owner, real Pi); fake at the boundaries: BB, OptChat and the models.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp();
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 500));
  await f.model.close();
  rmSync(f.root, { recursive: true, force: true });
});
const { fireEvent, within } = kit.testing;
const until = async (what: string, ok: () => boolean | Promise<boolean>, ms = 30000) => { for (let w = 0; !(await ok()); w += 50) { if (w > ms) throw new Error(`timed out waiting for ${what}\n${f.logs.join('\n')}`); await new Promise(r => setTimeout(r, 50)); } };
const boundaries = (threadId: string) => host.deltas(threadId).filter(d => d.kind === 'turn.boundary').length;
const sidebar = () => within(view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement);
const entries = () => sidebar().queryAllByRole('listitem').map((li: any) => li.textContent);
/** The surface's name as the server lists it (thread_list, what every view reads). */
const listedName = async (threadId: string) => (await f.rpc.thread_list(null)).threads.find((t: any) => t.threadId === threadId)?.title;
/** A new surface through the sidebar's New surface button, started by BB with its first message. */
async function newSurface() {
  const count = entries().length;
  fireEvent.click(sidebar().getAllByRole('button', { name: 'New surface' }).find((b: any) => !b.closest('li'))!);
  await until('the new surface listed', () => entries().length === count + 1);
  const made = (await f.rpc.thread_list(null)).threads.at(-1)!.threadId;
  assert.equal((await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  await until('the new surface settles', () => boundaries(made) > 0);
  return made;
}
/** The person's message on a surface (exo_send, as its input sends), until Exo's turn has ended. */
async function turn(threadId: string, text: string) {
  const before = boundaries(threadId);
  await f.rpc.exo_send({ threadId, text });
  await until(`the turn ${JSON.stringify(text)}`, () => boundaries(threadId) > before);
}
/** The person renames the surface listed as `from` in the sidebar (the latest such row): its Rename action, type the name, Enter. */
async function rename(from: string, to: string) {
  fireEvent.click(sidebar().getAllByRole('button', { name: `Rename ${from}` }).at(-1)!);
  const field = sidebar().getByRole('textbox', { name: 'Surface name' }) as HTMLInputElement;
  assert.equal(field.value, from);
  fireEvent.change(field, { target: { value: to } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

test('acceptance-rename: a surface Exo named, renamed to "Backyard" in the sidebar, keeps "Backyard" after a further turn; the namer is not asked again', async () => {
  await until('Home listed', () => entries().join('|') === 'Home');
  assert.equal(sidebar().queryByRole('button', { name: /^Rename/ }), null, 'Home has no rename');
  f.model.state.reply = 'Spring vegetable garden';
  const made = await newSurface();
  await turn(made, 'Help me plan a vegetable garden for spring');
  await until('auto-named in the sidebar', () => entries().join('|') === 'Home|Spring vegetable garden');
  assert.equal(f.model.requests.length, 1);

  // Escape leaves the name as it was.
  fireEvent.click(sidebar().getByRole('button', { name: 'Rename Spring vegetable garden' }));
  const field = sidebar().getByRole('textbox', { name: 'Surface name' });
  fireEvent.change(field, { target: { value: 'Not this' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  assert.equal(sidebar().queryByRole('textbox', { name: 'Surface name' }), null);
  assert.deepEqual(entries(), ['Home', 'Spring vegetable garden']);

  await rename('Spring vegetable garden', '  Backyard ');
  await until('the sidebar shows Backyard', () => entries().join('|') === 'Home|Backyard');
  assert.equal(await listedName(made), 'Backyard');

  f.model.state.reply = 'Something else entirely';
  await turn(made, 'Add tomatoes along the fence');
  await new Promise(r => setTimeout(r, 1500));
  assert.deepEqual(entries(), ['Home', 'Backyard']);
  assert.equal(await listedName(made), 'Backyard');
  assert.equal(f.model.requests.length, 1, 'the namer is not asked again');
});

test('acceptance-rename: a surface renamed before its first turn keeps the person\'s name after it; the namer is never asked', async () => {
  f.model.state.reply = 'Exo would call it this';
  const made = await newSurface();
  const asked = f.model.requests.length;
  await rename('New surface', 'Cabin trip');
  await until('the sidebar shows Cabin trip', () => entries().at(-1) === 'Cabin trip');
  await turn(made, 'Book the cabin for June');
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(entries().at(-1), 'Cabin trip');
  assert.equal(await listedName(made), 'Cabin trip');
  assert.equal(f.model.requests.length, asked, 'the namer is never called for it');

  // Renamed back to "New surface" by the person: still the person's name, never Exo's.
  await rename('Cabin trip', 'New surface');
  await until('the sidebar shows New surface', () => entries().at(-1) === 'New surface');
  await turn(made, 'And a canoe');
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(await listedName(made), 'New surface');
  assert.equal(f.model.requests.length, asked);
});

test('acceptance-rename: a rename landing while the naming call is in flight wins', async () => {
  f.model.state.reply = 'Exo name';
  const made = await newSurface();
  const asked = f.model.requests.length;
  f.model.state.hold = true;
  await turn(made, 'Sort out the garage');
  await until('the naming call in flight', () => f.model.requests.length > asked);
  await rename('New surface', 'Garage');
  await until('the sidebar shows Garage', () => entries().at(-1) === 'Garage');
  f.model.release();
  await until('the namer gives way', () => f.logs.some(l => l.includes(made) && l.includes('keeps the person\'s name')));
  await new Promise(r => setTimeout(r, 500));
  assert.equal(await listedName(made), 'Garage');
  assert.equal(entries().at(-1), 'Garage');
});

test('the rename RPC refuses Home, an empty name, a too long name and a thread that is not a bound Exo surface', async () => {
  const surface = (await f.rpc.thread_list(null)).threads.at(-1)!.threadId;
  await assert.rejects(f.rpc.thread_rename({ threadId: f.setup.threadId, name: 'My home' }), /Home/);
  assert.equal((await f.rpc.thread_list(null)).threads[0].title, 'Home');
  await assert.rejects(f.rpc.thread_rename({ threadId: surface, name: '   ' }), /empty/);
  await assert.rejects(f.rpc.thread_rename({ threadId: surface, name: 'x'.repeat(81) }), /80/);
  await assert.rejects(f.rpc.thread_rename({ threadId: 'not-a-surface', name: 'Backyard' }), /Exo surface/);
  // The sidebar shows the refusal and keeps the field open.
  const listed = entries().at(-1)!;
  fireEvent.click(sidebar().getAllByRole('button', { name: `Rename ${listed}` }).at(-1)!);
  const field = sidebar().getByRole('textbox', { name: 'Surface name' });
  fireEvent.change(field, { target: { value: ' ' } });
  fireEvent.keyDown(field, { key: 'Enter' });
  await until('the refusal shown', () => /empty/.test(sidebar().queryByRole('alert')?.textContent ?? ''));
  assert.ok(sidebar().queryByRole('textbox', { name: 'Surface name' }));
  fireEvent.keyDown(sidebar().getByRole('textbox', { name: 'Surface name' }), { key: 'Escape' });
  assert.equal(entries().at(-1), listed);
});

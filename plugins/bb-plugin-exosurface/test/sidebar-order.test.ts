// #186 (spec pages-and-activity N9, N5; acceptance-tree-newest-first, acceptance-tree-new-first): the tree's order by last
// activity, as N9 defines it. Rendered sidebar (package.json bb.app) on the live
// entry points (server.ts RPCs and events, host.ts bridge, the release owner, real Pi and its session journals); fake at
// the boundaries: BB, OptChat and the models. Only the listed names are compared, as strings.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';
import { waiter } from './wait.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp();
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
after(async () => {
  try {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 500));
  } finally { await f.model.close(); rmSync(f.root, { recursive: true, force: true }); }
});
const { fireEvent } = kit.testing;
const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
/** The sidebar's surfaces in screen order: Home, then the tree's top level. */
const entries = () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => String(li.textContent));
const until = waiter(() => `sidebar ${JSON.stringify(entries())}`);
const boundaries = (threadId: string) => host.deltas(threadId).filter(d => d.kind === 'turn.boundary').length;
const ids = async () => (await f.rpc.thread_list(null)).threads.map((t: any) => t.threadId as string);
/** The person presses New surface; BB starts the new thread with its first message. Returns the new surface's thread. */
async function newSurface() {
  const before = await ids(), count = entries().length;
  const button = [...sidebar()!.querySelectorAll('button')].find(b => b.textContent === 'New surface')!;
  fireEvent.click(button);
  await until('the new surface listed', () => entries().length === count + 1);
  const made = (await ids()).find(id => !before.includes(id))!;
  assert.equal((await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  await until('the new surface settles', () => boundaries(made) > 0);
  return made;
}
/** The person's message on a surface (exo_send, as its input sends), until Exo's turn has ended. */
async function turn(threadId: string, text: string) {
  const before = boundaries(threadId);
  await f.rpc.exo_send({ threadId, text });
  await until(`the turn ${JSON.stringify(text)}`, () => boundaries(threadId) > before, 30000);
}

test('acceptance-tree-newest-first: after a send on "Garden plan", the less recently active of two surfaces, and Exo\'s finished turn, the tree lists "Garden plan", then "Weekend trip"', async () => {
  await until('Home listed', () => entries().join('|') === 'Home');
  const weekend = await newSurface();
  await f.rpc.thread_rename({ threadId: weekend, name: 'Weekend trip' });
  const garden = await newSurface();
  await turn(weekend, 'Plan a weekend trip to the coast');
  // Renamed after Weekend trip's turn: a rename is not activity, so Garden plan stays below.
  await f.rpc.thread_rename({ threadId: garden, name: 'Garden plan' });
  await until('Weekend trip, the more recently active, listed first', () => entries().join('|') === 'Home|Weekend trip|Garden plan');

  await turn(garden, 'Lay out three raised beds');
  await until('Garden plan rises above Weekend trip', () => entries().join('|') === 'Home|Garden plan|Weekend trip');
  assert.deepEqual(entries(), ['Home', 'Garden plan', 'Weekend trip']);
});

test('acceptance-tree-new-first: with two surfaces, New surface lists the new surface first, above both others', async () => {
  await until('two surfaces listed', () => entries().length === 3);
  const others = entries().slice(1).sort();
  assert.deepEqual(others, ['Garden plan', 'Weekend trip']);
  const button = [...sidebar()!.querySelectorAll('button')].find(b => b.textContent === 'New surface')!;
  fireEvent.click(button);
  await until('the new surface listed', () => entries().length === 4);
  assert.deepEqual(entries().slice(0, 2), ['Home', 'New surface']);
});

test('a send alone is activity (N9): right after a send from the input of the least recently active surface, before Exo\'s turn ends, the tree lists it first', async () => {
  // #187 follow-up: the order before is New surface, Garden plan, Weekend trip; the person opens Weekend trip and sends a
  // message Exo answers only once released.
  await until('three surfaces listed', () => entries().join('|') === 'Home|New surface|Garden plan|Weekend trip');
  const row = [...sidebar()!.querySelectorAll('li button')].find(b => b.textContent === 'Weekend trip')!;
  fireEvent.click(row);
  const weekend = (await f.rpc.thread_list(null)).threads.find((t: any) => t.title === 'Weekend trip')!.threadId as string;
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
  await until('Weekend trip in view with its input', () => !!input() && !input()!.disabled && !!sidebar()!.querySelector('li button[aria-current="page"]') && sidebar()!.querySelector('li button[aria-current="page"]')!.textContent === 'Weekend trip');
  const before = boundaries(weekend);
  fireEvent.change(input()!, { target: { value: 'hold: pack for the coast' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  await until('Weekend trip listed first while Exo works', () => entries().join('|') === 'Home|Weekend trip|New surface|Garden plan');
  assert.equal(boundaries(weekend), before, 'Exo\'s turn has not ended');
  for (const run of f.piRuns()) f.release(run.profile);
  await until('the held turn to end', () => boundaries(weekend) > before, 30000);
  assert.deepEqual(entries(), ['Home', 'Weekend trip', 'New surface', 'Garden plan']);
});

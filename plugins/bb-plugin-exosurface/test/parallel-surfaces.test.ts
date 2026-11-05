// #70 (spec pages-and-activity S6, S9, F5): Exo works on several surfaces at once and never switches the surface in view.
// The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on server.ts, a send
// goes through the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts). Fake: BB's host, OptChat,
// the model ("slow:" answers once the test releases it; "together" answers only while another surface's turn runs too, else "ALONE").
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge, release } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
const started = await host.start('primary');
assert.equal(started.error, undefined, JSON.stringify(started));
assert.ok(started.result?.providerThreadId, 'the bridge gives Home a provider thread');
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
// The plugin's page streams run as in BB; what they publish reaches the rendered app's realtime subscriptions.
const published: { channel: string; threadId: string | null; at: number }[] = [];
f.realtime.deliver = (channel, payload) => { published.push({ channel, threadId: (payload as any)?.threadId ?? null, at: inView.length }); void view.emitRealtime(channel, payload); };
const stopStreams = f.streams();
// The surface in view, as the sidebar marks it, sampled every 20 ms for the whole file.
const inView: string[] = [];
const sampler = setInterval(() => { inView.push(current().join('|')); }, 20);
after(async () => {
  clearInterval(sampler); stopStreams(); view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
const current = () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => b.textContent ?? '');
const open = (title: string) => fireEvent.click([...sidebar().querySelectorAll('li button')].find(b => b.textContent === title)!);
const block = () => view.container.querySelector('section[aria-label="Exo"]') as HTMLElement | null;
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
const pageText = () => view.container.textContent;
async function until(what: string, ok: () => boolean, ms = 20000) {
  for (let waited = 0; !ok(); waited += 50) {
    if (waited > ms) throw new Error(`Timed out waiting for ${what}; in view: ${current()}; page: ${pageText()}`);
    await new Promise(r => setTimeout(r, 50));
  }
}
async function send(text: string) {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
}
const ended = (threadId: string, reply: string) => host.turn(threadId).replies.includes(reply) && !!host.turn(threadId).end;
let surface = '', profile = '';

test('send on Home, open another surface before Exo finishes, Home\'s turn ends: the other surface stays in view', async () => {
  await until('Home in view', () => current().join() === 'Home');
  await send('slow: plan the week');
  await until('Home\'s block to say Exo is working', () => block()?.textContent === 'Exo is working on this page…');
  fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface')!);
  await until('the new surface in view', () => current().join() === 'New surface');
  const opened = inView.length;
  surface = (await f.rpc.thread_list(null)).threads[1].threadId;
  assert.equal((await host.start(surface, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  profile = f.piRuns().at(-1).profile;
  assert.equal(host.turn('primary').end, undefined, 'Home\'s turn was still running when the other surface opened');
  release(f, 'slow');
  await until('Home\'s turn to end', () => ended('primary', 'Exo (exo-optchat): slow: plan the week'));
  // Home's block has caught up with its finished turn (its owner state and journal), then one more full poll of the page.
  for (let i = 0; i < 100 && (await f.rpc.exo_block({ threadId: 'primary' })).working; i++) await new Promise(r => setTimeout(r, 50));
  assert.deepEqual(await f.rpc.exo_block({ threadId: 'primary' }), { working: false, words: 'Exo (exo-optchat): slow: plan the week' });
  await new Promise(r => setTimeout(r, 5500));
  assert.deepEqual([...new Set(inView.slice(opened))], ['New surface']);
  // Home's turn reached the app over realtime while the other surface was in view.
  assert.ok(published.some(p => p.channel === 'surface-main' && p.threadId === 'primary' && p.at >= opened), JSON.stringify(published));
  // The surface in view shows its own (empty) Exo block, never Home's reply.
  await until('the new surface\'s empty block', () => block()?.textContent === '');
  assert.equal(pageText().includes('plan the week'), false);
});

test('send on a surface, open Home before Exo finishes, send on Home: each Exo block holds its own reply', async () => {
  await send('together: book the cabin');
  await until('the surface\'s block to say Exo is working', () => block()?.textContent === 'Exo is working on this page…');
  open('Home');
  await until('Home in view', () => current().join() === 'Home');
  const home = inView.length;
  // Per-surface working status: Home shows its own last reply, not the other surface's busy state.
  await until('Home\'s own block', () => block()?.textContent === 'Exo (exo-optchat): slow: plan the week');
  const statuses = Object.fromEntries((await f.rpc.overview(null)).threads.map((t: any) => [t.id, t.status]));
  assert.deepEqual([statuses.primary, statuses[surface]], ['idle', 'running']);
  // S9: Home's send is never refused, queued or gated by the other surface's turn.
  assert.equal(input()!.disabled, false);
  assert.equal(host.turn(surface).end, undefined, 'the surface\'s turn was still running when Home sent');
  await send('together: plan the week');
  // The model answers a "together" turn only while the other surface's turn runs too: both replies prove the overlap.
  await until('Home\'s reply in its block', () => block()?.textContent === 'Exo (exo-optchat): together: plan the week');
  await until('the surface\'s turn to end', () => ended(surface, `Exo (${profile}): together: book the cabin`));
  await new Promise(r => setTimeout(r, 1000));
  assert.deepEqual([...new Set(inView.slice(home))], ['Home']);
  assert.ok(published.some(p => p.channel === 'surface-thread' && p.threadId === surface && p.at >= home), JSON.stringify(published));
  open('New surface');
  await until('the surface in view', () => current().join() === 'New surface');
  await until('the surface\'s reply in its block', () => block()?.textContent === `Exo (${profile}): together: book the cabin`);
  assert.equal(pageText().includes('plan the week'), false);
  open('Home');
  await until('Home\'s reply in its block', () => block()?.textContent === 'Exo (exo-optchat): together: plan the week');
  assert.equal(pageText().includes('book the cabin'), false);
});

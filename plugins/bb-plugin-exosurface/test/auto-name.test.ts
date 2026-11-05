// #82 (spec pages-and-activity N7, N5; acceptance-auto-name): a new surface is "New surface" until its first turn ends; then
// the naming model from its profile config names it once from the person's first message and Exo's reply. Home never is.
// Through the live entry points (server.ts RPCs, events and dispatch hook, host.ts bridge, the release owner, real Pi);
// fake at the boundaries: BB, OptChat, Exo's model (a Pi extension) and the namer's model (HTTP, test/fake-model-http.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp();
after(async () => {
  close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 500));
  await f.model.close();
  rmSync(f.root, { recursive: true, force: true });
});
const until = async (what: string, ok: () => boolean | Promise<boolean>, ms = 30000) => { for (let w = 0; !(await ok()); w += 50) { if (w > ms) throw new Error(`timed out waiting for ${what}\n${f.logs.join('\n')}`); await new Promise(r => setTimeout(r, 50)); } };
const boundaries = (threadId: string) => host.deltas(threadId).filter(d => d.kind === 'turn.boundary').length;
const primaryConfig = join(f.optchatHome, 'profiles', f.setup.profile, 'config.json');
const setNamer = (namer: object | undefined) => { const c = JSON.parse(readFileSync(primaryConfig, 'utf8')); if (namer) c.namer = namer; else delete c.namer; writeFileSync(primaryConfig, JSON.stringify(c)); };
/** New surface through the server, started by BB with its first message, as the sidebar's button does. */
async function newSurface() {
  const { threadId } = await f.rpc.thread_new(null);
  assert.equal((await host.start(threadId, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  await until('the new surface settles', () => boundaries(threadId) > 0);
  return threadId;
}
/** The person's message on a surface, through its input (exo_send), until Exo's turn has ended. */
async function turn(threadId: string, text: string) {
  const before = boundaries(threadId);
  await f.rpc.exo_send({ threadId, text });
  await until(`the turn ${JSON.stringify(text)}`, () => boundaries(threadId) > before);
}
const listed = async () => (await f.rpc.thread_list(null)).threads.map((t: any) => t.title);
/** The surface's name as the server lists it (thread_list, what every view reads). */
const listedName = async (threadId: string) => (await f.rpc.thread_list(null)).threads.find((t: any) => t.threadId === threadId)?.title;
/** A published log line about this surface at this level. */
const logged = (level: string, threadId: string, text: string | RegExp) => f.logs.some(l => l.startsWith(`${level}:`) && l.includes(threadId) && (typeof text === 'string' ? l.includes(text) : text.test(l)));

test('a new surface is named after its first turn from the namer\'s answer, in the rendered sidebar; a second turn does not rename it; Home keeps its name', async () => {
  f.model.state.reply = 'Spring vegetable garden';
  const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]')!;
  const entries = () => [...sidebar().querySelectorAll('li')].map(li => li.textContent);
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
  const { fireEvent } = kit.testing;
  try {
    await until('Home listed', () => entries().join('|') === 'Home');
    fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li'))!);
    await until('the new surface listed', () => entries().join('|') === 'Home|New surface');
    const made = (await f.rpc.thread_list(null)).threads[1].threadId;
    assert.equal((await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
    await until('the new surface ready', () => !!input() && !input()!.disabled && boundaries(made) > 0);
    await new Promise(r => setTimeout(r, 300));
    assert.deepEqual(entries(), ['Home', 'New surface'], 'not named before its first turn');
    assert.equal(f.model.requests.length, 0);

    const sent = boundaries(made);
    fireEvent.change(input()!, { target: { value: 'Help me plan a vegetable garden for spring' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('Exo\'s first turn ends', () => boundaries(made) > sent);
    await until('the sidebar shows the name', () => entries().join('|') === 'Home|Spring vegetable garden');
    // The namer was asked once, with the person's first message and Exo's reply.
    assert.equal(f.model.requests.length, 1);
    const asked = JSON.stringify(f.model.requests[0].body);
    assert.match(asked, /Help me plan a vegetable garden for spring/);
    assert.match(asked, /Exo \(exo-optchat-t[0-9a-f]{16}\): Help me plan a vegetable garden for spring/);

    const second = boundaries(made);
    f.model.state.reply = 'Something else entirely';
    fireEvent.change(input()!, { target: { value: 'Add tomatoes to the plan' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('Exo\'s second turn ends', () => boundaries(made) > second);
    await new Promise(r => setTimeout(r, 1500));
    assert.deepEqual(entries(), ['Home', 'Spring vegetable garden'], 'a second turn does not rename it');
    assert.equal(f.model.requests.length, 1, 'the namer is not asked again');

    // Home: its turns end too, and it is never named.
    const homeTurns = boundaries('primary');
    host.send('primary', 'plan the garden on Home');
    await until('Home\'s turn', () => boundaries('primary') > homeTurns);
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(entries()[0], 'Home');
    assert.equal((await listed())[0], 'Home');
    assert.equal(f.model.requests.length, 1);
  } finally { view.unmount(); f.realtime.deliver = undefined; }
});

test('the namer is the surface profile config\'s "namer" (provider, model, thinking); absent, openai/gpt-6-luna with thinking off', async () => {
  // Absent: the default, as the model receives it.
  setNamer(undefined);
  f.model.state.reply = 'Cabin trip';
  const plain = await newSurface(), seen = f.model.requests.length;
  await turn(plain, 'Book the cabin for June');
  await until('named', async () => (await listedName(plain)) === 'Cabin trip');
  const luna = f.model.requests[seen];
  assert.deepEqual([luna.path, luna.body.model, luna.body.reasoning?.effort], ['/v1/responses', 'gpt-6-luna', 'none']);

  // Set beside compactor in the profile config (a new surface's profile takes the primary's): claude-haiku-5-5 is accepted.
  setNamer({ provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'low' });
  f.model.state.reply = '"Tax return checklist."';
  const haiku = await newSurface();
  const own = JSON.parse(readFileSync(join(f.optchatHome, 'profiles', f.piRuns().at(-1).profile, 'config.json'), 'utf8'));
  assert.deepEqual(own.namer, { provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'low' }, 'the surface profile config holds the namer');
  await turn(haiku, 'What do I need for my tax return?');
  await until('named', async () => (await listedName(haiku)) === 'Tax return checklist');
  const asked = f.model.requests.at(-1)!;
  assert.deepEqual([asked.path.split('?')[0], asked.body.model], ['/v1/messages', 'claude-haiku-5-5']);
  // Thinking as the model receives it: Pi sends a managed-effort model's level as the trailing system message's effort.
  assert.equal(asked.body.messages.filter((m: any) => m.role === 'system').at(-1)?.output_config?.effort, 'low');
  assert.ok((await listed()).includes('Tax return checklist'));
  setNamer(undefined);
});

test('a failing namer leaves "New surface" and logs why; an invalid namer is never replaced by another model', async () => {
  f.model.state.fail = 400;
  const failing = await newSurface();
  await turn(failing, 'Sort out the garage');
  await until('the failure logged', () => logged('warn', failing, 'keeps "New surface"'));
  assert.ok(logged('warn', failing, 'openai/gpt-6-luna'), f.logs.join('\n'));
  assert.equal(await listedName(failing), 'New surface');
  // Named once: a later turn does not ask again, even after a failure.
  f.model.state.fail = undefined;
  const asked = f.model.requests.length;
  await turn(failing, 'Start with the shelves');
  await new Promise(r => setTimeout(r, 1500));
  assert.equal(f.model.requests.length, asked);
  assert.equal(await listedName(failing), 'New surface');

  // An invalid namer in the surface's profile config: no model is called at all.
  const invalid = await newSurface();
  const config = join(f.optchatHome, 'profiles', f.piRuns().at(-1).profile, 'config.json'), c = JSON.parse(readFileSync(config, 'utf8'));
  writeFileSync(config, JSON.stringify({ ...c, namer: { provider: 'openai', model: 'gpt-6-luna', thinking: 'none' } }));
  const before = f.model.requests.length;
  await turn(invalid, 'Plan the week');
  await until('the failure logged', () => logged('warn', invalid, /keeps "New surface".*Invalid "namer"/));
  assert.equal(f.model.requests.length, before);
  assert.equal(await listedName(invalid), 'New surface');
});

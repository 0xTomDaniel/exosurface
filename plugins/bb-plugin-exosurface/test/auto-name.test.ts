// #82 (spec pages-and-activity N7, N5; acceptance-auto-name): a new surface is "New surface" until the person's first message
// is sent; then, beside Exo's turn, the naming model from the Exosurface local config names it once from that message (and Exo's
// reply if it has already arrived). Home never is.
// Through the live entry points (server.ts RPCs, events and dispatch hook, host.ts bridge, the release owner, real Pi);
// fake at the boundaries: BB, OptChat, Exo's model (a Pi extension) and the namer's model (HTTP, test/fake-model-http.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';
import { waiter, settled } from './wait.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp();
after(async () => {
  try {
    close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 500));
  } finally { await f.model.close(); rmSync(f.root, { recursive: true, force: true }); }
});
const wait = waiter(() => f.logs.join('\n'));
const until = (what: string, ok: () => boolean | Promise<boolean>) => wait(what, ok, 30000);
/** Exo would act within moments of a turn's end: a wall-clock bounded wait for a change that must not come (false: none came). */
const unchanged = async (changed: () => boolean | Promise<boolean>) => !(await settled(changed, 1500));
const boundaries = (threadId: string) => host.deltas(threadId).filter(d => d.kind === 'turn.boundary').length;
/** The naming model in the Exosurface local config (EXO_CONFIG): set, or removed for the default. */
const setNamer = (namer: object | undefined) => { const c = JSON.parse(readFileSync(f.config, 'utf8')); if (namer) c.namer = namer; else delete c.namer; writeFileSync(f.config, JSON.stringify(c)); };
/** An OptChat profile rewritten as OptChat's own settings page saves it (pinned 0.8.6: settings-page update -> saveConfig of
 * loadConfig's result, which keeps only compactor, subagent and OptChat's settings keys), with one setting changed. */
const OPTCHAT_KEYS = ['compactor', 'subagent', 'subagentLevels', 'maxAgents', 'groupReports', 'previousExchange', 'previousExchangeKB', 'memorySearch', 'summaryAcceptBytes', 'jobs', 'refreshAt'];
const optchatRewrite = (profile: string) => {
  const file = join(f.optchatHome, 'profiles', profile, 'config.json'), raw = JSON.parse(readFileSync(file, 'utf8'));
  writeFileSync(file, JSON.stringify({ ...Object.fromEntries(Object.entries(raw).filter(([k]) => OPTCHAT_KEYS.includes(k))), jobs: 4 }, null, 2) + '\n');
};
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

test('a new surface is named from its first message by the namer\'s answer, in the rendered sidebar and the title at the top; a second turn does not rename it; Home keeps its name', async () => {
  f.model.state.reply = 'Spring vegetable garden';
  const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]')!;
  const entries = () => [...sidebar().querySelectorAll('li')].map(li => li.textContent);
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
  /** The surface's title at the top of the view (the header's text). */
  const title = () => view.container.querySelector('main h1')?.textContent ?? null;
  const { fireEvent } = kit.testing;
  try {
    await until('Home listed', () => entries().join('|') === 'Home');
    fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li'))!);
    await until('the new surface listed', () => entries().join('|') === 'Home|New surface');
    const made = (await f.rpc.thread_list(null)).threads[1].threadId;
    assert.equal((await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
    await until('the new surface ready', () => !!input() && !input()!.disabled && boundaries(made) > 0 && title() === 'New surface');
    assert.ok(await unchanged(() => f.model.requests.length > 0 || title() !== 'New surface'), 'not named before its first message');
    assert.deepEqual(entries(), ['Home', 'New surface'], 'not named before its first message');
    assert.equal(f.model.requests.length, 0);

    const sent = boundaries(made);
    fireEvent.change(input()!, { target: { value: 'Help me plan a vegetable garden for spring' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('Exo\'s first turn ends', () => boundaries(made) > sent);
    await until('the sidebar shows the name', () => entries().join('|') === 'Home|Spring vegetable garden');
    await until('the title shows the name', () => title() === 'Spring vegetable garden');
    // The namer was asked once, at the send, with the person's first message (Exo's reply only if it had already arrived).
    assert.equal(f.model.requests.length, 1);
    const asked = JSON.stringify(f.model.requests[0].body);
    assert.match(asked, /Help me plan a vegetable garden for spring/);

    const second = boundaries(made);
    f.model.state.reply = 'Something else entirely';
    fireEvent.change(input()!, { target: { value: 'Add tomatoes to the plan' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('Exo\'s second turn ends', () => boundaries(made) > second);
    assert.ok(await unchanged(() => f.model.requests.length > 1 || entries()[1] !== 'Spring vegetable garden' || title() !== 'Spring vegetable garden'), 'a second turn does not rename it');
    assert.deepEqual(entries(), ['Home', 'Spring vegetable garden'], 'a second turn does not rename it');
    assert.equal(title(), 'Spring vegetable garden');
    assert.equal(f.model.requests.length, 1, 'the namer is not asked again');

    // Home: its turns end too, and it is never named.
    const homeTurns = boundaries('primary');
    host.send('primary', 'plan the garden on Home');
    await until('Home\'s turn', () => boundaries('primary') > homeTurns);
    assert.ok(await unchanged(() => f.model.requests.length > 1 || entries()[0] !== 'Home'), 'Home is never named');
    assert.equal(entries()[0], 'Home');
    assert.equal((await listed())[0], 'Home');
    assert.equal(f.model.requests.length, 1);
  } finally { view.unmount(); f.realtime.deliver = undefined; }
});

test('acceptance-auto-name: the name shows in the title and the sidebar while Exo\'s first turn is still running, from the first message alone; it stays after the turn and a later send; the namer is asked once', async () => {
  f.model.state.reply = 'Garden beds while working';
  const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]')!;
  const entries = () => [...sidebar().querySelectorAll('li')].map(li => li.textContent);
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
  const title = () => view.container.querySelector('main h1')?.textContent ?? null;
  const { fireEvent } = kit.testing;
  try {
    await until('the sidebar listed', () => entries()[0] === 'Home');
    const count = entries().length;
    fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li'))!);
    await until('the new surface listed', () => entries().length === count + 1);
    const made = (await f.rpc.thread_list(null)).threads.at(-1)!.threadId;
    assert.equal((await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
    const profile = f.piRuns().at(-1).profile;
    await until('the new surface ready', () => !!input() && !input()!.disabled && boundaries(made) > 0 && title() === 'New surface');
    const asked = f.model.requests.length, sent = boundaries(made);

    // Exo's turn is held (the fake Exo model answers a "hold:" message only on release): the name must come meanwhile.
    fireEvent.change(input()!, { target: { value: 'hold: Help me plan raised garden beds' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('the title and the sidebar show the name while Exo\'s turn runs', () => title() === 'Garden beds while working' && entries().at(-1) === 'Garden beds while working');
    assert.equal(boundaries(made) === sent, true, 'Exo\'s turn had not ended when the name showed');
    assert.equal(f.model.requests.length - asked, 1);
    // Named from the person's first message alone: Exo's reply had not arrived.
    const prompt = JSON.stringify(f.model.requests[asked].body);
    assert.equal(prompt.includes('Help me plan raised garden beds'), true);
    assert.equal(prompt.includes('The reply:'), false);

    f.release(profile);
    await until('Exo\'s turn ends', () => boundaries(made) > sent);
    f.model.state.reply = 'Something else entirely';
    const later = boundaries(made);
    fireEvent.change(input()!, { target: { value: 'Add a herb bed' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('the later turn ends', () => boundaries(made) > later);
    assert.equal(await unchanged(() => f.model.requests.length - asked > 1 || title() !== 'Garden beds while working' || entries().at(-1) !== 'Garden beds while working'), true, 'the name stays after the turn and a later send');
    assert.equal(title(), 'Garden beds while working');
    assert.equal(entries().at(-1), 'Garden beds while working');
    assert.equal(await listedName(made), 'Garden beds while working');
    assert.equal(f.model.requests.length - asked, 1, 'the namer is asked once');
  } finally { view.unmount(); f.realtime.deliver = undefined; }
});

test('the namer is the Exosurface local config\'s "namer" (provider, model, thinking), kept through OptChat\'s own profile rewrites; absent, openai/gpt-6-luna with thinking off', async () => {
  // Absent: the default, as the model receives it.
  setNamer(undefined);
  f.model.state.reply = 'Cabin trip';
  const plain = await newSurface(), seen = f.model.requests.length;
  await turn(plain, 'Book the cabin for June');
  await until('named', async () => (await listedName(plain)) === 'Cabin trip');
  const luna = f.model.requests[seen];
  assert.deepEqual([luna.path, luna.body.model, luna.body.reasoning?.effort], ['/v1/responses', 'gpt-6-luna', 'none']);

  // Set in the local config: claude-haiku-5-5 is accepted, and OptChat rewriting the primary's and the new surface's profile
  // configs through its own writer (a settings change) does not lose it.
  setNamer({ provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'low' });
  optchatRewrite(f.setup.profile);
  f.model.state.reply = '"Tax return checklist."';
  const haiku = await newSurface();
  optchatRewrite(f.piRuns().at(-1).profile);
  await turn(haiku, 'What do I need for my tax return?');
  await until('named', async () => (await listedName(haiku)) === 'Tax return checklist');
  const asked = f.model.requests.at(-1)!;
  assert.deepEqual([asked.path.split('?')[0], asked.body.model], ['/v1/messages', 'claude-haiku-5-5']);
  // Thinking as the model receives it: Pi sends a managed-effort model's level as the trailing system message's effort.
  assert.equal(asked.body.messages.filter((m: any) => m.role === 'system').at(-1)?.output_config?.effort, 'low');
  assert.ok(logged('info', haiku, 'by anthropic/claude-haiku-5-5 thinking low'), f.logs.join('\n'));
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
  assert.ok(await unchanged(() => f.model.requests.length > asked), 'not asked again after a failure');
  assert.equal(f.model.requests.length, asked);
  assert.equal(await listedName(failing), 'New surface');

  // An invalid namer in the local config: naming fails loudly and no model is called at all.
  const invalid = await newSurface();
  setNamer({ provider: 'openai', model: 'gpt-6-luna', thinking: 'none' });
  const before = f.model.requests.length;
  await turn(invalid, 'Plan the week');
  await until('the failure logged', () => logged('warn', invalid, /keeps "New surface".*Invalid "namer"/));
  assert.equal(f.model.requests.length, before);
  assert.equal(await listedName(invalid), 'New surface');
  setNamer(undefined);
});

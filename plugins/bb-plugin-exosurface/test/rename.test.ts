// #83 (spec pages-and-activity N5 amended, N7; acceptance-rename): the person renames any surface but Home from the flat
// sidebar, any time; a surface the person renamed is never named again by Exo, even before its first turn, and a rename that
// lands while Exo's naming call is in flight wins. Rendered sidebar (package.json bb.app) on the live entry points (server.ts
// RPCs and events, host.ts bridge, the release owner, real Pi); fake at the boundaries: BB, OptChat and the models.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync, lstatSync, readlinkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';
import { waiter, settled } from './wait.ts';

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
const { fireEvent, within } = kit.testing;
const wait = waiter(() => f.logs.join('\n'));
const until = (what: string, ok: () => boolean | Promise<boolean>) => wait(what, ok, 30000);
/** Exo would act within moments of a turn's end: a wall-clock bounded wait for a change that must not come (false: none came). */
const unchanged = async (changed: () => boolean | Promise<boolean>) => !(await settled(changed, 1500));
const boundaries = (threadId: string) => host.deltas(threadId).filter(d => d.kind === 'turn.boundary').length;
const sidebar = () => within(view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement);
// The sidebar shows once the tab has read that Exo is set up (#130).
const entries = () => view.container.querySelector('nav[aria-label="Surfaces"]') ? sidebar().queryAllByRole('listitem').map((li: any) => li.textContent as string) : [];
/** The title at the top of the surface in view (the header's text). */
const title = () => view.container.querySelector('main h1')?.textContent ?? null;
/** Whether the sidebar shows an element of this role and name (a plain value to assert on, never the element). */
const shows = (role: string, name: string | RegExp) => sidebar().queryByRole(role, { name }) !== null;
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
  const shown = field.value;
  assert.equal(shown, from);
  fireEvent.change(field, { target: { value: to } });
  fireEvent.keyDown(field, { key: 'Enter' });
}

test('acceptance-rename: a surface Exo named, renamed to "Backyard" in the sidebar, keeps "Backyard" after a further turn; the namer is not asked again', async () => {
  await until('Home listed', () => entries().join('|') === 'Home');
  assert.equal(shows('button', /^Rename/), false, 'Home has no rename');
  f.model.state.reply = 'Spring vegetable garden';
  const made = await newSurface();
  await turn(made, 'Help me plan a vegetable garden for spring');
  await until('auto-named in the sidebar', () => entries().join('|') === 'Home|Spring vegetable garden');
  await until('auto-named in the title', () => title() === 'Spring vegetable garden');
  assert.equal(f.model.requests.length, 1);

  // Escape leaves the name as it was.
  fireEvent.click(sidebar().getByRole('button', { name: 'Rename Spring vegetable garden' }));
  const field = sidebar().getByRole('textbox', { name: 'Surface name' });
  fireEvent.change(field, { target: { value: 'Not this' } });
  fireEvent.keyDown(field, { key: 'Escape' });
  assert.equal(shows('textbox', 'Surface name'), false);
  assert.deepEqual(entries(), ['Home', 'Spring vegetable garden']);
  assert.equal(title(), 'Spring vegetable garden');

  await rename('Spring vegetable garden', '  Backyard ');
  await until('the sidebar shows Backyard', () => entries().join('|') === 'Home|Backyard');
  await until('the title shows Backyard', () => title() === 'Backyard');
  assert.equal(await listedName(made), 'Backyard');

  f.model.state.reply = 'Something else entirely';
  await turn(made, 'Add tomatoes along the fence');
  assert.ok(await unchanged(() => f.model.requests.length > 1 || entries().join('|') !== 'Home|Backyard' || title() !== 'Backyard'));
  assert.deepEqual(entries(), ['Home', 'Backyard']);
  assert.equal(title(), 'Backyard');
  assert.equal(await listedName(made), 'Backyard');
  assert.equal(f.model.requests.length, 1, 'the namer is not asked again');
});

test('acceptance-rename: a surface renamed before its first turn keeps the person\'s name after it; the namer is never asked', async () => {
  f.model.state.reply = 'Exo would call it this';
  const made = await newSurface();
  const asked = f.model.requests.length;
  await rename('New surface', 'Cabin trip');
  await until('the sidebar and the title show Cabin trip', () => entries().at(-1) === 'Cabin trip' && title() === 'Cabin trip');
  await turn(made, 'Book the cabin for June');
  assert.ok(await unchanged(() => f.model.requests.length > asked || entries().at(-1) !== 'Cabin trip' || title() !== 'Cabin trip'));
  assert.equal(entries().at(-1), 'Cabin trip');
  assert.equal(title(), 'Cabin trip');
  assert.equal(await listedName(made), 'Cabin trip');
  assert.equal(f.model.requests.length, asked, 'the namer is never called for it');

  // Renamed back to "New surface" by the person: still the person's name, never Exo's.
  await rename('Cabin trip', 'New surface');
  await until('the sidebar shows New surface', () => entries().at(-1) === 'New surface');
  await turn(made, 'And a canoe');
  assert.ok(await unchanged(() => f.model.requests.length > asked || entries().at(-1) !== 'New surface'));
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
  assert.ok(await unchanged(() => entries().at(-1) !== 'Garage' || title() !== 'Garage'));
  assert.equal(await listedName(made), 'Garage');
  assert.equal(entries().at(-1), 'Garage');
  assert.equal(title(), 'Garage');
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
  assert.equal(shows('textbox', 'Surface name'), true);
  fireEvent.keyDown(sidebar().getByRole('textbox', { name: 'Surface name' }), { key: 'Escape' });
  assert.equal(entries().at(-1), listed);
});

/** The top of the surface in view (its title and revision line), as queries; never held by an assert. */
const header = () => within(view.container.querySelector('main .exo-topline') as HTMLElement);
/** An element's opacity as the browser computes it from the app's own stylesheets (jsdom: no :hover, no layout or paint). */
const opacity = (el: Element) => Number(getComputedStyle(el).opacity || '1');
/** Whether a pencil shows faintly at rest (computed opacity strictly between 0 and 1: the stylesheet applied, and not hidden) and
 *  fully once it has keyboard focus, as computed style says; focus is left as it was. */
function pencilShows(button: HTMLElement) {
  const resting = opacity(button);
  button.focus();
  const focused = document.activeElement === button && button.tabIndex >= 0, shown = opacity(button);
  button.blur();
  return { resting: resting > 0 && resting < 1, focused, shown: shown === 1 };
}

test('acceptance-rename: the title at the top renames the surface in view (double-click, "Backyard", Enter); its pencil is keyboard focusable and shows on focus, as the sidebar\'s does; Home\'s title has neither', async () => {
  // Home in view: no pencil at the top, and a double-click on its title opens nothing.
  fireEvent.click(sidebar().getByRole('button', { name: 'Home' }));
  await until('Home in view', () => title() === 'Home');
  assert.equal(header().queryByRole('button', { name: /^Rename/ }) !== null, false, 'Home\'s title has no pencil');
  fireEvent.doubleClick(header().getByRole('heading'));
  assert.equal(header().queryByRole('textbox', { name: 'Surface name' }) !== null, false, 'Home\'s title does not turn into a field');
  assert.equal(title(), 'Home');

  f.model.state.reply = 'Patio lights';
  const made = await newSurface();
  await turn(made, 'Help me string lights over the patio');
  await until('named at the top', () => title() === 'Patio lights' && entries().at(-1) === 'Patio lights');

  // The pencil beside the title and the sidebar's, judged by computed style from the app's own stylesheets.
  assert.deepEqual(pencilShows(header().getByRole('button', { name: 'Rename Patio lights' })), { resting: true, focused: true, shown: true });
  assert.deepEqual(pencilShows(sidebar().getAllByRole('button', { name: 'Rename Patio lights' }).at(-1)!), { resting: true, focused: true, shown: true });

  // A refusal shows at the top and keeps the field open; Escape leaves the name as it was.
  fireEvent.doubleClick(header().getByRole('heading', { name: 'Patio lights' }));
  assert.equal((header().getByRole('textbox', { name: 'Surface name' }) as HTMLInputElement).value, 'Patio lights');
  fireEvent.change(header().getByRole('textbox', { name: 'Surface name' }), { target: { value: '  ' } });
  fireEvent.keyDown(header().getByRole('textbox', { name: 'Surface name' }), { key: 'Enter' });
  await until('the refusal shown at the top', () => /empty/.test(header().queryByRole('alert')?.textContent ?? ''));
  assert.equal(header().queryByRole('textbox', { name: 'Surface name' }) !== null, true);
  fireEvent.keyDown(header().getByRole('textbox', { name: 'Surface name' }), { key: 'Escape' });
  assert.equal(title(), 'Patio lights');

  // Double-click, type, Enter: the title and the sidebar show the new name, as the server lists it.
  fireEvent.doubleClick(header().getByRole('heading', { name: 'Patio lights' }));
  fireEvent.change(header().getByRole('textbox', { name: 'Surface name' }), { target: { value: 'Backyard' } });
  fireEvent.keyDown(header().getByRole('textbox', { name: 'Surface name' }), { key: 'Enter' });
  await until('the title and the sidebar show Backyard', () => title() === 'Backyard' && entries().at(-1) === 'Backyard');
  assert.equal(await listedName(made), 'Backyard');
  // The pencil opens the same field.
  fireEvent.click(header().getByRole('button', { name: 'Rename Backyard' }));
  assert.equal((header().getByRole('textbox', { name: 'Surface name' }) as HTMLInputElement).value, 'Backyard');
  fireEvent.keyDown(header().getByRole('textbox', { name: 'Surface name' }), { key: 'Escape' });
  assert.equal(title(), 'Backyard');
});

/** The Pi agent folder (PI_CODING_AGENT_DIR) of the namer's Pi while it runs: the child of this process that has one in its
 *  environment (the bridge and the owner do not). Linux /proc, as test/reap.ts. */
function namerFolder() {
  for (const pid of readdirSync('/proc').filter(d => /^\d+$/.test(d))) {
    try {
      if (Number(readFileSync(`/proc/${pid}/stat`, 'utf8').split(') ').at(-1)!.split(' ')[1]) !== process.pid) continue;
      const dir = /(?:^|\0)PI_CODING_AGENT_DIR=([^\0]*)/.exec(readFileSync(`/proc/${pid}/environ`, 'utf8'))?.[1];
      if (dir) return dir;
    } catch {} // a process gone meanwhile
  }
  return undefined;
}

test('a namer Pi that exits leaving a lock in its agent folder does not hold up the next surface\'s start; that folder holds no copied credentials and is gone after the naming', async () => {
  f.model.state.reply = 'Garden shed';
  const made = await newSurface();
  const asked = f.model.requests.length;
  f.model.state.hold = true;
  await turn(made, 'Clear out the garden shed');
  await until('the naming call in flight', () => f.model.requests.length > asked);
  let folder: string | undefined;
  await until('the namer\'s Pi found', () => (folder = namerFolder()) !== undefined);
  // Credentials are referenced, never copied: the key by command, and auth.json a link to the primary agent folder's.
  const providers = Object.values(JSON.parse(readFileSync(join(folder!, 'models.json'), 'utf8')).providers ?? {}) as { apiKey?: unknown }[];
  assert.ok(providers.length > 0, 'the namer\'s provider is configured');
  assert.deepEqual(providers.map(p => typeof p.apiKey === 'string' && p.apiKey.startsWith('!')), providers.map(() => true), 'every key is a reference');
  const auth = join(folder!, 'auth.json');
  assert.deepEqual([lstatSync(auth).isSymbolicLink(), readlinkSync(auth)], [true, join(f.home, 'pi-config', 'auth.json')], 'auth.json is a link, not a copy');
  // Pi's models-store.json is a plain file of this folder, so its lock ("<path>.lock", links unresolved) lands here too.
  await until('the namer\'s models-store.json', () => existsSync(join(folder!, 'models-store.json')));
  assert.equal(dirname(realpathSync(join(folder!, 'models-store.json'))), realpathSync(folder!));
  // What a namer Pi exiting between Pi's lock mkdir and its registration leaves behind (#147): an orphan, fresh lock.
  mkdirSync(join(folder!, 'models-store.json.lock'));
  f.model.release();
  await until('the namer has named it', () => f.logs.some(l => l.includes(made) && l.includes('named "Garden shed"')));
  // The next surface's Pi starts at once: its thread/start answers inside the bridge's deadline (newSurface).
  await newSurface();
  await until('the namer\'s folder removed', () => !existsSync(folder!));
});

test('real-install shape: the namer\'s provider credential lives only in the primary agent folder\'s auth.json (no key in models.json); the surface is named and that auth.json is left as it was', async () => {
  const agent = join(f.home, 'pi-config'), models = join(agent, 'models.json'), auth = join(agent, 'auth.json');
  const before = { models: readFileSync(models, 'utf8'), auth: existsSync(auth) ? readFileSync(auth, 'utf8') : undefined };
  const keyless = JSON.parse(before.models); delete keyless.providers.openai.apiKey;
  const credential = JSON.stringify({ openai: { type: 'api_key', key: 'fixture-auth-json-only' } }); // fake, as every fixture credential
  writeFileSync(models, JSON.stringify(keyless)); writeFileSync(auth, credential, { mode: 0o600 });
  try {
    f.model.state.reply = 'Bike repair';
    const asked = f.model.requests.length;
    const made = await newSurface();
    await turn(made, 'Fix the bike chain');
    const outcome = () => f.logs.find(l => l.includes(made) && (l.includes('named "') || l.includes('naming failed')));
    await until('the naming done', () => outcome() !== undefined);
    assert.match(outcome()!, /named "Bike repair" by openai\//, 'named with the auth.json credential, not failed');
    assert.equal(f.model.requests.length - asked, 1);
    assert.equal(readFileSync(auth, 'utf8'), credential, 'the primary auth.json is left as it was');
  } finally {
    writeFileSync(models, before.models);
    if (before.auth === undefined) rmSync(auth, { force: true }); else writeFileSync(auth, before.auth);
  }
});

test('an OAuth auth.json entry for the namer\'s provider (one Pi refreshes): the namer runs in the primary agent folder as before #147, no namer folder; that choice is logged once across two namings; the primary auth.json is left as it was', async () => {
  const agent = join(f.home, 'pi-config'), auth = join(agent, 'auth.json'), namers = join(f.home, 'namer');
  const before = { auth: existsSync(auth) ? readFileSync(auth, 'utf8') : undefined, config: readFileSync(f.config, 'utf8') };
  const oauth = JSON.stringify({ anthropic: { type: 'oauth', access: 'fixture-access', refresh: 'fixture-refresh', expires: Date.now() + 86_400_000 } }); // fake
  writeFileSync(auth, oauth, { mode: 0o600 });
  writeFileSync(f.config, JSON.stringify({ ...JSON.parse(before.config), namer: { provider: 'anthropic', model: 'claude-haiku-5-5', thinking: 'low' } }));
  const folders = () => existsSync(namers) ? readdirSync(namers).length : 0, already = folders();
  try {
    for (const [reply, text] of [['Tool shed', 'Sort the tool shed'], ['Pantry', 'Stock the pantry']]) {
      f.model.state.reply = reply;
      const made = await newSurface();
      const asked = f.model.requests.length;
      f.model.state.hold = true;
      await turn(made, text);
      await until('the naming call in flight', () => f.model.requests.length > asked);
      let folder: string | undefined;
      await until('the namer\'s Pi found', () => (folder = namerFolder()) !== undefined);
      assert.equal(folder, agent, 'the namer runs in the primary agent folder');
      assert.equal(folders(), already, 'no namer folder');
      f.model.release();
      await until('the naming done', () => f.logs.some(l => l.includes(made) && (l.includes('named "') || l.includes('naming failed'))));
    }
    assert.equal(f.logs.filter(l => l.includes('Surface namer runs in the primary Pi agent folder')).length, 1, 'logged once');
    assert.equal(readFileSync(auth, 'utf8'), oauth, 'the primary auth.json is left as it was');
  } finally {
    writeFileSync(f.config, before.config);
    if (before.auth === undefined) rmSync(auth, { force: true }); else writeFileSync(auth, before.auth);
  }
});

test('the namer\'s agent folder takes its provider from the primary agent folder\'s models.json with credentials by reference only: a literal key or header is never copied', async () => {
  const { namerAgentDir } = await import('../legacy/primary/src/surface-name.ts');
  const primary = join(f.root, 'primary-agent'); mkdirSync(primary);
  writeFileSync(join(primary, 'models.json'), JSON.stringify({ providers: {
    openai: { baseUrl: 'http://127.0.0.1:1/v1', apiKey: 'sk-literal-secret', headers: { 'x-team': '$TEAM_ID', 'x-token': 'literal-token' } },
    anthropic: { baseUrl: 'http://127.0.0.1:1', apiKey: '!security find-generic-password -w' } } }));
  const literal = namerAgentDir(f.home, primary, 'openai'), byCommand = namerAgentDir(f.home, primary, 'anthropic');
  assert.deepEqual(JSON.parse(readFileSync(join(literal, 'models.json'), 'utf8')), { providers: { openai: { baseUrl: 'http://127.0.0.1:1/v1', headers: { 'x-team': '$TEAM_ID' } } } });
  assert.deepEqual(JSON.parse(readFileSync(join(byCommand, 'models.json'), 'utf8')), { providers: { anthropic: { baseUrl: 'http://127.0.0.1:1', apiKey: '!security find-generic-password -w' } } });
  assert.deepEqual([readdirSync(literal), readdirSync(byCommand)], [['models.json'], ['models.json']], 'no primary auth.json: nothing but models.json, no key file');
  // With a primary auth.json (a Pi login), the namer's is a link to it: no copy, the primary file untouched.
  writeFileSync(join(primary, 'auth.json'), '{"openai":{"type":"api_key","key":"fixture-fake"}}');
  const linked = namerAgentDir(f.home, primary, 'openai');
  assert.deepEqual([readdirSync(linked).sort(), lstatSync(join(linked, 'auth.json')).isSymbolicLink(), readlinkSync(join(linked, 'auth.json'))], [['auth.json', 'models.json'], true, join(primary, 'auth.json')]);
  for (const dir of [literal, byCommand, linked]) rmSync(dir, { recursive: true, force: true });
  assert.equal(readFileSync(join(primary, 'auth.json'), 'utf8'), '{"openai":{"type":"api_key","key":"fixture-fake"}}', 'removing the namer folder leaves the primary auth.json');
});

// #69 (spec pages-and-activity S1, S2, E1-E4, E7): the surface view shows its page, one Exo block and one input, and no
// chat. The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on server.ts, a send goes through
// the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts). Fake: BB's host, OptChat, the model.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { liveFixture, owner, bridge, modelRequests } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
let ownerProcess = await owner(f);
let host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
// The provider thread each bridge start answered with (thread/start's public result), resumed after a restart.
// host.ts answers thread/start with a JSON-RPC result or error (legacy/primary/host.ts); a test reads only a success.
const startResponse = z.union([
  z.strictObject({ jsonrpc: z.literal('2.0'), id: z.number(), result: z.strictObject({ providerThreadId: z.string(), sessionRestorable: z.boolean() }) }),
  z.strictObject({ jsonrpc: z.literal('2.0'), id: z.number(), error: z.strictObject({ code: z.number(), message: z.string(), data: z.unknown().optional() }) }),
]);
const startedThread = (raw: unknown) => { const response = startResponse.parse(raw); assert.ok('result' in response, JSON.stringify(response)); return response.result.providerThreadId; };
const providerThreads = new Map<string, string>();
const started = await host.start('primary');
providerThreads.set('primary', startedThread(started));
assert.equal(started.error, undefined, JSON.stringify(started));
assert.ok(started.result?.providerThreadId, 'the bridge gives Home a provider thread');
const { kit, app, close, browser } = await renderedApp(), { fireEvent } = kit.testing;
// The Exosurface panel with Home (the primary thread) in view; every RPC it calls runs on server.ts.
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

const block = () => view.container.querySelector('section[aria-label="Exo"]') as HTMLElement | null;
// Exo's words in the block (since #79 the block opens with the person's latest message as a bubble above them).
const reply = () => block()?.querySelector('[data-exo-reply]') as HTMLElement | null;
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
const pageText = () => view.container.querySelector('main')!.textContent + (view.container.querySelector('form[aria-label="Message Exo"]')?.textContent ?? '');
const until = waiter(() => `page: ${pageText()}`);
async function send(text: string) {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
}
const count = (haystack: string, needle: string) => haystack.split(needle).length - 1;
// #215 helpers, typed at the fixture's untyped edges (Pi run records, the SDK app test kit).
// A Pi run record as the fake OptChat writes it (test/mock-bb.ts FAKE_OPTCHAT, pi-runs.jsonl).
const piRun = z.strictObject({ pid: z.number(), profile: z.string(), cwd: z.string(), model: z.string(), instructions: z.string(), pageExtensions: z.boolean(), sessionFile: z.string() });
const lastRun = () => piRun.parse(f.piRuns().at(-1));
const lastContext = (profile: string) => { const request = modelRequests(f).filter(r => r.profile === profile).at(-1); assert.ok(request, 'a model request'); return JSON.stringify(request.messages); };
const surface = (threadId: string) => f.rpc.workspace({ deployment: 'main', threadId, cursor: null });
const checkpointOf = (workspace: Awaited<ReturnType<typeof surface>>) => { const checkpoint = workspace.delivery.checkpoint; assert.ok(checkpoint, 'a committed checkpoint'); return checkpoint; };
const surfaceThread = async () => { const thread = (await f.rpc.thread_list(null)).threads[1]; assert.ok(thread, 'a second surface'); return thread.threadId; };
const stage = async (threadId: string) => (await surface(threadId)).delivery.checkpoint?.layout?.focus;
interface Screen { container: HTMLElement; getByRole(role: string, options: { name: string; exact?: boolean }): HTMLElement; queryByRole(role: string, options: { name: string; exact?: boolean }): HTMLElement | null; getByDisplayValue(value: string): HTMLElement; queryByDisplayValue(value: string): HTMLElement | null }
const screen = view as Screen;
const act = fireEvent as { click(element: Element): void; input(element: Element, init: { target: { value: string } }): void };
const busy = () => screen.container.querySelector('p.exo-status')?.getAttribute('data-busy');
// Exo's finished reply under the person's bubble; the offline model answers the notice of the person's page changes since
// its last turn instead of the message when there is one, so only who answered is checked.
const answered = (profile: string, bubble: string) => said() === bubble && !!reply()?.textContent.startsWith(`Exo (${profile}): `);

test('after a send and Exo\'s finished turn, the Exo block shows the reply, the input is shown and empty, and no chat shows', async () => {
  await send('plan the week');
  // E4: while Exo works, its block says so.
  await until('the block to say Exo is working', () => reply()?.textContent === 'Reading your message');
  await until('Exo\'s reply in the block', () => reply()?.textContent === 'Exo (exo-optchat): plan the week');
  assert.equal(input()!.value, '');
  // S1: no chat column and no transcript; the person's message is on screen only as the block's bubble and in Exo's words echoing it.
  assert.ok(view.queryByTestId('bb-thread-chat') === null, 'no chat column');
  assert.equal(count(pageText(), 'plan the week'), 2);
  // E7: only Exo writes the block; nothing in it takes the person's input.
  assert.equal(block()!.querySelectorAll('textarea, input, button, [contenteditable]').length, 0);
});

test('after a second send on the same topic, the Exo block shows only the reply to the new message', async () => {
  await send('plan the week, with Friday off');
  await until('the new reply in the block', () => reply()?.textContent === 'Exo (exo-optchat): plan the week, with Friday off');
  assert.equal(input()!.value, '');
  assert.ok(view.queryByTestId('bb-thread-chat') === null, 'no chat column');
  // E2: the earlier reply and messages are gone from the screen (they stay in the thread).
  assert.equal(count(pageText(), 'Exo (exo-optchat)'), 1);
  assert.equal(count(pageText(), 'plan the week'), 2); // the bubble and Exo's echo of the second message
});

test('a turn in which Exo says nothing leaves the Exo block empty', async () => {
  // Held until the block has been seen saying Exo is working, so the turn cannot end before the block shows it.
  await send('hold: quiet: only redraw the page');
  await until('the block to say Exo is working', () => reply()?.textContent === 'Reading your message');
  f.release(f.setup.profile);
  // The provider bridge reports the third turn's end to BB; then the block has caught up with it.
  const ended = () => { const d = host.deltas('primary'), third = d.filter(x => x.kind === 'turn.open')[2]; return !!third && d.slice(d.indexOf(third)).some(x => x.kind === 'turn.boundary'); };
  await until('the third turn to end', ended);
  await until('the block to stop saying Exo is working', () => block()?.querySelector('[role="status"]') === null);
  assert.equal(reply()!.textContent, '');
  assert.equal(input()!.value, '');
});

test('a surface made by New surface shows no transcript, not even its control first message; its Exo block shows only its own latest turn', async () => {
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
  fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface')!);
  await until('the new surface in view', () => [...sidebar().querySelectorAll('button[aria-current="page"]')].some(b => b.textContent === 'New surface'));
  // BB starts the spawned thread with its first message, as it does after spawn.
  const fresh = (await f.rpc["thread_list"](null)).threads[1].threadId;
  providerThreads.set(fresh, startedThread(await host.start(fresh, [{ type: 'text', text: f.spawns.at(-1).prompt }])));
  await until('the new surface to be ready with an empty Exo block', () => !!input() && !input()!.disabled && reply()?.textContent === '');
  // S1: New surface's control first message is no transcript line anywhere in the view (sidebar, page, Exo block, input).
  const control = '/exosurface-new-surface', shown = () => view.container.textContent!.includes(control) || input()!.value.includes(control);
  assert.equal(f.spawns.at(-1).prompt, control);
  assert.equal(shown(), false);
  await send('book the cabin');
  const profile = f.piRuns().at(-1).profile;
  await until('the new surface\'s reply in its block', () => reply()?.textContent === `Exo (${profile}): book the cabin`);
  assert.equal(input()!.value, '');
  assert.equal(count(pageText(), 'Exo ('), 1);
  assert.equal(count(pageText(), 'Friday'), 0);
  assert.equal(shown(), false);
});

test('each page\'s Exo block shows the person\'s latest message on that page and Exo\'s reply to it, never a turn on another page', async () => {
  // #134, owner ruling 2026-11-06 (spec E1, E8): on the New surface in view, turns drawing different pages, then the earlier
  // page picked from the page strip. Real turns on the thread's own journal; the association is the app's to find.
  const profile = f.piRuns().at(-1).profile, said = () => block()?.querySelector('[data-exo-said]')?.textContent ?? '';
  const strip = () => [...view.container.querySelectorAll('nav button[aria-pressed]')] as HTMLElement[];
  const turn = async (text: string) => { await send(text); await until(`Exo's reply to ${JSON.stringify(text)}`, () => reply()?.textContent === `Exo (${profile}): ${text}`); };
  await turn('draw week: Week plan');
  await turn('draw garden: Garden plan');
  await turn('and the roses by the fence');
  await until('the week page as a pill', () => strip().some(b => b.textContent === 'Week plan'));
  fireEvent.click(strip().find(b => b.textContent === 'Week plan')!);
  await until('the week page\'s own message in its block', () => said() === 'draw week: Week plan');
  assert.equal(reply()!.textContent, `Exo (${profile}): draw week: Week plan`);
  assert.equal(count(block()!.textContent!, 'Garden'), 0);
  assert.equal(count(block()!.textContent!, 'roses'), 0);
  // Back on the latest page: its own latest message, a turn that drew nothing while it was the topic.
  fireEvent.click(view.getByRole('button', { name: 'Back to the current topic' }));
  await until('the garden page\'s own message in its block', () => said() === 'and the roses by the fence');
  assert.equal(reply()!.textContent, `Exo (${profile}): and the roses by the fence`);
  assert.equal(count(block()!.textContent!, 'Week'), 0);
});

test('after Exo withdraws the page in view, a message that draws nothing shows in the Exo block of the page that comes back into view', async () => {
  // #134 review: week drawn, then garden; Exo withdraws garden (revision 2 to 3) and the stage falls back to week; the next
  // message draws nothing, so it is on week, the page in view.
  const profile = f.piRuns().at(-1).profile, said = () => block()?.querySelector('[data-exo-said]')?.textContent ?? '';
  const withdraw = 'call: {"baseRevision":2,"delete":["garden"]}';
  await send(withdraw);
  await until('the garden page withdrawn and the week page in view', () => !pageText().includes('Garden plan') && pageText().includes('Week plan'));
  await send('and the hedge along the path');
  await until('the week page\'s latest message and Exo\'s reply in its block', () => reply()?.textContent === `Exo (${profile}): and the hedge along the path`);
  assert.equal(said(), 'and the hedge along the path');
  assert.equal(count(block()!.textContent!, 'draw week'), 0);
});

// #187 (spec pages-and-activity E10, S3): a send or a press is on the page in view it came from.
const said = () => block()?.querySelector('[data-exo-said]')?.textContent ?? '';
const inView = () => [...view.container.querySelectorAll('.exo-stage [data-surface]')].map(s => s.getAttribute('data-surface')).join(',');

test('pages-and-activity#acceptance-exo-block-sent-page: a question sent from the kept page and answered without changing any page shows in that page\'s Exo block', async () => {
  const profile = f.piRuns().at(-1).profile, strip = () => [...view.container.querySelectorAll('nav button[aria-pressed]')] as HTMLElement[];
  const turn = async (text: string, answer = `Exo (${profile}): ${text}`) => { await send(text); await until(`Exo's reply to ${JSON.stringify(text)}`, () => reply()?.textContent === answer); };
  // The kept page, with a button, made in reply to one message; a later page made in reply to another.
  const revision = Number(view.getByLabelText('Surface revision').textContent!.replace('Revision ', ''));
  const snapshot = '- region "Plum plan" [ref=plum]:\n  - heading "Plum plan" [ref=title]\n  - button "Pick plums" [ref=pick] [action=pick]';
  await turn(`call: ${JSON.stringify({ baseRevision: revision, snapshot })}`);
  await until('Keep on the idle plum page', () => !!view.queryByRole('button', { name: 'Keep', exact: true }) && view.container.querySelector('p.exo-status')?.getAttribute('data-busy') === 'false');
  fireEvent.click(view.getByRole('button', { name: 'Keep', exact: true }));
  await until('plum marked kept', () => !!view.queryByRole('button', { name: 'Plum plan (kept)', exact: true }));
  await turn('draw pear: Pear plan');
  fireEvent.click(view.getByRole('button', { name: 'Plum plan (kept)', exact: true }));
  await until('the plum page in view', () => inView() === 'plum');
  const surfaceName = view.container.querySelector('nav[aria-label="Surfaces"] li button[aria-current="page"]')!.textContent!;
  const surfaceRow = (name: string) => [...view.container.querySelectorAll('nav[aria-label="Surfaces"] li button')].find(button => button.textContent === name)!;
  fireEvent.click(view.getByRole('button', { name: 'Settings', exact: true }));
  await until('settings in view', () => !!view.queryByRole('button', { name: 'Close', exact: true }));
  fireEvent.click(view.getByRole('button', { name: 'Close', exact: true }));
  assert.equal(inView(), 'plum', 'closing settings restores the selected page');
  fireEvent.click(surfaceRow('Home'));
  await until('Home in view', () => view.container.querySelector('nav[aria-label="Surfaces"] button[aria-current="page"]')?.textContent === 'Home');
  await until('the original surface listed after navigation', () => !!surfaceRow(surfaceName));
  fireEvent.click(surfaceRow(surfaceName));
  await until('the earlier page restored on returning to its surface', () => inView() === 'plum');
  // Match the installed owner journal: origin, optchat.run, changed system prompt, user, no-draw assistant.
  writeFileSync(join(f.optchatHome, 'system-prompt'), 'Keep the full surface conversation.');
  const question = 'which plums are ripe?', originalSend = f.rpc["exo_send"];
  const payloads: unknown[] = [];
  f.rpc["exo_send"] = async payload => { payloads.push(payload); return originalSend(payload); };
  const threadId = (await f.rpc["thread_list"](null)).threads[1].threadId;
  try { await send(question); } finally { f.rpc["exo_send"] = originalSend; }
  await until('the question to reach the model', () => JSON.stringify(modelRequests(f).filter(r => r.profile === profile).at(-1)?.messages).includes(question));
  await until('the no-draw turn to finish', async () => !(await f.rpc["exo_block"]({ threadId })).working);
  assert.deepEqual(payloads, [{ threadId, text: question, page: 'plum' }]);
  const started = modelRequests(f).filter(r => r.profile === profile).at(-1)!.started;
  const user = started.findIndex(message => message.role === 'user' && JSON.stringify(message.content).includes(question));
  assert.ok(user >= 0 && started.slice(0, user).some(message => message.role === 'system'), 'Pi emits a system update before the question at its public message boundary');
  const context = JSON.stringify(modelRequests(f).filter(r => r.profile === profile).at(-1)?.messages);
  assert.ok(context.includes('Plum plan') && context.includes('Pear plan') && context.includes('book the cabin'), 'full thread context reaches the model, not just the selected page');
  const selected = await f.rpc["exo_block"]({ threadId, page: 'plum' });
  assert.equal(selected.said, question);
  assert.equal(selected.words, `Exo (${profile}): ${question}`);
  assert.equal((await f.rpc["exo_block"]({ threadId, page: 'pear' })).said, 'draw pear: Pear plan');
  await until('the selected page reply to render', () => reply()?.textContent === `Exo (${profile}): ${question}`);
  assert.equal(inView(), 'plum');
  assert.equal(said(), 'which plums are ripe?');
  assert.equal(reply()!.textContent, `Exo (${profile}): which plums are ripe?`);
});

// #215, pages-and-activity#acceptance-exo-block-sent-page: the diagnostic above can pass while the native stage and the
// model's current outline still name the later page. Sending from the earlier kept page makes it current first.
void test('a send from an earlier kept page makes it current in native state and the model context before Exo answers', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const context = lastContext(profile);
  assert.ok(context.includes('which plums are ripe?'), 'the actual UI question, not an earlier model request');
  const modelStage = [...context.matchAll(/EXOSURFACE revision \d+\. Stage: ([^.]+)\./g)].at(-1)?.[1];
  assert.deepEqual({ selectedPage: inView(), nativeStage: await stage(threadId), modelStage }, { selectedPage: 'plum', nativeStage: 'plum', modelStage: 'plum' });
});

// #215, acceptance-exo-block-sent-page: a press from an earlier kept page that is not native current.
void test('a button press from an earlier kept page makes it current before the model receives context', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  await send('draw quince: Quince plan');
  await until('the later quince page and reply', () => inView() === 'quince' && reply()?.textContent === `Exo (${profile}): draw quince: Quince plan`);
  act.click(screen.getByRole('button', { name: 'Plum plan (kept)', exact: true }));
  await until('the earlier plum page selected and idle', () => inView() === 'plum' && busy() === 'false');
  assert.equal(await stage(threadId), 'quince', 'viewing a page does not itself make it current');
  const before = modelRequests(f).length;
  act.click(screen.getByRole('button', { name: 'Pick plums' }));
  await until('the earlier-page press reply', () => modelRequests(f).length > before && reply()?.textContent === `Exo (${profile}): ▸ Plum plan · Pick plums`);
  assert.match(lastContext(profile), /EXOSURFACE revision \d+\. Stage: plum\./);
  assert.equal(await stage(threadId), 'plum');
  assert.equal(inView(), 'plum');
  assert.equal(said(), 'Pick plums');
});

// #215, acceptance-exo-block-sent-page on a page not kept: a form submit carries its values and makes the page current.
void test('submitting values from an earlier page not kept captures them and makes the page current before context', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const revision = (await surface(threadId)).revision;
  const snapshot = '- region "Field notes" [ref=notes]:\n  - heading "Field notes" [ref=title]\n  - textbox "Observation" [ref=observation]: initial\n  - button "Submit observation" [ref=submit] [action=submit] [sends=observation]';
  const draw = `call: ${JSON.stringify({ baseRevision: revision, snapshot })}`;
  await send(draw);
  await until('the notes page', () => inView() === 'notes' && reply()?.textContent === `Exo (${profile}): ${draw}`);
  await send('draw birch: Birch plan');
  await until('later birch in view', () => inView() === 'birch' && reply()?.textContent === `Exo (${profile}): draw birch: Birch plan`);
  act.click(screen.getByRole('button', { name: 'Field notes', exact: true }));
  await until('earlier notes controls ready', () => inView() === 'notes' && busy() === 'false');
  assert.equal(await stage(threadId), 'birch');
  const before = modelRequests(f).length;
  act.input(screen.getByDisplayValue('initial'), { target: { value: 'Three herons at dawn' } });
  act.click(screen.getByRole('button', { name: 'Submit observation', exact: true }));
  await until('the submitted observation reply', () => modelRequests(f).length > before && said() === 'Submit observation' && !!reply()?.textContent.includes('Three herons at dawn'));
  const checkpoint = checkpointOf(await surface(threadId)), context = lastContext(profile);
  assert.equal(checkpoint.layout?.focus, 'notes');
  assert.match(JSON.stringify(checkpoint), /Three herons at dawn/);
  assert.match(context, /EXOSURFACE revision \d+\. Stage: notes\./);
  assert.match(context, /Three herons at dawn/);
  assert.equal(inView(), 'notes');
});

// #215, pages-and-activity#acceptance-exo-block-own-page: a same-topic update stays on its page; a new page Exo draws
// carries that exchange, and the older page keeps its own (E10, call aa82a48).
void test('a same-topic update stays on its page; a new page Exo draws carries that exchange and the older page keeps its own', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const update = `call: ${JSON.stringify({ baseRevision: (await surface(threadId)).revision, edits: [{ page: 'notes', ref: 'title', op: 'replace', lines: '- heading "Field notes updated" [ref=title]' }] })}`;
  await send(update);
  await until('the same-topic update reply', () => reply()?.textContent === `Exo (${profile}): ${update}`);
  assert.equal(inView(), 'notes');
  assert.equal(await stage(threadId), 'notes');
  assert.equal(said(), update);
  const topic = 'draw cedar: Cedar plan';
  await send(topic);
  await until('the new page and its exchange in view together', () => inView() === 'cedar' && said() === topic && reply()?.textContent === `Exo (${profile}): ${topic}`);
  assert.equal(await stage(threadId), 'cedar');
  assert.equal((await f.rpc.exo_block({ threadId, page: 'cedar' })).said, topic, 'the new page carries the exchange');
  assert.equal((await f.rpc.exo_block({ threadId, page: 'notes' })).said, update, 'the older page keeps its own exchange');
});

// E10 (call aa82a48): a turn that changes a page is on that page; the person's page in view stays in view (F3).
void test('a turn that edits another page is on that page and does not change the page in view', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const edit = `call: ${JSON.stringify({ baseRevision: (await surface(threadId)).revision, edits: [{ page: 'notes', ref: 'title', op: 'replace', lines: '- heading "Background notes" [ref=title]' }] })}`;
  const asked = browser.scrolls.length;
  await send(edit);
  // F3: once the send's own scroll to the top is asked for, the person scrolls and clicks on the page in view while Exo's
  // turn changes another page.
  await until('the send\'s scroll to the top', () => browser.scrolls.length > asked);
  const page = screen.container.querySelector('main');
  assert.ok(page, 'the surface view');
  page.scrollTop = 120;
  const heading = screen.container.querySelector('main section[data-surface="cedar"] h1, main section[data-surface="cedar"] h2, main section[data-surface="cedar"] h3');
  assert.ok(heading, 'the cedar heading');
  act.click(heading);
  await until('the edit turn to finish', async () => !(await f.rpc.exo_block({ threadId })).working && JSON.stringify(checkpointOf(await surface(threadId))).includes('Background notes'));
  assert.equal(inView(), 'cedar');
  assert.equal(page.scrollTop, 120, 'no forced scroll after the person scrolled');
  assert.equal(browser.scrolls.length, asked + 1, 'only the send asked for a scroll');
  assert.equal(await stage(threadId), 'cedar');
  const notes = await f.rpc.exo_block({ threadId, page: 'notes' });
  assert.equal(notes.said, edit);
  assert.equal(notes.words, `Exo (${profile}): ${edit}`);
  assert.equal((await f.rpc.exo_block({ threadId, page: 'cedar' })).said, 'draw cedar: Cedar plan');
});

// E10: a turn that only withdraws a page changes no page left on the surface, so it is on the page it was sent from.
void test('a turn that only withdraws another page is on the page it was sent from', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  await send('draw elm: Elm plan');
  await until('the elm page and reply', () => inView() === 'elm' && reply()?.textContent === `Exo (${profile}): draw elm: Elm plan`);
  act.click(screen.getByRole('button', { name: 'Cedar plan', exact: true }));
  await until('cedar selected and idle', () => inView() === 'cedar' && busy() === 'false');
  // A question from cedar makes it current first, so the withdrawal below names the revision it is sent against.
  await send('what is left on cedar?');
  await until('cedar current after the question', async () => !(await f.rpc.exo_block({ threadId })).working && await stage(threadId) === 'cedar');
  const live = (w: Awaited<ReturnType<typeof surface>>) => JSON.stringify(checkpointOf(w).messages).includes('"surfaceId":"elm"');
  const before = await surface(threadId);
  assert.ok(live(before), 'elm on the surface before the withdrawal');
  const withdraw = `call: ${JSON.stringify({ baseRevision: before.revision, delete: ['elm'] })}`;
  await send(withdraw);
  await until('the withdrawal turn to finish', async () => !(await f.rpc.exo_block({ threadId })).working && (await surface(threadId)).revision > before.revision);
  assert.equal(live(await surface(threadId)), false, 'elm withdrawn from the surface');
  const cedar = await f.rpc.exo_block({ threadId, page: 'cedar' });
  assert.equal(cedar.said, withdraw);
  assert.equal(cedar.words, `Exo (${profile}): ${withdraw}`);
  await until('cedar in view', () => inView() === 'cedar');
});

void test('an edit of a value on another page starts no turn and changes no exchange or page in view', async () => {
  const threadId = await surfaceThread(), workspace = await surface(threadId);
  const before = await f.rpc.exo_block({ threadId, page: 'cedar' }), requests = modelRequests(f).length;
  const path = /"label":"Observation","value":\{"path":"([^"]+)"/.exec(JSON.stringify(checkpointOf(workspace).messages))?.[1];
  assert.ok(path, 'the Observation field path');
  await f.rpc.edit({ threadId, revision: workspace.revision, surfaceId: 'notes', updates: [{ path, value: 'Herons in the evening' }], mutationId: crypto.randomUUID() });
  const after = checkpointOf(await surface(threadId));
  assert.match(JSON.stringify(after), /Herons in the evening/);
  assert.equal(after.layout?.focus, 'cedar');
  assert.equal(inView(), 'cedar');
  assert.deepEqual(await f.rpc.exo_block({ threadId, page: 'cedar' }), before);
  assert.equal(modelRequests(f).length, requests);
});

// #215, acceptance-exo-block-sent-page on a page not kept: an ordinary message, with the full surface conversation; Home unchanged.
void test('a message from an earlier page not kept makes it current with the full conversation and leaves Home unchanged', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const home = await f.rpc.workspace({ deployment: 'main', cursor: null });
  await until('the renamed notes page in the strip', () => !!screen.queryByRole('button', { name: 'Background notes', exact: true }));
  act.click(screen.getByRole('button', { name: 'Background notes', exact: true }));
  await until('the earlier notes page selected', () => inView() === 'notes');
  assert.equal(await stage(threadId), 'cedar');
  const question = 'what did we observe at dawn?';
  await send(question);
  await until('the reply', () => answered(profile, question));
  assert.equal(await stage(threadId), 'notes');
  const context = lastContext(profile);
  assert.match(context, /EXOSURFACE revision \d+\. Stage: notes\./);
  for (const remembered of ['book the cabin', 'Three herons at dawn', 'Cedar plan']) assert.ok(context.includes(remembered), `full conversation keeps ${remembered}`);
  assert.equal(inView(), 'notes');
  assert.equal(said(), question);
  assert.deepEqual(await f.rpc.workspace({ deployment: 'main', cursor: null }), home);
  assert.equal((await f.rpc.thread_list(null)).threads[0]?.title, 'Home');
});

// The notes page's conversation card, as Exo's reply carried it, for the retired-page test after the restart.
let notesCard: string | undefined;
void test('restarting the owner and the provider keeps the current page, the full context and Home', async () => {
  const threadId = await surfaceThread();
  const before = checkpointOf(await surface(threadId)), home = (await f.rpc.thread_list(null)).threads[0];
  notesCard = /::exo-surface\{surface=\\"notes\\" revision=\\"(\d+)\\" action=\\"drew\\"\}/.exec(JSON.stringify(host.deltas(threadId)))?.[1];
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  ownerProcess = await owner(f); host = bridge(f);
  for (const id of ['primary', threadId]) assert.equal(startedThread(await host.start(id, undefined, providerThreads.get(id))), providerThreads.get(id), 'the provider thread resumed');
  assert.deepEqual(checkpointOf(await surface(threadId)), before);
  assert.deepEqual((await f.rpc.thread_list(null)).threads[0], home);
  const question = 'what survives restarting this surface?';
  await send(question);
  const profile = lastRun().profile;
  await until('the resumed surface reply', () => reply()?.textContent === `Exo (${profile}): ${question}`);
  const context = lastContext(profile);
  for (const remembered of ['book the cabin', 'Three herons at dawn', 'what did we observe at dawn?']) assert.ok(context.includes(remembered));
  assert.match(context, /EXOSURFACE revision \d+\. Stage: notes\./);
  assert.equal(inView(), 'notes');
});

interface Kit { renderSlot(slot: unknown, props: object, context: object): Screen & { unmount(): void } }
void test('a retired page brought back from its conversation card takes edited values and is current before its own context', async () => {
  const threadId = await surfaceThread(), profile = lastRun().profile, revision = notesCard;
  assert.ok(revision, 'the notes page conversation card');
  const before = (await surface(threadId)).revision;
  await send(`call: ${JSON.stringify({ baseRevision: before, delete: ['notes'] })}`);
  await until('the notes page retired', async () => { const w = await surface(threadId); return w.revision > before && !JSON.stringify(checkpointOf(w).messages).includes('"surfaceId":"notes"') && !(await f.rpc.exo_block({ threadId })).working; });
  const directive = (app as { messageDirectives: { id: string }[] }).messageDirectives.find(d => d.id === 'exo-surface');
  const chat = (kit as Kit).renderSlot(directive, { attributes: { surface: 'notes', revision, action: 'drew' }, message: { threadId } }, { rpc: f.rpc });
  try {
    const restore = chat.container.querySelector('button');
    assert.ok(restore, 'the conversation card button');
    act.click(restore);
    await until('the retired page and its original value', () => !!screen.container.querySelector('main section[data-surface="notes"]') && !!screen.queryByDisplayValue('initial'));
    act.input(screen.getByDisplayValue('initial'), { target: { value: 'Five swans at dusk' } });
    act.click(screen.getByRole('button', { name: 'Submit observation' }));
    await until('the restored-page press reply', () => answered(profile, 'Submit observation'));
    const context = lastContext(profile);
    assert.match(context, /EXOSURFACE revision \d+\. Stage: notes\./);
    assert.match(context, /Brought back notes.*it is on stage now/);
    assert.equal((await f.rpc.exo_block({ threadId, page: 'notes' })).said, 'Submit observation', 'the press is on the brought-back page');
    for (const text of ['Five swans at dusk', 'book the cabin', 'what survives restarting this surface?']) assert.ok(context.includes(text));
    assert.equal(await stage(threadId), 'notes');
    assert.equal(inView(), 'notes');
  } finally { chat.unmount(); }
});

// #215 busy behaviour, no worse than main: a message sent while Exo works goes to BB and brings no new error. Its page is
// recorded only while Exo is idle, as on main. This mock BB starts a second turn for it instead of queueing as BB does,
// so its answer is not asserted here.
void test('a message sent while Exo works goes to BB with no new error, not left in the input', async () => {
  const profile = lastRun().profile, threadId = await surfaceThread();
  const first = 'hold: compare the morning observations', second = 'include the evening observations too';
  const alert = () => screen.container.querySelector('form[aria-label="Message Exo"] [role="alert"]');
  await send(first);
  await until('the first message to reach the model', () => lastContext(profile).includes(first));
  assert.match(lastContext(profile), /EXOSURFACE revision \d+\. Stage: notes\./, 'the idle send made its page current');
  try {
    assert.equal((await f.rpc.exo_block({ threadId })).working, true);
    await send(second);
    await until('the second send taken or refused', () => input()?.value === '' || !!alert());
    assert.equal(alert(), null, 'no new error for a send while Exo works');
    assert.ok(JSON.stringify(f.sends).includes(JSON.stringify(second)), 'the second message reached BB');
  } finally {
    f.release(profile);
  }
});

// #69 (spec pages-and-activity S1, S2, E1-E4, E7): the surface view shows its page, one Exo block and one input, and no
// chat. The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on server.ts, a send goes through
// the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts). Fake: BB's host, OptChat, the model.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge, modelRequests } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
const started = await host.start('primary');
assert.equal(started.error, undefined, JSON.stringify(started));
assert.ok(started.result?.providerThreadId, 'the bridge gives Home a provider thread');
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
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
  const fresh = (await f.rpc.thread_list(null)).threads[1].threadId;
  assert.equal((await host.start(fresh, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
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
  await turn('draw pear: Pear plan');
  await until('the plum page as a pill', () => strip().some(b => b.textContent === 'Plum plan'));
  fireEvent.click(strip().find(b => b.textContent === 'Plum plan')!);
  await until('the plum page in view', () => inView() === 'plum');
  // Match the installed owner journal: origin, optchat.run, changed system prompt, user, no-draw assistant.
  writeFileSync(join(f.optchatHome, 'system-prompt'), 'Keep the full surface conversation.');
  const question = 'which plums are ripe?', originalSend = f.rpc.exo_send;
  const payloads: unknown[] = [];
  f.rpc.exo_send = async payload => { payloads.push(payload); return originalSend(payload); };
  const threadId = (await f.rpc.thread_list(null)).threads[1].threadId;
  try { await send(question); } finally { f.rpc.exo_send = originalSend; }
  await until('the question to reach the model', () => JSON.stringify(modelRequests(f).filter(r => r.profile === profile).at(-1)?.messages).includes(question));
  await until('the no-draw turn to finish', async () => !(await f.rpc.exo_block({ threadId })).working);
  assert.deepEqual(payloads, [{ threadId, text: question, page: 'plum' }]);
  const journal = readFileSync(f.piRuns().find(r => r.profile === profile).sessionFile, 'utf8');
  const entries = journal.trim().split('\n').map(line => JSON.parse(line));
  const origin = entries.findLastIndex(e => e.customType === 'exosurface-press' && e.data.line === question);
  const user = entries.findIndex((e, i) => i > origin && e.message?.role === 'user');
  assert.ok(origin >= 0 && user > origin, 'the selected-page origin precedes this question');
  assert.ok(entries.slice(origin + 1, user).some(e => e.message?.role === 'system'), 'real Pi journal interleaves a system message');
  const context = JSON.stringify(modelRequests(f).filter(r => r.profile === profile).at(-1)?.messages);
  assert.ok(context.includes('Plum plan') && context.includes('Pear plan') && context.includes('book the cabin'), 'full thread context reaches the model, not just the selected page');
  const selected = await f.rpc.exo_block({ threadId, page: 'plum' });
  assert.equal(selected.said, question);
  assert.equal(selected.words, `Exo (${profile}): ${question}`);
  assert.equal((await f.rpc.exo_block({ threadId, page: 'pear' })).said, 'draw pear: Pear plan');
  await until('the selected page reply to render', () => reply()?.textContent === `Exo (${profile}): ${question}`);
  assert.equal(inView(), 'plum');
  assert.equal(said(), 'which plums are ripe?');
  assert.equal(reply()!.textContent, `Exo (${profile}): which plums are ripe?`);
});

test('a press is on the page its button sits on: a press that draws nothing shows in that page\'s Exo block, not the page on stage', async () => {
  const profile = f.piRuns().at(-1).profile;
  assert.equal(inView(), 'plum', 'the kept plum page in view, the pear page on stage');
  await until('the page to take a press', () => !block()?.querySelector('[role="status"]') && view.container.querySelector('p.exo-status')?.getAttribute('data-busy') === 'false');
  fireEvent.click(view.getByRole('button', { name: 'Pick plums' }));
  await until('the press and Exo\'s reply in the plum page\'s block', () => reply()?.textContent === `Exo (${profile}): ▸ Plum plan · Pick plums`);
  assert.equal(inView(), 'plum');
  assert.equal(said(), 'Pick plums');
});

#!/usr/bin/env -S node --experimental-transform-types --no-warnings
// Exosurface surfaces demo (ADR 0002 fallback: BB is not on this box). Drives the live entry points through the mock-BB
// harness (test/mock-bb.ts): server.ts RPC (canonical_setup, thread_bind), host.ts provider bridge and the release owner
// (legacy/primary) on the real Pi CLI; fake BB, OptChat and model at the boundary. Needs build:owner and build:runtime.
// Usage: demo/surfaces <scenario>   Scenarios are dispatched by name; later tickets add theirs to SCENARIOS.
import type { ChildProcess } from 'node:child_process';
import { z } from 'zod';
import { readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, installedFixture, owner, bridge, stepsTurn, stepsShown, modelRequests } from '../test/mock-bb.ts';
import { exoTab } from '../test/exo-tab.ts';
import { renderedAppTyped as renderedApp, rightAligned, boxed, divided, pinnedToBottom, column, fadeStart, centeredIn } from '../test/app-render.ts';
import { waiter, settled } from '../test/wait.ts';
import { reapOnExit } from '../test/reap.ts';
import { required } from '../test/required.ts';

const content = z.array(z.object({ type: z.string(), text: z.string().optional() }));
const journalMessage = z.object({ type: z.literal('message'), message: z.discriminatedUnion('role', [
  z.object({ role: z.literal('user'), content: z.union([z.string(), content]) }),
  z.object({ role: z.literal('toolResult'), toolName: z.string(), isError: z.boolean(), content }),
]) });
const journalLine = z.object({ type: z.string() });
const journalRole = z.object({ message: z.object({ role: z.string() }) });
function messages(file: string) {
  return readFileSync(file, 'utf8').trim().split('\n').flatMap(line => {
    const raw: unknown = JSON.parse(line);
    if (journalLine.parse(raw).type !== 'message') return [];
    const { role } = journalRole.parse(raw).message;
    return role === 'user' || role === 'toolResult' ? [journalMessage.parse(raw).message] : [];
  });
}

function control(value: Element | null | undefined) {
  if (value instanceof HTMLInputElement || value instanceof HTMLTextAreaElement || value instanceof HTMLButtonElement || value instanceof HTMLSelectElement) return value;
  throw new Error('Expected a form control');
}

async function parallelThreads() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  try {
    const second = await f.rpc.thread_bind({ threadId: 'second' });
    console.log(`bound thread second -> its own OptChat profile ${second.profile} (instructions: the primary's AGENTS.md)`);
    for (const id of ['primary', 'second']) { const r = await host.start(id); if (r.error) throw new Error(`${id}: ${r.error.message}`); }
    host.send('primary', 'together: plan the week');
    host.send('second', 'together: book the cabin');
    await host.settled(['primary', 'second']);
    const runs = Object.fromEntries(f.piRuns().map(r => [r.profile, r]));
    let ok = true; const spans: Record<string, [number, number]> = {};
    const bindings: [string, string][] = [['primary', f.setup.profile], ['second', second.profile]];
    for (const [id, profile] of bindings) {
      const t = host.turn(required(id, "Expected demo element or value")); spans[id] = [t.open.at, t.end.at];
      console.log(`thread ${required(id, "Expected demo element or value").padEnd(7)} profile ${required(profile, "Expected demo element or value").padEnd(28)} pi ${runs[profile].pid}  turn ${String(t.open.at).padStart(5)}ms -> ${String(t.end.at).padStart(5)}ms  ${t.end.status}  reply: ${JSON.stringify(t.replies)}`);
      ok &&= t.end.status === 'completed' && t.replies.length === 1 && t.replies[0].startsWith(`Exo (${profile})`);
    }
    const overlap = required(spans['primary'], 'Expected primary turn')[0] < required(spans['second'], 'Expected second turn')[1] && required(spans['second'], 'Expected second turn')[0] < required(spans['primary'], 'Expected primary turn')[1];
    const refusals = host.lines.filter(l => l.value.error || l.value.method === 'error').length;
    console.log(`overlap: ${overlap ? 'yes' : 'NO'}  refusals: ${refusals}  (fake Pi answers a "together" turn only while the other thread's turn runs)`);
    if (!overlap || refusals || !ok) throw new Error('parallel-threads failed');
  } finally {
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000)); // Pi children stop with the owner.
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #68: the rendered Exosurface panel (package.json bb.app) on the real server RPCs; the person presses New surface.
async function newSurface() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f), { kit, app, close } = await renderedApp();
  const { fireEvent, waitFor, within, screen } = kit.testing;
  const panel = app.navPanels.find(p => p.path === 'surface');
  const view = kit.renderSlot(required(panel, "Expected demo element or value"), { subPath: '' }, { rpc: { thread_list: f.rpc.thread_list, thread_new: f.rpc.thread_new, workspace: f.rpc.workspace, exo_block: f.rpc.exo_block, exo_send: f.rpc.exo_send, canonical_setup_status: f.rpc.canonical_setup_status } });
  try {
    const sidebar = () => within(screen.getByRole('navigation', { name: 'Surfaces' }));
    const listed = () => sidebar().getAllByRole('listitem').map(li => li.textContent);
    await waitFor(() => { if (listed().length !== 1) throw new Error('sidebar not loaded'); });
    fireEvent.click(sidebar().getByRole('button', { name: 'New surface' }));
    await waitFor(() => { if (listed().length !== 2) throw new Error('no new surface listed'); }, { timeout: 10000 });
    // BB starts the spawned thread with its first message, as it does after spawn.
    const made = f.spawns.at(-1), threads = (await f.rpc.thread_list(null)).threads, fresh = required(threads[1], "Expected demo element or value").threadId;
    const started = await host.start(fresh, [{ type: 'text', text: made.prompt }]);
    if (started.error) throw new Error(started.error.message);
    await waitFor(async () => { if (!(await f.rpc.workspace({ deployment: 'main', threadId: fresh, cursor: null })).ready) throw new Error('not ready'); }, { timeout: 15000 });
    const current = sidebar().getAllByRole('button').filter(b => b.getAttribute('aria-current') === 'page').map(b => b.textContent);
    const main = document.querySelector('main[aria-label="Exo"]');
    const pages = required(main, "Expected demo element or value").querySelectorAll('[data-surface]').length, page = await f.rpc.workspace({ deployment: 'main', threadId: fresh, cursor: null });
    const inputs = [...document.querySelectorAll('textarea, input[type=text], [role=textbox]')].filter(e => !e.closest('nav'));
    const chat = document.body.textContent.includes(`ThreadChat stub (${fresh})`);
    const replies = host.deltas(fresh).filter(d => d.kind === 'item.textClose').length;
    console.log(`surface in view: ${current.join(', ')} (thread ${page.threadId})`);
    console.log(`  page: ${pages === 0 && page.revision === 0 && !page.delivery.checkpoint ? 'one empty page' : `${pages} drawn page(s), revision ${page.revision}`}`);
    console.log(`  input: ${inputs.length ? `shown, ${inputs.every(e => ('value' in e && typeof e.value === 'string' ? e.value : e.textContent) === '') ? 'empty' : 'NOT empty'}` : chat ? `BB's conversation input of thread ${fresh} (ThreadChat), a new thread with no draft` : 'NOT shown'}`);
    console.log(`  activity: ${replies} Exo message(s)`);
    console.log(`sidebar: ${listed().join(', ')}`);
    const runs = Object.fromEntries(f.piRuns().map(r => [r.profile, r.pid]));
    for (const t of threads) { const b = (await f.rpc.workspace({ deployment: 'main', ...(t.home ? {} : { threadId: t.threadId }), cursor: null })); console.log(`  ${t.title.padEnd(12)} thread ${t.threadId.padEnd(9)} pages of thread ${b.threadId}`); }
    console.log(`Exo runs: ${Object.entries(runs).map(([p, pid]) => `${p} (pi ${pid})`).join(', ')}`);
    const ok = current.length === 1 && current[0] === 'New surface' && page.threadId === fresh && pages === 0 && page.revision === 0 && (inputs.length ? inputs.every(e => ('value' in e && typeof e.value === 'string' ? e.value : e.textContent) === '') : chat)
      && replies === 0 && listed().join('|') === 'Home|New surface' && required(threads[0], "Expected demo element or value").threadId === f.setup.threadId && fresh !== f.setup.threadId && !made.parentThreadId;
    if (!ok) throw new Error('new-surface failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #69: the surface view (app.tsx, rendered) after two sends on one topic: one Exo block holding only the latest reply,
// the input shown and empty, no chat column and no transcript.
async function exoBlock() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const block = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const until = waiter();
  try {
    const sends = ['plan the week', 'plan the week, with Friday off'];
    for (const text of sends) {
      await until('the input', () => !!input() && !control(input()).disabled);
      fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } });
      fireEvent.click(view.getByRole('button', { name: 'Send' }));
      console.log(`sent: ${JSON.stringify(text)}`);
      await until(`the reply to ${JSON.stringify(text)}`, () => block()?.textContent === `Exo (${f.setup.profile}): ${text}`);
    }
    const page = required(view.container.querySelector('main'), "Expected demo element or value").textContent + required(view.container.querySelector('form[aria-label="Message Exo"]'), "Expected demo element or value").textContent;
    const chat = view.queryByTestId('bb-thread-chat') !== null, count = (s: string) => page.split(s).length - 1;
    // Only the latest turn is on screen: one reply from Exo, and the topic's words only in the bubble and the reply.
    const earlier = count(`Exo (${f.setup.profile})`) !== 1 || count(required(sends[0], "Expected demo element or value")) !== 2;
    console.log('--- the surface view after two sends ---');
    console.log(`page:      ${JSON.stringify(required(view.container.querySelector('main'), "Expected demo element or value").textContent.replace(required(block(), "Expected demo element or value").textContent, ''))}`);
    console.log(`Exo block: ${JSON.stringify(required(block(), "Expected demo element or value").textContent)}`);
    console.log(`input:     shown, value ${JSON.stringify(control(input()).value)}`);
    console.log(`chat column: ${chat ? 'SHOWN' : 'none'}   transcript (earlier reply or messages on screen): ${earlier ? 'SHOWN' : 'none'}`);
    if (chat || earlier || control(input()).value !== '' || required(block(), "Expected demo element or value").textContent !== `Exo (${f.setup.profile}): ${sends[1]}`) throw new Error('exo-block failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #70: two overlapping turns through the rendered surface view: send on Home, open the other surface before Exo finishes,
// send there too. The surface in view is the one the person opened throughout; afterwards each Exo block holds its own reply.
async function parallel() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const stopStreams = f.streams(), t0 = Date.now(), at = () => `${String(Date.now() - t0).padStart(6)}ms`;
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const current = () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => b.textContent).join('|');
  const click = (title: string) => fireEvent.click(required([...required(sidebar(), "Expected demo element or value").querySelectorAll('li button')].find(b => b.textContent === title), "Expected demo element or value"));
  const block = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const until = waiter();
  // The surface in view, sampled every 20 ms; each change is printed with what the person did last.
  let did = 'opened the panel', last = '', changes: { now: string; did: string }[] = [], watching = false;
  const sampler = setInterval(() => { const now = current(); if (now !== last) { last = now; console.log(`${at()}  in view: ${now || '(none)'}   after: ${did}`); if (watching) changes.push({ now, did }); } }, 20);
  const send = async (text: string) => { await until('the input', () => !!input() && !control(input()).disabled); fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' })); did = `sent ${JSON.stringify(text)} on ${current()}`; console.log(`${at()}  ${did}`); };
  try {
    await until('Home in view', () => current() === 'Home');
    fireEvent.click(required([...required(sidebar(), "Expected demo element or value").querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li')), "Expected demo element or value")); did = 'pressed New surface';
    await until('the new surface', () => current() === 'New surface');
    const surface = required((await f.rpc.thread_list(null)).threads[1], "Expected demo element or value").threadId;
    const started = await host.start(surface, [{ type: 'text', text: f.spawns.at(-1).prompt }]); if (started.error) throw new Error(started.error.message);
    const profile = f.piRuns().at(-1).profile;
    await until('the new surface ready', () => !!input() && !control(input()).disabled && block()?.textContent === '');
    click('Home'); did = 'opened Home';
    await until('Home in view', () => current() === 'Home');
    console.log(`--- two overlapping turns (fake model answers a "together" turn only while another surface's turn runs, else "ALONE") ---`);
    await new Promise(r => setTimeout(r, 100)); watching = true; // the sampler has seen Home in view
    await send('together: plan the week');
    await until('Home working', () => block()?.textContent === 'Reading your message');
    click('New surface'); did = 'opened New surface while Home\'s turn runs';
    await until('the new surface', () => current() === 'New surface');
    await send('together: book the cabin');
    await host.settled(['primary', surface]);
    const one = host.turn('primary'), two = host.turn(surface), overlap = one.open.at < two.end.at && two.open.at < one.end.at;
    console.log(`${at()}  both turns ended; Home's ${one.open.at}->${one.end.at}ms, New surface's ${two.open.at}->${two.end.at}ms (bridge clock), overlap: ${overlap ? 'yes' : 'NO'}`);
    await new Promise(r => setTimeout(r, 5500)); // one more full poll of the page in view
    watching = false;
    // After its first turn the surface is named by the fixture's namer (#82): the same surface under its new label.
    const same = (label: string) => label === f.model.state.reply ? 'New surface' : label;
    const stayed = changes.map(c => same(c.now)).filter((v, i, a) => v !== a[i - 1]).join(' > ') === 'New surface' && same(current()) === 'New surface';
    console.log(`surface in view throughout: ${['Home', ...changes.map(c => c.now)].join(' > ')} (${stayed ? 'only where the person went' : 'CHANGED BY EXO'})`);
    console.log('--- each surface\'s Exo block afterwards ---');
    await until('the new surface\'s reply', () => !!(block()?.textContent.startsWith('Exo (') || block()?.textContent.startsWith('ALONE')));
    const theirs = required(block(), "Expected demo element or value").textContent; console.log(`New surface: ${JSON.stringify(theirs)}`);
    click('Home'); did = 'went back to Home';
    await until('Home\'s reply', () => current() === 'Home' && !!block()?.textContent && required(block(), "Expected demo element or value").textContent !== 'Reading your message');
    const home = required(block(), "Expected demo element or value").textContent; console.log(`Home:        ${JSON.stringify(home)}`);
    const ok = stayed && overlap && home === `Exo (${f.setup.profile}): together: plan the week` && theirs === `Exo (${profile}): together: book the cabin`;
    if (!ok) throw new Error('parallel failed');
  } finally {
    clearInterval(sampler); stopStreams(); view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #79: the rendered surface view of a surface whose stored name is "Garden plan", after its sends: the name on top, then the
// Exo block opening the page (the latest message as a bubble, Exo's reply as plain text), then the page; no earlier message.
// #81 (owner walkthrough, PR #89): an earlier page about the week puts its pill in the page strip, which sits under the
// title, above the Exo block, set off from it by a hairline.
async function opening() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const surface = (await f.rpc.thread_new(null)).threadId;
  f.retitle(surface, 'Garden plan'); // BB's stored name of the thread
  const started = await host.start(surface, [{ type: 'text', text: f.spawns.at(-1).prompt }]); if (started.error) throw new Error(started.error.message);
  const { kit, app, close, browser } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const block = () => view.container.querySelector('section[aria-label="Exo"]'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const said = () => block()?.querySelector('[data-exo-said]'), reply = () => block()?.querySelector('[data-exo-reply]');
  const until = waiter(() => `page: ${main()?.textContent}`);
  try {
    await until('the sidebar', () => [...(sidebar()?.querySelectorAll('li button') ?? [])].some(b => b.textContent === 'Garden plan'));
    fireEvent.click(required([...required(sidebar(), "Expected demo element or value").querySelectorAll('li button')].find(b => b.textContent === 'Garden plan'), "Expected demo element or value"));
    const sends = ['draw week: Week plan', 'draw beds: Garden beds', 'add a row of tomatoes'], latest = sends.at(-1);
    let scroll = '';
    for (const text of sends) {
      await until('the input', () => !!input() && !control(input()).disabled && reply()?.textContent !== 'Reading your message');
      // The person has scrolled down the surface before the latest send (jsdom: the scroll container's position only).
      if (text === latest) required(main(), "Expected demo element or value").scrollTop = 400;
      const was = required(main(), "Expected demo element or value").scrollTop, asked = browser.scrolls.length;
      fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } });
      fireEvent.click(view.getByRole('button', { name: 'Send' }));
      console.log(`sent: ${JSON.stringify(text)}`);
      if (text === latest) { await until('the send accepted', () => control(input()).value === '' && said()?.textContent === text); scroll = `scrolled ${was} -> ${required(main(), "Expected demo element or value").scrollTop} after send, requested ${JSON.stringify(browser.scrolls.slice(asked))}`; console.log(`  ${scroll}`);
        await until('the working block', () => reply()?.textContent === 'Reading your message'); console.log(`  while working: bubble ${JSON.stringify(said()?.textContent)}, block ${JSON.stringify(required(reply(), "Expected demo element or value").textContent)}`); }
      await until(`the reply to ${JSON.stringify(text)}`, () => said()?.textContent === text && !!reply()?.textContent.startsWith('Exo (') && required(reply(), "Expected demo element or value").textContent.endsWith(`: ${text}`));
    }
    await until('the drawn page', () => !!required(main(), "Expected demo element or value").querySelector('[data-surface]')?.firstElementChild?.tagName.includes('-'));
    // Everything shown at the top of the surface, in screen (document) order.
    const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || getComputedStyle(at).display === 'none') return false; return true; };
    const parts = [...required(main(), "Expected demo element or value").querySelectorAll('h1, nav, [data-exo-said], [data-exo-reply], [data-surface]')].filter(el => shown(el) && (el.tagName !== 'NAV' || !!el.querySelector('button[aria-pressed]')));
    const kind = (el: Element) => el.tagName === 'H1' ? 'title' : el.tagName === 'NAV' ? 'strip' : el.hasAttribute('data-exo-said') ? 'bubble' : el.hasAttribute('data-exo-reply') ? 'reply' : 'page';
    const strip = parts.find(el => kind(el) === 'strip'), pillsOf = (el: Element) => JSON.stringify([...el.querySelectorAll('button[aria-pressed]')].map(b => b.textContent));
    // The page shows as its title and its rendered root element (its A2UI element, under this bundle's own tag name).
    const pageText = (el: Element) => `${JSON.stringify(el.getAttribute('aria-label'))}, rendered as <${el.firstElementChild?.tagName.toLowerCase()}>`;
    console.log('--- the surface view, top to bottom ---');
    for (const el of parts) {
      const k = kind(el); // presentation from computed styles (test/app-render.ts); true layout: the owner's RDP walkthrough
      console.log(`${k.padEnd(6)} ${k === 'page' ? pageText(el) : k === 'strip' ? `pills ${pillsOf(el)}  (${divided(el, required(block(), "Expected demo element or value")) ? 'hairline below it, before the Exo block' : 'NO hairline before the Exo block'})` : JSON.stringify(el.textContent)}${k === 'bubble' ? `  (${rightAligned(el) ? 'right-aligned' : 'NOT right-aligned'})` : ''}${k === 'reply' ? `  (${boxed(el, required(block(), "Expected demo element or value")) ? 'IN A BOX' : 'plain text, no box'})` : ''}`);
    }
    const first = sends.slice(0, -1).some(t => view.container.textContent.includes(t));
    console.log(`earlier messages ${sends.slice(0, -1).map(t => JSON.stringify(t)).join(', ')}: ${first ? 'SHOWN' : 'absent'}`);
    const order = parts.map(kind).join(' > ');
    console.log(`order: ${order}`);
    const viewOk = scroll.startsWith('scrolled 400 -> 0 after send') && order === 'title > strip > bubble > reply > page' && required(parts[0], "Expected demo element or value").textContent === 'Garden plan' && pillsOf(required(strip, "Expected demo element or value")) === '["Week plan"]' && divided(required(strip, "Expected demo element or value"), required(block(), "Expected demo element or value")) && required(said(), "Expected demo element or value").textContent === latest && required(reply(), "Expected demo element or value").textContent.endsWith(`: ${latest}`) && rightAligned(required(said(), "Expected demo element or value")) && !boxed(required(reply(), "Expected demo element or value"), required(block(), "Expected demo element or value")) && !first
      && ![...view.container.querySelectorAll('h1, h2, h3, h4, h5, h6')].some(h => h.textContent.includes('Exosurface'));
    // The same send to top for a person who asked their system for reduced motion (jsdom: the requested scroll only; the
    // visible easing is the owner's RDP re-check).
    browser.reducedMotion = true; required(main(), "Expected demo element or value").scrollTop = 400;
    const again = 'and some basil', before = browser.scrolls.length;
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: again } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('the reduced-motion send accepted', () => control(input()).value === '' && said()?.textContent === again);
    const reduced = JSON.stringify(browser.scrolls.slice(before)), behavior = (r: string) => r === '[{"top":0,"behavior":"smooth"}]' ? 'smooth' : r === '[{"top":0,"behavior":"auto"}]' ? 'instant' : `UNEXPECTED ${r}`;
    const requested = `scroll to top requested: ${behavior(scroll.slice(scroll.indexOf('requested ') + 10))} (reduced motion: ${behavior(reduced)})`;
    console.log(requested);
    await until('the reply to the reduced-motion send', () => !!(reply()?.textContent.endsWith(`: ${again}`)));
    const ok = requested === 'scroll to top requested: smooth (reduced motion: instant)' && viewOk;
    if (!ok) throw new Error('opening failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #81: one page at a time. A page about the week, then a message about the garden and Exo's finished turn (nobody scrolls,
// clicks or types): the rendered pages in view (one, the garden's) and the page strip's pills (the week's); then Exo asks
// for the garden page beside a new seed list page: still one page in view, the garden page a pill.
async function onePage() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]');
  const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('hidden') || getComputedStyle(at).display === 'none') return false; return true; };
  const inView = () => [...required(main(), "Expected demo element or value").querySelectorAll('section[data-surface]')].filter(shown).map(s => s.getAttribute('aria-label'));
  const pills = () => [...required(main(), "Expected demo element or value").querySelectorAll('nav button[aria-pressed]')].filter(shown).map(b => b.textContent);
  // The surface view top down: the title, the page strip (the navigation holding the pills), the Exo block, the page in view.
  const order = () => [...required(main(), "Expected demo element or value").querySelectorAll('h1, nav, section[aria-label="Exo"], section[data-surface]')].filter(el => shown(el) && (el.tagName !== 'NAV' || !!el.querySelector('button[aria-pressed]')))
    .map(el => el.tagName === 'H1' ? 'title' : el.tagName === 'NAV' ? `strip${divided(el, required(required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"]'), "Expected demo element or value")) ? ' (hairline below)' : ''}` : el.getAttribute('aria-label') === 'Exo' ? 'Exo block' : `page ${JSON.stringify(el.getAttribute('aria-label'))}`).join(' > ');
  const until = waiter(() => `in view ${JSON.stringify(inView())}`);
  const send = async (text: string, page: string) => {
    await until('the input', () => !!input() && !control(input()).disabled);
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply()?.textContent === `Exo (${f.setup.profile}): ${text}` && inView().includes(page));
    console.log(`sent ${JSON.stringify(text)}; Exo's turn finished, nothing scrolled, clicked or typed since`);
    console.log(`  pages in view (${inView().length}): ${JSON.stringify(inView())}`);
    console.log(`  page strip pills: ${JSON.stringify(pills())}`);
    console.log(`  top down: ${order()}`);
  };
  try {
    await send('draw week: Week plan', 'Week plan');
    await send('draw garden: Garden plan', 'Garden plan');
    const topic = JSON.stringify(inView()) === '["Garden plan"]' && JSON.stringify(pills()) === '["Week plan"]' && order() === 'title > strip (hairline below) > Exo block > page "Garden plan"';
    await send('draw seeds: Seed list beside garden', 'Seed list');
    const beside = JSON.stringify(inView()) === '["Seed list"]' && pills().includes('Garden plan');
    if (!topic || !beside) throw new Error('one page failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #142 (bug #134; spec E1, E8): turns on Home that draw different pages (the week's, then the garden's, then a message on
// the garden page that draws nothing); then the earlier page opened from the page strip, and back to the latest. For each page
// opened: the message bubble and reply its Exo block shows, which must be that page's own.
async function exoBlockOwnPage() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const said = () => required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"] [data-exo-said]')?.textContent ?? '', reply = () => required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"] [data-exo-reply]')?.textContent ?? '';
  const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || getComputedStyle(at).display === 'none') return false; return true; };
  const inView = () => [...required(main(), "Expected demo element or value").querySelectorAll('section[data-surface]')].filter(shown).map(s => s.getAttribute('aria-label')).join(', ');
  const pills = () => [...required(main(), "Expected demo element or value").querySelectorAll('nav button[aria-pressed]')].filter(shown);
  const until = waiter(() => `in view ${inView()}; bubble ${JSON.stringify(said())}; reply ${JSON.stringify(reply())}`);
  const own = { 'Week plan': 'draw week: Week plan', 'Garden plan': 'and the roses by the fence' };
  let ok = true;
  const show = async (how: string, page: keyof typeof own) => {
    await until(`${page} in view with its own block`, () => inView() === page && said() === own[page] && reply() === `Exo (${f.setup.profile}): ${own[page]}`);
    const other = Object.entries(own).filter(([p]) => p !== page).some(([, t]) => required(required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"]'), "Expected demo element or value").textContent.includes(t));
    console.log(`${how}: page in view ${JSON.stringify(inView())}`);
    console.log(`  Exo block bubble: ${JSON.stringify(said())}`);
    console.log(`  Exo block reply:  ${JSON.stringify(reply())}`);
    console.log(`  another page's turn in the block: ${other ? 'SHOWN' : 'none'}`);
    ok &&= !other;
  };
  try {
    for (const [text, page] of [['draw week: Week plan', 'Week plan'], ['draw garden: Garden plan', 'Garden plan'], ['and the roses by the fence', 'Garden plan']]) {
      await until('the input', () => !!input() && !control(input()).disabled);
      fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
      await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply() === `Exo (${f.setup.profile}): ${text}` && inView() === page);
      console.log(`sent ${JSON.stringify(text)}; Exo's turn finished; page in view ${JSON.stringify(inView())}`);
    }
    await show('latest page', 'Garden plan');
    await until('the week page as a pill', () => pills().some(b => b.textContent === 'Week plan'));
    fireEvent.click(required(pills().find(b => b.textContent === 'Week plan'), "Expected demo element or value"));
    await show('earlier page opened from the page strip', 'Week plan');
    fireEvent.click(view.getByRole('button', { name: 'Back to the current topic' }));
    await show('back to the current topic', 'Garden plan');
    // Exo withdraws the garden page (revision 2 to 3); the stage falls back to the week page, and a message that draws
    // nothing is on it.
    const withdraw = 'call: {"baseRevision":2,"delete":["garden"]}';
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: withdraw } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('the garden page withdrawn', () => !!(inView() === 'Week plan' && input() && !control(input()).disabled));
    console.log(`sent ${JSON.stringify(withdraw)}; Exo's turn finished; page in view ${JSON.stringify(inView())}`);
    const quiet = 'and the hedge along the path';
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: quiet } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
    own['Week plan'] = quiet;
    await show('after Exo withdrew the page in view, a message that draws nothing', 'Week plan');
    if (!ok) throw new Error('exo-block-own-page failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #187 (spec pages-and-activity E10, S3): the rendered surface view; Exo draws a kept page with a button, then a later page;
// the person opens the kept page from the page strip, sends a question Exo answers without changing any page, and presses
// the kept page's button, which draws nothing either. Each page's Exo block, as the view shows it.
async function exoBlockSentPage() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const said = () => required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"] [data-exo-said]')?.textContent ?? '', reply = () => required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"] [data-exo-reply]')?.textContent ?? '';
  const inView = () => [...required(main(), "Expected demo element or value").querySelectorAll('.exo-stage [data-surface]')].map(s => s.getAttribute('aria-label')).join(', ');
  const pills = () => [...required(main(), "Expected demo element or value").querySelectorAll('nav button[aria-pressed]')];
  const until = waiter(() => `in view ${inView()}; bubble ${JSON.stringify(said())}; reply ${JSON.stringify(reply())}`);
  const idle = () => !!input() && !control(input()).disabled && required(main(), "Expected demo element or value").querySelector('p.exo-status')?.getAttribute('data-busy') === 'false' && !required(main(), "Expected demo element or value").querySelector('section[aria-label="Exo"] [role="status"]');
  const answer = (text: string) => `Exo (${f.setup.profile}): ${text}`;
  const send = async (text: string, page: string) => {
    await until('the input', idle);
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply() === answer(text) && inView() === page);
    console.log(`sent ${JSON.stringify(text.length > 60 ? text.slice(0, 57) + '...' : text)}; Exo's turn finished; page in view ${JSON.stringify(inView())}`);
  };
  let ok = true;
  const show = (what: string, page: string, bubble: string, words: string) => {
    const right = inView() === page && said() === bubble && reply() === answer(words);
    console.log(`${what}: page in view ${JSON.stringify(inView())}`);
    console.log(`  Exo block bubble: ${JSON.stringify(said())}`);
    console.log(`  Exo block reply:  ${JSON.stringify(reply())}`);
    ok &&= right;
  };
  try {
    const snapshot = '- region "Plum plan" [ref=plum]:\n  - heading "Plum plan" [ref=title]\n  - button "Pick plums" [ref=pick] [action=pick]';
    await send(`call: ${JSON.stringify({ baseRevision: 0, snapshot })}`, 'Plum plan');
    await until('Keep on the idle drawn page', () => idle() && !!view.queryByRole('button', { name: 'Keep' }));
    fireEvent.click(view.getByRole('button', { name: 'Keep' }));
    await until('public canonical kept metadata', async () => (await f.rpc.workspace({ deployment: 'main', cursor: null })).delivery.checkpoint?.kept?.includes('plum') === true);
    await until('plum marked kept in the strip', () => !!view.queryByRole('button', { name: 'Plum plan (kept)' }));
    console.log('pressed literal Keep; canonical workspace delivery kept refs: [plum]; strip marks Plum plan kept');
    await send('draw pear: Pear plan', 'Pear plan');
    if (!view.queryByRole('button', { name: 'Plum plan (kept)' }) || !view.queryByRole('button', { name: 'Pear plan' })) throw new Error('kept and new page must both be listed');
    fireEvent.click(view.getByRole('button', { name: 'Plum plan (kept)' }));
    await until('the plum page in view', () => inView() === 'Plum plan');
    console.log('opened "Plum plan" from the page strip; "Pear plan" stays on stage');
    fireEvent.click(view.getByRole('button', { name: 'Settings' }));
    await until('settings opened', () => !!view.queryByRole('button', { name: 'Close' }));
    fireEvent.click(view.getByRole('button', { name: 'Close' }));
    fireEvent.click(required([...view.container.querySelectorAll('nav[aria-label="Surfaces"] > button')].find(button => button.textContent === 'New surface'), "Expected demo element or value"));
    await until('another surface opened', () => view.container.querySelector('nav[aria-label="Surfaces"] li button[aria-current="page"]')?.textContent !== 'Home');
    fireEvent.click(required([...view.container.querySelectorAll('nav[aria-label="Surfaces"] li button')].find(button => button.textContent === 'Home'), "Expected demo element or value"));
    await until('earlier selected page restored after away/back', () => inView() === 'Plum plan');
    console.log('Settings close and surface away/back preserve selected Plum plan, without changing the model stage');
    // #189: Pi journals an updated system prompt after the send's origin, before its user message.
    writeFileSync(join(f.optchatHome, 'system-prompt'), 'Keep the full surface conversation.');
    const question = 'which plums are ripe?', originalSend = f.rpc.exo_send, payloads: Parameters<typeof originalSend>[0][] = [];
    f.rpc.exo_send = async (payload: Parameters<typeof originalSend>[0]) => { payloads.push(payload); return originalSend(payload); };
    try { await send(question, 'Plum plan'); } finally { f.rpc.exo_send = originalSend; }
    if (JSON.stringify(payloads) !== JSON.stringify([{ threadId: 'primary', text: question, page: 'plum' }])) throw new Error('selected-page send payload differs');
    const request = modelRequests(f).filter(r => r.profile === f.setup.profile).at(-1);
    const user = required(request, "Expected demo element or value").started.findIndex(message => message.role === 'user' && JSON.stringify(message.content).includes(question));
    if (user < 0 || !required(request, "Expected demo element or value").started.slice(0, user).some(message => message.role === 'system')) throw new Error('Pi did not emit a system update before the question');
    const context = JSON.stringify(required(request, "Expected demo element or value").messages);
    if (!context.includes('Plum plan') || !context.includes('Pear plan')) throw new Error('model lost surface context');
    const selected = await f.rpc.exo_block({ threadId: 'primary', page: 'plum' }), newer = await f.rpc.exo_block({ threadId: 'primary', page: 'pear' });
    if (selected.said !== question || selected.words !== answer(question) || newer.said !== 'draw pear: Pear plan' || newer.words !== answer('draw pear: Pear plan')) throw new Error('public page association differs');
    console.log('Pi public message_start: system update -> question; selected-page RPC payload and both page associations verified; full thread context retained');
    show('after the question (draws nothing)', 'Plum plan', question, question);
    await until('the page to take a press', idle);
    fireEvent.click(view.getByRole('button', { name: 'Pick plums' }));
    const line = '▸ Plum plan · Pick plums';
    await until('Exo\'s finished turn on the press', () => reply() === answer(line));
    console.log(`pressed "Pick plums" on "Plum plan" (draws nothing); Exo's turn finished; page in view ${JSON.stringify(inView())}`);
    show('after the press', 'Plum plan', 'Pick plums', line);
    fireEvent.click(view.getByRole('button', { name: 'Back to the current topic' }));
    await until('the pear page in view', () => inView() === 'Pear plan' && said() === 'draw pear: Pear plan');
    show('back to the current topic', 'Pear plan', 'draw pear: Pear plan', 'draw pear: Pear plan');
    if (!ok) throw new Error('exo-block-sent-page failed');
  } finally {
    view.unmount(); close();
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running; fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #80: the rendered surface view with a drawn page: where the input sits, what its width follows, and where the fade over the
// content beneath it starts. Read from computed styles (test/app-render.ts); jsdom does no layout, so true layout and paint
// are the owner's RDP walkthrough.
async function inputFloats() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), form = () => view.container.querySelector('form[aria-label="Message Exo"]');
  const input = () => form()?.querySelector('textarea'), reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]');
  const until = waiter();
  const name = (el: Element | null) => el === main() ? 'the scrolling surface (main "Exo")' : el?.matches('form') ? 'the input itself' : el ? `the page's column (max-width ${getComputedStyle(el).maxWidth})` : 'the window';
  try {
    await until('the input', () => !!input() && !required(input(), "Expected demo element or value").disabled);
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: 'draw: Week plan' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    console.log('sent: "draw: Week plan"');
    await until('the drawn page', () => !!(!!required(main(), "Expected demo element or value").querySelector('[data-surface]') && reply()?.textContent.startsWith('Exo (')));
    const page = required(main(), "Expected demo element or value").querySelector('[data-surface]'), held = pinnedToBottom(required(form(), "Expected demo element or value")), col = column(required(page, "Expected demo element or value")), own = column(required(form(), "Expected demo element or value"));
    const after = held && !!(required(page, "Expected demo element or value").compareDocumentPosition(held.pinned) & Node.DOCUMENT_POSITION_FOLLOWING);
    const start = held ? fadeStart(held.pinned) : null, middle = held ? centeredIn(required(form(), "Expected demo element or value"), held.pinned) : false;
    console.log('--- the input on the surface view ---');
    console.log(`pinned:  ${held ? `sticky at bottom ${getComputedStyle(held.pinned).bottom} of ${name(held.scroller)}, stays in view while the page scrolls` : 'NOT pinned'}`);
    console.log(`flow:    ${after ? 'after the page, in the same column: the page\'s last lines scroll clear above it' : 'NOT after the page'}`);
    console.log(`column:  the page sits in ${name(col)}; the input's width follows ${name(own)} (${own === col ? 'the same column, not the window' : 'NOT the page\'s column'})`);
    console.log(`fade:    ${start === null ? 'NONE' : `starts ${start * 100}% down the floating box, clear to opaque at its bottom edge`}; the input ${middle ? 'is centred in that box, so the fade starts at the input\'s middle' : 'is NOT centred in it'}`);
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: 'plan the week, with Friday off' } });
    fireEvent.click(view.getByRole('button', { name: 'Send' }));
    await until('the second reply', () => !!(reply()?.textContent.endsWith(': plan the week, with Friday off')));
    console.log(`send:    still works; reply ${JSON.stringify(required(reply(), "Expected demo element or value").textContent)}, input value ${JSON.stringify(required(input(), "Expected demo element or value").value)}`);
    const ok = held?.scroller === main() && held.scroller.contains(page) && after && col && own === col && start === 0.5 && middle && required(input(), "Expected demo element or value").value === '';
    if (!ok) throw new Error('input-floats failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// PR #89 blocker: BB loads a reinstalled plugin's new app bundle into its long-lived window, whose custom element registry
// still holds the first bundle's A2UI elements. Two distinct builds of app.tsx in one jsdom window render the same page.
async function secondBundle() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  host.send('primary', 'draw week: Week plan'); await host.settled(['primary']);
  const first = await renderedApp(), second = await renderedApp({ window: first.window });
  const errors: string[] = [], consoleError = console.error;
  console.error = (...args) => { errors.push(args.map(a => a instanceof Error ? a.message : String(a)).join(' ')); };
  const render = async (bundle: Awaited<ReturnType<typeof renderedApp>>, name: string) => {
    let view;
    try { view = bundle.kit.renderSlot(required(bundle.app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc }); } catch (e) { errors.push(String(e)); return false; }
    const page = () => view.container.querySelector('section[data-surface]');
    for (let waited = 0; !page()?.textContent.includes('Week plan') && waited < 20000; waited += 50) await new Promise(r => setTimeout(r, 50));
    const root = page()?.firstElementChild, tag = root?.tagName.toLowerCase() ?? '', upgraded = !!root && !!customElements.get(tag) && root instanceof required(customElements.get(tag), 'Expected a registered custom element');
    const ok = page()?.getAttribute('aria-label') === 'Week plan' && required(page(), "Expected demo element or value").textContent.includes('Week plan') && upgraded;
    console.log(`${name} rendered page ${JSON.stringify(page()?.getAttribute('aria-label') ?? null)}: root <${tag || 'none'}> ${upgraded ? 'upgraded' : 'NOT upgraded'}, text ${JSON.stringify(page()?.textContent.trim() ?? '')}`);
    view.unmount(); return ok;
  };
  try {
    const one = await render(first, 'bundle 1'), two = await render(second, 'bundle 2');
    const collisions = errors.filter(e => e.includes('collision'));
    console.log(collisions.length ? `COLLISION: ${collisions[0]}` : 'no collision');
    if (!one || !two || collisions.length) throw new Error('second bundle failed');
  } finally {
    console.error = consoleError; first.close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #82: a new surface is "New surface" until the person's first message is sent; then, beside Exo's turn, the namer names it
// once. Rendered surface view (app.tsx: sidebar and the title at the top) on the real server RPCs; the namer is "namer" in the
// Exosurface local config (EXO_CONFIG); its model is the fixture's fake over HTTP (models.json in its agent folder). Exo's first
// turn is held (the fake Exo model answers a "hold:" message only on release), so the name is seen while Exo still works.
// An agent's and a system message come first and name nothing: only the person's first message does.
async function autoName() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const entries = () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => li.textContent);
  const title = () => view.container.querySelector('main h1')?.textContent ?? null;
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const boundaries = (id: string) => host.deltas(id).filter(d => d.kind === 'turn.boundary').length;
  const until = waiter(() => `sidebar ${entries().join(', ')}; title ${JSON.stringify(title())}`);
  const type = (text: string) => { fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' })); console.log(`sent: ${JSON.stringify(text)}`); };
  try {
    f.model.state.reply = 'Spring vegetable garden';
    await until('Home listed', () => entries().join('|') === 'Home');
    fireEvent.click(required([...required(sidebar(), "Expected demo element or value").querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li')), "Expected demo element or value"));
    await until('the new surface', () => entries().length === 2);
    const made = required((await f.rpc.thread_list(null)).threads[1], "Expected demo element or value").threadId;
    const started = await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }]); if (started.error) throw new Error(started.error.message);
    const profile = f.piRuns().at(-1).profile;
    await until('the new surface ready', () => !!input() && !control(input()).disabled && boundaries(made) > 0 && title() === 'New surface');
    const config = z.object({ namer: z.unknown().optional() }).parse(JSON.parse(readFileSync(f.config, 'utf8')));
    console.log(`namer from the Exosurface local config ${f.config}: ${config.namer ? JSON.stringify(config.namer) : '"namer" absent (default openai/gpt-6-luna, thinking off)'}`);
    const before = entries()[1], titleBefore = title();
    console.log(`before its first message: sidebar ${entries().join(', ')}; title at the top ${JSON.stringify(titleBefore)}`);
    // Only the person's messages name a surface: another thread's message (agent) and a system notice come first.
    const notices: [string, 'system' | { senderThreadId: string }, string][] = [['quiet: agent note about the cabin trip', { senderThreadId: 'thread-other' }, 'agent (another thread)'], ['quiet: system notice: a child thread finished', 'system', 'system']];
    for (const [text, from, who] of notices) {
      const at = boundaries(made); await f.tell(made, required(text, "Expected demo element or value"), from);
      await until(`Exo's turn on the ${who} message`, () => boundaries(made) > at, 30000);
      await settled(() => f.model.requests.length > 0 || title() !== 'New surface', 1500);
      console.log(`after a message from the ${who} and Exo's turn on it: sidebar ${entries().join(', ')}; title at the top ${JSON.stringify(title())}; namer asked ${f.model.requests.length} times`);
    }
    const untouched = title() === 'New surface' && entries()[1] === 'New surface' && f.model.requests.length === 0;
    const turns = boundaries(made);
    type('hold: Help me plan a vegetable garden for spring');
    await until('the name in the sidebar and the title', () => entries()[1] !== 'New surface' && title() !== 'New surface', 30000);
    const running = boundaries(made) === turns, request = f.model.requests[0];
    console.log(`while Exo's turn is still running (${running ? 'its turn has not ended' : 'TURN ALREADY ENDED'}): sidebar ${entries().join(', ')}; title at the top ${JSON.stringify(title())}`);
    console.log(`  the model received: ${request?.path} model ${request?.body.model}, reasoning ${JSON.stringify(request?.body.reasoning ?? null)}; from the first message alone: ${!JSON.stringify(request?.body ?? '').includes('The reply:')}`);
    for (const line of f.logs) console.log(`  log ${line}`);
    const named = entries()[1], titled = title();
    f.model.state.reply = 'Something else entirely';
    f.release(profile);
    await until('Exo\'s first turn to end', () => boundaries(made) > turns, 30000);
    // Exo would act within moments of the turn's end: a wall-clock bounded wait for a change that must not come.
    const changedAtEnd = await settled(() => f.model.requests.length > 1 || entries()[1] !== named || title() !== titled, 2000);
    console.log(`after Exo's first turn: sidebar ${entries().join(', ')}; title at the top ${JSON.stringify(title())} (${!changedAtEnd ? 'unchanged' : 'CHANGED or asked again'})`);
    const later = boundaries(made);
    type('Add tomatoes to the plan');
    await until('the later turn to end', () => boundaries(made) > later, 30000);
    const changed = await settled(() => f.model.requests.length > 1 || entries()[1] !== named || title() !== titled, 2000);
    const after = entries()[1], asked = f.model.requests.length;
    console.log(`after a later send:     sidebar ${entries().join(', ')}; title at the top ${JSON.stringify(title())} (${!changed ? 'unchanged' : 'CHANGED'}; namer asked ${asked} time${asked === 1 ? '' : 's'} in all)`);
    const ok = before === 'New surface' && titleBefore === 'New surface' && untouched && running && named === 'Spring vegetable garden' && titled === named && !changedAtEnd && !changed && after === named && asked === 1 && entries()[0] === 'Home'
      && !config.namer && request?.path === '/v1/responses' && request.body.model === 'gpt-6-luna' && request.body.reasoning?.effort === 'none'; // the default: openai, gpt-6-luna, thinking off
    if (!ok) throw new Error('auto-name failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    await f.model.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #83: the person renames a surface from the rendered sidebar (its Rename action, type, Enter); Exo never names it again,
// and the title at the top follows. One surface Exo named, then renamed to Backyard, then a further turn; one renamed before
// its first turn, then once more from the title at the top (double-click, type, Enter). Home's title has no pencil.
async function rename() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const entries = () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => li.textContent);
  const title = () => view.container.querySelector('main h1')?.textContent ?? null;
  const boundaries = (id: string) => host.deltas(id).filter(d => d.kind === 'turn.boundary').length;
  const until = waiter(() => `sidebar ${entries().join(', ')}; title ${JSON.stringify(title())}`);
  const name = async (id: string) => (await f.rpc.thread_list(null)).threads.find(t => t.threadId === id)?.title;
  // A turn, then a wall-clock bounded wait for Exo to touch the name or ask the namer, which must not come.
  const turn = async (id: string, text: string) => {
    const before = boundaries(id), asked = f.model.requests.length, listed = entries().join('|');
    await f.rpc.exo_send({ threadId: id, text }); console.log(`  sent: ${JSON.stringify(text)}`);
    await until('the turn to end', () => boundaries(id) > before, 30000);
    await settled(() => f.model.requests.length > asked || entries().join('|') !== listed, 1500);
  };
  const newOne = async () => {
    const count = entries().length;
    fireEvent.click(required([...required(sidebar(), "Expected demo element or value").querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li')), "Expected demo element or value"));
    await until('the new surface', () => entries().length === count + 1);
    const made = required((await f.rpc.thread_list(null)).threads[1], "Expected demo element or value").threadId;
    const started = await host.start(made, [{ type: 'text', text: f.spawns.at(-1).prompt }]); if (started.error) throw new Error(started.error.message);
    await until('the new surface ready', () => boundaries(made) > 0);
    return made;
  };
  const renameTo = async (from: string, to: string) => {
    fireEvent.click(required(required(sidebar(), "Expected demo element or value").querySelector(`button[aria-label="Rename ${from}"]`), "Expected demo element or value")); // the most recently active such row (N9)
    const field = required(sidebar(), "Expected demo element or value").querySelector('input[aria-label="Surface name"]');
    fireEvent.change(required(field, "Expected demo element or value"), { target: { value: to } }); fireEvent.keyDown(required(field, "Expected demo element or value"), { key: 'Enter' });
    console.log(`  renamed in the sidebar: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    await until(`the sidebar and the title to show ${to}`, () => entries()[1] === to && title() === to);
  };
  const top = () => view.container.querySelector('main .exo-topline');
  const show = async (when: string, id: string) => { const n = await name(id); console.log(`  ${when.padEnd(30)} name ${JSON.stringify(n)}  title at the top ${JSON.stringify(title())}  sidebar: ${entries().join(', ')}  namer calls: ${f.model.requests.length}`); return n === title() ? n : `${n} (title ${title()})`; };
  try {
    await until('Home listed', () => entries().join('|') === 'Home');
    const homeRpc = await f.rpc.thread_rename({ threadId: f.setup.threadId, name: 'My home' }).then(() => 'ACCEPTED', e => `refused (${e.message})`);
    console.log(`Home: rename action ${required(sidebar(), "Expected demo element or value").querySelector('button[aria-label^="Rename"]') ? 'SHOWN' : 'none'}; RPC: ${homeRpc}; title at the top ${JSON.stringify(title())}, its pencil ${top()?.querySelector('button[aria-label^="Rename"]') ? 'SHOWN' : 'none'}`);
    const homeTitle = title(), homePencil = !!top()?.querySelector('button[aria-label^="Rename"]');
    console.log('--- a surface Exo named, renamed to Backyard ---');
    f.model.state.reply = 'Spring vegetable garden';
    const one = await newOne();
    await turn(one, 'Help me plan a vegetable garden for spring');
    await settled(() => entries()[1] !== 'New surface' && title() !== 'New surface', 15000);
    const auto = await show('after auto-naming:', one), asked = f.model.requests.length;
    await renameTo(auto, 'Backyard');
    const renamed = await show('after the rename:', one);
    const emptyRpc = await f.rpc.thread_rename({ threadId: one, name: '  ' }).then(() => 'ACCEPTED', e => `refused (${e.message})`);
    console.log(`  empty name: ${emptyRpc}`);
    f.model.state.reply = 'Something else entirely';
    await turn(one, 'Add tomatoes along the fence');
    const further = await show('after a further turn:', one), againOne = f.model.requests.length - asked;
    console.log('--- a surface renamed before its first turn ---');
    f.model.state.reply = 'Exo would call it this';
    const two = await newOne(), before = f.model.requests.length;
    await until('the new surface\'s title', () => title() === 'New surface');
    await show('new:', two);
    await renameTo('New surface', 'Cabin trip');
    const early = await show('after the rename:', two);
    await turn(two, 'Book the cabin for June');
    const kept = await show('after its first turn:', two), againTwo = f.model.requests.length - before;
    console.log(`namer asked again: ${againOne} (Backyard), ${againTwo} (Cabin trip)`);
    console.log('--- renamed from the title at the top ---');
    const pencil = !!required(top(), "Expected demo element or value").querySelector('button[aria-label="Rename Cabin trip"]');
    fireEvent.doubleClick(required(required(top(), "Expected demo element or value").querySelector('h1'), "Expected demo element or value"));
    const field = required(top(), "Expected demo element or value").querySelector('input[aria-label="Surface name"]'), held = field instanceof HTMLInputElement ? field.value : null;
    console.log(`  double-click on the title "Cabin trip": a field holding ${JSON.stringify(held)}; pencil beside the title: ${pencil ? 'shown' : 'NONE'}`);
    fireEvent.change(required(field, "Expected demo element or value"), { target: { value: 'Lake cabin' } }); fireEvent.keyDown(required(field, "Expected demo element or value"), { key: 'Enter' });
    console.log('  typed "Lake cabin", Enter');
    await until('the title and the sidebar to show Lake cabin', () => title() === 'Lake cabin' && entries()[1] === 'Lake cabin');
    const header = await show('after the title rename:', two);
    const ok = auto === 'Spring vegetable garden' && renamed === 'Backyard' && further === 'Backyard' && !againOne && early === 'Cabin trip' && kept === 'Cabin trip' && !againTwo
      && pencil && held === 'Cabin trip' && header === 'Lake cabin' && homeTitle === 'Home' && !homePencil
      && entries().join('|') === 'Home|Lake cabin|Backyard' && homeRpc.startsWith('refused') && emptyRpc.startsWith('refused');
    if (!ok) throw new Error('rename failed');
  } finally {
    view.unmount(); close();
    for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
    await new Promise(r => setTimeout(r, 1000));
    await f.model.close();
    rmSync(f.root, { recursive: true, force: true });
  }
}

// #108: update_exosurface calls carrying each argument-format error, then a well-formed one, from the (fake) model through
// the release owner's Pi; each tool result as Exo receives it, read from the Pi session. Plain words, never raw schema text.
async function badArguments() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const until = waiter(() => host.errors());
  const snapshot = '- region "Week plan" [ref=week]:\n  - heading "Week plan" [ref=title]';
  const calls: [string, unknown][] = [
    ['baseRevision missing', { snapshot }], ['baseRevision -1', { baseRevision: -1, snapshot }], ['baseRevision 1.5', { baseRevision: 1.5, snapshot }],
    ['edit op "bogus"', { baseRevision: 0, edits: [{ page: 'week', ref: 'title', op: 'bogus', lines: '- heading "Plan" [ref=title]' }] }],
    ['edit ref missing', { baseRevision: 0, edits: [{ page: 'week', op: 'remove' }] }], ['edit page missing', { baseRevision: 0, edits: [{ ref: 'title', op: 'remove' }] }],
    ['well-formed draw', { baseRevision: 0, snapshot }],
  ];
  const results = () => { const file = f.piRuns()[0]?.sessionFile; return file ? messages(file).filter(e => e.role === 'toolResult').filter(e => e.toolName === 'update_exosurface') : []; };
  try {
    let raw = 0;
    for (const [i, [name, args]] of calls.entries()) {
      host.send('primary', `call: ${JSON.stringify(args)}`);
      await until(`the result of ${name}`, () => results().length === i + 1 && host.deltas('primary').filter(d => d.kind === 'turn.boundary').length === i + 1);
      const r = results()[i], text = required(r, "Expected demo element or value").content.map(c => c.text).join('');
      const isRaw = /Validation failed|Received arguments/.test(text); raw += isRaw ? 1 : 0;
      console.log(`${required(name, "Expected demo element or value").padEnd(20)} ${required(r, "Expected demo element or value").isError ? 'error ' : 'saved '} ${isRaw ? 'RAW SCHEMA TEXT ' : ''}${JSON.stringify(text)}`);
    }
    const page = await f.rpc.workspace({ deployment: 'main', cursor: null });
    console.log(`surface after the calls: revision ${page.revision}`);
    if (raw || page.revision !== 1 || results().slice(0, -1).some(r => !r.isError) || required(results().at(-1), "Expected demo element or value").isError) throw new Error('bad-arguments failed');
  } finally {
    // The fixture's processes: the bridge, the owner and the Pi the owner started (its pid from the fake OptChat's record).
    // Each must be seen gone by a wall-clock deadline before the fixture is removed; else its state stays for diagnosis.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #84 (spec E9): a send Exo answers in several steps (fake model: reasoning headed "**Planning the garden**", a read of
// garden.md, reasoning with no bold headline, the reply; each step held until its line is seen). Prints each line the exo_block RPC reports while Exo works, then
// what it reports once the turn ends.
async function activityLine() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const t0 = Date.now(), at = () => `${String(Date.now() - t0).padStart(6)}ms`;
  try {
    writeFileSync(join(f.vault, 'garden.md'), '# The garden\n');
    const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
    const text = 'steps: garden', lines: string[] = [];
    console.log(`${at()}  sending: ${JSON.stringify(text)}`);
    const blocks = await stepsTurn(f, 'primary', 'garden', b => { if (b.working && b.activity && b.activity !== lines.at(-1)) { lines.push(b.activity); console.log(`${at()}  working, activity: ${JSON.stringify(b.activity)}`); } });
    const block = required(blocks.at(-1), 'Expected the completed steps turn block');
    console.log(`${at()}  turn ended: words ${JSON.stringify(block.words)}, activity: ${'activity' in block ? JSON.stringify(block.activity) : 'none'}`);
    if (lines.length < 2) throw new Error(`activity-line failed: the line never changed (${lines.length} line(s))`);
    if ('activity' in block || block.words !== `Exo (${f.setup.profile}): ${text}`) throw new Error('activity-line failed: the line survived the reply, or no reply');
  } finally {
    // As bad-arguments: the bridge, the owner and its Pis seen gone by a wall-clock deadline, else the fixture is kept.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running; fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #85 (spec E9, amends E4): the same multi-step send from the rendered surface view. Prints the Exo block's text each time it
// changes while Exo works, then what the block shows once the turn ends: the reply alone, no activity line.
async function activityBlock() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const t0 = Date.now(), at = () => `${String(Date.now() - t0).padStart(6)}ms`;
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]'), status = () => reply()?.querySelector('[role="status"]');
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea'), until = waiter();
  try {
    writeFileSync(join(f.vault, 'garden.md'), '# The garden\n');
    const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
    const text = 'steps: garden';
    await until('the input', () => !!input() && !control(input()).disabled);
    fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' }));
    console.log(`${at()}  sent: ${JSON.stringify(text)}`);
    let last: string | undefined;
    const line = () => {
      const shown = reply()?.textContent ?? '';
      if (shown !== last) { last = shown; console.log(`${at()}  Exo block: ${JSON.stringify(shown)}${!status() ? '' : shown === 'Reading your message' ? ' (activity line: the first step, before any model event)' : ' (activity line)'}${status() ? `, shimmer: ${getComputedStyle(required(required(status(), "Expected demo element or value").firstElementChild ?? status(), "Expected demo element or value")).animation}` : ''}`); }
      return status() ? shown : undefined;
    };
    const lines = await stepsShown(f, 'garden', line, () => !status() && !!reply()?.textContent);
    line();
    const after = required(reply(), "Expected demo element or value").textContent, survived = !!status();
    console.log(`${at()}  turn ended: Exo block ${JSON.stringify(after)}, activity line: ${survived ? 'STILL SHOWN' : 'none'}`);
    if (new Set(lines).size < 2) throw new Error(`activity-block failed: the line never changed (${lines.length} line(s))`);
    if (survived || after !== `Exo (${f.setup.profile}): ${text}`) throw new Error('activity-block failed: the line survived the reply, or no reply');
  } finally {
    view.unmount(); close();
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running; fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #128: Exo is one BB tab named "Exo" and BB lists the plugin as "Exo" (package.json bb.name); the tab opens on the sidebar
// and Home with the input shown. Rendered app (package.json bb.app) on the real server RPCs; Home has a page Exo drew.
async function oneTab() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  host.send('primary', 'draw week: Week plan'); await host.settled(['primary']);
  const { kit, app, close } = await renderedApp();
  const titles = app.navPanels.map(p => p.title), name = z.object({ bb: z.object({ name: z.string() }) }).parse(JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'))).bb.name;
  console.log(`nav panels: ${titles.map(t => JSON.stringify(t)).join(', ')} (${titles.length})`);
  console.log(`plugin display name (package.json bb.name): ${JSON.stringify(name)}`);
  const panel = app.navPanels.find(p => p.title === 'Exo');
  if (!panel) { close(); throw new Error('no panel titled "Exo"'); }
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const entries = () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => li.textContent);
  const inView = () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => b.textContent);
  const page = () => view.container.querySelector('section[data-surface]')?.getAttribute('aria-label') ?? null;
  const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const until = waiter(() => `sidebar ${entries().join(', ')}; in view ${inView().join(', ')}; page ${JSON.stringify(page())}; input ${input() ? 'shown' : 'none'}`);
  try {
    await until('the sidebar, Home and its input', () => !!(entries().join('|') === 'Home' && page() === 'Week plan' && input() && !control(input()).disabled), 20000);
    console.log(`Exo tab opened: sidebar ${entries().join(', ')}; in view ${inView().join(', ')}`);
    console.log(`  Home page: ${JSON.stringify(page())}`);
    console.log(`  input: ${input() && !control(input()).disabled ? 'shown' : 'NOT shown'}`);
    const ok = titles.join('|') === 'Exo' && name === 'Exo' && inView().join('|') === 'Home';
    if (!ok) throw new Error('one-tab failed');
  } finally {
    view.unmount(); close();
    // The fixture's processes, observed gone before its removal as in badArguments' teardown.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #129: the Exo tab on a set-up fixture; the person presses Settings (below the tree), reads what settings show, then closes
// them and the surface in view is back with its page. Rendered app (package.json bb.app) on the real server RPCs.
async function settings() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  host.send('primary', 'draw week: Week plan'); await host.settled(['primary']);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.title === 'Exo'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('hidden') || getComputedStyle(at).display === 'none') return false; return true; };
  const all = (selector: string) => [...view.container.querySelectorAll(selector)].filter(shown);
  const sidebar = () => all('nav[aria-label="Surfaces"]')[0];
  const panel = () => all('main[aria-label="Settings"]')[0];
  const inView = () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => b.textContent);
  const surface = () => all('main[aria-label="Exo"]').length;
  const page = () => all('main[aria-label="Exo"] section[data-surface]').map(s => s.getAttribute('aria-label'));
  const facts = () => [...(panel()?.querySelectorAll('dt') ?? [])].map(dt => [dt.textContent, dt.nextElementSibling?.textContent]);
  const press = (name: string, within: () => Element | null | undefined) => fireEvent.click(required([...required(within(), "Expected demo element or value").querySelectorAll('button')].find(b => (b.getAttribute('aria-label') ?? b.textContent) === name), "Expected demo element or value"));
  const until = waiter(() => `in view ${JSON.stringify(inView())}; surface shown ${surface()}; page ${JSON.stringify(page())}; settings ${JSON.stringify(facts())}`);
  try {
    await until('Home with its page', () => inView().join() === 'Home' && page().join() === 'Week plan');
    console.log(`Exo tab: in view ${inView().join(', ')}; page ${page().join(', ')}; sidebar buttons ${[...required(sidebar(), "Expected demo element or value").querySelectorAll('button')].map(b => JSON.stringify(b.textContent)).join(', ')}`);
    press('Settings', sidebar);
    await until('settings with the owner\'s status', () => facts().length === 4 && facts().every(([, v]) => v !== 'Loading…'));
    console.log(`pressed Settings: surface shown ${surface() ? 'yes' : 'no'}; settings show:`);
    for (const [term, value] of facts()) console.log(`  ${term}: ${value}`);
    const controls = [...required(panel(), "Expected demo element or value").querySelectorAll('button, a, [role="button"]')].map(b => b.textContent), inputs = all('input, textarea, select, [contenteditable="true"], [role="textbox"]').length;
    console.log(`  controls: ${controls.map(c => JSON.stringify(c)).join(', ')}; inputs in view: ${inputs}`);
    const shownFacts = facts().map(([, v]) => v);
    if (shownFacts[0] !== 'Exo is set up' || shownFacts[2] !== 'Exo is running' || shownFacts[1] === 'Not reported yet' || surface()) throw new Error('settings do not show a set-up, running Exo in place of the surface');
    press('Close', panel);
    await until('the surface back', () => !panel() && surface() === 1);
    console.log(`closed settings: in view ${inView().join(', ')}; page ${page().join(', ')}`);
    if (inView().join() !== 'Home' || page().join() !== 'Week plan' || controls.join() !== 'Close' || inputs !== 0) throw new Error('settings failed');
  } finally {
    view.unmount(); close();
    // The fixture's processes, observed gone before its removal as in oneTab's teardown.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #130: the Exo tab on a fresh fixture, Exo installed and not set up: settings offering set-up; the person presses Set up
// Exo and, once set-up finishes, the tab shows the sidebar and Home with the input. Rendered app on the real server RPCs.
async function firstRun() {
  const f = await installedFixture();
  const { kit, app, close } = await renderedApp();
  const view = kit.renderSlot(required(app.navPanels.find(p => p.title === 'Exo'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const s = exoTab(view, kit.testing.fireEvent), until = waiter(s.describe);
  try {
    await until('settings offering set-up', () => s.fields().length === 4 && s.setUpButton() !== null);
    console.log(`Exo tab opened (not set up): settings ${s.settingsShown() ? 'shown' : 'NOT shown'}; sidebar ${s.sidebarShown() ? 'SHOWN' : 'none'}; surface ${s.surfaceShown() ? 'SHOWN' : 'none'}; input ${s.inputs() ? 'SHOWN' : 'none'}`);
    for (const line of s.text()) console.log(`  ${line}`);
    for (const [label, value, editable] of s.fields()) console.log(`  ${label.padEnd(10)} ${value}${editable ? '' : ' (fixed)'}`);
    console.log(`  button: ${s.setUpButton()}`);
    const first = s.settingsShown() === 1 && !s.sidebarShown() && !s.surfaceShown() && !s.inputs() && s.setUpButton() === 'Set up Exo';
    const t0 = Date.now(); s.press('Set up Exo'); console.log('pressed Set up Exo');
    await until('the sidebar and Home with the input', () => s.listed().join('|') === 'Home' && s.inView().join('|') === 'Home' && s.input() !== null, 60000);
    const status = await f.rpc.canonical_setup_status(null);
    console.log(`set-up finished in ${Date.now() - t0} ms: stage ${status.stage}; BB conversations created ${f.spawns.length}`);
    console.log(`Exo tab: sidebar ${s.listed().join(', ')}; in view ${s.inView().join(', ')}; settings ${s.settingsShown() ? 'SHOWN' : 'none'}; surface ${s.surfaceShown() ? 'shown' : 'NONE'}; input ${s.input() === '' ? 'shown, empty' : JSON.stringify(s.input())}`);
    if (!first || status.stage !== 'bound' || f.spawns.length !== 1 || s.input() !== '' || s.settingsShown() || s.surfaceShown() !== 1) throw new Error('first-run failed');
  } finally {
    view.unmount(); close();
    // Any Pi set-up started, observed gone before the fixture's removal.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    if (await settled(() => !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`Pi still running (${pis.filter(alive).join(', ')}); fixture kept at ${f.root}`); process.exitCode = 1; }
    await f.model.close();
  }
}

// #140 (acceptance-press-to-top, F6; owner ruling 2026-11-05 on #138: a press must not jump): on a drawn page, scrolled
// below the first screen, the person presses the page's Book button, then sends a message; each asks the surface's scroll
// container for the top through the one scroll a send uses, eased, then both again under reduced motion (instant).
// jsdom does no layout or animation: the scroll position and the requested scroll only; the visible easing is the owner's
// RDP re-check.
async function pressToTop() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close, browser } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const said = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-said]'), reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]');
  const book = () => [...required(main(), "Expected demo element or value").querySelectorAll('[data-surface] button')].find(b => b.textContent.trim() === 'Book');
  const until = waiter(() => `page: ${main()?.textContent}`);
  const idle = () => !!(!!input() && !control(input()).disabled && reply()?.textContent !== 'Exo is working on this page…' && book() && !required(book(), "Expected demo element or value").closest('[inert]'));
  const sendText = async (text: string) => { fireEvent.change(required(input(), "Expected demo element or value"), { target: { value: text } }); fireEvent.click(view.getByRole('button', { name: 'Send' })); await until(`the reply to ${JSON.stringify(text)}`, () => !!(said()?.textContent === text && reply()?.textContent.endsWith(`: ${text}`))); };
  const press = async (who: string) => { fireEvent.input(required(required(main(), "Expected demo element or value").querySelector('[data-surface] input'), "Expected demo element or value"), { target: { value: who } }); fireEvent.click(required(book(), "Expected demo element or value")); await until(`the reply to the press (Who: ${who})`, () => !!reply()?.textContent.includes('▸') && required(reply(), "Expected demo element or value").textContent.includes(who)); };
  // One step: scrolled below the first screen, act, then print what the surface asked its scroll container for.
  const results: string[] = [];
  const step = async (what: string, act: () => Promise<void>) => {
    await until('the page idle', idle);
    required(main(), "Expected demo element or value").scrollTop = 400; const was = required(main(), "Expected demo element or value").scrollTop, asked = browser.scrolls.length;
    await act();
    const requested = browser.scrolls.slice(asked), line = `${what.padEnd(28)} scrollTop ${was} -> ${required(main(), "Expected demo element or value").scrollTop}  requested ${requested.map(r => `top ${r.top} behavior ${r.behavior}`).join('; ') || 'nothing'}`;
    console.log(line); results.push(JSON.stringify(requested));
  };
  try {
    await until('the input', () => !!input() && !control(input()).disabled);
    await sendText('draw: Week plan');
    await until('the drawn page with its Book button', () => !!book());
    console.log('--- on the drawn page "Week plan", scrolled down to its Book button ---');
    await step('press Book', () => press('Grace'));
    await step('send "and Saturday too"', () => sendText('and Saturday too'));
    browser.reducedMotion = true;
    console.log('--- the person asked their system for reduced motion ---');
    await step('press Book', () => press('Lin'));
    await step('send "and Sunday"', () => sendText('and Sunday'));
    const eased = '[{"top":0,"behavior":"smooth"}]', instant = '[{"top":0,"behavior":"auto"}]';
    const ok = results.join('|') === [eased, eased, instant, instant].join('|');
    console.log(`press and send through the one scroll to top: ${ok ? 'yes (smooth, then auto under reduced motion)' : 'NO'}`);
    if (!ok) throw new Error('press-to-top failed');
  } finally {
    view.unmount(); close();
    // As bad-arguments: the bridge, the owner and its Pi runs each seen gone by a wall-clock deadline, else the fixture stays.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #141 (acceptance-press-to-top, F6: a press shows as the person's bubble with the button's label): on a drawn page the
// person presses its button labelled "Keep — later · Book", a label holding the press line's own separators; after Exo's turn, the Exo block's bubble (its text, right-aligned as the person's) and Exo's
// reply to the press below it as plain text. Presentation from computed styles (test/app-render.ts); true layout: the
// owner's RDP walkthrough.
async function pressBubble() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea');
  const block = () => view.container.querySelector('section[aria-label="Exo"]'), said = () => block()?.querySelector('[data-exo-said]'), reply = () => block()?.querySelector('[data-exo-reply]');
  const label = 'Keep — later · Book', book = () => [...required(main(), "Expected demo element or value").querySelectorAll('[data-surface] button')].find(b => b.textContent.trim() === label);
  const until = waiter(() => `page: ${main()?.textContent}`);
  try {
    await until('the input', () => !!input() && !control(input()).disabled);
    const snapshot = `- region "Week plan" [ref=week]:\n  - textbox "Who" [ref=who]\n  - button ${JSON.stringify(label)} [ref=book] [action=book] [sends=who]`;
    host.send('primary', `call: ${JSON.stringify({ baseRevision: 0, snapshot })}`);
    await until('the drawn page with its button, idle', () => !!book() && !required(book(), "Expected demo element or value").closest('[inert]') && !!input() && !control(input()).disabled && !!reply()?.textContent.startsWith('Exo (exo-optchat): call: '));
    console.log(`--- on the drawn page "Week plan": Who "Ada", then press ${JSON.stringify(label)} ---`);
    fireEvent.input(required(required(main(), "Expected demo element or value").querySelector('[data-surface] input'), "Expected demo element or value"), { target: { value: 'Ada' } });
    fireEvent.click(required(book(), "Expected demo element or value"));
    await until('Exo\'s reply to the press', () => !!reply()?.textContent.includes('▸') && required(reply(), "Expected demo element or value").textContent.includes('Ada'));
    const bubble = required(said(), "Expected demo element or value").textContent, right = rightAligned(required(said(), "Expected demo element or value")), below = !!(required(said(), "Expected demo element or value").compareDocumentPosition(required(reply(), "Expected demo element or value")) & Node.DOCUMENT_POSITION_FOLLOWING), plain = !boxed(required(reply(), "Expected demo element or value"), required(block(), "Expected demo element or value"));
    console.log(`bubble ${JSON.stringify(bubble)}  (${right ? 'right-aligned as the person\'s' : 'NOT right-aligned'})`);
    console.log(`reply  ${JSON.stringify(required(reply(), "Expected demo element or value").textContent)}  (${below ? 'below the bubble' : 'NOT below the bubble'}, ${plain ? 'plain text, no box' : 'IN A BOX'})`);
    console.log(`bubble equals the button's label ${JSON.stringify(label)}: ${bubble === label ? 'yes' : 'NO'}`);
    if (!(bubble === label && right && below && plain)) throw new Error('press-bubble failed');
  } finally {
    view.unmount(); close();
    // The bridge, the owner and the Pi the owner started, each seen gone by a wall-clock deadline before the fixture is
    // removed; else its state stays for diagnosis.
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #143 (#31; owner ruling 2026-11-06): the person types a long multiline note into a page's textbox and presses Apply;
// the note Exo received (the press message in its Pi session) against the note typed: lengths and the note's last words.
async function pressNotes() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  const main = () => view.container.querySelector('main'), box = () => main()?.querySelector('[data-surface] textarea');
  const apply = () => [...(main()?.querySelectorAll('[data-surface] button') ?? [])].find(b => b.textContent.trim() === 'Apply');
  const until = waiter(() => `page: ${main()?.textContent.slice(0, 300)}`);
  const prompts = () => { const file = f.piRuns()[0]?.sessionFile; return file ? messages(file).filter(e => e.role === 'user').map(e => typeof e.content === 'string' ? e.content : e.content.filter(p => p.type === 'text').map(p => p.text).join('')) : []; };
  const note = [
    'Batch 2 review, carried tasks from C7. I went through each one with the calendar open and the inbox beside it.',
    'The dentist reschedule is done; I called on Tuesday and they moved it to the 14th at 9:30, so close that one and drop the reminder. The gutter quote from Hal is still waiting on him; he said end of the month, so leave it open but push the check-in to the 30th.',
    'Insurance renewal: the paperwork came in the mail and it is on the desk in the blue folder. I have not read it yet. Keep it active and put it at the top of next week, it needs an hour with no interruptions.',
    'The garden bed order can wait until spring. Archive it with a note that the cedar boards were the ones we liked, the 2x10 ones from the yard on Pine Street.',
    'Car registration was renewed online on the 3rd, receipt is in the email folder "car". Close it. The oil change is overdue by maybe 800 miles; make that a new task for this weekend.',
    'Mom\'s birthday: the gift is ordered and arrives Friday. Card still needs writing. Move "write card" to Thursday evening so it goes out with the Saturday mail.',
    'Library books are due on the 12th, two of them are not finished. Renew both online instead of returning them, and keep the task until the renewal shows on the account.',
    'Bank: the duplicate charge from the hotel was refunded, I saw it on the statement. Close it, but keep the hotel booking task open because the second night still shows as pending and I want that confirmed in writing.',
    'Taxes: the 1099 from the brokerage has not arrived. Leave it open with a check date of the 20th; if it is still missing then, write to them, and copy the accountant so she knows why the appointment may move.',
    'School forms for the field trip: signed and in the backpack. Close it. The permission slip for swimming is a separate form and has not come home yet; keep that one open until Wednesday and ask the teacher if it is still missing.',
    'Unticked items in this batch are not done just because I did not tick them. Keep active in C7 -- just because it isn\'t checked, doesn\'t mean you close it. Ask me about any you are unsure of before moving anything to the archive, once everything worked well.',
  ].join('\n\n'), last = 'once everything worked well.';
  try {
    const snapshot = '- region "Carried tasks" [ref=ct]:\n  - textbox "Batch 2 notes" [ref=note] [multiline]\n  - button "Apply" [ref=apply] [action=apply] [sends=note]';
    host.send('primary', `call: ${JSON.stringify({ baseRevision: 0, snapshot })}`);
    await until('the drawn page with its notes box and Apply', () => !!box() && !!apply() && !required(apply(), "Expected demo element or value").closest('[inert]') && !control(apply()).disabled);
    const asked = prompts().length;
    fireEvent.input(required(box(), "Expected demo element or value"), { target: { value: note } });
    console.log(`typed into "Batch 2 notes": ${note.length} characters, ${note.split('\n').length} lines, ending ${JSON.stringify(note.slice(-40))}`);
    fireEvent.click(required(apply(), "Expected demo element or value"));
    await until('the press to reach Exo', () => prompts().slice(asked).some(p => p.startsWith('▸')));
    const press = prompts().slice(asked).find(p => p.startsWith('▸')), open = required(press, "Expected demo element or value").indexOf('“'), received = required(press, "Expected demo element or value").slice(open + 1, required(press, "Expected demo element or value").lastIndexOf('”'));
    console.log(`Exo received: ${JSON.stringify(required(press, "Expected demo element or value").slice(0, open + 30))}… (${required(press, "Expected demo element or value").length} characters in all)`);
    console.log(`typed ${note.length}, received ${received.length}: ${received.length === note.length ? 'equal' : 'NOT EQUAL'}`);
    console.log(`last words ${JSON.stringify(last)} in what Exo received: ${required(press, "Expected demo element or value").includes(last) ? 'found' : 'MISSING'}; cut mark "…" in the note: ${received.includes('…') ? 'YES' : 'none'}`);
    if (received !== note || !required(press, "Expected demo element or value").includes(last)) throw new Error('press-notes failed');
  } finally {
    view.unmount(); close();
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running (bridge ${ended(host.child) ? 'gone' : 'alive'}, owner ${ended(ownerProcess) ? 'gone' : 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

// #186 (spec N8, N9, T3): the Exo tab with several surfaces on the live entry points (their order from BB's createdAt and
// each surface's own Pi session journal); the sidebar's order before and after a send on the least recently active surface
// and after New surface; then, the list scrolled to its end, where New surface and the Settings gear sit, by computed style.
async function sidebarLayout() {
  const f = await liveFixture(), ownerProcess = await owner(f), host = bridge(f);
  f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
  const start = await host.start('primary'); if (start.error) throw new Error(start.error.message);
  const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
  const view = kit.renderSlot(required(app.navPanels.find(p => p.path === 'surface'), "Expected demo element or value"), { subPath: '' }, { rpc: f.rpc });
  f.realtime.deliver = (channel, payload) => { void view.emitRealtime(channel, payload); };
  const nav = () => view.container.querySelector('nav[aria-label="Surfaces"]');
  const entries = () => [...(nav()?.querySelectorAll('li') ?? [])].map(li => li.textContent);
  const until = waiter(() => `sidebar ${entries().join(', ')}`);
  const boundaries = (id: string) => host.deltas(id).filter(d => d.kind === 'turn.boundary').length;
  const ids = async () => (await f.rpc.thread_list(null)).threads.map(t => t.threadId);
  const newSurfaceButton = () => [...required(nav(), "Expected demo element or value").querySelectorAll('button')].find(b => b.textContent === 'New surface' && !b.closest('li'));
  const make = async (name: string) => {
    const before = await ids(), count = entries().length;
    fireEvent.click(required(newSurfaceButton(), "Expected demo element or value"));
    await until('the new surface listed', () => entries().length === count + 1);
    const made = (await ids()).find(id => !before.includes(id));
    const started = await host.start(required(made, "Expected demo element or value"), [{ type: 'text', text: f.spawns.at(-1).prompt }]); if (started.error) throw new Error(started.error.message);
    await until('the new surface ready', () => boundaries(required(made, "Expected demo element or value")) > 0);
    await f.rpc.thread_rename({ threadId: made, name });
    return made;
  };
  const turn = async (id: string, text: string) => {
    const before = boundaries(id);
    await f.rpc.exo_send({ threadId: id, text });
    await until('the turn to end', () => boundaries(id) > before, 30000);
  };
  try {
    await until('Home listed', () => entries().join('|') === 'Home');
    const made: Record<string, string> = {};
    const surfaces: [string, string][] = [['Reading list', 'Books for the summer'], ['Kitchen remodel', 'Price new cabinets'], ['Weekend trip', 'Plan a weekend at the coast'], ['Garden plan', 'Lay out three raised beds']];
    for (const [name, text] of surfaces) {
      made[name] = required(await make(name), 'Expected a new surface id');
      await turn(required(made[name], "Expected demo element or value"), required(text, "Expected demo element or value"));
      console.log(`made ${JSON.stringify(name)}, sent ${JSON.stringify(text)}, Exo's turn finished`);
    }
    await until('four surfaces listed', () => entries().length === 5);
    const before = entries().join(' | ');
    console.log(`sidebar order before:            ${before}`);
    const least = required(entries().at(-1), 'Expected the least active surface');
    // Exo answers this send only once released: the order right after the send, while Exo's turn runs (N9: a send alone
    // is activity), then once the turn has ended.
    const held = boundaries(required(made[least], "Expected demo element or value"));
    await f.rpc.exo_send({ threadId: made[least], text: 'hold: Add two more novels' });
    await until(`${least} at the top while Exo works`, () => entries()[1] === least);
    const whileWorking = entries().join(' | '), working = boundaries(required(made[least], "Expected demo element or value")) === held;
    console.log(`right after a send on ${JSON.stringify(least)}, ${working ? 'before Exo\'s turn ended' : 'EXO\'S TURN ALREADY ENDED'}: ${whileWorking}`);
    for (const run of f.piRuns()) f.release(run.profile);
    await until('the turn to end', () => boundaries(required(made[least], "Expected demo element or value")) > held, 30000);
    const afterSend = entries().join(' | ');
    console.log(`after a send on ${JSON.stringify(least)}, Exo's turn finished: ${afterSend}`);
    await f.rpc.thread_rename({ threadId: made['Kitchen remodel'], name: 'Kitchen' });
    await until('the rename shown', () => entries().includes('Kitchen'));
    const afterRename = entries().join(' | ');
    console.log(`after renaming "Kitchen remodel" (not activity): ${afterRename}`);
    fireEvent.click(required(newSurfaceButton(), "Expected demo element or value"));
    await until('the new surface listed', () => entries().length === 6);
    const afterNew = entries().join(' | ');
    console.log(`after New surface:               ${afterNew}`);
    // Many more surfaces than fit; the person scrolls the list to its end.
    for (let i = 0; i < 30; i++) await f.rpc.thread_new(null);
    await view.emitRealtime('surface-activity', {});
    await until('35 surfaces listed', () => entries().length === 36);
    const style = (el: Element) => getComputedStyle(el), scrolls = (el: Element) => ['auto', 'scroll'].includes(style(el).overflowY) || ['auto', 'scroll'].includes(style(el).overflow);
    const regions = [required(nav(), "Expected sidebar"), ...required(nav(), "Expected demo element or value").querySelectorAll('*')].filter(scrolls), list = regions[0];
    required(list, "Expected demo element or value").scrollTop = required(list, "Expected demo element or value").scrollHeight;
    const settingsButton = required(nav(), "Expected demo element or value").querySelector('button[aria-label="Settings"]'), children = [...required(nav(), "Expected demo element or value").children];
    const where = (b: Element) => `child ${children.indexOf(b) + 1} of ${children.length} in the sidebar, ${required(list, "Expected demo element or value").contains(b) ? 'INSIDE' : 'outside'} the scrolling list, ${required(list, "Expected demo element or value").compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING ? 'above' : 'below'} it`;
    console.log(`scrolling regions in the sidebar: ${regions.length} (${regions.map(r => `<${required(r, "Expected demo element or value").tagName.toLowerCase()}> overflow-y ${style(required(r, "Expected demo element or value")).overflowY}, flex-grow ${style(required(r, "Expected demo element or value")).flexGrow}, min-height ${style(required(r, "Expected demo element or value")).minHeight}`).join('; ')}); the sidebar itself: overflow-y ${style(required(nav(), "Expected demo element or value")).overflowY || 'visible'}, display ${style(required(nav(), "Expected demo element or value")).display} ${style(required(nav(), "Expected demo element or value")).flexDirection}`);
    console.log(`the list holds ${[...required(list, "Expected demo element or value").querySelectorAll('li')].length} of ${entries().length} rows, first ${JSON.stringify(entries()[0])}, last ${JSON.stringify(entries().at(-1))}; scrolled to its end (scrollTop ${required(list, "Expected demo element or value").scrollTop} of ${required(list, "Expected demo element or value").scrollHeight}: jsdom does no layout)`);
    console.log(`New surface: ${where(required(newSurfaceButton(), "Expected demo element or value"))}`);
    console.log(`Settings (shown ${JSON.stringify(required(settingsButton, "Expected demo element or value").textContent)}, named ${JSON.stringify(required(settingsButton, "Expected demo element or value").getAttribute('aria-label'))}): ${where(required(settingsButton, "Expected demo element or value"))}`);
    const ok = before === 'Home | Garden plan | Weekend trip | Kitchen remodel | Reading list' && working && whileWorking === 'Home | Reading list | Garden plan | Weekend trip | Kitchen remodel' && afterSend === 'Home | Reading list | Garden plan | Weekend trip | Kitchen remodel'
      && afterRename === 'Home | Reading list | Garden plan | Weekend trip | Kitchen' && afterNew === 'Home | New surface | Reading list | Garden plan | Weekend trip | Kitchen'
      && regions.length === 1 && list !== nav() && children.indexOf(required(newSurfaceButton(), "Expected demo element or value")) === 0 && !required(list, "Expected demo element or value").contains(required(newSurfaceButton(), "Expected demo element or value")) && !required(list, "Expected demo element or value").contains(settingsButton)
      && !!(required(list, "Expected demo element or value").compareDocumentPosition(required(settingsButton, "Expected demo element or value")) & Node.DOCUMENT_POSITION_FOLLOWING) && [...required(list, "Expected demo element or value").querySelectorAll('li')].length === entries().length;
    console.log(ok ? 'sidebar-layout: ok' : 'sidebar-layout: FAILED');
    if (!ok) throw new Error('sidebar-layout failed');
  } finally {
    view.unmount(); close();
    const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
    const ended = (c: ChildProcess) => c.exitCode !== null || c.signalCode !== null;
    const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return !(e instanceof Error && 'code' in e && e.code === 'ESRCH'); } };
    for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
    await f.model.close();
    if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
    else { console.error(`fixture processes still running; fixture kept at ${f.root}`); process.exitCode = 1; }
  }
}

const SCENARIOS: Record<string, () => Promise<void>> = { 'sidebar-layout': sidebarLayout, 'first-run': firstRun, settings, 'one-tab': oneTab, 'press-notes': pressNotes, 'press-bubble': pressBubble, 'press-to-top': pressToTop, 'bad-arguments': badArguments, 'parallel-threads': parallelThreads, 'new-surface': newSurface, 'exo-block': exoBlock, parallel, opening, 'one-page': onePage, 'exo-block-own-page': exoBlockOwnPage, 'exo-block-sent-page': exoBlockSentPage, 'second-bundle': secondBundle, 'input-floats': inputFloats, 'auto-name': autoName, rename, 'activity-line': activityLine, 'activity-block': activityBlock };
const scenario = SCENARIOS[process.argv[2] ?? ''];
if (!scenario) { console.error(`usage: demo/surfaces <${Object.keys(SCENARIOS).join('|')}>`); process.exit(2); }
try { await scenario(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }

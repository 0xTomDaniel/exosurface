// #129 (spec pages-and-activity T3, T4; acceptance-settings-shows, acceptance-settings-close): below the tree the sidebar
// has one Settings button; settings show in place of the surface in view, beside the sidebar: whether Exo is set up, the
// model it runs on, whether it is running and the owner profile, with no input and no control for testing Exo. Closing
// them, or opening a surface from the sidebar, puts that surface back with its page as the person left it.
// The app (package.json bb.app) is rendered through the SDK's app test runtime (test/app-render.ts). Settings read the
// owner's status from server.ts on a set-up fixture (test/mock-bb.ts: canonical_setup, the release owner on the real Pi
// CLI); the surface test's rpc handlers stand in for the server. Only extracted strings and counts are compared.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { bridge, liveFixture, owner } from './mock-bb.ts';
import { reapOnExit } from './reap.ts';
import { settled, waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const panel = app.navPanels.find((p: any) => p.title === 'Exo');
// host.ts as BB runs it, started by the model-switch test below.
let host: ReturnType<typeof bridge> | undefined;
after(async () => {
  close();
  if (host) { host.child.kill('SIGTERM'); if (!(await settled(() => host!.child.exitCode !== null || host!.child.signalCode !== null, 15000))) throw new Error(`host.ts still running; fixture kept at ${f.root}`); }
  // The owner and the Pi it started, each seen gone by a wall-clock deadline before the fixture is removed.
  const pis = f.piRuns().map(r => r.pid as number); for (const pid of pis) reapOnExit(pid);
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } };
  ownerProcess.kill('SIGTERM');
  const gone = await settled(() => (ownerProcess.exitCode !== null || ownerProcess.signalCode !== null) && !pis.some(alive), 15000);
  if (!gone) throw new Error(`fixture processes still running (owner ${ownerProcess.exitCode ?? ownerProcess.signalCode ?? 'alive'}, Pi ${pis.filter(alive).join(', ') || 'gone'}); fixture kept at ${f.root}`);
  rmSync(f.root, { recursive: true, force: true });
});

// Shown: neither it nor anything around it is hidden from the person (aria-hidden, the hidden attribute, display:none).
const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('hidden') || getComputedStyle(at).display === 'none') return false; return true; };
/** A button's name for people and assistive tech: its label, else its text (the Settings gear is labelled Settings). */
const named = (b: Element) => b.getAttribute('aria-label') ?? b.textContent;
function screenOf(view: any) {
  const all = (selector: string) => [...view.container.querySelectorAll(selector)].filter(shown) as HTMLElement[];
  const sidebar = () => all('nav[aria-label="Surfaces"]')[0] ?? null;
  const settings = () => all('main[aria-label="Settings"]')[0] ?? null;
  return {
    all, sidebar, settings,
    /** The sidebar's surfaces, and the one marked in view. */
    listed: () => [...(sidebar()?.querySelectorAll('li') ?? [])].map(li => String(li.textContent)),
    inView: () => [...(sidebar()?.querySelectorAll('button[aria-current="page"]') ?? [])].map(b => String(b.textContent)),
    /** The surface shown beside the sidebar (main "Exo"), and the titles of its pages in view. */
    surfaceShown: () => all('main[aria-label="Exo"]').length,
    pages: () => all('main[aria-label="Exo"] section[data-surface]').map(s => String(s.getAttribute('aria-label'))),
    /** What settings show: each term with its value, in order. */
    facts: () => [...(settings()?.querySelectorAll('dt') ?? [])].map(dt => [String(dt.textContent), String(dt.nextElementSibling?.textContent)]),
    press: (name: string, within: () => Element | null) => { const b = [...(within()?.querySelectorAll('button') ?? [])].find(b => named(b) === name && shown(b)); if (!b) throw new Error(`no button "${name}"`); fireEvent.click(b); },
  };
}

test('with Exo set up, pressing Settings shows set up, the model, running and the owner profile, and no input or test control', async () => {
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  const s = screenOf(view);
  const until = waiter(() => `sidebar ${JSON.stringify(s.listed())}; surface shown ${s.surfaceShown()}; settings ${JSON.stringify(s.facts())}`);
  try {
    await until('the sidebar listing Home, Home in view', () => s.listed().join('|') === 'Home' && s.surfaceShown() === 1);
    // T3: one Settings button, below the tree (after the surfaces in screen order), not a surface in the list.
    const buttons = [...s.sidebar()!.querySelectorAll('button')].filter(b => named(b) === 'Settings');
    assert.deepEqual(buttons.map(b => b.closest('li') !== null), [false]);
    const lastRow = [...s.sidebar()!.querySelectorAll('li')].at(-1)!;
    assert.equal(!!(lastRow.compareDocumentPosition(buttons[0]) & Node.DOCUMENT_POSITION_FOLLOWING), true, 'Settings follows the tree');
    s.press('Settings', s.sidebar);
    await until('settings with the owner\'s status', () => s.facts().length === 4 && s.facts().every(([, v]) => v !== 'Loading…'));
    assert.deepEqual(s.facts(), [['Set-up', 'Exo is set up'], ['Model', 'anthropic/claude-opus-5-5'], ['Running', 'Exo is running'], ['Owner profile', 'exo-optchat']]);
    // In place of the surface in view, beside the sidebar.
    assert.equal(s.surfaceShown(), 0);
    assert.equal(!!s.sidebar() && shown(s.sidebar()!), true);
    // No input anywhere in view, and no control in settings but Close.
    assert.equal(s.all('input, textarea, select, [contenteditable="true"], [role="textbox"]').length, 0);
    assert.deepEqual([...s.settings()!.querySelectorAll('button, a, [role="button"]')].filter(shown).map(b => String(b.textContent)), ['Close']);
  } finally { view.unmount(); }
});

// A surface other than Home with two pages: Garden plan (newest, in view first) and Week plan, which the person brings into
// view from the page strip before opening settings.
const PAGES = { threadId: 'garden', ready: true, streaming: false, revision: 2, composition: { configured: false, surfaceId: null, candidateCount: 0, running: false, lastRun: null }, observer: null,
  delivery: { epoch: 'garden', checkpoint: { revision: 2, messages: [
    { version: 'v0.9', createSurface: { surfaceId: 'week', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json' } },
    { version: 'v0.9', updateComponents: { surfaceId: 'week', components: [{ id: 'root', component: 'Text', variant: 'h1', text: 'Week plan' }] } },
    { version: 'v0.9', createSurface: { surfaceId: 'garden', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json' } },
    { version: 'v0.9', updateComponents: { surfaceId: 'garden', components: [{ id: 'root', component: 'Text', variant: 'h1', text: 'Garden plan' }] } },
  ] }, updates: [], preview: null } };
const HOME = { ...PAGES, threadId: 'primary', revision: 0, delivery: { epoch: 'home', checkpoint: null, updates: [], preview: null } };

test('on a surface other than Home, Settings then Close shows that surface with its page as left; so does opening it from the sidebar', async () => {
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: {
    thread_list: async () => ({ threads: [{ threadId: 'primary', title: 'Home', home: true }, { threadId: 'garden', title: 'Garden trip', home: false }] }),
    workspace: async (input: any) => input.threadId === 'garden' ? PAGES : HOME,
    exo_block: async () => ({ working: false, said: '', words: '' }),
    // The settings reads, as on the set-up fixture above.
    canonical_setup_status: f.rpc.canonical_setup_status,
    overview: f.rpc.overview,
  } });
  const s = screenOf(view);
  const until = waiter(() => `in view ${JSON.stringify(s.inView())}; pages ${JSON.stringify(s.pages())}; settings ${s.settings() ? 'shown' : 'none'}`);
  const pill = () => s.all('main[aria-label="Exo"] nav')[0] ?? null;
  try {
    await until('the sidebar', () => s.listed().join('|') === 'Home|Garden trip');
    s.press('Garden trip', s.sidebar);
    await until('Garden trip with its newest page', () => s.inView().join() === 'Garden trip' && s.pages().join() === 'Garden plan');
    s.press('Week plan', pill);
    await until('the earlier page brought into view', () => s.pages().join() === 'Week plan');

    s.press('Settings', s.sidebar);
    await until('settings in place of the surface', () => !!s.settings() && s.surfaceShown() === 0);
    s.press('Close', s.settings);
    await until('the surface back', () => !s.settings() && s.surfaceShown() === 1);
    assert.deepEqual(s.inView(), ['Garden trip']);
    assert.deepEqual(s.pages(), ['Week plan']);

    s.press('Settings', s.sidebar);
    await until('settings in place of the surface', () => !!s.settings() && s.surfaceShown() === 0);
    s.press('Garden trip', s.sidebar);
    await until('the surface back', () => !s.settings() && s.surfaceShown() === 1);
    assert.deepEqual(s.inView(), ['Garden trip']);
    assert.deepEqual(s.pages(), ['Week plan']);
  } finally { view.unmount(); }
});

// T4, "the model it runs on": the person picks Sol in BB's model picker and sends; host.ts switches the running Pi
// (set_model, model-selection.ts) and Settings, opened after, show Sol, not the model Exo started on.
test('after the person picks Sol in BB and sends, Settings show Sol as the model Exo runs on', async () => {
  host = bridge(f);
  assert.equal((await host.start('primary')).error ?? null, null);
  host.send('primary', 'hello on Sol', 'exo-gpt-6-1-sol');
  await host.settled(['primary']);
  assert.deepEqual(host.turn('primary').replies, ['Exo (exo-optchat): hello on Sol']);
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  const s = screenOf(view);
  const until = waiter(() => `settings ${JSON.stringify(s.facts())}`);
  try {
    await until('the sidebar', () => s.listed().length > 0);
    s.press('Settings', s.sidebar);
    await until('settings with the owner\'s status', () => s.facts().length === 4 && s.facts().every(([, v]) => v !== 'Loading…'));
    assert.deepEqual(s.facts().find(([term]) => term === 'Model'), ['Model', 'openai-codex/gpt-6.1-sol']);
  } finally { view.unmount(); }
});

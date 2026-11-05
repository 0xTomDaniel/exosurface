// #81 (spec pages-and-activity S13; acceptance-one-page-in-view): a surface shows one page at a time. After a message about
// a new topic and Exo's finished turn, with no scroll, click or typing, the new topic's page is the one page in view and every
// earlier page shows only as a pill in the page strip: also when Exo's layout asks for the earlier page beside the new one,
// and when the surface's pages carry no focus at all. The app (app.tsx) is rendered through the SDK's app test runtime
// (test/app-render.ts); its RPCs run on server.ts, a send goes through the mock BB to host.ts and the release owner on the
// real Pi CLI (test/mock-bb.ts, whose fake model draws "draw <ref>: <title>" pages).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const panel = app.navPanels.find((p: any) => p.path === 'surface');
let view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

const main = () => view.container.querySelector('main') as HTMLElement;
const reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]') as HTMLElement | null;
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
// Shown: neither it nor anything around it is hidden from the person (aria-hidden, the hidden attribute, display:none).
const shown = (el: Element) => { for (let at: Element | null = el; at; at = at.parentElement) if (at.getAttribute('aria-hidden') === 'true' || at.hasAttribute('hidden') || getComputedStyle(at).display === 'none') return false; return true; };
/** The pages rendered in view, by their titles. */
const inView = () => [...main().querySelectorAll('section[data-surface]')].filter(shown).map(s => s.getAttribute('aria-label'));
/** The page strip's pills, by their labels. */
const pills = () => [...main().querySelectorAll('nav button[aria-pressed]')].filter(shown).map(b => b.textContent);
const until = waiter(() => `in view ${JSON.stringify(inView())}, pills ${JSON.stringify(pills())}`);
async function send(text: string) {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply()?.textContent === `Exo (exo-optchat): ${text}`);
}

test('after a message about a new topic and Exo\'s finished turn, its page is the one page in view; the earlier page is only a pill', async () => {
  await send('draw week: Week plan');
  await until('the week page', () => inView().includes('Week plan'));
  await send('draw garden: Garden plan');
  await until('the garden page', () => inView().includes('Garden plan'));
  assert.deepEqual(inView(), ['Garden plan']);
  assert.deepEqual(pills(), ['Week plan']);
});

test('when Exo\'s layout asks for the earlier page beside the new one, the new page is still the only page in view', async () => {
  await send('draw seeds: Seed list beside garden');
  await until('the seed page', () => inView().includes('Seed list'));
  assert.deepEqual(inView(), ['Seed list']);
  assert.deepEqual(pills().sort(), ['Garden plan', 'Week plan']);
});

test('pages that carry no focus (no grid of pages): the newest page is the one page in view, every other one a pill', async () => {
  // The surface's pages as saved without a stage (no layout): what the workspace RPC delivers is the only change.
  const bare = (s: any) => { if (s) delete s.layout; return s; };
  const rpc = { ...f.rpc, async workspace(i: any) { const r = await f.rpc.workspace(i); bare(r.delivery.checkpoint); r.delivery.updates.forEach(bare); return r; } };
  view.unmount(); view = kit.renderSlot(panel, { subPath: '' }, { rpc });
  await until('the pages', () => inView().length > 0);
  assert.deepEqual(inView(), ['Seed list']);
  assert.deepEqual(pills().sort(), ['Garden plan', 'Week plan']);
});

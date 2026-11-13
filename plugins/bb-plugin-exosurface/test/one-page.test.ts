import { required } from './required.ts';
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
import { renderedApp, divided } from './app-render.ts';

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
  await until('the input to take a message', () => !!input() && !required(input(), "Expected input() to be non-null").disabled);
  fireEvent.change(required(input(), "Expected input() to be non-null"), { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  await until(`Exo's finished turn on ${JSON.stringify(text)}`, () => reply()?.textContent === `Exo (exo-optchat): ${text}`);
}

void test('after a message about a new topic and Exo\'s finished turn, its page is the one page in view; the earlier page is only a pill', async () => {
  await send('draw week: Week plan');
  await until('the week page', () => inView().includes('Week plan'));
  await send('draw garden: Garden plan');
  await until('the garden page', () => inView().includes('Garden plan'));
  assert.deepEqual(inView(), ['Garden plan']);
  assert.deepEqual(pills(), ['Week plan']);
});

void test('top down: the title, the page strip with the earlier page\'s pill, then the Exo block, then the page; a hairline sets the title and strip off', async () => {
  // Owner walkthrough on PR #89. Each part by what the person sees: the heading, the navigation holding the pills, the
  // Exo block, the page in view; screen (document) order as primitives, never elements compared.
  const title = required(main().querySelector('h1, h2, h3, h4, h5, h6'), "Expected main().querySelector('h1, h2, h3, h4, h5, h6') to be non-null"), strip = required([...main().querySelectorAll('nav')].find(n => n.querySelector('button[aria-pressed]') && shown(n)), "Expected [...main().querySelectorAll('nav')].find(n => n.querySelector('button[aria-pressed]') && shown(n)) to be non-null");
  const block = required(main().querySelector('section[aria-label="Exo"]'), "Expected main().querySelector('section[aria-label=\"Exo\"]') to be non-null"), page = required([...main().querySelectorAll('section[data-surface]')].find(shown), "Expected [...main().querySelectorAll('section[data-surface]')].find(shown) to be non-null");
  assert.ok(!!title && !!strip && !!block && !!page, `parts present: title ${!!title}, strip ${!!strip}, block ${!!block}, page ${!!page}`);
  const parts = [['title', title], ['strip', strip], ['block', block], ['page', page]] as const;
  const order = [...parts].sort(([, a], [, b]) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1).map(([k]) => k).join(' > ');
  assert.ok(order === 'title > strip > block > page', order);
  assert.ok(JSON.stringify(pills()) === '["Week plan"]', JSON.stringify(pills()));
  // The top area (title and strip) and the Exo block below it: a hairline between them (computed styles; true paint: RDP).
  assert.ok(divided(strip, block) && divided(title, block), `divided: strip ${divided(strip, block)}, title ${divided(title, block)}`);
  // The strip still works from its new place: a pill shows that page, and Back returns to the current topic.
  fireEvent.click(required([...strip.querySelectorAll('button[aria-pressed]')].find(b => b.textContent === 'Week plan'), "Expected [...strip.querySelectorAll('button[aria-pressed]')].find(b => b.textContent === 'Week plan') to be non-null"));
  await until('the week page from its pill', () => JSON.stringify(inView()) === '["Week plan"]');
  fireEvent.click(view.getByRole('button', { name: 'Back to the current topic' }));
  await until('back to the garden page', () => JSON.stringify(inView()) === '["Garden plan"]' && JSON.stringify(pills()) === '["Week plan"]');
});

void test('when Exo\'s layout asks for the earlier page beside the new one, the new page is still the only page in view', async () => {
  await send('draw seeds: Seed list beside garden');
  await until('the seed page', () => inView().includes('Seed list'));
  assert.deepEqual(inView(), ['Seed list']);
  assert.deepEqual(pills().sort(), ['Garden plan', 'Week plan']);
});

void test('pages that carry no focus (no grid of pages): the newest page is the one page in view, every other one a pill', async () => {
  // The surface's pages as saved without a stage (no layout): what the workspace RPC delivers is the only change.
  const bare = (s: any) => { if (s) delete s.layout; return s; };
  const rpc = { ...f.rpc, async workspace(i: any) { const r = await f.rpc.workspace(i); bare(r.delivery.checkpoint); r.delivery.updates.forEach(bare); return r; } };
  view.unmount(); view = kit.renderSlot(panel, { subPath: '' }, { rpc });
  await until('the pages', () => inView().length > 0);
  assert.deepEqual(inView(), ['Seed list']);
  assert.deepEqual(pills().sort(), ['Garden plan', 'Week plan']);
});

// #79 (spec pages-and-activity S12, E8; acceptance-name-header, acceptance-opening): the top of the surface in view is its
// own name, then the Exo block opens the page: the person's latest message as a bubble, Exo's reply as plain text, then the
// page's content. The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on
// server.ts, a send goes through the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp, rightAligned, boxed } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close, browser } = await renderedApp(), { fireEvent } = kit.testing;
const panel = app.navPanels.find((p: any) => p.path === 'surface');
let view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

const main = () => view.container.querySelector('main') as HTMLElement;
const title = () => main().querySelector('h1, h2, h3, h4, h5, h6') as HTMLElement | null;
const block = () => view.container.querySelector('section[aria-label="Exo"]') as HTMLElement | null;
const bubble = () => block()?.querySelector('[data-exo-said]') as HTMLElement | null;
const reply = () => block()?.querySelector('[data-exo-reply]') as HTMLElement | null;
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
const until = waiter(() => `page: ${main()?.textContent}`);
async function send(text: string) {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
}
const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

test('after a second send and Exo\'s finished turn: the name, the second message as a bubble, Exo\'s reply as plain text, then the page; nothing of the first message', async () => {
  await send('draw: Week plan');
  await until('the first reply', () => reply()?.textContent === 'Exo (exo-optchat): draw: Week plan');
  await until('the drawn page', () => !!main().querySelector('[data-surface]'));
  // The fake model holds this turn ("hold:", test/mock-bb.ts) until the working block has been seen, so it cannot finish first.
  await send('hold: plan the week, with Friday off');
  // While Exo works, the bubble is the message just sent and the block's one working line follows it.
  await until('the working block', () => bubble()?.textContent === 'hold: plan the week, with Friday off' && reply()?.textContent === 'Reading your message');
  assert.equal(block()!.querySelectorAll('[role="status"]').length, 1);
  f.release('exo-optchat');
  await until('the second reply', () => reply()?.textContent === 'Exo (exo-optchat): hold: plan the week, with Friday off');

  const page = main().querySelector('[data-surface]') as HTMLElement;
  assert.equal(title()!.textContent, 'Home');
  assert.equal(bubble()!.textContent, 'hold: plan the week, with Friday off');
  // Screen order: the title, the bubble, the reply, the page's content; one scrolling region holds them all.
  assert.ok(before(title()!, bubble()!) && before(bubble()!, reply()!) && before(reply()!, page), main().innerHTML);
  assert.ok(main().contains(bubble()) && main().contains(page));
  // The bubble sits on the right; the reply is plain text, not in a box (computed styles; layout: the owner's RDP walkthrough).
  assert.equal(rightAligned(bubble()!), true);
  assert.equal(boxed(reply()!, block()!), false);
  // Nothing of the first message or its reply.
  assert.equal(view.container.textContent!.includes('draw: Week plan'), false);
  assert.equal(input()!.value, '');
});

test('a send scrolls the surface back to its top, eased (instantly under reduced motion); a press on its page, Exo\'s turn ending and a poll leave the scroll where it was', async () => {
  // Owner walkthrough on PR #89 (spec E8, F1/F4). jsdom does no layout or scrolling: through the browser stand-ins of
  // test/app-render.ts it proves what the surface asks its scroll container for (top 0, smooth or instant) and that the
  // request reaches that container (its scrollTop). The visible easing, and the title, page strip and bubble then showing
  // on screen, are the owner's RDP re-check.
  // The press is the one the page's button sends, through the action RPC: the app hears of it only by its turn and the
  // polls that follow.
  const scroller = main(), revision = () => view.container.querySelector('[aria-label="Surface revision"]')?.textContent;
  scroller.scrollTop = 400;
  assert.ok(scroller.scrollTop === 400, `scrolled down: ${scroller.scrollTop}`);
  const asked = browser.scrolls.length, request = () => JSON.stringify(browser.scrolls.slice(asked));
  const drawn = (await f.rpc.workspace({ deployment: 'main', cursor: null })).delivery.checkpoint;
  const surfaceId = drawn.messages.find((m: any) => m.createSurface).createSurface.surfaceId, at = revision();
  const button = drawn.messages.flatMap((m: any) => m.updateComponents?.components ?? []).find((n: any) => n.action?.event);
  const context = Object.fromEntries(Object.keys(button.action.event.context).map(k => [k, 'Grace']));
  const pressed = await f.rpc.action({ threadId: 'primary', revision: drawn.revision, event: { version: 'v0.9.1', action: { name: button.action.event.name, surfaceId, sourceComponentId: button.id, timestamp: new Date().toISOString(), context } }, actionId: randomUUID(), metadata: { a2uiClientCapabilities: { 'v0.9.1': { supportedCatalogIds: ['https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json'] } } } });
  assert.ok(pressed.accepted === true, JSON.stringify(pressed));
  await until('the press turn\'s reply and the pressed page polled in', () => !!reply()?.textContent?.startsWith('Exo (exo-optchat): ▸') && revision() !== at);
  assert.ok(scroller.scrollTop === 400 && request() === '[]', `after a press, Exo's turn and polls: ${scroller.scrollTop}, scrolls asked ${request()}`);
  await send('and Saturday too');
  await until('the send accepted', () => input()!.value === '' && bubble()?.textContent === 'and Saturday too');
  assert.ok(main() === scroller && scroller.scrollTop === 0 && request() === '[{"top":0,"behavior":"smooth"}]', `after a send: ${scroller.scrollTop}, scrolls asked ${request()}`);
  await until('the send\'s reply', () => reply()?.textContent === 'Exo (exo-optchat): and Saturday too');
  // The person asked their system for reduced motion: the next send jumps to the top instead.
  browser.reducedMotion = true; scroller.scrollTop = 400;
  const before = browser.scrolls.length;
  try {
    await send('and Sunday');
    await until('the second send accepted', () => input()!.value === '' && bubble()?.textContent === 'and Sunday');
    const jumped = JSON.stringify(browser.scrolls.slice(before));
    assert.ok(scroller.scrollTop === 0 && jumped === '[{"top":0,"behavior":"auto"}]', `after a send with reduced motion: ${scroller.scrollTop}, scrolls asked ${jumped}`);
    await until('the second send\'s reply', () => reply()?.textContent === 'Exo (exo-optchat): and Sunday');
  } finally { browser.reducedMotion = false; }
});

test('a surface whose stored name is "Garden plan" shows "Garden plan" as its title at the top; Home shows "Home"; never "Exosurface"', async () => {
  const made = (await f.rpc.thread_new(null)).threadId;
  f.retitle(made, 'Garden plan');
  view.unmount(); view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
  const open = (name: string) => fireEvent.click([...sidebar().querySelectorAll('li button')].find(b => b.textContent === name)!);
  const headings = () => [...view.container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map(h => h.textContent);
  await until('Garden plan in the sidebar', () => !!sidebar() && [...sidebar().querySelectorAll('li button')].some(b => b.textContent === 'Garden plan'));
  open('Garden plan');
  await until('Garden plan as the title', () => title()?.textContent === 'Garden plan');
  assert.ok(main().textContent!.startsWith('Garden plan'), main().textContent!);
  assert.deepEqual(headings().filter(h => h?.includes('Exosurface')), []);
  open('Home');
  await until('Home as the title', () => title()?.textContent === 'Home');
  assert.deepEqual(headings().filter(h => h?.includes('Exosurface')), []);
});

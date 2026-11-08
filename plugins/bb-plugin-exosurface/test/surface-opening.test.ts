// #79 (spec pages-and-activity S12, E8; acceptance-name-header, acceptance-opening): the top of the surface in view is its
// own name, then the Exo block opens the page: the person's latest message as a bubble, Exo's reply as plain text, then the
// page's content. The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on
// server.ts, a send goes through the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
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
  await send('plan the week, with Friday off');
  // While Exo works, the bubble is the message just sent and the block's one working line follows it.
  await until('the working block', () => bubble()?.textContent === 'plan the week, with Friday off' && reply()?.textContent === 'Exo is working on this page…');
  assert.equal(block()!.querySelectorAll('[role="status"]').length, 1);
  await until('the second reply', () => reply()?.textContent === 'Exo (exo-optchat): plan the week, with Friday off');

  const page = main().querySelector('[data-surface]') as HTMLElement;
  assert.equal(title()!.textContent, 'Home');
  assert.equal(bubble()!.textContent, 'plan the week, with Friday off');
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

test('a press on its page and a send both scroll the surface back to its top through the one eased scroll (instantly under reduced motion); Exo\'s turn ending and a poll leave the scroll where it was', async () => {
  // Owner walkthrough on PR #89 (spec E8, F1/F4) and owner ruling 2026-11-05 on #138 (F6, acceptance-press-to-top: a
  // press must not jump, it eases exactly like a send). jsdom does no layout or scrolling: through the browser stand-ins
  // of test/app-render.ts it proves what the surface asks its scroll container for (top 0, smooth or instant) and that
  // the request reaches that container (its scrollTop). The visible easing, and the title, page strip and bubble then
  // showing on screen, are the owner's RDP re-check.
  // The press is the person clicking the page's Book button in the rendered surface.
  const revision = () => view.container.querySelector('[aria-label="Surface revision"]')?.textContent;
  const book = () => [...main().querySelectorAll('[data-surface] button')].find(b => b.textContent?.trim() === 'Book') as HTMLButtonElement | undefined;
  const idle = () => !!book() && !book()!.closest('[inert]') && !!input() && !input()!.disabled;
  // Each step starts scrolled down, below the first screen; it returns the scrolls the surface asked for during it.
  async function step(what: string, act: () => Promise<void>) {
    main().scrollTop = 400;
    assert.equal(main().scrollTop, 400, `scrolled down before ${what}`);
    const asked = browser.scrolls.length;
    await act();
    return { top: main().scrollTop, asked: JSON.stringify(browser.scrolls.slice(asked)) };
  }
  async function press(who: string) {
    await until('the page\'s Book button, idle', idle);
    const at = revision(), field = main().querySelector('[data-surface] input') as HTMLInputElement;
    fireEvent.input(field, { target: { value: who } });
    fireEvent.click(book()!);
    // Exo's turn on the press ends and the pressed page is polled in; neither scrolls again.
    await until('the press turn\'s reply and the pressed page polled in', () => !!reply()?.textContent?.startsWith('Exo (exo-optchat): ▸') && revision() !== at);
  }
  async function sent(text: string) {
    await send(text);
    await until('the send accepted', () => input()!.value === '' && bubble()?.textContent === text);
    await until('the send\'s reply', () => reply()?.textContent === `Exo (exo-optchat): ${text}`);
  }
  const eased = '[{"top":0,"behavior":"smooth"}]', instant = '[{"top":0,"behavior":"auto"}]';
  const pressed = await step('a press', () => press('Grace'));
  assert.ok(pressed.top === 0 && pressed.asked === eased, `after a press, Exo's turn and polls: ${JSON.stringify(pressed)}`);
  const send1 = await step('a send', () => sent('and Saturday too'));
  assert.ok(send1.top === 0 && send1.asked === eased, `after a send: ${JSON.stringify(send1)}`);
  // The person asked their system for reduced motion: a press and a send both jump to the top instead.
  browser.reducedMotion = true;
  try {
    const pressed2 = await step('a press with reduced motion', () => press('Lin'));
    assert.ok(pressed2.top === 0 && pressed2.asked === instant, `after a press with reduced motion: ${JSON.stringify(pressed2)}`);
    const send2 = await step('a send with reduced motion', () => sent('and Sunday'));
    assert.ok(send2.top === 0 && send2.asked === instant, `after a send with reduced motion: ${JSON.stringify(send2)}`);
  } finally { browser.reducedMotion = false; }
});

test('after a press and Exo\'s finished turn, the person\'s bubble is the button\'s label, right-aligned, and Exo\'s reply to the press is plain text below it', async () => {
  // #141 (acceptance-press-to-top, F6: a press shows as the person's bubble with the button's label, never the press line).
  const book = () => [...main().querySelectorAll('[data-surface] button')].find(b => b.textContent?.trim() === 'Book') as HTMLButtonElement | undefined;
  await until('the page\'s Book button, idle', () => !!book() && !book()!.closest('[inert]') && !!input() && !input()!.disabled);
  fireEvent.input(main().querySelector('[data-surface] input') as HTMLInputElement, { target: { value: 'Ada' } });
  fireEvent.click(book()!);
  await until('Exo\'s reply to the press', () => !!reply()?.textContent?.startsWith('Exo (exo-optchat): ▸') && reply()!.textContent!.includes('Ada'));
  assert.equal(bubble()?.textContent, 'Book');
  assert.equal(rightAligned(bubble()!), true);
  assert.equal(before(bubble()!, reply()!), true);
  assert.equal(boxed(reply()!, block()!), false);
});

test('a press on an earlier version of the page, opened from its card in the chat, scrolls the surface back to its top through the same eased scroll', async () => {
  // Owner ruling 2026-11-05 on #138 (F6: every press, an earlier-version press included). The person clicks the chat card
  // of the page as first drawn (revision 1, since edited by the presses above), the surface shows that earlier version, and
  // they press its Book button; as above, what the surface asks its scroll container for and its scrollTop.
  const card = /::exo-surface\{surface="([^"]+)" revision="1" action="drew"\}/;
  const drawn = host.deltas('primary').map((d: any) => d.kind === 'item.textClose' ? card.exec(d.text) : null).find(Boolean)!;
  assert.ok(drawn, 'the chat card of the drawn page');
  const directive = app.messageDirectives.find((d: any) => d.id === 'exo-surface');
  const chat = kit.renderSlot(directive, { attributes: { surface: drawn[1], revision: '1', action: 'drew' }, message: { threadId: 'primary' } }, { rpc: f.rpc });
  try {
    const earlier = () => [...main().querySelectorAll('[role="status"]')].some(s => s.textContent?.startsWith('Earlier version'));
    const book = () => [...main().querySelectorAll('[data-surface] button')].find(b => b.textContent?.trim() === 'Book') as HTMLButtonElement | undefined;
    await until('the input idle', () => !!input() && !input()!.disabled);
    fireEvent.click(chat.container.querySelector('button')!);
    await until('the earlier version with its Book button', () => earlier() && !!book() && !book()!.closest('[inert]'));
    main().scrollTop = 400;
    assert.equal(main().scrollTop, 400, 'scrolled down before the press');
    const asked = browser.scrolls.length;
    fireEvent.input(main().querySelector('[data-surface] input')!, { target: { value: 'Ada' } });
    fireEvent.click(book()!);
    await until('the press turn\'s reply, back on the live page', () => !earlier() && bubble()?.textContent === 'Book' && !!reply()?.textContent?.startsWith('Exo (exo-optchat): Tom changed pages on the surface since your last turn') && reply()!.textContent!.includes('Brought back'));
    const pressed = { top: main().scrollTop, asked: JSON.stringify(browser.scrolls.slice(asked)) };
    assert.ok(pressed.top === 0 && pressed.asked === '[{"top":0,"behavior":"smooth"}]', `after a press on the earlier version: ${JSON.stringify(pressed)}`);
  } finally { chat.unmount(); }
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

test('a press on a button whose label holds " — " or " · " shows exactly that label as the person\'s bubble; a typed message that looks like a press shows as typed', async () => {
  // Review of PR #146 (F6, acceptance-press-to-top: the bubble carries the button's label, never a rewritten one).
  // Each button sends the page's note, so each press commits it and the next press is on a new revision.
  const snapshot = '- region "Plan · Week" [ref=pw]:\n  - textbox "Note" [ref=note]\n  - button "Keep — later" [ref=later] [action=later] [sends=note]\n  - button "Plan · Keep" [ref=plankeep] [action=plan] [sends=note]';
  const revision = (await f.rpc.workspace({ deployment: 'main', cursor: null })).revision;
  await until('the input idle', () => !!input() && !input()!.disabled);
  host.send('primary', `call: ${JSON.stringify({ baseRevision: revision, snapshot })}`);
  const button = (label: string) => [...main().querySelectorAll('[data-surface] button')].find(b => b.textContent?.trim() === label) as HTMLButtonElement | undefined;
  for (const [label, note] of [['Keep — later', 'first'], ['Plan · Keep', 'second']]) {
    await until(`the ${label} button, idle`, () => !!button(label) && !button(label)!.closest('[inert]') && !!input() && !input()!.disabled);
    fireEvent.input(main().querySelector('[data-surface] input') as HTMLInputElement, { target: { value: note } });
    fireEvent.click(button(label)!);
    await until(`Exo's reply to the ${label} press`, () => reply()?.textContent === `Exo (exo-optchat): ▸ Plan · Week · ${label} — Note: “${note}”`);
    assert.equal(bubble()?.textContent, label);
  }
  await send('▸ Plan · Keep');
  await until('the reply to the typed message', () => reply()?.textContent === 'Exo (exo-optchat): ▸ Plan · Keep');
  assert.equal(bubble()?.textContent, '▸ Plan · Keep');
});

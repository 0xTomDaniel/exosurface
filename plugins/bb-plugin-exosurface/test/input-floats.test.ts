// #80 (spec pages-and-activity S11; acceptance-input-floats): the input floats over the bottom of the scrolling surface in
// the page's column, the page scrolls beneath it, and the content under it fades out from its middle down. The app (app.tsx)
// is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run on server.ts, a send goes through the mock
// BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts). Presentation is read from computed styles, never
// class names; jsdom does no layout, so true layout and paint are checked in the owner's RDP walkthrough.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { waiter } from './wait.ts';
import { renderedApp, pinnedToBottom, column, fadeStart, centeredIn } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
after(async () => {
  view.unmount(); close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

const main = () => view.container.querySelector('main') as HTMLElement;
const form = () => view.container.querySelector('form[aria-label="Message Exo"]') as HTMLFormElement | null;
const input = () => form()?.querySelector('textarea') as HTMLTextAreaElement | null;
const reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]') as HTMLElement | null;
const until = waiter(() => `page: ${main()?.textContent}`);
async function send(text: string) {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: text } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
}
const before = (a: Node, b: Node) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);

test('on a drawn page, the input floats over the bottom of the scrolling surface at the page\'s width, fading the content beneath it from its middle down', { timeout: 60000 }, async () => {
  await send('draw: Week plan');
  await until('the reply', () => reply()?.textContent === 'Exo (exo-optchat): draw: Week plan');
  await until('the drawn page', () => !!main().querySelector('[data-surface]'));
  const page = main().querySelector('[data-surface]') as HTMLElement;
  // Assertions compare booleans only: a failing assert on jsdom elements makes node inspect the whole DOM graph.
  // Pinned over the bottom of the surface that scrolls the page, not of the window.
  const held = pinnedToBottom(form()!);
  assert.ok(held !== null, 'the input is held against the bottom of a scrolling region');
  assert.ok(held!.scroller.contains(page), 'the region the input floats over is the one the page scrolls in');
  // In flow after the page, so the page's last lines scroll clear above it.
  assert.ok(before(page, held!.pinned), 'the input comes after the page');
  // Its width follows the page's column, not the window.
  const col = column(page);
  assert.ok(col !== null && col !== held!.scroller, 'the page sits in a column narrower than the surface');
  assert.ok(column(form()!) === col, 'the input follows the page\'s column');
  // The fade starts at the input's middle and runs to the bottom edge.
  assert.equal(fadeStart(held!.pinned), 0.5);
  assert.equal(centeredIn(form()!, held!.pinned), true);
});

test('the floating input still sends and is empty again after the send', { timeout: 60000 }, async () => {
  await send('plan the week, with Friday off');
  await until('the reply', () => reply()?.textContent === 'Exo (exo-optchat): plan the week, with Friday off');
  assert.equal(input()!.value, '');
  assert.ok(pinnedToBottom(form()!) !== null, 'the input is still pinned');
});

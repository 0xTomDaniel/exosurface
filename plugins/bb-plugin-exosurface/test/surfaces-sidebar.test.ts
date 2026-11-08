// #68 (spec pages-and-activity S7, N1; acceptance-new-surface), the rendered app: the Exosurface panel shows a sidebar of
// surfaces (Home, then every other, flat) and the surface in view; New surface puts the new one in view with an empty page.
// Rendered from package.json bb.app in BB's SDK app test runtime; the rpc handlers stand in for the server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderedApp } from './app-render.ts';
import { waiter } from './wait.ts';

const { kit, app, close } = await renderedApp();
after(close);
const { fireEvent, within, screen } = kit.testing;
const empty = (threadId: string) => ({ threadId, ready: true, streaming: false, revision: 0, composition: { configured: false, surfaceId: null, candidateCount: 0, running: false, lastRun: null }, observer: null, delivery: { epoch: 'e', checkpoint: null, updates: [], preview: null } });
// Home has one drawn page, the A2UI surface "week" (one basic-catalog Text), so the test sees which thread's page is on screen.
const HOME_PAGE = 'Week plan: Monday to Friday';
const homePage = () => ({ ...empty('primary'), revision: 1, delivery: { epoch: 'home', checkpoint: { revision: 1, messages: [
  { version: 'v0.9', createSurface: { surfaceId: 'week', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json' } },
  { version: 'v0.9', updateComponents: { surfaceId: 'week', components: [{ id: 'root', component: 'Text', text: HOME_PAGE }] } },
] }, updates: [], preview: null } });
/** Home's page as rendered on the canvas: its surface section. */
const homeShown = () => document.querySelector('main[aria-label="Exo"] section[data-surface="week"]') !== null;
const input = () => document.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;

test('New surface puts a new surface in view with one empty page; the sidebar lists Home, then the new surface', async t => {
  const threads = [{ threadId: 'primary', title: 'Home', home: true }];
  const panel = app.navPanels.find((p: any) => p.path === 'surface');
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: {
    thread_list: async () => ({ threads }),
    thread_new: async () => { threads.push({ threadId: 'thread-2', title: 'New surface', home: false }); return { threadId: 'thread-2' }; },
    workspace: async (input: any) => input.threadId ? empty(input.threadId) : homePage(),
    exo_block: async () => ({ working: false, words: '' }),
    // Exo is set up (#130: until then the tab shows only settings).
    canonical_setup_status: async () => ({ stage: 'bound' }),
  } });
  // Unmounted even on a red: a mounted view keeps the file alive until the runner's test timeout (scripts/check).
  t.after(() => view.unmount());
  const nav = () => screen.queryByRole('navigation', { name: 'Surfaces' });
  const sidebar = () => within(screen.getByRole('navigation', { name: 'Surfaces' }));
  // Plain strings read off the screen, empty while the sidebar is not drawn yet, so a wait can poll them.
  const listed = (): string[] => { const n = nav(); return n ? within(n).queryAllByRole('listitem').map((li: any) => li.textContent) : []; };
  const inView = (): string[] => { const n = nav(); return n ? within(n).queryAllByRole('button').filter((b: any) => b.getAttribute('aria-current') === 'page').map((b: any) => b.textContent) : []; };
  const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
  // The file's one wait: test/wait.ts's waiter at its default deadline, not Testing Library waitFor's (#163).
  const until = waiter(() => `listed ${JSON.stringify(listed())}, in view ${JSON.stringify(inView())}, Home page shown ${homeShown()}`);
  await until('the sidebar to list Home', () => same(listed(), ['Home']));
  assert.deepEqual(listed(), ['Home']);
  assert.deepEqual(inView(), ['Home']);
  await until("Home's page on the canvas", () => homeShown());
  assert.equal(homeShown(), true);

  fireEvent.click(sidebar().getByRole('button', { name: 'New surface' }));
  await until('the sidebar to list Home, then New surface', () => same(listed(), ['Home', 'New surface']));
  assert.deepEqual(listed(), ['Home', 'New surface']);
  assert.deepEqual(inView(), ['New surface']);
  // The surface in view is the new thread: Home's page is gone, it has no page drawn yet, and its input is shown and empty.
  await until("Home's page to leave the canvas", () => !homeShown());
  assert.equal(homeShown(), false);
  assert.equal(document.querySelectorAll('[data-surface]').length, 0);
  await until('the input to be shown and enabled', () => !!input() && !input()!.disabled);
  assert.equal(input()!.value, '');

  // Home is one click away and is the primary thread's page state again.
  fireEvent.click(sidebar().getByRole('button', { name: 'Home' }));
  await until('Home in view', () => same(inView(), ['Home']));
  assert.deepEqual(inView(), ['Home']);
  await until("Home's page back on the canvas", () => homeShown());
  assert.equal(homeShown(), true);
});

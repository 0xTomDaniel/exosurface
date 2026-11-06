// #68 (spec pages-and-activity S7, N1; acceptance-new-surface), the rendered app: the Exosurface panel shows a sidebar of
// surfaces (Home, then every other, flat) and the surface in view; New surface puts the new one in view with an empty page.
// Rendered from package.json bb.app in BB's SDK app test runtime; the rpc handlers stand in for the server.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { renderedApp } from './app-render.ts';

const { kit, app, close } = await renderedApp();
after(close);
const { fireEvent, waitFor, within, screen } = kit.testing;
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

test('New surface puts a new surface in view with one empty page; the sidebar lists Home, then the new surface', async () => {
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
  const sidebar = () => within(screen.getByRole('navigation', { name: 'Surfaces' }));
  const listed = () => sidebar().getAllByRole('listitem').map((li: any) => li.textContent);
  const inView = () => sidebar().getAllByRole('button').filter((b: any) => b.getAttribute('aria-current') === 'page').map((b: any) => b.textContent);
  await waitFor(() => assert.deepEqual(listed(), ['Home']));
  assert.deepEqual(inView(), ['Home']);
  await waitFor(() => assert.equal(homeShown(), true));

  fireEvent.click(sidebar().getByRole('button', { name: 'New surface' }));
  await waitFor(() => assert.deepEqual(listed(), ['Home', 'New surface']));
  assert.deepEqual(inView(), ['New surface']);
  // The surface in view is the new thread: Home's page is gone, it has no page drawn yet, and its input is shown and empty.
  await waitFor(() => assert.equal(homeShown(), false));
  assert.equal(document.querySelectorAll('[data-surface]').length, 0);
  await waitFor(() => assert.ok(input() && !input()!.disabled));
  assert.equal(input()!.value, '');

  // Home is one click away and is the primary thread's page state again.
  fireEvent.click(sidebar().getByRole('button', { name: 'Home' }));
  await waitFor(() => assert.deepEqual(inView(), ['Home']));
  await waitFor(() => assert.equal(homeShown(), true));
  view.unmount();
});

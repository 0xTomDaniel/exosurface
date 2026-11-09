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

// #186 (spec N8, T3; acceptance-sidebar-pinned). jsdom does no layout, so where things sit is read from computed style: the
// one region of the sidebar that scrolls holds every surface and neither New surface nor Settings, which sit above and below
// it; nothing around them scrolls, so they stay in view wherever that region is scrolled.
test('acceptance-sidebar-pinned: with more surfaces than fit, scrolled to the tree\'s end, New surface stays at the top and the Settings gear at the bottom', async () => {
  const threads = [{ threadId: 'primary', title: 'Home', home: true }, ...Array.from({ length: 40 }, (_, i) => ({ threadId: `thread-${i + 2}`, title: `Surface ${i + 1}`, home: false }))];
  const panel = app.navPanels.find((p: any) => p.path === 'surface');
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: {
    thread_list: async () => ({ threads }),
    workspace: async (input: any) => input.threadId ? empty(input.threadId) : homePage(),
    exo_block: async () => ({ working: false, words: '' }),
    canonical_setup_status: async () => ({ stage: 'bound' }),
  } });
  try {
    const nav = () => document.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
    const rows = () => [...nav().querySelectorAll('li')];
    await waitFor(() => assert.equal(rows().length, 41));
    const scrolls = (el: Element) => ['auto', 'scroll'].includes(getComputedStyle(el).overflowY) || ['auto', 'scroll'].includes(getComputedStyle(el).overflow);
    const button = (name: string) => [...nav().querySelectorAll('button')].filter(b => (b.getAttribute('aria-label') ?? b.textContent) === name);
    const newSurface = button('New surface').filter(b => !b.closest('li')), settings = button('Settings');
    assert.equal(newSurface.length, 1);
    assert.equal(settings.length, 1);
    // The sidebar's one scrolling region holds every surface, Home to the last.
    const regions = [nav(), ...nav().querySelectorAll('*')].filter(scrolls);
    assert.equal(regions.length, 1, 'one scrolling region in the sidebar');
    const [list] = regions;
    assert.equal(list === nav(), false, 'the sidebar itself does not scroll');
    assert.equal(rows().every(r => list.contains(r)), true, 'every surface is in the scrolling region');
    // It shrinks to the room left between the two buttons (a flex column item that may shrink below its content).
    assert.equal(getComputedStyle(nav()).display, 'flex');
    assert.equal(getComputedStyle(nav()).flexDirection, 'column');
    assert.equal(list.parentElement === nav(), true);
    assert.equal(['0', '0px'].includes(getComputedStyle(list).minHeight), true, 'the list may shrink below its content');
    assert.equal(getComputedStyle(list).flexGrow, '1');
    // The person scrolls the list to its end.
    list.scrollTop = list.scrollHeight;
    // New surface sits above it, Home first in it, the Settings gear below it; none of the three scrolls with it.
    for (const b of [newSurface[0], settings[0]]) {
      assert.equal(list.contains(b), false);
      assert.equal(b.parentElement === nav(), true);
    }
    assert.equal([...nav().children].indexOf(newSurface[0]), 0, 'New surface at the top of the sidebar');
    assert.equal(rows()[0].textContent, 'Home');
    assert.equal(rows().at(-1)!.textContent, 'Surface 40');
    assert.equal(!!(list.compareDocumentPosition(settings[0]) & Node.DOCUMENT_POSITION_FOLLOWING), true, 'Settings below the list');
    assert.equal([...nav().children].filter(c => c.tagName !== 'P').at(-1) === settings[0], true, 'Settings at the bottom of the sidebar');
    // Shown as a gear; named Settings for people and assistive tech.
    assert.equal(settings[0].textContent, '⚙');
    assert.equal(settings[0].getAttribute('title'), 'Settings');
  } finally { view.unmount(); }
});

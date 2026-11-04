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

test('New surface puts a new surface in view with one empty page; the sidebar lists Home, then the new surface', async () => {
  const threads = [{ threadId: 'primary', title: 'Home', home: true }];
  const panel = app.navPanels.find((p: any) => p.path === 'surface');
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: {
    thread_list: async () => ({ threads }),
    thread_new: async () => { threads.push({ threadId: 'thread-2', title: 'New surface', home: false }); return { threadId: 'thread-2' }; },
    workspace: async (input: any) => empty(input.threadId ?? 'primary'),
  } });
  const sidebar = () => within(screen.getByRole('navigation', { name: 'Surfaces' }));
  const listed = () => sidebar().getAllByRole('listitem').map((li: any) => li.textContent);
  const inView = () => sidebar().getAllByRole('button').filter((b: any) => b.getAttribute('aria-current') === 'page').map((b: any) => b.textContent);
  await waitFor(() => assert.deepEqual(listed(), ['Home']));
  assert.deepEqual(inView(), ['Home']);

  fireEvent.click(sidebar().getByRole('button', { name: 'New surface' }));
  await waitFor(() => assert.deepEqual(listed(), ['Home', 'New surface']));
  assert.deepEqual(inView(), ['New surface']);
  // The surface in view is the new thread: its own page state, and it has no page drawn yet.
  await waitFor(() => assert.ok(view.inspection.rpcCalls.some((c: any) => c.method === 'workspace' && c.input.threadId === 'thread-2')));
  assert.equal(document.querySelectorAll('[data-surface]').length, 0);

  // Home is one click away and is the primary thread's page state again.
  const calls = view.inspection.rpcCalls.length;
  fireEvent.click(sidebar().getByRole('button', { name: 'Home' }));
  await waitFor(() => assert.deepEqual(inView(), ['Home']));
  await waitFor(() => assert.ok(view.inspection.rpcCalls.slice(calls).some((c: any) => c.method === 'workspace' && c.input.threadId === undefined)));
  view.unmount();
});

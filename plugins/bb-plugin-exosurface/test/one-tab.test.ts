// #128 (spec pages-and-activity T1, T2; acceptance-one-tab, acceptance-tab-opens-home, acceptance-plugin-name): Exo is one
// BB tab named "Exo", opening on the sidebar and Home with the input shown, and BB lists the plugin as "Exo". Rendered from
// package.json bb.app in BB's SDK app test runtime; the rpc handlers stand in for the server. Only extracted strings and
// counts are compared.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderedApp } from './app-render.ts';
import { waiter } from './wait.ts';

const { kit, app, close } = await renderedApp();
after(close);
const { within, screen } = kit.testing;

test('the plugin app registers one nav panel, titled "Exo"; none titled "Exosurface" and no proof panel', () => {
  const titles: string[] = app.navPanels.map((p: any) => String(p.title));
  const paths: string[] = app.navPanels.map((p: any) => String(p.path));
  assert.deepEqual(titles, ['Exo']);
  assert.equal(titles.filter(t => t === 'Exosurface').length, 0);
  assert.equal(paths.filter(p => p === 'proof').length, 0);
});

test('opening the Exo tab shows the sidebar and Home, with the input shown', async () => {
  const panel = app.navPanels.find((p: any) => p.title === 'Exo');
  assert.ok(panel, 'no panel titled "Exo"');
  const home = { threadId: 'primary', ready: true, streaming: false, revision: 1, composition: { configured: false, surfaceId: null, candidateCount: 0, running: false, lastRun: null }, observer: null,
    delivery: { epoch: 'home', checkpoint: { revision: 1, messages: [
      { version: 'v0.9', createSurface: { surfaceId: 'week', catalogId: 'https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json' } },
      { version: 'v0.9', updateComponents: { surfaceId: 'week', components: [{ id: 'root', component: 'Text', text: 'Home page text' }] } },
    ] }, updates: [], preview: null } };
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: {
    thread_list: async () => ({ threads: [{ threadId: 'primary', title: 'Home', home: true }] }),
    workspace: async () => home,
    exo_block: async () => ({ working: false, words: '' }),
  } });
  try {
    const sidebar = () => within(screen.getByRole('navigation', { name: 'Surfaces' }));
    const inView = () => sidebar().getAllByRole('button').filter((b: any) => b.getAttribute('aria-current') === 'page').map((b: any) => String(b.textContent));
    const entries = (): string[] => screen.queryByRole('navigation', { name: 'Surfaces' }) ? sidebar().queryAllByRole('listitem').map((li: any) => String(li.textContent)) : [];
    const pages = () => document.querySelectorAll('section[data-surface="week"]').length;
    const inputs = () => document.querySelectorAll('form[aria-label="Message Exo"] textarea:not([disabled])').length;
    const until = waiter(() => `sidebar ${JSON.stringify(entries())}; Home pages ${pages()}; enabled inputs ${inputs()}`);
    await until('the sidebar listing Home', () => entries().join('|') === 'Home');
    assert.deepEqual(entries(), ['Home']);
    assert.deepEqual(inView(), ['Home']);
    await until('the Home page', () => pages() === 1);
    assert.equal(pages(), 1);
    await until('the enabled input', () => inputs() === 1);
    assert.equal(inputs(), 1);
  } finally { view.unmount(); }
});

test('BB lists the plugin as "Exo" (package.json bb.name)', () => {
  const manifest = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'package.json'), 'utf8'));
  assert.equal(manifest.bb.name, 'Exo');
});

// PR #89 blocker (owner re-check crash 2026-11-05): a plugin reinstall or reload loads a second app bundle into BB's
// long-lived window, whose one customElements registry still holds the first bundle's A2UI element classes. The second
// bundle must render the same page without "Custom element tag name collision" (which made BB disable the slot). Two
// distinct builds of app.tsx (test/app-render.ts) in one jsdom window; RPCs on server.ts, the page drawn by the fake
// model through the mock BB, host.ts and the release owner on the real Pi CLI (test/mock-bb.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { liveFixture, owner, bridge } from './mock-bb.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.ok((await host.start('primary')).error === undefined, 'Home starts');
host.send('primary', 'draw week: Week plan');
await host.settled(['primary']);
const first = await renderedApp(), second = await renderedApp({ window: first.window });
const errors: string[] = [], consoleError = console.error;
console.error = (...args: unknown[]) => { errors.push(args.map(a => a instanceof Error ? a.message : String(a)).join(' ')); };
after(async () => {
  console.error = consoleError; first.close();
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});

/** Renders the surface panel from one bundle until its page shows; what the person sees of it, as primitives. */
async function shown(bundle: Awaited<ReturnType<typeof renderedApp>>) {
  const panel = bundle.app.navPanels.find((p: any) => p.path === 'surface');
  let view: any;
  try { view = bundle.kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc }); } catch (e) { errors.push(String(e)); return { title: null, root: null, upgraded: false, text: '' }; }
  const page = () => view.container.querySelector('section[data-surface]') as HTMLElement | null;
  // Until the page's A2UI elements have rendered its heading (they render it themselves once upgraded).
  for (let waited = 0; !page()?.textContent?.includes('Week plan') && waited < 20000; waited += 50) await new Promise(r => setTimeout(r, 50));
  const root = page()?.firstElementChild ?? null, tag = root?.tagName.toLowerCase() ?? '';
  // Upgraded: the element in the page is an instance of the class the window's registry holds for its tag.
  const result = { title: page()?.getAttribute('aria-label') ?? null, root: tag || null, upgraded: !!root && !!customElements.get(tag) && root instanceof customElements.get(tag)!, text: page()?.textContent?.trim() ?? '' };
  view.unmount();
  return result;
}

test('a second app bundle in the same window renders the page the first one did, without a tag name collision', async () => {
  const one = await shown(first);
  assert.ok(one.title === 'Week plan' && one.text.includes('Week plan') && one.upgraded && !!one.root?.startsWith('a2ui-basic-column'), `bundle 1: ${JSON.stringify(one)}`);
  const two = await shown(second);
  const collisions = errors.filter(e => e.includes('collision'));
  assert.ok(collisions.length === 0, `collisions: ${JSON.stringify(collisions.slice(0, 2))}`);
  assert.ok(two.title === 'Week plan' && two.text.includes('Week plan') && two.upgraded && !!two.root?.startsWith('a2ui-basic-column'), `bundle 2: ${JSON.stringify(two)}`);
});

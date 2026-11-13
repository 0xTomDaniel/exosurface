// #130 (spec pages-and-activity T5): a set-up that stops part way resumes from settings. Here BB's connection is lost once
// while set-up checks the conversation it created (the mock BB's threads.get fails once): set-up stops after that
// conversation exists. Settings, also when the Exo tab is opened again, offer to resume it with what it was started with;
// resuming finishes it without a second conversation, and the tab shows the sidebar and Home with the input.
// The app (package.json bb.app) rendered through the SDK's app test runtime (test/app-render.ts) on server.ts's RPCs, on a
// fixture with Exo installed and not set up (test/mock-bb.ts installedFixture). Only extracted strings and counts are compared.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { installedFixture } from './mock-bb.ts';
import { reapOnExit } from './reap.ts';
import { settled, waiter } from './wait.ts';
import { renderedApp } from './app-render.ts';
import { exoTab } from './exo-tab.ts';

const f = await installedFixture();
const { kit, app, close } = await renderedApp();
const panel = app.navPanels.find((p: any) => p.title === 'Exo');
after(async () => {
  close();
  const pis = f.piRuns().map(r => r.pid as number); for (const pid of pis) reapOnExit(pid);
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } };
  if (!(await settled(() => !pis.some(alive), 15000))) throw new Error(`Pi still running (${pis.filter(alive).join(', ')}); fixture kept at ${f.root}`);
  rmSync(f.root, { recursive: true, force: true });
});

void test('a set-up that stopped part way shows as resumable in settings and resumes from there', async () => {
  f.faults.threadGet = 1;
  let view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  let s = exoTab(view, kit.testing.fireEvent);
  const until = waiter(() => s.describe());
  try {
    await until('settings offering set-up', () => s.setUpButton() === 'Set up Exo');
    s.press('Set up Exo');
    await until('set-up stopped part way, offered to resume', () => s.setUpButton() === 'Resume set-up', 60000);
    assert.equal(s.sidebarShown(), 0);
    assert.equal(s.inputs(), 0);
    assert.ok(s.text().some(t => /stopped part way/.test(t)), 'settings say set-up stopped part way');
    // Opened again, the tab still offers to resume, with what set-up was started with.
    view.unmount();
    view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc }); s = exoTab(view, kit.testing.fireEvent);
    await until('settings offering to resume', () => s.setUpButton() === 'Resume set-up');
    assert.deepEqual(s.fields().map(([label, value]) => [label, value]), [['Project', 'Exo'], ['Workspace', f.vault], ['Pi', f.piCli], ['OptChat', f.optchat]]);
    s.press('Resume set-up');
    await until('the sidebar and Home with the input', () => s.listed().join('|') === 'Home' && s.inView().join('|') === 'Home' && s.input() !== null, 60000);
    assert.equal(s.input(), '');
    assert.equal(f.spawns.length, 1, 'resuming creates no second conversation');
  } finally { view.unmount(); }
});

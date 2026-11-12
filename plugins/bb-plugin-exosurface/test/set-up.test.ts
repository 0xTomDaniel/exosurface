// #130 (spec pages-and-activity T5, T2; acceptance-first-run, acceptance-set-up): until Exo is set up, the Exo tab shows
// only settings offering set-up: what Exo will use (project, workspace, Pi, OptChat), each filled in where Exo finds it and
// changeable, and a Set up Exo button. Pressing it runs the canonical set-up (server.ts canonical_setup) once; when it
// finishes the tab shows the sidebar and Home with the input shown and empty.
// The app (package.json bb.app) is rendered through the SDK's app test runtime (test/app-render.ts) on server.ts's RPCs, on
// a fixture with Exo installed and not set up (test/mock-bb.ts installedFixture). Only extracted strings and counts are compared.
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
  // Any Pi a set-up started, seen gone by a wall-clock deadline before the fixture is removed.
  const pis = f.piRuns().map(r => r.pid as number); for (const pid of pis) reapOnExit(pid);
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code !== 'ESRCH'; } };
  if (!(await settled(() => !pis.some(alive), 15000))) throw new Error(`Pi still running (${pis.filter(alive).join(', ')}); fixture kept at ${f.root}`);
  rmSync(f.root, { recursive: true, force: true });
});

test('not set up: the Exo tab shows only settings offering set-up, then Set up Exo shows the sidebar and Home with the input shown and empty', async () => {
  const view = kit.renderSlot(panel, { subPath: '' }, { rpc: f.rpc });
  const s = exoTab(view, kit.testing.fireEvent);
  const until = waiter(s.describe);
  try {
    // acceptance-first-run
    await until('settings offering set-up', () => s.fields().length === 4 && s.setUpButton() !== null);
    assert.deepEqual(s.fields().map(([label]) => label), ['Project', 'Workspace', 'Pi', 'OptChat']);
    // Each filled in where Exo finds it: the BB project, and the paths the installer's local config names.
    assert.deepEqual(s.fields().map(([, value]) => value), ['Exo', f.vault, f.piCli, f.optchat]);
    assert.ok(s.fields().every(([, , editable]) => editable), 'the person may change any of them');
    assert.equal(s.setUpButton(), 'Set up Exo');
    assert.equal(s.surfaceShown(), 0);
    assert.equal(s.sidebarShown(), 0);
    assert.equal(s.inputs(), 0);
    // acceptance-set-up
    s.press('Set up Exo');
    await until('the sidebar and Home with the input', () => s.listed().join('|') === 'Home' && s.inView().join('|') === 'Home' && s.input() !== null, 60000);
    assert.equal(s.input(), '');
    assert.equal(s.surfaceShown(), 1);
    assert.equal(s.settingsShown(), 0);
    // Set up once: one native conversation.
    assert.equal(f.spawns.length, 1);
    assert.equal((await f.rpc["canonical_setup_status"](null)).stage, 'bound');
  } finally { view.unmount(); }
});

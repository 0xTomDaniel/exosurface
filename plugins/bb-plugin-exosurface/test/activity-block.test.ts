// #85 (spec pages-and-activity E9, amends E4; acceptance-live-activity, acceptance-live-activity-ends): while Exo works, the
// Exo block of the page in view shows one line of what Exo is doing, replaced as Exo goes; once the turn ends it shows
// Exo's reply and no line. The app (app.tsx) is rendered through the SDK's app test runtime (test/app-render.ts); its RPCs run
// on server.ts, a send goes through the mock BB to host.ts and the release owner on the real Pi CLI (test/mock-bb.ts).
// Fake: BB's host, OptChat, the model ("steps: <topic>": reasoning, a read of <topic>.md, reasoning, the reply; each step
// held until its line is seen on screen). Only text and computed-style strings are read from the screen, never held.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge, stepsShown } from './mock-bb.ts';
import { waiter, settled } from './wait.ts';
import { reapOnExit } from './reap.ts';
import { renderedApp } from './app-render.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
assert.equal((await host.start('primary')).error, undefined);
writeFileSync(join(f.vault, 'garden.md'), '# The garden\n');
const { kit, app, close } = await renderedApp(), { fireEvent } = kit.testing;
const view = kit.renderSlot(app.navPanels.find((p: any) => p.path === 'surface'), { subPath: '' }, { rpc: f.rpc });
// The bridge, the owner and the Pis the owner started, each seen gone by a wall-clock deadline before the fixture is removed.
after(async () => {
  view.unmount(); close();
  const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
  const ended = (c: typeof ownerProcess) => c.exitCode !== null || c.signalCode !== null;
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) { return e.code !== 'ESRCH'; } };
  for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
  if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
  else throw new Error(`fixture processes still running; fixture kept at ${f.root}`);
});

const reply = () => view.container.querySelector('section[aria-label="Exo"] [data-exo-reply]') as HTMLElement | null;
const status = () => reply()?.querySelector('[role="status"]') as HTMLElement | null;
const input = () => view.container.querySelector('form[aria-label="Message Exo"] textarea') as HTMLTextAreaElement | null;
const until = waiter(() => `Exo block: ${reply()?.textContent}`);
const FALLBACK = 'Exo is working on this page…';

test('a send Exo answers in several steps: the Exo block shows one line of what Exo does, changing as it goes, then only the reply', async () => {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: 'steps: garden' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  // Each sample: the line's text, and as strings what keeps it one line and announced; the block holds nothing else meanwhile.
  const shown: string[] = [];
  const line = () => {
    const s = status(); if (!s || s.textContent === FALLBACK) return undefined;
    const css = getComputedStyle(s);
    shown.push(JSON.stringify({ alone: reply()!.textContent === s.textContent && reply()!.children.length === 1, live: s.getAttribute('aria-live'), wrap: css.whiteSpace, overflow: css.overflow || css.overflowX, ellipsis: css.textOverflow }));
    return s.textContent!;
  };
  const lines = await stepsShown(f, 'garden', line, () => status() === null && !!reply()?.textContent);
  assert.deepEqual(lines, ['Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  assert.deepEqual([...new Set(shown)], [JSON.stringify({ alone: true, live: 'polite', wrap: 'nowrap', overflow: 'hidden', ellipsis: 'ellipsis' })]);
  // acceptance-live-activity-ends: the reply, and no activity line.
  assert.equal(reply()!.textContent, `Exo (${f.setup.profile}): steps: garden`);
  assert.equal(status(), null);
  assert.equal(input()!.value, '');
});

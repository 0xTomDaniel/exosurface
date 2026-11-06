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
import { renderedApp, declared, keyframed, animation } from './app-render.ts';

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

test('a send Exo answers in several steps: the Exo block shows one line of what Exo does, changing as it goes, then only the reply', async () => {
  await until('the input to take a message', () => !!input() && !input()!.disabled);
  fireEvent.change(input()!, { target: { value: 'steps: garden' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  // Each sample: the line's text, and as strings what keeps it one line and announced, and the shimmer and fixed one-line
  // height jsdom computes for it from the app's own stylesheet; the block holds nothing else meanwhile. The first sample also
  // keeps what that stylesheet's source declares for the line (the gradient, the reduced-motion rule: values jsdom drops).
  const shown: string[] = [];
  let source: ReturnType<typeof declared> = [], canvas: CSSStyleDeclaration | null = null;
  const line = () => {
    const s = status(); if (!s) return undefined;
    const css = getComputedStyle(s);
    if (!canvas) { source = declared(s); canvas = getComputedStyle(s.closest('main[aria-label="Exosurface"]')!); }
    shown.push(JSON.stringify({ alone: reply()!.textContent === s.textContent && reply()!.children.length === 1, live: s.getAttribute('aria-live'), wrap: css.whiteSpace, overflow: css.overflow || css.overflowX, ellipsis: css.textOverflow,
      animation: animation(css.animation), clip: css.getPropertyValue('background-clip'), color: css.color, lineHeight: css.lineHeight, height: css.height }));
    return s.textContent!;
  };
  const lines = await stepsShown(f, 'garden', line, () => status() === null && !!reply()?.textContent);
  assert.deepEqual(lines, ['Reading your message', 'Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  const samples = [...new Set(shown)].map(s => JSON.parse(s));
  assert.equal(samples.length, 1, `the line's presentation changed between steps: ${JSON.stringify(samples)}`);
  const [sample] = samples;
  assert.deepEqual({ ...sample, animation: undefined, lineHeight: undefined, height: undefined },
    { alone: true, live: 'polite', wrap: 'nowrap', overflow: 'hidden', ellipsis: 'ellipsis', clip: 'text', color: 'rgba(0, 0, 0, 0)', animation: undefined, lineHeight: undefined, height: undefined });
  // The shimmer: one named animation, 1.5 to 2 s a sweep, looping while the line shows, moving the gradient under the text.
  assert.ok(sample.animation && sample.animation.infinite && sample.animation.seconds >= 1.5 && sample.animation.seconds <= 2, `animation: ${JSON.stringify(sample.animation)}`);
  assert.ok(keyframed(view.container.ownerDocument, sample.animation.name).includes('background-position'), `@keyframes ${sample.animation.name} moves no background`);
  // No layout shift: a set line height and a set box height, the same whatever the step text (one sample for all steps).
  assert.ok(!['', 'normal'].includes(sample.lineHeight) && !['', 'auto'].includes(sample.height), `line-height ${sample.lineHeight}, height ${sample.height}`);
  // Legible in both BB themes: the gradient painted through the text is the theme's own colours, every stop a var() the
  // canvas defines (from BB's light or dark host colours), at least two of them (the quiet text and a brighter band).
  const always = source.filter(d => !d.media);
  const gradient = always.filter(d => d.property === 'background-image' || d.property === 'background').map(d => d.value).filter(v => v.includes('linear-gradient')).at(-1) ?? '';
  const stops = [...new Set([...gradient.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))];
  assert.ok(stops.length >= 2 && !/#[0-9a-f]{3,8}\b|rgb|hsl|oklch\(/i.test(gradient), `gradient: ${gradient}`);
  for (const stop of stops) assert.notEqual(canvas!.getPropertyValue(stop).trim(), '', `${stop} is not defined on the canvas`);
  // Under prefers-reduced-motion: reduce the stylesheet stops that animation on this same element (jsdom applies no @media
  // rule, so the rule is read from the source the app put in the document).
  assert.deepEqual(source.filter(d => /prefers-reduced-motion:\s*reduce/.test(d.media) && d.property === 'animation').map(d => d.value), ['none']);
  // After the turn ends no element shimmers.
  assert.deepEqual([...view.container.querySelectorAll('*')].filter(e => animation(getComputedStyle(e).animation)?.name === sample.animation.name), []);
  // acceptance-live-activity-ends: the reply, and no activity line.
  assert.equal(reply()!.textContent, `Exo (${f.setup.profile}): steps: garden`);
  assert.equal(status(), null);
  assert.equal(input()!.value, '');
});

test('a send on a new surface whose turn the provider fails before any step: the Exo block shows one line from the send until the turn ends, then none', async () => {
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
  fireEvent.click([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface')!);
  await until('the new surface in view', () => [...sidebar().querySelectorAll('button[aria-current="page"]')].some(b => b.textContent === 'New surface'));
  // BB starts the spawned thread with its first message, as it does after spawn.
  const fresh = (await f.rpc.thread_list(null)).threads[1].threadId;
  assert.equal((await host.start(fresh, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  await until('the new surface to take a message', () => !!input() && !input()!.disabled && reply()?.textContent === '');
  const profile = f.piRuns().at(-1).profile, opened = host.deltas(fresh).filter(d => d.kind === 'turn.open').length;
  // The provider fails the turn once released: no reasoning, no tool step, no words, only an error.
  fireEvent.change(input()!, { target: { value: 'hold: fail: create a design for a flying car' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  await until('BB to take the send', () => input()!.value === '');
  // Each sample: the activity line on screen and whether it is the block's one element, from the send until the bridge
  // reports the turn's end; the provider holds the turn for 3 s of wall-clock time first.
  const samples: string[] = [], sample = () => { const s = status(); samples.push(JSON.stringify(s ? { line: s.textContent, alone: reply()!.children.length === 1 } : null)); };
  for (const held = Date.now() + 3000; Date.now() < held;) { sample(); await new Promise(r => setTimeout(r, 25)); }
  f.release(profile);
  const ended = () => { const d = host.deltas(fresh), open = d.filter(x => x.kind === 'turn.open')[opened]; return !!open && d.slice(d.indexOf(open)).some(x => x.kind === 'turn.boundary'); };
  for (const end = Date.now() + 30000; !ended();) { if (Date.now() > end) throw new Error('the failed turn did not end'); sample(); await new Promise(r => setTimeout(r, 25)); }
  // E9: before (here: without) any streamed reasoning or tool step, the line names the step Exo is taking in plain words,
  // never E4's bare "working" (owner ruling on #85), and never nothing.
  assert.deepEqual([...new Set(samples)], [JSON.stringify({ line: 'Reading your message', alone: true })]);
  // acceptance-live-activity-ends: once the turn has ended, no line (the failed turn has no words to show).
  await until('the line to go once the turn has ended', () => status() === null);
  assert.equal(reply()!.textContent, '');
});

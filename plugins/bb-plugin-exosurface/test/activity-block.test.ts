import { required } from './required.ts';
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
import { renderedApp, declared, keyframed, animation, gradientStops, themeColor, contrast, toOklab } from './app-render.ts';

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

void test('a send Exo answers in several steps: the Exo block shows one line of what Exo does, changing as it goes, then only the reply', async () => {
  await until('the input to take a message', () => !!input() && !required(input(), "Expected input() to be non-null").disabled);
  fireEvent.change(required(input(), "Expected input() to be non-null"), { target: { value: 'steps: garden' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  // Each sample: the line's text, and as strings what keeps it one line and announced, the fixed one-line height, and the
  // shimmer jsdom computes from the app's own stylesheet: on the element inside the line that paints the text, sized to the
  // text (an inline-block), not on the full-width line. The block holds nothing else meanwhile. The first sample also keeps
  // what that stylesheet's source declares for the shimmering element (the gradient, its size, the reduced-motion rule:
  // values jsdom drops).
  const shown: string[] = [];
  let source: ReturnType<typeof declared> = [], canvas: CSSStyleDeclaration | null = null;
  const line = () => {
    const s = status(); if (!s) return undefined;
    const css = getComputedStyle(s);
    const shimmer = [s, ...s.querySelectorAll('*')].find(e => animation(getComputedStyle(e).animation)) ?? s, glyphs = getComputedStyle(shimmer);
    if (!canvas) { source = declared(shimmer); canvas = getComputedStyle(required(s.closest('main[aria-label="Exo"]'), "Expected s.closest('main[aria-label=\"Exo\"]') to be non-null")); }
    shown.push(JSON.stringify({ alone: required(reply(), "Expected reply() to be non-null").textContent === s.textContent && required(reply(), "Expected reply() to be non-null").children.length === 1, live: s.getAttribute('aria-live'), wrap: css.whiteSpace, overflow: css.overflow || css.overflowX, ellipsis: css.textOverflow,
      inside: shimmer !== s && shimmer.textContent === s.textContent, sized: glyphs.display,
      animation: animation(glyphs.animation), clip: glyphs.getPropertyValue('background-clip'), color: glyphs.color, lineHeight: css.lineHeight, height: css.height }));
    return required(s.textContent, "Expected s.textContent to be non-null");
  };
  const lines = await stepsShown(f, 'garden', line, () => status() === null && !!reply()?.textContent);
  assert.deepEqual(lines, ['Reading your message', 'Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  const samples = [...new Set(shown)].map(s => JSON.parse(s));
  assert.equal(samples.length, 1, `the line's presentation changed between steps: ${JSON.stringify(samples)}`);
  const [sample] = samples;
  assert.deepEqual({ ...sample, animation: undefined, lineHeight: undefined, height: undefined },
    { alone: true, live: 'polite', wrap: 'nowrap', overflow: 'hidden', ellipsis: 'ellipsis', inside: true, sized: 'inline-block', clip: 'text', color: 'rgba(0, 0, 0, 0)', animation: undefined, lineHeight: undefined, height: undefined });
  // The shimmer: one named animation, 1.5 to 2 s a sweep, looping while the line shows, moving the gradient under the text.
  assert.ok(sample.animation && sample.animation.infinite && sample.animation.seconds >= 1.5 && sample.animation.seconds <= 2, `animation: ${JSON.stringify(sample.animation)}`);
  assert.ok(keyframed(view.container.ownerDocument, sample.animation.name).includes('background-position'), `@keyframes ${sample.animation.name} moves no background`);
  // No layout shift: a set line height and a set box height, the same whatever the step text (one sample for all steps).
  assert.ok(!['', 'normal'].includes(sample.lineHeight) && !['', 'auto'].includes(sample.height), `line-height ${sample.lineHeight}, height ${sample.height}`);
  // Legible in both BB themes: the gradient painted through the text is the theme's own colours, every stop a var() the
  // canvas defines (from BB's light or dark host colours), at least two of them (the quiet text and a band).
  const always = source.filter(d => !d.media);
  const gradient = always.filter(d => d.property === 'background-image' || d.property === 'background').map(d => d.value).filter(v => v.includes('linear-gradient')).at(-1) ?? '';
  const stops = [...new Set([...gradient.matchAll(/var\((--[\w-]+)/g)].map(m => m[1]))];
  assert.ok(stops.length >= 2 && !/#[0-9a-f]{3,8}\b|rgb|hsl|oklch\(/i.test(gradient), `gradient: ${gradient}`);
  for (const stop of stops) assert.notEqual(canvas!.getPropertyValue(stop).trim(), '', `${stop} is not defined on the canvas`);
  // A narrow band: the brighter stop rises from and falls back to the base between two stops at most 15% of the text's width
  // apart (stop positions are a share of the gradient, which is background-size wide against the text).
  const size = Number(/^(\d+(?:\.\d+)?)%/.exec(always.filter(d => d.property === 'background-size').at(-1)?.value ?? '')?.[1] ?? NaN) / 100;
  const at = gradientStops(gradient).map(x => ({ stop: x.color, at: x.at ?? NaN }));
  const base = at[0]?.stop, peak = at.findIndex(x => x.stop !== base), back = at.findIndex((x, i) => i > peak && x.stop === base);
  const band = (at[back]?.at - at[peak - 1]?.at) * size;
  assert.ok(band > 0 && band <= 0.15, `band ${band} of the text's width: ${gradient}, size ${size}`);
  // The band moves the text toward the page background (owner re-check on #85): in BB's light and dark themes alike, each
  // band stop, resolved with that theme's colours, is nearer the background (OKLab distance) and contrasts less with it
  // than the base text colour does, yet stays readable: at least 2:1 against the background. Theme values: BB 0.48's own
  // stylesheet (app/dist/assets/index-*.css, `:root,.light` and `.dark`); the app's vars from its stylesheet on the canvas.
  const bb = {
    light: { '--canvas': 'oklch(100% 0 0)', '--ink': 'oklch(32.11% 0 0)', '--muted-foreground': 'oklch(44% 0 0)' },
    dark: { '--canvas': 'oklch(19.5% 0 0)', '--ink': 'oklch(81% 0 0)', '--muted-foreground': 'oklch(78% 0 0)' },
  };
  const bands = [...new Set(at.filter(x => x.stop !== base).map(x => x.stop))];
  for (const [theme, colours] of Object.entries(bb)) {
    const vars: Record<string, string> = new Proxy({ ...colours, '--background': 'var(--canvas)', '--foreground': 'var(--ink)' } as Record<string, string>, { get: (o, k: string) => o[k] ?? canvas!.getPropertyValue(k) });
    const paper = themeColor('var(--exo-paper)', vars), quiet = themeColor(required(base, "Expected base to be non-null"), vars), ok = toOklab(paper);
    const far = (c: ReturnType<typeof themeColor>) => Math.hypot(...toOklab(c).map((v, i) => v - ok[i]));
    for (const stop of bands) {
      const glyph = themeColor(stop, vars), shown = `${theme}: band ${stop} ${contrast(glyph, paper).toFixed(2)}:1 on the background, base ${base} ${contrast(quiet, paper).toFixed(2)}:1`;
      assert.ok(far(glyph) < far(quiet) && contrast(glyph, paper) < contrast(quiet, paper), `the band is not nearer the background than the base: ${shown}`);
      assert.ok(contrast(glyph, paper) >= 2, `the band is unreadable: ${shown}`);
    }
  }
  // Under prefers-reduced-motion: reduce the stylesheet stops that animation on this same element (jsdom applies no @media
  // rule, so the rule is read from the source the app put in the document).
  assert.deepEqual(source.filter(d => /prefers-reduced-motion:\s*reduce/.test(d.media) && d.property === 'animation').map(d => d.value), ['none']);
  // and paints the text plainly in the theme's base colour: no gradient through it, a colour that is a theme var.
  const still = source.filter(d => /prefers-reduced-motion:\s*reduce/.test(d.media));
  assert.deepEqual(still.filter(d => ['background', 'background-image'].includes(d.property)).map(d => d.value), ['none'], JSON.stringify(still));
  assert.match(still.filter(d => d.property === 'color').at(-1)?.value ?? '', /^var\(--exo-[\w-]+\)$/, JSON.stringify(still));
  // After the turn ends no element shimmers.
  assert.deepEqual([...view.container.querySelectorAll('*')].filter(e => animation(getComputedStyle(e).animation)?.name === sample.animation.name), []);
  // acceptance-live-activity-ends: the reply, and no activity line.
  assert.equal(required(reply(), "Expected reply() to be non-null").textContent, `Exo (${f.setup.profile}): steps: garden`);
  assert.equal(status(), null);
  assert.equal(required(input(), "Expected input() to be non-null").value, '');
});

void test('a send on a new surface whose turn the provider fails before any step: the Exo block shows one line from the send until the turn ends, then none', async () => {
  const sidebar = () => view.container.querySelector('nav[aria-label="Surfaces"]') as HTMLElement;
  fireEvent.click(required([...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface'), "Expected [...sidebar().querySelectorAll('button')].find(b => b.textContent === 'New surface') to be non-null"));
  await until('the new surface in view', () => [...sidebar().querySelectorAll('button[aria-current="page"]')].some(b => b.textContent === 'New surface'));
  // BB starts the spawned thread with its first message, as it does after spawn.
  const fresh = (await f.rpc.thread_list(null)).threads[1].threadId;
  assert.equal((await host.start(fresh, [{ type: 'text', text: f.spawns.at(-1).prompt }])).error, undefined);
  await until('the new surface to take a message', () => !!input() && !required(input(), "Expected input() to be non-null").disabled && reply()?.textContent === '');
  const profile = f.piRuns().at(-1).profile, opened = host.deltas(fresh).filter(d => d.kind === 'turn.open').length;
  // The provider fails the turn once released: no reasoning, no tool step, no words, only an error.
  fireEvent.change(required(input(), "Expected input() to be non-null"), { target: { value: 'hold: fail: create a design for a flying car' } });
  fireEvent.click(view.getByRole('button', { name: 'Send' }));
  await until('BB to take the send', () => required(input(), "Expected input() to be non-null").value === '');
  // Each sample: the activity line on screen and whether it is the block's one element, from the send until the bridge
  // reports the turn's end; the provider holds the turn for 3 s of wall-clock time first.
  const samples: string[] = [], sample = () => { const s = status(); samples.push(JSON.stringify(s ? { line: s.textContent, alone: required(reply(), "Expected reply() to be non-null").children.length === 1 } : null)); };
  for (const held = Date.now() + 3000; Date.now() < held;) { sample(); await new Promise(r => setTimeout(r, 25)); }
  f.release(profile);
  const ended = () => { const d = host.deltas(fresh), open = d.filter(x => x.kind === 'turn.open')[opened]; return !!open && d.slice(d.indexOf(open)).some(x => x.kind === 'turn.boundary'); };
  for (const end = Date.now() + 30000; !ended();) { if (Date.now() > end) throw new Error('the failed turn did not end'); sample(); await new Promise(r => setTimeout(r, 25)); }
  // E9: before (here: without) any streamed reasoning or tool step, the line names the step Exo is taking in plain words,
  // never E4's bare "working" (owner ruling on #85), and never nothing.
  assert.deepEqual([...new Set(samples)], [JSON.stringify({ line: 'Reading your message', alone: true })]);
  // acceptance-live-activity-ends: once the turn has ended, no line (the failed turn has no words to show).
  await until('the line to go once the turn has ended', () => status() === null);
  assert.equal(required(reply(), "Expected reply() to be non-null").textContent, '');
});

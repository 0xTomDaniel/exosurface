// Rendered-app harness (#68): package.json bb.app (app.tsx) bundled as BB bundles it, loaded into the BB SDK's own app test
// runtime (@get-bb/plugin-sdk/testing/app: renderSlot with fake rpc handlers) on a jsdom document. One React for the app
// and the runtime, as in BB. Used by test/*.test.ts and demo/surfaces.
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parse, walk, generate, type CssNode } from 'css-tree';

const PLUGIN = resolve(import.meta.dirname, '..');
const modules = join(PLUGIN, 'node_modules');

/** What the app asked the browser to scroll (an element's scrollTo), and the person's reduced-motion setting. */
export type Browser = { scrolls: { top: number; behavior: string }[]; reducedMotion: boolean };
const browsers = new WeakMap<JSDOM, Browser>();
// jsdom has neither an element's scrollTo nor matchMedia, and does no scrolling or animation. Test-side stand-ins for those
// browser surfaces, once per window: scrollTo records each request and moves scrollTop there at once (the easing itself is
// the browser's, seen in the owner's RDP re-check); matchMedia answers the reduced-motion query from `reducedMotion`, and no
// other query matches.
function scrolling(dom: JSDOM): Browser {
  let browser = browsers.get(dom);
  if (browser) return browser;
  const made: Browser = { scrolls: [], reducedMotion: false }, w = dom.window as any;
  browsers.set(dom, made);
  w.Element.prototype.scrollTo = function (this: Element, options: ScrollToOptions) { made.scrolls.push({ top: options.top ?? 0, behavior: options.behavior ?? 'auto' }); this.scrollTop = options.top ?? 0; };
  w.matchMedia = (media: string) => ({ media, matches: /prefers-reduced-motion:\s*reduce/.test(media) && made.reducedMotion, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false });
  (globalThis as any).matchMedia = w.matchMedia;
  return made;
}

/** Installs a jsdom window as the global DOM, then returns the bundled app's registrations and the SDK test kit. Each call
 *  builds and loads its own bundle (its own module instances and element classes). `window`: load into an earlier call's
 *  window instead of a fresh one, as BB loads a reinstalled plugin's new app bundle into its long-lived window (one
 *  customElements registry); its `close` then leaves the window to that earlier call. */
export async function renderedApp(options: { window?: JSDOM } = {}) {
  const dom = options.window ?? new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://bb.invalid/plugins/exosurface/surface', pretendToBeVisual: true });
  const g = globalThis as any;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment', 'Text', 'CustomEvent', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement', 'customElements', ...Object.getOwnPropertyNames(dom.window).filter(k => /^[A-Z]/.test(k) && typeof (dom.window as any)[k] === 'function')])
    if (!(key in g) || ['window', 'document', 'navigator', 'customElements', 'Event', 'CustomEvent'].includes(key)) Object.defineProperty(g, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  // The window's own custom element registry, as in BB's renderer: without it Lit's Node build installs a server-side stand-in
  // registry, so A2UI elements were never upgraded in this harness and a second bundle's definitions were never checked. The
  // upgraded elements then use the window's DOM classes (every one Node lacks), and its events: Node's own Event is refused by jsdom.
  g.IS_REACT_ACT_ENVIRONMENT = true;
  const browser = scrolling(dom);
  if (!g.CSS) g.CSS = { supports: () => false, escape: (s: string) => s };
  const out = mkdtempSync(join(tmpdir(), 'exo-app-'));
  try {
    const entry = `export * from ${JSON.stringify(join(modules, '@get-bb/plugin-sdk/dist/testing/app.js'))};export * as testing from ${JSON.stringify(join(modules, '@testing-library/react/dist/index.js'))};export {default as app} from ${JSON.stringify(join(PLUGIN, 'app.tsx'))};`;
    await build({ stdin: { contents: entry, resolveDir: PLUGIN, loader: 'js' }, bundle: true, format: 'esm', platform: 'node', outfile: join(out, 'app.mjs'), jsx: 'automatic', logLevel: 'silent',
      loader: { '.css': 'text' }, external: ['jsdom'],
      // React's act queues its tasks on a new MessageChannel in this bundle (its Node setImmediate lookup fails here) and never
      // closes it, so the open ports keep the process alive. In the bundle only: a port pair that delivers on setImmediate.
      banner: { js: 'const MessageChannel=class{constructor(){const c=this;this.port1={onmessage:null};this.port2={postMessage:d=>setImmediate(()=>c.port1.onmessage?.({data:d}))};}};' },
      alias: { react: join(modules, 'react'), 'react-dom': join(modules, 'react-dom'), 'react/jsx-runtime': join(modules, 'react/jsx-runtime.js') } });
    const kit = await import(pathToFileURL(join(out, 'app.mjs')).href);
    const app = await kit.loadPluginApp(kit.app);
    return { kit, app, window: dom, browser, close: () => { if (!options.window) dom.window.close(); } };
  } finally { rmSync(out, { recursive: true, force: true }); }
}

// Presentation as jsdom computes it from the app's own stylesheets (getComputedStyle), never class names, so a restyle
// that looks the same passes. jsdom does no layout, and it drops a shorthand declaration holding var() (e.g. a border in a
// theme colour): true layout and paint are checked in the owner's RDP walkthrough.
const css = (el: Element) => getComputedStyle(el);
const edge = (v: string) => ['flex-end', 'end', 'right', 'self-end'].includes(v);
/** Whether an element sits against the right edge of its container, by any technique: an auto left margin on a shrunk box,
 *  a right float, flex or grid end alignment on it or its container, or right text alignment around an inline box. */
export function rightAligned(el: Element): boolean {
  const own = css(el), parent = el.parentElement ? css(el.parentElement) : null, display = parent?.display ?? '';
  if (own.float === 'right') return true;
  if (display.endsWith('flex')) {
    const column = (parent!.flexDirection ?? '').startsWith('column');
    return own.marginLeft === 'auto' || (column ? edge(own.alignSelf) || (['', 'auto'].includes(own.alignSelf) && edge(parent!.alignItems)) : edge(parent!.justifyContent));
  }
  if (display.endsWith('grid')) return own.marginLeft === 'auto' || edge(own.justifySelf) || (['', 'auto'].includes(own.justifySelf) && edge(parent!.justifyItems));
  if (own.display.startsWith('inline')) return ['right', 'end'].includes(parent?.textAlign ?? '');
  // A block box: an auto left margin moves it right only when it is narrower than its container.
  const shrunk = !['', 'auto', '100%'].includes(own.width) || !['', 'none', '100%'].includes(own.maxWidth) || own.display === 'table';
  return own.marginLeft === 'auto' && shrunk;
}
const painted = (s: CSSStyleDeclaration) =>
  ['Top', 'Right', 'Bottom', 'Left'].some(side => !['', 'none', 'hidden'].includes((s as any)[`border${side}Style`]) && !['0', '0px'].includes((s as any)[`border${side}Width`]))
  || !['', 'transparent', 'rgba(0, 0, 0, 0)', 'initial'].includes(s.backgroundColor) || !['', 'none', 'initial'].includes(s.backgroundImage)
  || !['', 'none', 'initial'].includes(s.boxShadow);
const zero = (v: string) => ['0', '0px'].includes(v);
const scrolls = (s: CSSStyleDeclaration) => [s.overflow, s.overflowY].some(v => ['auto', 'scroll'].includes(v));
/** What holds an element over the bottom of the region that scrolls around it: the element or its nearest ancestor kept
 *  against that region's bottom edge while it scrolls (sticky at bottom 0), and the region. A sticky box stays in the flow,
 *  so it takes its own height at the end of its column and the content above it can scroll clear of it. null when nothing
 *  holds it there, or when it is fixed to the window rather than the surface. */
export function pinnedToBottom(el: Element): { pinned: Element; scroller: Element } | null {
  for (let at: Element | null = el; at; at = at.parentElement) {
    const own = css(at);
    if (own.position === 'fixed') return null;
    if (own.position !== 'sticky' || !zero(own.bottom)) continue;
    for (let up = at.parentElement; up; up = up.parentElement) if (scrolls(css(up))) return { pinned: at, scroller: up };
    return null;
  }
  return null;
}
const held = (s: CSSStyleDeclaration) => !['', 'none', '100%'].includes(s.maxWidth) || !['', 'auto', '100%'].includes(s.width);
/** The box whose width an element's width follows: the element itself when it holds a width of its own (a width or a
 *  max-width), else its nearest ancestor that does; null when nothing but the window bounds it. */
export function column(el: Element): Element | null {
  for (let at: Element | null = el; at; at = at.parentElement) if (held(css(at))) return at;
  return null;
}
// Computed values are read through css-tree's value parser (its AST), so no CSS grammar lives here; only what a fade means.
const value = (text: string): CssNode | null => { try { const v = parse(text, { context: 'value' }); return v.type === 'Value' && v.children.size === 1 ? v.children.first : null; } catch { return null; } };
/** Whether a colour paints nothing: transparent, or rgb()/rgba() with a zero alpha. */
const clear = (color: CssNode | null | undefined) => {
  if (!color) return true;
  if (color.type === 'Identifier') return color.name === 'transparent';
  if (color.type !== 'Function' || !['rgb', 'rgba'].includes(color.name)) return false;
  const channels = [...color.children].filter(n => n.type === 'Number' || n.type === 'Percentage') as Array<{ value: string }>;
  return channels.length === 4 && Number(channels[3].value) === 0;
};
const downward = (direction: CssNode[]) => direction.length === 0 || direction.map(n => n.type === 'Identifier' ? n.name : '?').join(' ') === 'to bottom'
  || (direction.length === 1 && direction[0].type === 'Dimension' && ((direction[0].unit === 'deg' && Number(direction[0].value) === 180) || (direction[0].unit === 'turn' && Number(direction[0].value) === 0.5)));
/** Where a top-to-bottom linear gradient, clear at first and opaque at the bottom edge, begins (a fraction of the box's
 *  height); null for any other value. */
function gradientStart(text: string): number | null {
  const only = value(text);
  if (!only || only.type !== 'Function' || only.name !== 'linear-gradient') return null;
  const groups: CssNode[][] = [[]];
  only.children.forEach(n => { if (n.type === 'Operator' && n.value === ',') groups.push([]); else groups.at(-1)!.push(n); });
  const isStop = (g: CssNode[]) => g[0] && (g[0].type === 'Function' || g[0].type === 'Hash' || (g[0].type === 'Identifier' && g[0].name !== 'to'));
  const direction = isStop(groups[0]) ? [] : groups.shift()!;
  if (!downward(direction) || groups.length < 2) return null;
  const at = (g: CssNode[]) => { const p = g.find(n => n.type === 'Percentage'); return p && p.type === 'Percentage' ? Number(p.value) / 100 : null; };
  const first = groups[0], last = groups.at(-1)!;
  if (!clear(first[0]) || clear(last[0]) || (at(last) !== null && at(last) !== 1)) return null;
  return at(first) ?? 0;
}
/** Where the fade over the content beneath a floating box begins, as a fraction of the box's height from its top: a
 *  top-to-bottom gradient from clear to opaque at the box's bottom edge, painted as its background or masking a painted
 *  layer, on the box itself or on a layer placed over its whole area. null when nothing fades. */
export function fadeStart(box: Element): number | null {
  const covers = (e: Element) => { const s = css(e); return s.position === 'absolute' && [s.top, s.right, s.bottom, s.left].every(zero); };
  for (const layer of [box, ...[...box.children].filter(covers)]) {
    const s = css(layer), mask = s.getPropertyValue('mask-image') || s.getPropertyValue('-webkit-mask-image');
    const start = gradientStart(s.backgroundImage) ?? (mask && s.backgroundColor !== '' && !clear(value(s.backgroundColor)) ? gradientStart(mask) : null);
    if (start !== null) return start;
  }
  return null;
}
const spacing = (s: CSSStyleDeclaration, side: 'Top' | 'Bottom') => [s[`margin${side}`], s[`padding${side}`], s[`border${side}Width`]].map(v => parseFloat(v) || 0).reduce((a, b) => a + b, 0);
/** Whether an element's vertical middle is its container's: every box from the element up to (not including) the container
 *  is the only in-flow child of its parent, with equal space above and below it, and so is the container's own padding. */
export function centeredIn(el: Element, container: Element): boolean {
  const inFlow = (e: Element) => { const s = css(e); return s.display !== 'none' && !['absolute', 'fixed'].includes(s.position); };
  for (let at: Element = el; at !== container; at = at.parentElement!) {
    if (!at.parentElement) return false;
    const s = css(at); if (spacing(s, 'Top') !== spacing(s, 'Bottom') || [...at.parentElement.children].filter(inFlow).length !== 1) return false;
  }
  const s = css(container); return parseFloat(s.paddingTop) === parseFloat(s.paddingBottom) && parseFloat(s.borderTopWidth || '0') === parseFloat(s.borderBottomWidth || '0');
}
// jsdom's CSSOM drops a declaration whose value holds var() (a gradient in theme colours) and its cascade applies no @media
// rule, so what the app's stylesheets say about an element is also read from their source text: the <style> elements the app
// put in the document, parsed by css-tree, each rule matched to the element by the browser's own selector matching.
/** Every declaration the document's <style> text gives an element, in source order, with the @media condition it sits under
 *  ('' when none). A selector list matches when any one selector in it does. */
export function declared(el: Element): { media: string; property: string; value: string }[] {
  const out: { media: string; property: string; value: string }[] = [];
  for (const sheet of el.ownerDocument.querySelectorAll('style')) {
    walk(parse(sheet.textContent ?? ''), {
      visit: 'Rule',
      enter(this: { atrule: CssNode | null }, rule: CssNode) {
        if (rule.type !== 'Rule' || rule.prelude.type !== 'SelectorList') return;
        const at = this.atrule;
        if (at && (at.type !== 'Atrule' || at.name !== 'media')) return;
        const matches = [...rule.prelude.children].some(s => { try { return el.matches(generate(s)); } catch { return false; } });
        if (!matches) return;
        const media = at && at.type === 'Atrule' && at.prelude ? generate(at.prelude) : '';
        rule.block.children.forEach(d => { if (d.type === 'Declaration') out.push({ media, property: d.property, value: generate(d.value) }); });
      },
    });
  }
  return out;
}
/** The properties a named @keyframes rule in the document's <style> text sets, across its frames. */
export function keyframed(doc: Document, name: string): string[] {
  const props = new Set<string>();
  for (const sheet of doc.querySelectorAll('style')) walk(parse(sheet.textContent ?? ''), {
    visit: 'Atrule',
    enter(at: CssNode) {
      if (at.type !== 'Atrule' || !/keyframes$/.test(at.name) || !at.prelude || generate(at.prelude) !== name || !at.block) return;
      walk(at.block, { visit: 'Declaration', enter(d: CssNode) { if (d.type === 'Declaration') props.add(d.property); } });
    },
  });
  return [...props];
}
/** A linear-gradient's colour stops, split at its top-level commas (css-tree's AST): each stop's colour as written and its
 *  position as a fraction (null when it has none). The direction, when given, is not a stop. */
export function gradientStops(text: string): { color: string; at: number | null }[] {
  const only = value(text);
  if (!only || only.type !== 'Function' || only.name !== 'linear-gradient') return [];
  const groups: CssNode[][] = [[]];
  only.children.forEach(n => { if (n.type === 'Operator' && n.value === ',') groups.push([]); else groups.at(-1)!.push(n); });
  const direction = (g: CssNode[]) => g.some(n => n.type === 'Dimension' && /deg|turn|rad/.test(n.unit)) || (g[0]?.type === 'Identifier' && g[0].name === 'to');
  return groups.filter(g => g.length && !direction(g)).map(g => {
    const p = g.at(-1)!, at = g.length > 1 && p.type === 'Percentage' ? Number(p.value) / 100 : null;
    return { color: (at === null ? g : g.slice(0, -1)).map(n => generate(n)).join(' '), at };
  });
}
// The colour a theme paints: a CSS colour text with its var() resolved (custom property values from `vars`, else the
// var()'s fallback), evaluated as a browser does for the forms the app's and BB's stylesheets use (#hex, rgb(), oklab(),
// oklch(), color-mix() in srgb or oklab); any other form throws. Colours are held as linear-light sRGB.
type Rgb = [number, number, number];
const decode = (c: number) => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4, encode = (c: number) => c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;
const fromOklab = ([L, a, b]: Rgb): Rgb => {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
};
export const toOklab = ([r, g, b]: Rgb): Rgb => {
  const [l, m, s] = [0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b, 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b, 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b].map(Math.cbrt);
  return [0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s];
};
function substitute(text: string, vars: Record<string, string>, depth = 0): string {
  if (depth > 20) throw new Error(`var() cycle in ${text}`);
  const at = text.lastIndexOf('var(');
  if (at < 0) return text;
  let end = at + 4; for (let open = 1; open; end++) { if (end >= text.length) throw new Error(`unbalanced ${text}`); open += text[end] === '(' ? 1 : text[end] === ')' ? -1 : 0; }
  const inner = text.slice(at + 4, end - 1), comma = inner.indexOf(','), name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  const own = vars[name]?.trim(), fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
  if (!own && fallback === undefined) throw new Error(`${name} is not defined`);
  return substitute(text.slice(0, at) + substitute(own || fallback!, vars, depth + 1) + text.slice(end), vars, depth + 1);
}
const number = (n: CssNode, percent = 1) => n.type === 'Percentage' ? Number(n.value) / 100 * percent : n.type === 'Number' ? Number(n.value) : NaN;
function evaluate(n: CssNode): Rgb {
  if (n.type === 'Hash') { const h = n.value.length <= 4 ? [...n.value.slice(0, 3)].map(c => c + c).join('') : n.value.slice(0, 6); return [0, 2, 4].map(i => decode(parseInt(h.slice(i, i + 2), 16) / 255)) as Rgb; }
  if (n.type !== 'Function') throw new Error(`colour form ${generate(n)} not supported`);
  const args = [...n.children].filter(c => c.type !== 'Operator' || c.value !== ',');
  if (['rgb', 'rgba'].includes(n.name)) return args.slice(0, 3).map(c => decode(number(c, 255) / 255)) as Rgb;
  if (n.name === 'oklab') return fromOklab([number(args[0]), number(args[1], 0.4), number(args[2], 0.4)]);
  if (n.name === 'oklch') { const L = number(args[0]), C = number(args[1], 0.4), h = Number((args[2] as any).value) * Math.PI / 180; return fromOklab([L, C * Math.cos(h), C * Math.sin(h)]); }
  if (n.name === 'color-mix') {
    const groups: CssNode[][] = [[]];
    n.children.forEach(c => { if (c.type === 'Operator' && c.value === ',') groups.push([]); else groups.at(-1)!.push(c); });
    const space = groups[0].map(c => c.type === 'Identifier' ? c.name : '?').join(' ');
    const sides = groups.slice(1).map(g => ({ color: evaluate(g.find(c => c.type !== 'Percentage')!), p: g.find(c => c.type === 'Percentage') }));
    let [p1, p2] = sides.map(s => s.p ? number(s.p) : NaN);
    if (isNaN(p1) && isNaN(p2)) p1 = p2 = 0.5; else if (isNaN(p1)) p1 = 1 - p2; else if (isNaN(p2)) p2 = 1 - p1;
    const w = p1 / (p1 + p2), into = space === 'in oklab' ? toOklab : space === 'in srgb' ? (c: Rgb) => c.map(encode) as Rgb : null;
    if (!into) throw new Error(`color-mix ${space} not supported`);
    const [a, b] = sides.map(s => into(s.color)), mixed = a.map((v, i) => v * w + b[i] * (1 - w)) as Rgb;
    return space === 'in oklab' ? fromOklab(mixed) : mixed.map(decode) as Rgb;
  }
  throw new Error(`colour form ${n.name}() not supported`);
}
/** A colour text as a theme paints it (linear-light sRGB), its var() resolved from `vars`. */
export function themeColor(text: string, vars: Record<string, string>): Rgb {
  const resolved = substitute(text, vars), node = value(resolved);
  if (!node) throw new Error(`not one colour: ${resolved}`);
  return evaluate(node);
}
/** WCAG 2 contrast ratio between two linear-light sRGB colours. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [a, b].map(c => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]).sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
const timing = new Set(['linear', 'ease', 'ease-in', 'ease-out', 'ease-in-out', 'step-start', 'step-end', 'normal', 'reverse', 'alternate', 'alternate-reverse', 'none', 'forwards', 'backwards', 'both', 'running', 'paused', 'infinite']);
/** An animation shorthand as computed (one animation): its name, its duration in seconds (the first time in it) and whether
 *  it loops forever; null when it names no animation. */
export function animation(text: string): { name: string; seconds: number; infinite: boolean } | null {
  let v: CssNode; try { v = parse(text, { context: 'value' }); } catch { return null; }
  if (v.type !== 'Value') return null;
  const parts = [...v.children];
  const name = parts.find(n => n.type === 'Identifier' && !timing.has(n.name)), time = parts.find(n => n.type === 'Dimension' && ['s', 'ms'].includes(n.unit));
  if (!name || name.type !== 'Identifier') return null;
  const seconds = time && time.type === 'Dimension' ? Number(time.value) / (time.unit === 'ms' ? 1000 : 1) : 0;
  return { name: name.name, seconds, infinite: parts.some(n => n.type === 'Identifier' && n.name === 'infinite') };
}
/** Whether an element is drawn in a box: it, anything inside it, or any element between it and `within` (inclusive) has a
 *  border, a background or a shadow. */
export function boxed(el: Element, within: Element): boolean {
  const chain: Element[] = [...el.querySelectorAll('*')];
  for (let at: Element | null = el; at; at = at === within ? null : at.parentElement) chain.push(at);
  return chain.some(e => painted(css(e)));
}
const line = (s: CSSStyleDeclaration, side: 'Top' | 'Bottom') => !['', 'none', 'hidden'].includes((s as any)[`border${side}Style`]) && !['0', '0px', ''].includes((s as any)[`border${side}Width`]);
/** Whether a hairline sets `above` off from `below` (which follows it on screen): a bottom border or shadow on `above` or on
 *  a box holding it and not `below`, a top border on `below` or on a box holding it and not `above`, or an <hr> between them. */
export function divided(above: Element, below: Element): boolean {
  const up = (from: Element, other: Element) => { const out: Element[] = []; for (let at: Element | null = from; at && !at.contains(other); at = at.parentElement) out.push(at); return out; };
  if (up(above, below).some(e => line(css(e), 'Bottom') || !['', 'none', 'initial'].includes(css(e).boxShadow))) return true;
  if (up(below, above).some(e => line(css(e), 'Top'))) return true;
  return [...(above.ownerDocument.querySelectorAll('hr'))].some(hr => !!(above.compareDocumentPosition(hr) & Node.DOCUMENT_POSITION_FOLLOWING) && !!(hr.compareDocumentPosition(below) & Node.DOCUMENT_POSITION_FOLLOWING));
}

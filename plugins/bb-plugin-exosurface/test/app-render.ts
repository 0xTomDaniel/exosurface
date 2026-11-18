import { required } from './required.ts';
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
import { resolve as resolveColor, convert } from '@asamuzakjp/css-color';

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
// Kept source-compatible for #212 until its routing rebase contracts the legacy export.
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

/** Typed entry for migrating consumers; the generated bundle re-exports these exact modules. */
export function renderedAppTyped(options: { window?: JSDOM } = {}): Promise<{
  kit: typeof import('@get-bb/plugin-sdk/testing/app') & {
    testing: typeof import('@testing-library/react');
    app: typeof import('../app.tsx').default;
  };
  app: Awaited<ReturnType<typeof import('@get-bb/plugin-sdk/testing/app').loadPluginApp>>;
  window: JSDOM;
  browser: Browser;
  close: () => void;
}> {
  return renderedApp(options);
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
    const column = (required(parent, "Expected parent to be non-null").flexDirection ?? '').startsWith('column');
    return own.marginLeft === 'auto' || (column ? edge(own.alignSelf) || (['', 'auto'].includes(own.alignSelf) && edge(required(parent, "Expected parent to be non-null").alignItems)) : edge(required(parent, "Expected parent to be non-null").justifyContent));
  }
  if (display.endsWith('grid')) return own.marginLeft === 'auto' || edge(own.justifySelf) || (['', 'auto'].includes(own.justifySelf) && edge(required(parent, "Expected parent to be non-null").justifyItems));
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
  const channels = [...color.children].filter(n => n.type === 'Number' || n.type === 'Percentage');
  return channels.length === 4 && channels.slice(3).every(n => Number(n.value) === 0);
};
const downward = (direction: CssNode[]) => direction.length === 0 || direction.map(n => n.type === 'Identifier' ? n.name : '?').join(' ') === 'to bottom'
  || (direction.length === 1 && direction.every(n => n.type === 'Dimension' && ((n.unit === 'deg' && Number(n.value) === 180) || (n.unit === 'turn' && Number(n.value) === 0.5))));
/** Where a top-to-bottom linear gradient, clear at first and opaque at the bottom edge, begins (a fraction of the box's
 *  height); null for any other value. */
function gradientStart(text: string): number | null {
  const only = value(text);
  if (!only || only.type !== 'Function' || only.name !== 'linear-gradient') return null;
  const initial: CssNode[] = [];
  let last = initial;
  const groups: CssNode[][] = [initial];
  only.children.forEach(n => { if (n.type === 'Operator' && n.value === ',') groups.push(last = []); else last.push(n); });
  const isStop = (g: CssNode[]) => g[0] && (g[0].type === 'Function' || g[0].type === 'Hash' || (g[0].type === 'Identifier' && g[0].name !== 'to'));
  const startsWithStop = isStop(initial);
  const direction = startsWithStop ? [] : initial;
  const [first, second] = startsWithStop ? groups : groups.slice(1);
  if (!downward(direction) || !first || !second) return null;
  const at = (g: CssNode[]) => { const p = g.find(n => n.type === 'Percentage'); return p && p.type === 'Percentage' ? Number(p.value) / 100 : null; };
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
  only.children.forEach(n => { if (n.type === 'Operator' && n.value === ',') groups.push([]); else required(groups.at(-1), "Expected groups.at(-1) to be non-null").push(n); });
  const direction = (g: CssNode[]) => g.some(n => n.type === 'Dimension' && /deg|turn|rad/.test(n.unit)) || (g[0]?.type === 'Identifier' && g[0].name === 'to');
  return groups.filter(g => g.length && !direction(g)).map(g => {
    const p = required(g.at(-1), "Expected g.at(-1) to be non-null"), at = g.length > 1 && p.type === 'Percentage' ? Number(p.value) / 100 : null;
    return { color: (at === null ? g : g.slice(0, -1)).map(n => generate(n)).join(' '), at };
  });
}
// The colour a theme paints, worked out by @asamuzakjp/css-color (jsdom's own colour engine): var() resolved from `vars`,
// color-mix() and every colour space as a browser does. It answers an unresolvable or invalid colour with transparent,
// which no theme colour here is, so that answer throws.
type Theme = Record<string, string>;
const options = (vars: Theme) => ({ customProperty: { callback: (name: string) => vars[name]?.trim() || undefined } });
/** A colour text as a theme paints it, its var() resolved from `vars`: an opaque CSS colour. */
export function themeColor(text: string, vars: Theme): string {
  const color = resolveColor(text, options(vars));
  if (!color || convert.colorToXyz(color)[3] === 0) throw new Error(`not one opaque colour with these theme values: ${text}`);
  return color;
}
/** A colour's OKLab coordinates [L, a, b]. */
export const toOklab = (color: string): [number, number, number] => convert.colorToOklab(color).slice(0, 3) as [number, number, number];
/** WCAG 2 contrast ratio between two colours, from their relative luminance (CIE XYZ Y, D65). */
export function contrast(a: string, b: string): number {
  const luminances: [number, number] = [convert.colorToXyz(a)[1], convert.colorToXyz(b)[1]];
  const [hi, lo] = luminances.sort((x, y) => y - x);
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

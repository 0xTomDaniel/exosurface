// Rendered-app harness (#68): package.json bb.app (app.tsx) bundled as BB bundles it, loaded into the BB SDK's own app test
// runtime (@get-bb/plugin-sdk/testing/app: renderSlot with fake rpc handlers) on a jsdom document. One React for the app
// and the runtime, as in BB. Used by test/*.test.ts and demo/surfaces.
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const PLUGIN = resolve(import.meta.dirname, '..');
const modules = join(PLUGIN, 'node_modules');

/** Installs a jsdom window as the global DOM, then returns the bundled app's registrations and the SDK test kit. */
export async function renderedApp() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://bb.invalid/plugins/exosurface/surface', pretendToBeVisual: true });
  const g = globalThis as any;
  for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'MutationObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'DocumentFragment', 'Text', 'CustomEvent', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLButtonElement', 'HTMLSelectElement'])
    if (!(key in g) || key === 'window' || key === 'document' || key === 'navigator') Object.defineProperty(g, key, { configurable: true, writable: true, value: (dom.window as any)[key] });
  g.IS_REACT_ACT_ENVIRONMENT = true;
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
    return { kit, app, close: () => dom.window.close() };
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
// The top-level, comma-separated arguments of a CSS function value.
const args = (value: string) => {
  const out: string[] = []; let depth = 0, cur = '';
  for (const ch of value) { if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; } if (ch === '(') depth++; if (ch === ')') depth--; cur += ch; }
  return [...out, cur.trim()];
};
const clear = (color: string) => color === 'transparent' || /^rgba\(.*,\s*0\)$/.test(color);
/** Where a top-to-bottom gradient, clear at first and opaque at the bottom edge, begins (a fraction of the box's height). */
function gradientStart(value: string): number | null {
  const m = /^linear-gradient\((.*)\)$/.exec(value.trim()); if (!m) return null;
  const parts = args(m[1]); if (/^(to |-?[\d.]+(deg|turn|rad))/.test(parts[0])) { if (!['to bottom', '180deg', '0.5turn'].includes(parts.shift()!)) return null; }
  const stop = (s: string) => { const at = /\s(-?[\d.]+)%$/.exec(s); return { color: at ? s.slice(0, at.index).trim() : s, at: at ? Number(at[1]) / 100 : null }; };
  const first = stop(parts[0]), last = stop(parts.at(-1)!);
  if (parts.length < 2 || !clear(first.color) || clear(last.color) || (last.at !== null && last.at !== 1)) return null;
  return first.at ?? 0;
}
/** Where the fade over the content beneath a floating box begins, as a fraction of the box's height from its top: a
 *  top-to-bottom gradient from clear to opaque at the box's bottom edge, painted as its background or masking a painted
 *  layer, on the box itself or on a layer placed over its whole area. null when nothing fades. */
export function fadeStart(box: Element): number | null {
  const covers = (e: Element) => { const s = css(e); return s.position === 'absolute' && [s.top, s.right, s.bottom, s.left].every(zero); };
  for (const layer of [box, ...[...box.children].filter(covers)]) {
    const s = css(layer), mask = s.getPropertyValue('mask-image') || s.getPropertyValue('-webkit-mask-image');
    const start = gradientStart(s.backgroundImage) ?? (mask && !clear(s.backgroundColor) && s.backgroundColor !== '' ? gradientStart(mask) : null);
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
/** Whether an element is drawn in a box: it, anything inside it, or any element between it and `within` (inclusive) has a
 *  border, a background or a shadow. */
export function boxed(el: Element, within: Element): boolean {
  const chain: Element[] = [...el.querySelectorAll('*')];
  for (let at: Element | null = el; at; at = at === within ? null : at.parentElement) chain.push(at);
  return chain.some(e => painted(css(e)));
}

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
/** Whether an element is drawn in a box: it, anything inside it, or any element between it and `within` (inclusive) has a
 *  border, a background or a shadow. */
export function boxed(el: Element, within: Element): boolean {
  const chain: Element[] = [...el.querySelectorAll('*')];
  for (let at: Element | null = el; at; at = at === within ? null : at.parentElement) chain.push(at);
  return chain.some(e => painted(css(e)));
}

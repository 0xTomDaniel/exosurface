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
      alias: { react: join(modules, 'react'), 'react-dom': join(modules, 'react-dom'), 'react/jsx-runtime': join(modules, 'react/jsx-runtime.js') } });
    const kit = await import(pathToFileURL(join(out, 'app.mjs')).href);
    const app = await kit.loadPluginApp(kit.app);
    return { kit, app, close: () => dom.window.close() };
  } finally { rmSync(out, { recursive: true, force: true }); }
}

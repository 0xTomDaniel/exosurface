// The plugin's app (package.json bb.app, app.tsx) rendered as BB renders it, for tests and demo/surfaces: bundled with
// esbuild (JSX is not type stripping), mounted in jsdom through the SDK's own app test runtime (@get-bb/plugin-sdk/testing/app),
// its useRpc() calls answered by the server.ts handlers a mock BB registered (test/mock-bb.ts). Only BB's host is faked.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import globalJsdom from 'global-jsdom';
import { build } from 'esbuild';
import { PLUGIN } from './mock-bb.ts';

// jsdom is the global window before React DOM first loads (it decides at import whether a DOM exists).
globalJsdom(undefined, { pretendToBeVisual: true, url: 'http://bb.invalid/' });
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = false; // the app runs on real timers and a real server, as in BB
/** Testing Library's DOM events, from the same React DOM the app renders with. */
export const { fireEvent } = await import('@testing-library/react');

let loaded: Promise<any> | undefined;
/** app.tsx bundled and loaded through the SDK's validating collector. */
function loadApp() {
  return loaded ??= (async () => {
    const out = join(PLUGIN, 'node_modules', '.cache', 'exosurface-app-test');
    mkdirSync(out, { recursive: true });
    // One React for the app, its UI libraries and the SDK test runtime: the plugin's own (legacy/surface has a second copy).
    await build({ entryPoints: [join(PLUGIN, 'app.tsx')], bundle: true, format: 'esm', platform: 'browser', jsx: 'automatic', outfile: join(out, 'app.mjs'), logLevel: 'error',
      external: ['react', 'react/*', 'react-dom', 'react-dom/*', '@get-bb/plugin-sdk', '@get-bb/plugin-sdk/*'] });
    const testing = await import('@get-bb/plugin-sdk/testing/app');
    const app = await testing.loadPluginApp(() => import(pathToFileURL(join(out, 'app.mjs')).href));
    return { testing, app };
  })();
}

/** The Exosurface nav panel (path `surface`), its RPCs answered by the given server handlers. */
export async function renderSurfacePanel(rpc: Record<string, (input: any) => Promise<any>>) {
  const { testing, app } = await loadApp();
  const panel = app.navPanels.find((p: any) => p.path === 'surface');
  if (!panel) throw new Error('app.tsx registers no surface nav panel');
  return testing.renderSlot(panel, {}, { rpc }) as import('@get-bb/plugin-sdk/testing/app').RenderedSlot;
}

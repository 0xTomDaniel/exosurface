// Builtins-only release entry for the independent Pi/socket owner and fail-closed preflight.
import { fileURLToPath } from 'node:url';
import { realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readConfig, layout, schemaState, atLeast, PINS } from './config.ts';
import { save, loadIf } from './store.ts';
import { startOwner } from './owner-runtime.ts';

export async function run(env: NodeJS.ProcessEnv = process.env, args = process.argv.slice(2)) {
  if (args.includes('--readiness')) {
    const { config, problems } = readConfig(env);
    const schema = config ? schemaState(layout(config.stateDir)) : 'absent';
    const unsupported = typeof schema === 'object';
    console.log(JSON.stringify({ schema: 'exosurface-readiness/0', config: { ready: !problems.length, codes: problems.map(p => p.code) }, authentication: { status: 'unverified', reason: 'fresh-owner-login-required' }, connectivity: { status: 'unverified', reason: 'no-provider-call' }, runtime: { ready: false }, ready: false, unsupported }));
    return unsupported ? 1 : 2;
  }
  if (args.includes('--release-selftest')) {
    console.log(JSON.stringify({ ok: true, contract: 'exosurface-package/0', runtimeImplemented: true }));
    return 0; // Must not read configuration, create files, or initialize authentication.
  }
  const { config, problems } = readConfig(env);
  const l = layout(config?.stateDir || env["EXO_STATE_DIR"] || join(homedir(), '.exosurface'));
  const schema = schemaState(l);
  if (typeof schema === 'object') throw new Error(`Unsupported state schema: ${schema.unsupported}`);
  if (!atLeast(process.versions.node, PINS.node)) throw new Error(`Node >=${PINS.node} required`);
  if (problems.length) {
    save(l.ownerState, { ready: false, status: 'awaiting-first-run', problems });
    return 0;
  }
  if (!loadIf(l.primary)) {
    save(l.ownerState, { ready: false, status: 'awaiting-first-run', problems: [{ code: 'binding-missing', message: 'Complete first-run in BB.' }] });
    return 0;
  }
  const owner = await startOwner(config!);
  for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void owner.close().then(() => process.exit(0)); });
  return 0;
}
if (process.argv[1] && realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
  try { process.exitCode = await run(); } catch (e) { console.error(e instanceof Error ? e.message : String(e)); process.exitCode = 1; }
}

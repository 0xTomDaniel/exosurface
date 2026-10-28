import { TEST_ROOT, assertIsolated, createIsolatedRoot, isolatedEnvironment, LIVE_ENV } from './isolation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, rmSync, realpathSync } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join } from 'node:path';
import { HOME, CANONICAL_HOME } from '../src/state.ts';
import { LOCAL_CONFIG } from '../src/local-config.ts';
import { OWNER_DIR } from '../src/owner-client.ts';

const REAL = realpathSync(userInfo().homedir);
const guard = new URL('./isolation.ts', import.meta.url).href;
// Child that only imports the guard: if the guard refuses, nothing else loads.
const child = (env: NodeJS.ProcessEnv) => spawnSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', `import {TEST_ROOT} from ${JSON.stringify(guard)};console.log(TEST_ROOT)`], { env, encoding: 'utf8' });

test('every runtime state path resolves inside the disposable test root', () => {
  for (const p of [homedir(), HOME, CANONICAL_HOME, LOCAL_CONFIG, OWNER_DIR]) {
    assert.ok(p.startsWith(TEST_ROOT + '/'), `${p} outside ${TEST_ROOT}`);
    assert.ok(!p.startsWith(REAL + '/'), `${p} inside the real home`);
  }
});

test('guard refuses the real home, a missing root and config outside the root', () => {
  const ok = { EXO_TEST_ROOT: TEST_ROOT, HOME: join(TEST_ROOT, 'home'), TMPDIR: join(TEST_ROOT, 'tmp'), EXO_CONFIG: join(TEST_ROOT, 'home/.config/exo/exosurface.json') };
  assert.equal(assertIsolated(ok), TEST_ROOT);
  assert.throws(() => assertIsolated({ ...ok, HOME: REAL }), /real home/);
  assert.throws(() => assertIsolated({ ...ok, HOME: '/' }), /real home/, 'an ancestor of the real home');
  assert.throws(() => assertIsolated({ ...ok, EXO_TEST_ROOT: undefined }), /not isolated/);
  assert.throws(() => assertIsolated({ ...ok, EXO_CONFIG: join(REAL, '.config/exo/exosurface.json') }), /EXO_CONFIG is outside/);
  assert.throws(() => assertIsolated({ ...ok, TMPDIR: '/tmp' }), /TMPDIR is outside/);
  // Selectors inherited from the live Exo session (or set by other tooling) name real state directly.
  for (const [k, v] of [['EXOSURFACE_HOME', join(REAL, '.exo-bb-spike')], ['EXOSURFACE_OPTCHAT_HOME', join(REAL, 'o')], ['OPTCHAT_HOME', join(REAL, 'o')], ['PI_SESSION_FILE', join(REAL, 'x.jsonl')], ['PI_CODING_AGENT_DIR', join(REAL, '.pi/agent')], ['EXO_BB_INFO_FILE', join(REAL, 'i.json')],
    ['EXO_STATE_DIR', join(REAL, 's')], ['EXO_RELEASE_DIR', join(REAL, 'r')], ['PLAYWRIGHT_MODULE', join(REAL, 'p')], ['EXOSURFACE_MODE', 'main'], ['EXO_BB_RUNTIME_KIND', 'canonical'], ['EXO_A2UI_SPIKE', '1'], ['EXO_RELEASE_CHANNEL', 'live']])
    assert.throws(() => assertIsolated({ ...ok, [k]: v }), (e: Error) => e.message.includes(`${k} points outside`) && (!String(v).startsWith('/') || !e.message.includes(String(v))), k);
  assert.equal(assertIsolated({ ...ok, EXOSURFACE_HOME: join(TEST_ROOT, 'home/.exo-bb-spike'), PI_TELEMETRY: '0', EXO_TEST_PI_CLI: '/elsewhere' }), TEST_ROOT, 'paths inside the root and test inputs are fine');
  assert.throws(() => assertIsolated({ ...ok, EXO_TEST_ROOT: join(REAL, 'exo-test-x'), HOME: join(REAL, 'exo-test-x/home') }), /fresh exo-test-\* folder outside the real home/);
});

test('a test file pointed at the real home exits before loading plugin state', () => {
  const r = child({ PATH: process.env.PATH, EXO_TEST_ROOT: TEST_ROOT, HOME: REAL, TMPDIR: join(TEST_ROOT, 'tmp'), EXO_CONFIG: join(TEST_ROOT, 'x.json') });
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Refusing to run tests against the real home/);
});

test('live-session selectors are scrubbed before plugin modules load', () => {
  for (const k of Object.keys(process.env)) assert.ok(!LIVE_ENV.test(k) || k === 'PI_TELEMETRY' || process.env[k]!.startsWith(TEST_ROOT + '/'), `${k} inherited`);
  const live = { EXOSURFACE_MODE: 'main', EXOSURFACE_HOME: join(REAL, '.exo-bb-spike'), OPTCHAT_HOME: join(REAL, 'o'), PI_SESSION_FILE: join(REAL, 'x.jsonl'), EXO_CONFIG: join(REAL, 'c.json'), EXO_STATE_DIR: join(REAL, 's'), EXO_RELEASE_DIR: join(REAL, 'r'), PLAYWRIGHT_MODULE: join(REAL, 'p') };
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--input-type=module', '-e', `import ${JSON.stringify(guard)};const r=process.env.EXO_TEST_ROOT;console.log(JSON.stringify(Object.entries(process.env).filter(([k,v])=>${LIVE_ENV}.test(k)&&k!=='PI_TELEMETRY'&&!v.startsWith(r+'/')).map(([k])=>k)))`],
    { env: { PATH: process.env.PATH, HOME: join(TEST_ROOT, 'home'), ...live }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), '[]', 'no selector survives unless re-pointed into the root (EXO_CONFIG → fixture)');
});

test('a test file run directly isolates itself and removes its root on exit', () => {
  const r = child({ PATH: process.env.PATH, HOME: join(TEST_ROOT, 'home') });
  assert.equal(r.status, 0, r.stderr); const root = r.stdout.trim();
  assert.match(root, /exo-test-/); assert.notEqual(root, TEST_ROOT); assert.equal(existsSync(root), false, 'own root cleaned up');
});

test('fresh roots are unique and contain a fixture config, not the real one', () => {
  const a = createIsolatedRoot(), b = createIsolatedRoot();
  try { assert.notEqual(a.root, b.root); assert.ok(a.env.EXO_CONFIG.startsWith(a.root + '/')); assert.ok(existsSync(a.env.EXO_CONFIG)); }
  finally { rmSync(a.root, { recursive: true, force: true }); rmSync(b.root, { recursive: true, force: true }); }
});


test('allowlist drops credentials, NODE_OPTIONS, BB paths and unknown future runtime selectors', () => {
  const env = isolatedEnvironment({ HOME: join(TEST_ROOT,'home'), EXO_CONFIG: join(TEST_ROOT,'config.json'), EXO_TEST_ROOT: TEST_ROOT,
    OPENAI_API_KEY:'not-a-key', NODE_OPTIONS:'--require unsafe', BB_DATA_DIR:'/live', FUTURE_OWNER_HOME:'/live', OPTCHAT_HOME:'/live', PATH:'/shim' });
  for (const k of ['OPENAI_API_KEY','NODE_OPTIONS','BB_DATA_DIR','FUTURE_OWNER_HOME','OPTCHAT_HOME']) assert.equal(env[k], undefined, k);
  assert.equal(env.HOME, join(TEST_ROOT,'home'));
  assert.ok(!env.PATH!.includes('/shim'));
});

test('HOME alone does not isolate a2ui state: selector wins; guard rejects it', () => {
  // Deliberately use a second FIXTURE path, never an actual live-state path.
  const foreign = createIsolatedRoot();
  try {
    const env = { ...process.env, EXOSURFACE_MODE:'main', EXOSURFACE_HOME: join(foreign.root, 'foreign-state') };
    const state = new URL('../../bb-plugin-exo-a2ui-spike/src/state.ts', import.meta.url).href;
    const r = spawnSync(process.execPath, ['--experimental-transform-types','--input-type=module','-e',
      `const {HOME}=await import(${JSON.stringify(state)});console.log(HOME)`], {env, encoding:'utf8'});
    assert.equal(r.status,0,r.stderr);
    assert.equal(r.stdout.trim(),env.EXOSURFACE_HOME,'temporary HOME did not override the selector');
    const checked={...env};delete checked.EXOSURFACE_MODE;
    assert.throws(()=>assertIsolated(checked),/EXOSURFACE_HOME points outside/);
  } finally { rmSync(foreign.root,{recursive:true,force:true}); }
});

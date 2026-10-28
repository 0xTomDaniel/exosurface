import test from 'node:test';
import assert from 'node:assert/strict';
// @ts-ignore plain ESM helper
import { stageEnv, assertClean, FORBIDDEN } from '../scripts/stage-env.mjs';

test('test process itself carries no inherited live selectors', () => {
  const leaked = Object.keys(process.env).filter(k => FORBIDDEN.test(k) && k !== 'EXO_CONFIG');
  assert.deepEqual(leaked, [], 'run tests via scripts/test-isolated.mjs');
  if (process.env.EXO_CONFIG) assert.ok(process.env.EXO_CONFIG.startsWith('/tmp/'), 'EXO_CONFIG must be a staging fixture');
  assert.ok(process.env.HOME?.startsWith('/tmp/'), 'HOME must be disposable');
});

test('stageEnv is an allowlist: live selectors in the parent never reach staging', () => {
  const saved = { ...process.env };
  try {
    Object.assign(process.env, { EXOSURFACE_HOME: '/Users/x/.exo-bb-spike', EXO_BB_PROFILE: 'exo-optchat', EXO_A2UI_X: '1', OPTCHAT_HOME: '/Users/x/.optchat', PI_CODING_AGENT_DIR: '/Users/x/.pi/agent', EXO_CONFIG: '/Users/x/.config/exo/exosurface.json' });
    const env = assertClean(stageEnv({ stage: '/tmp/nls-unit' }), '/tmp/nls-unit');
    for (const k of Object.keys(env)) assert.ok(!FORBIDDEN.test(k) || (k === 'EXO_CONFIG' && env[k].startsWith('/tmp/nls-unit')), k);
    assert.equal(env.HOME, '/tmp/nls-unit/home');
    assert.equal(env.BB_DATA_DIR, '/tmp/nls-unit/data');
    assert.ok(!env.PATH.includes('.local/bin') && !env.PATH.includes('homebrew'));
  } finally { for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k]; Object.assign(process.env, saved); }
});

test('assertClean rejects inherited selectors and live state paths', () => {
  assert.throws(() => assertClean({ OPTCHAT_HOME: '/tmp/x' }, '/tmp/nls-s'));
  assert.throws(() => assertClean({ PI_SESSION_FILE: '/tmp/x' }, '/tmp/nls-s'));
  assert.throws(() => assertClean({ EXO_CONFIG: '/Users/x/.config/exo/exosurface.json' }, '/tmp/nls-s'));
  assert.throws(() => assertClean({ BB_DATA_DIR: '/Users/x/.bb' }, '/tmp/nls-s'));
  assert.throws(() => stageEnv({ stage: '/Users/x/stage' }));
  assert.throws(() => stageEnv({ stage: '/tmp/nls-s', serverPort: 38886 }));
});

test('stage root rejects traversal, broad tmp paths, and invalid ports', () => {
  for (const stage of ['/tmp', '/tmp/nls-x/../x', '/tmp/nls-x/child']) assert.throws(() => stageEnv({ stage }));
  for (const serverPort of [0, 80, NaN, 65536, 39886.1]) assert.throws(() => stageEnv({ stage: '/tmp/nls-unit', serverPort }));
});

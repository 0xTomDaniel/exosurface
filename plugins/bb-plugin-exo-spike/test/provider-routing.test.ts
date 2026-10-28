import { canonicalFixture } from './isolation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import { primaryModelDefinition, EXO_MODELS, CANONICAL_PROFILE, CANONICAL_HOME, mainModel } from '../src/state.ts';
import { runtimeLaunch } from '../src/runtime.ts';
import { local } from '../src/local-config.ts';
import { homedir } from 'node:os';
import { join } from 'node:path';

test('primary Sol can use an explicit provider without changing the default registry', () => {
  assert.equal(primaryModelDefinition('exo-gpt-6-1-sol', 'private-proxy').provider, 'private-proxy');
  assert.equal(primaryModelDefinition('exo-gpt-6-1-sol', '').provider, 'openai-codex');
  assert.deepEqual(primaryModelDefinition('exo-opus-5-5', 'private-proxy'), EXO_MODELS['exo-opus-5-5']);
  assert.equal(EXO_MODELS['exo-gpt-6-1-sol'].provider, 'openai-codex');
  assert.throws(() => primaryModelDefinition('unknown', 'private-proxy'));
});

test('only canonical launch uses the primary agent directory and provider route', () => {
  canonicalFixture(CANONICAL_HOME, CANONICAL_PROFILE);
  const launch = runtimeLaunch(CANONICAL_PROFILE, 'canonical', 'test-primary-routing');
  assert.equal(launch.env.PI_CODING_AGENT_DIR, local('primaryAgentDir') || join(homedir(), '.pi', 'agent'));
  assert.equal(launch.args[launch.args.indexOf('--provider') + 1], primaryModelDefinition(mainModel()).provider);
  const live = runtimeLaunch('live-test-provider-routing', 'live', 'test-isolated-routing');
  assert.equal(live.env.PI_CODING_AGENT_DIR, join(homedir(), '.pi', 'agent'));
  assert.equal(live.args[live.args.indexOf('--provider') + 1], 'anthropic');
});

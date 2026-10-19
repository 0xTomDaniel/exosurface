import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { promptWithPrimaryModel } from '../src/model-selection.ts';
import { primaryModelDefinition } from '../src/state.ts';

const sol = { provider: primaryModelDefinition('exo-gpt-6-1-sol').provider, id: 'gpt-6.1-sol' };
const opus = { provider: 'anthropic', id: 'claude-opus-5-5' };
function fake(model = opus, thinkingLevel = 'high') {
  const calls: string[] = [], saved: string[] = [];
  const state = { model, thinkingLevel, isStreaming: false, isCompacting: false, pendingMessageCount: 0 };
  const rpc = { async send(type: string, fields: any = {}) {
    calls.push(type);
    if (type === 'set_model') state.model = { provider: fields.provider, id: fields.modelId };
    if (type === 'set_thinking_level') state.thinkingLevel = fields.level;
    return structuredClone(state);
  } };
  const run = () => promptWithPrimaryModel(rpc, 'exo-gpt-6-1-sol', async () => { calls.push('prompt'); return 'sent'; }, id => saved.push(id));
  return { state, rpc, calls, saved, run };
}

test('verify live Pi, switch and read back before prompting or remembering', async () => {
  const f = fake();
  assert.equal(await f.run(), 'sent');
  assert.deepEqual(f.calls, ['get_state', 'set_model', 'set_thinking_level', 'get_state', 'prompt']);
  assert.deepEqual(f.saved, ['exo-gpt-6-1-sol']);
  assert.deepEqual(f.state.model, sol);
});

test('matching Pi is checked, not blindly switched or trusted from a saved preference', async () => {
  const f = fake(sol);
  await f.run();
  assert.deepEqual(f.calls, ['get_state', 'prompt']);
  // A later native change must be detected even though the requested/saved model stayed Sol.
  f.state.model = opus; f.calls.length = 0;
  await f.run();
  assert.deepEqual(f.calls, ['get_state', 'set_model', 'set_thinking_level', 'get_state', 'prompt']);
});

test('correct model with wrong thinking is repaired and verified', async () => {
  const f = fake(sol, 'low'); await f.run();
  assert.deepEqual(f.calls, ['get_state', 'set_thinking_level', 'get_state', 'prompt']);
  assert.equal(f.state.thinkingLevel, 'high');
});

test('do not send or remember a model if Pi acknowledges but does not apply it', async () => {
  const f = fake();
  const send = f.rpc.send;
  f.rpc.send = async (type, fields) => type === 'set_model' ? {} as any : send(type, fields);
  await assert.rejects(f.run(), /did not confirm/);
  assert.ok(!f.calls.includes('prompt')); assert.deepEqual(f.saved, []);
});

test('do not fall back to old model on a failed switch', async () => {
  const f = fake(); const send = f.rpc.send;
  f.rpc.send = async (type, fields) => { if (type === 'set_model') throw new Error('switch failed'); return send(type, fields); };
  await assert.rejects(f.run(), /switch failed/);
  assert.ok(!f.calls.includes('prompt')); assert.deepEqual(f.saved, []);
});

test('busy switching is rejected without stopping work or clearing queued messages', async () => {
  for (const busy of ['isStreaming', 'isCompacting', 'pendingMessageCount'] as const) {
    const f = fake(); Object.assign(f.state, { [busy]: busy === 'pendingMessageCount' ? 1 : true });
    await assert.rejects(f.run(), /become idle/);
    assert.deepEqual(f.calls, ['get_state']); assert.deepEqual(f.saved, []);
  }
  const f = fake(sol); f.state.isStreaming = true; await f.run();
  assert.deepEqual(f.calls, ['get_state', 'prompt']);
});

test('unknown picker models fail closed', async () => {
  const f = fake();
  await assert.rejects(promptWithPrimaryModel(f.rpc, 'wrong-model', async () => f.calls.push('prompt'), () => {}), /Unsupported/);
  assert.deepEqual(f.calls, []);
});

test('startup/resume input and regular turns share the checked prompt route; steering is checked too', () => {
  const source = readFileSync(new URL('../host.ts', import.meta.url), 'utf8');
  assert.match(source, /selectedPrompt\(s, p\.options\?\.model, p\.input\)/);
  assert.match(source, /selectedPrompt\(s, p\.options\?\.model, p\.input, p\.clientRequestId\)/);
  assert.match(source, /promptWithPrimaryModel\(s\.rpc, p\.options\?\.model, send\)/);
  assert.doesNotMatch(source, /if \(p\.input\?\.length\) await prompt\(/);
});

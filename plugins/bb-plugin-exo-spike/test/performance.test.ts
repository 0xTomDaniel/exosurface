import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOverview, updateFeedback } from '../src/overview.ts';
import { feedback } from '../src/state.ts';
import { readFileSync } from 'node:fs';
test('concurrent refreshes share one bounded thread-list query', async () => {
  let calls = 0;
  const overview = createOverview(async () => { calls++; await new Promise(r => setTimeout(r, 20)); return []; }, async id => ({ id, providerId:'exo-spike',title:'Exo',status:'idle',parentThreadId:null }));
  await Promise.all(Array.from({length:40}, () => overview()));
  await overview(); assert.equal(calls, 1);
});
test('feedback remains bounded latest state and deduplicates notifications', () => {
  const id = `feedback_test_${process.pid}`;
  for (let i=0;i<2000;i++) updateFeedback(id,{method:'setStatus',statusKey:'runtime',statusText:'working'});
  for (let i=0;i<30;i++) updateFeedback(id,{method:'notify',id:`n${i}`,message:`message ${i}`});
  updateFeedback(id,{method:'notify',id:'n29',message:'message 29'});
  const value=feedback(id);assert.equal(value.statuses.runtime,'working');assert.equal(value.notifications.length,20);
  const source=readFileSync('host.ts','utf8');assert.ok(!source.includes("kind: 'extension.state'"));
});
test('canonical reconnect never fetches a whole growing transcript over RPC', () => {
  const source=readFileSync('host.ts','utf8');
  assert.ok(source.includes("runtimeKind === 'canonical'\n        ? load"));
  assert.ok(source.includes('await OwnerClient.open'));
  const client=readFileSync('src/owner-client.ts','utf8');assert.ok(!client.includes("kill('SIG"));
});

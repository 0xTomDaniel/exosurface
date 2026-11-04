// #67 (spec pages-and-activity S9, S10; owner ruling option A on #33): bound canonical threads with turns at once,
// through the live entry points: server.ts RPC, host.ts provider bridge and the release owner (legacy/primary).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { realpathSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, serverRpc, bridge, ownerRequest, INSTRUCTIONS } from './mock-bb.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
after(async () => {
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  const pids = f.piRuns().map(r => r.pid);
  for (let i = 0; i < 100 && pids.some(alive); i++) await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(pids.filter(alive), [], 'every owned Pi stopped with the owner');
  rmSync(f.root, { recursive: true, force: true });
});
function alive(pid: number) { try { process.kill(pid, 0); return true; } catch { return false; } }

test('two bound canonical threads run turns at once; each reply reaches only its own thread; neither is refused', async () => {
  const rpc = await serverRpc();
  const second = await rpc.thread_bind({ threadId: 'second' });
  assert.match(second.profile, /^exo-optchat-t[0-9a-f]{16}$/);
  assert.deepEqual(await rpc.thread_bind({ threadId: 'second' }), second, 'binding is idempotent');

  assert.equal((await host.start('primary')).error, undefined);
  assert.equal((await host.start('second')).error, undefined);
  host.send('primary', 'together: plan the week');
  host.send('second', 'together: book the cabin');
  await host.settled(['primary', 'second']);

  // The fake Pi answers a "together" turn only while the other thread's turn is running too.
  const one = host.turn('primary'), two = host.turn('second');
  assert.deepEqual(one.replies, ['Exo (exo-optchat): together: plan the week']);
  assert.deepEqual(two.replies, [`Exo (${second.profile}): together: book the cabin`]);
  assert.deepEqual([one.end.status, two.end.status], ['completed', 'completed']);
  assert.ok(one.open.at < two.end.at && two.open.at < one.end.at, 'turns overlap');
  assert.equal(host.lines.some(l => l.value.error || l.value.method === 'error'), false, JSON.stringify(host.lines));

  // S10: each thread its own Pi and profile; the same instructions source, model and vault. Pages stay the primary's.
  const runs = f.piRuns();
  assert.deepEqual(runs.map(r => r.profile), ['exo-optchat', second.profile]);
  assert.notEqual(runs[0].pid, runs[1].pid);
  for (const r of runs) assert.deepEqual([r.instructions, r.model, realpathSync(r.cwd)], [INSTRUCTIONS, 'anthropic/claude-opus-5-5/high', f.vault]);
  assert.equal(runs[1].pageExtensions, false);
  assert.notEqual(runs[0].sessionFile, runs[1].sessionFile);
});

test('an unbound thread is refused by the bridge and by the owner, and starts no Pi', async () => {
  const before = f.piRuns().length;
  assert.match((await host.start('stranger')).error?.message ?? '', /do not start another owner thread/);
  assert.deepEqual(await ownerRequest(f, { type: 'hello', threadId: 'stranger' }), { kind: 'response', id: 'probe', ok: false, error: 'Owner request failed; native owner/state and session evidence must be checked' });
  assert.equal(f.piRuns().length, before);
  assert.equal(join(f.home, 'canonical-thread.json').length > 0, true);
});

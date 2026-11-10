// #199: actual native Pi command capability and public edit RPC, with the existing offline provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { liveFixture, modelRequests, PLUGIN } from './mock-bb.ts';
import { settled } from './wait.ts';

test('acceptance-keep #199: retained page Keep and edits refuse before a turn when workspace-data is absent', async () => {
  const f = await liveFixture();
  const { OwnerClient } = await import('../legacy/primary/src/owner-client.ts');
  const events: { type: string; message?: { role: string } }[] = [];
  const pids = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-path', 'pids'], { cwd: PLUGIN, encoding: 'utf8' }).trim();
  mkdirSync(pids, { recursive: true });
  const pidfile = join(pids, `keep-capability-${process.pid}`);
  let child: ChildProcess | undefined, client: InstanceType<typeof OwnerClient> | undefined;
  async function stop() {
    await client?.close(); client = undefined;
    if (child) {
      const closed = once(child, 'close');
      execFileSync('bash', ['-c', 'kill -- -"$(< "$1")"', 'sh', pidfile]);
      await closed; child = undefined;
    }
  }
  async function start() {
    child = spawn('setsid', ['sh', '-c', 'echo $$ > "$1"; exec "$2" --experimental-transform-types --no-warnings "$3"', 'sh', pidfile, process.execPath, join(PLUGIN, 'legacy/primary/release-owner.ts')], { cwd: f.vault, env: { EXO_CONFIG: f.config, HOME: f.root, TMPDIR: f.root, PATH: process.env.PATH }, stdio: ['ignore', 'pipe', 'pipe'] });
    let errors = '';
    child.stderr!.on('data', b => { errors += b; }); child.stdout!.resume();
    const state = join(f.home, 'owner/state.json');
    assert.ok(await settled(() => existsSync(pidfile) && existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).ready && JSON.parse(readFileSync(state, 'utf8')).ownerPid === Number(readFileSync(pidfile, 'utf8')), 25000, 25), errors);
    client = await OwnerClient.open('primary', e => events.push(e), () => {});
    await client.send('attach');
  }
  const workspace = () => f.rpc.workspace({ deployment: 'main', cursor: null });
  try {
    await start();
    assert.ok((await client!.send('get_commands')).commands.some((c: { name: string; source: string }) => c.name === 'workspace-data' && c.source === 'extension'));
    await client!.send('prompt', { message: 'draw plum: Plum plan' });
    assert.ok(await settled(async () => (await workspace()).revision === 1 && !(await client!.send('get_state')).isStreaming, 25000, 25));
    await stop();
    writeFileSync(f.config, JSON.stringify({ ...JSON.parse(readFileSync(f.config, 'utf8')), surfaceMain: 'off' }));
    await start();
    assert.equal((await client!.send('get_commands')).commands.some((c: { name: string }) => c.name === 'workspace-data'), false);
    const retained = await workspace();
    assert.equal(retained.revision, 1);
    assert.ok(retained.delivery.checkpoint.messages.some((m: { createSurface?: { surfaceId: string } }) => m.createSurface?.surfaceId === 'plum'));
    for (const keep of [true, false]) {
      const requestsBefore = modelRequests(f).length, eventsBefore = events.length;
      await assert.rejects(f.rpc.edit({ threadId: 'primary', revision: retained.revision, surfaceId: 'plum', updates: [], ...(keep ? { keep: true } : {}), mutationId: crypto.randomUUID() }));
      assert.ok(await settled(async () => !(await client!.send('get_state')).isStreaming, 25000, 25));
      const observed = { providerRequests: modelRequests(f).length - requestsBefore, userTurns: events.slice(eventsBefore).filter(e => e.type === 'message_start' && e.message?.role === 'user').length };
      console.log(`${keep ? 'Keep' : 'edit'} missing workspace-data: ${JSON.stringify(observed)}`);
      assert.deepEqual(observed, { providerRequests: 0, userTurns: 0 });
      assert.deepEqual(await workspace(), retained, 'refusal leaves the public page and kept metadata unchanged');
    }
  } finally {
    await stop(); await f.model.close();
    rmSync(pidfile, { force: true }); rmSync(f.root, { recursive: true, force: true });
  }
});

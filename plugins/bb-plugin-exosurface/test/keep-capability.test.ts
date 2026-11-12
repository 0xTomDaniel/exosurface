// #199: actual native Pi command capability and public edit RPC, with the existing offline provider.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn, execFileSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { liveFixture, modelRequests, PLUGIN } from './mock-bb.ts';
import { settled } from './wait.ts';
import { reaped, PARENT_WATCH } from './reap.ts';

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
    child = reaped(spawn('setsid', ['sh', '-c', 'echo $$ > "$1"; shift; exec "$@"', 'sh', pidfile, process.execPath, ...PARENT_WATCH, '--experimental-transform-types', '--no-warnings', join(PLUGIN, 'legacy/primary/release-owner.ts')], { cwd: f.vault, env: { EXO_CONFIG: f.config, HOME: f.root, TMPDIR: f.root, PATH: process.env["PATH"] }, stdio: ['ignore', 'pipe', 'pipe'] }));
    let errors = '';
    child.stderr!.on('data', b => { errors += b; }); child.stdout!.resume();
    const state = join(f.home, 'owner/state.json');
    assert.ok(await settled(() => existsSync(pidfile) && existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).ready && JSON.parse(readFileSync(state, 'utf8')).ownerPid === Number(readFileSync(pidfile, 'utf8')), 25000, 25), errors);
    client = await OwnerClient.open('primary', e => events.push(e), () => {});
    await client.send('attach');
  }
  const workspace = () => f.rpc["workspace"]({ deployment: 'main', cursor: null });
  try {
    await start();
    assert.ok((await client!.send('get_commands')).commands.some((c: { name: string; source: string }) => c.name === 'workspace-data' && c.source === 'extension'));
    const snapshot = '- region "Plum plan" [ref=plum]:\n  - textbox "Notes" [ref=note] [multiline]\n  - button "Apply" [ref=apply] [action=apply] [sends=note]';
    await client!.send('prompt', { message: `call: ${JSON.stringify({ baseRevision: 0, snapshot })}` });
    assert.ok(await settled(async () => (await workspace()).revision === 1 && !(await client!.send('get_state')).isStreaming, 25000, 25));
    const drawn = (await workspace()).delivery.checkpoint;
    const button = drawn.messages.flatMap((m: { updateComponents?: { components: { action?: { event?: { context: Record<string, { path: string }> } } }[] } }) => m.updateComponents?.components ?? []).find((n: { action?: { event?: unknown } }) => n.action?.event);
    const path = button.action.event.context.note.path;
    const requestCount = modelRequests(f).length, eventCount = events.length;
    assert.deepEqual(await f.rpc["edit"]({ threadId: 'primary', revision: 1, surfaceId: 'plum', updates: [{ path, value: 'Saved while on' }], mutationId: crypto.randomUUID() }), { revision: 2 });
    assert.ok(JSON.stringify((await workspace()).delivery.checkpoint).includes('Saved while on'));
    assert.equal(modelRequests(f).length, requestCount);
    assert.equal(events.slice(eventCount).filter(e => e.type === 'message_start' && e.message?.role === 'user').length, 0);
    await stop();
    writeFileSync(f.config, JSON.stringify({ ...JSON.parse(readFileSync(f.config, 'utf8')), surfaceMain: 'off' }));
    await start();
    assert.equal((await client!.send('get_commands')).commands.some((c: { name: string }) => c.name === 'workspace-data'), false);
    const retained = await workspace();
    assert.equal(retained.revision, 2);
    assert.ok(retained.delivery.checkpoint.messages.some((m: { createSurface?: { surfaceId: string } }) => m.createSurface?.surfaceId === 'plum'));
    console.log('native workspace-data absent; retained plum has an offered Notes input');
    const observations = [];
    for (const keep of [true, false]) {
      const requestsBefore = modelRequests(f).length, eventsBefore = events.length;
      let refusal = '';
      try {
        await f.rpc["edit"]({ threadId: 'primary', revision: retained.revision, surfaceId: 'plum', updates: keep ? [] : [{ path, value: 'Changed while off' }], ...(keep ? { keep: true } : {}), mutationId: crypto.randomUUID() });
      } catch (error) { refusal = error instanceof Error ? error.message : String(error); }
      const idle = await settled(async () => !(await client!.send('get_state')).isStreaming, 25000, 25);
      const observed = { providerRequests: modelRequests(f).length - requestsBefore, userTurns: events.slice(eventsBefore).filter(e => e.type === 'message_start' && e.message?.role === 'user').length };
      console.log(`${keep ? 'Keep' : 'valid edit'} missing workspace-data: ${JSON.stringify(observed)}; refusal: ${refusal}`);
      observations.push({ refusal, idle, observed, after: await workspace() });
    }
    for (const { refusal, idle, observed, after } of observations) {
      assert.match(refusal, /Owner request failed; native owner\/state and session evidence must be checked/);
      assert.ok(idle);
      assert.deepEqual(observed, { providerRequests: 0, userTurns: 0 });
      assert.deepEqual(after, retained, 'refusal leaves the public page and kept metadata unchanged');
    }
  } finally {
    await stop(); await f.model.close();
    rmSync(pidfile, { force: true }); rmSync(f.root, { recursive: true, force: true });
  }
});

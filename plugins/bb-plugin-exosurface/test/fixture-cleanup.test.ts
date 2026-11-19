import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn } from 'node:child_process';
import { fixtureCleanup } from './fixture-cleanup.ts';
import { PARENT_WATCH } from './reap.ts';

void test('test teardown awaits reverse resource shutdown before deleting its root; late stopped-state write cannot recreate it', async t => {
  const root = mkdtempSync(join(tmpdir(), 'exo-cleanup-order-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const hooks: Array<() => Promise<void>> = [], order: string[] = [];
  const cleanup = fixtureCleanup({ after: (fn: () => Promise<void>) => hooks.push(fn), diagnostic: () => {} }, root);
  cleanup.beforeRemove(async () => {
    await new Promise<void>(resolve => setImmediate(resolve));
    assert.deepEqual(order, ['client-closed']);
    mkdirSync(join(root, 'state/owner'), { recursive: true });
    writeFileSync(join(root, 'state/owner/state.json'), '{"status":"stopped"}');
    order.push('owner-closed');
  });
  cleanup.beforeRemove(() => { order.push('client-closed'); });
  await hooks[0]();
  assert.deepEqual(order, ['client-closed', 'owner-closed']);
  assert.equal(existsSync(root), false);
});

void test('test teardown reaps its owned child and verifies PID disappearance before root removal', t => {
  const root = mkdtempSync(join(tmpdir(), 'exo-cleanup-child-'));
  const cleanup = fixtureCleanup(t, root);
  const child = spawn(process.execPath, [...PARENT_WATCH, '-e', 'setInterval(()=>{},1000)'], {
    cwd: root, env: { HOME: root, TMPDIR: root, PATH: '/usr/bin:/bin' }, stdio: 'ignore',
  });
  cleanup.child(child);
});

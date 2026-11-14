// Test-only ownership barrier: close resources before deleting their state root.
import { required } from './required.ts';
import assert from 'node:assert/strict';
import { existsSync, rmSync } from 'node:fs';
import { basename } from 'node:path';
import type { ChildProcess } from 'node:child_process';

export function fixtureCleanup(t: any, root: string) {
  const tasks: Array<() => void | Promise<void>> = [], gonePids: number[] = [];
  const verifyGone = (pid: number) => {
    assert.ok(Number.isInteger(pid) && pid > 0, 'fixture child PID required');
    assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' }, `Owned fixture PID ${pid} survived shutdown`);
    gonePids.push(pid);
  };
  t.after(async () => {
    let failure: unknown;
    for (const cleanup of tasks.reverse()) {
      try { await cleanup(); } catch (error) { failure ??= error; }
    }
    if (failure) throw failure; // Keep failed resources' state for diagnosis.
    rmSync(root, { recursive: true, force: true });
    await new Promise<void>(resolve => setTimeout(resolve, 50));
    assert.equal(existsSync(root), false, `Fixture root recreated after awaited shutdown: ${root}`);
    for (const pid of gonePids) assert.throws(() => process.kill(pid, 0), { code: 'ESRCH' });
    t.diagnostic(JSON.stringify({ fixtureCleanup: basename(root), rootAbsentAfterShutdown: true, observationMs: 50, ownedPidsGone: gonePids }));
  });
  return {
    beforeRemove(cleanup: () => void | Promise<void>) { tasks.push(cleanup); },
    verifyGone,
    child(child: ChildProcess) {
      const closed = new Promise<void>(resolve => child.once('close', () => resolve()));
      tasks.push(async () => {
        if (child.exitCode === null && child.signalCode === null) child.kill('SIGTERM');
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([closed, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error(`Fixture child ${child.pid} did not close`)), 2000); })]);
        } catch (error) { child.kill('SIGKILL'); throw error; } // Forced cleanup never passes.
        finally { clearTimeout(timer); }
        verifyGone(required(child.pid, "Expected child.pid to be non-null"));
      });
    },
  };
}

import { test, expect } from 'vitest';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { once } from 'node:events';
import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { connectClient, discover, sendIntent, requestOptions } from '../src/client.js';
import { GetTaskRequest, TaskState } from '@a2a-js/sdk';

async function childHost(directory: string, crash = false) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'src/start.ts', '--host-only', '--state', directory,
    '--port', '0', '--boot-work-ms', '60000', ...(crash ? ['--crash-after-plan-write'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  const url = await new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Child startup timed out')), 10000);
    child.once('exit', () => { clearTimeout(timeout); reject(new Error('Child exited during startup')); });
    lines.on('line', line => { try { const value = JSON.parse(line) as { host?: string }; if (value.host) { clearTimeout(timeout); resolve(value.host); } } catch { /* Runtime notices are not state. */ } });
  });
  return { child, url, close: async () => { lines.close(); if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); } } };
}

test('SIGKILL after the durable plan write reconciles one acceptance and truthful interrupted work', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-restart-'));
  let first: Awaited<ReturnType<typeof childHost>> | undefined;
  let second: Awaited<ReturnType<typeof childHost>> | undefined;
  try {
    first = await childHost(dir, true); const client = await connectClient(first.url);
    let state = await discover(client); const work = state.work[0]!.id;
    await sendIntent(client, { name: 'move', objectId: 'research-review', revision: state.revision, surfaceId: state.surfaceId });
    state = await discover(client);
    const proposal = state.proposals[0]!;
    const exited = once(first.child, 'exit');
    await expect(sendIntent(client, { name: 'accept', proposalId: proposal.id, revision: state.revision, surfaceId: state.surfaceId })).rejects.toThrow();
    const [, signal] = await exited; expect(signal).toBe('SIGKILL');
    second = await childHost(dir); const returning = await connectClient(second.url);
    const restored = await discover(returning);
    expect(restored.proposals.find(p => p.id === proposal.id)?.status).toBe('accepted');
    expect(restored.tasks.find(t => t.id === 'research-review')?.time).toBe('13:00');
    expect(restored.work.find(w => w.id === work)?.state).toBe('interrupted');
    expect((await returning.getTask(GetTaskRequest.fromJSON({ id: work }), requestOptions())).status?.state).toBe(TaskState.TASK_STATE_FAILED);
    await sendIntent(returning, { name: 'accept', proposalId: proposal.id, revision: state.revision, surfaceId: state.surfaceId });
    expect(readdirSync(join(dir, 'vault', 'Plans'))).toHaveLength(1);
    expect(restored.turns.filter(t => t.kind === 'accept')).toHaveLength(1);
  } finally { await first?.close(); await second?.close(); rmSync(dir, { recursive: true, force: true }); }
});

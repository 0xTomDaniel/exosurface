import { afterEach, expect, test } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHost } from '../src/host.js';
import { connectClient, sendIntent, discover, requestOptions } from '../src/client.js';
import { SubscribeToTaskRequest, CancelTaskRequest, GetTaskRequest, ListTasksRequest, TaskState } from '@a2a-js/sdk';

// Seam authority: assigned spike's Proposed validation requires the real published
// SDK, HTTP wire, visible snapshots and authoritative fixture effects.
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => { for (const fn of cleanup.splice(0).reverse()) await fn(); });
test('server-started work completes with zero clients and is found without resubmission', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0, bootWorkMs: 80 });
  cleanup.push(host.close);
  await new Promise(resolve => setTimeout(resolve, 180));
  const client = await connectClient(host.url);
  const state = await discover(client);
  expect(state.work[0]?.state).toBe('completed');
  expect(state.tasks.map(t => t.id)).toContain('research-brief');
  const reply = await sendIntent(client, { name: 'select', revision: state.revision,
    surfaceId: state.surfaceId, objectId: 'research-review' });
  expect(reply.taskId).toBe('');
  const next = await discover(client);
  expect(next.turns.at(-1)?.author).toBe('person');
  expect(next.turns.at(-1)?.reference?.objectId).toBe('research-review');
  expect(next.turns.at(-1)?.utterance).toBeUndefined();
});
test('explicit cancellation is truthful, completed work is discoverable with pagination, and outsider access is denied', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0 }); cleanup.push(host.close);
  const client = await connectClient(host.url);
  const work = await host.startWork(1500);
  const canceled = await client.cancelTask(CancelTaskRequest.fromJSON({ id: work }), requestOptions());
  expect(canceled.status?.state).toBe(TaskState.TASK_STATE_CANCELED);
  expect((await discover(client)).work.find(w => w.id === work)?.state).toBe('canceled');
  const completed = await host.startWork(20); await new Promise(resolve => setTimeout(resolve, 100));
  await expect(client.cancelTask(CancelTaskRequest.fromJSON({ id: completed }), requestOptions())).rejects.toThrow();
  expect((await client.getTask(GetTaskRequest.fromJSON({ id: completed }), requestOptions())).status?.state).toBe(TaskState.TASK_STATE_COMPLETED);
  let token = '', count = 0;
  do {
    const page = await client.listTasks(ListTasksRequest.fromJSON({ contextId: 'thread-sunday', pageSize: 1, pageToken: token }), requestOptions());
    count += page.tasks.length; token = page.nextPageToken;
  } while (token);
  expect(count).toBe(3);
  const outsider = { serviceParameters: { Authorization: 'Bearer demo-outsider' } };
  expect((await client.listTasks(ListTasksRequest.fromJSON({ pageSize: 10 }), outsider)).tasks).toHaveLength(0);
  await expect(client.getTask(GetTaskRequest.fromJSON({ id: completed }), outsider)).rejects.toThrow();
  expect((await fetch(`${host.url}/rpc`, { method: 'POST' })).status).toBe(401);
});

test('30 standard-wire detach cycles plus repeated finite lease renewal retain bounded listeners and checkpoints', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0, leaseMs: 350 }); cleanup.push(host.close);
  const client = await connectClient(host.url);
  let successes = 0;
  for (let cycle = 0; cycle < 30; cycle++) {
    const state = await discover(client), abort = new AbortController();
    const stream = client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ id: state.observerTaskId }), requestOptions(abort.signal));
    try { const event = await stream.next(); if (event.value?.payload?.$case === 'task') successes++; }
    catch { /* Lease may rotate between discovery and attachment; retry on next cycle. */ }
    finally { abort.abort(); await stream.return(); }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
  await new Promise(resolve => setTimeout(resolve, 450));
  const measured = await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json();
  expect(successes).toBeGreaterThan(25);
  expect(measured.activeStreams).toBe(0);
  expect(measured.busListeners).toBeLessThanOrEqual(4);
  expect(measured.buses).toBe(1);
  expect(measured.observerRecords).toBeLessThanOrEqual(3);
  expect(measured.taskWrites).toBe(0);
  expect(measured.checkpointBytes).toBeLessThan(30000);
  mkdirSync('evidence/generated', { recursive: true });
  writeFileSync('evidence/generated/resource-churn.json', JSON.stringify({ cycles: 30, leaseMs: 350, ...measured }, null, 2));
});

test('completion/cancellation races remain truthful and completed work retention stays at 32 records', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-races-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0 }); cleanup.push(host.close);
  const client = await connectClient(host.url);
  const outcomes: string[] = [];
  for (let i = 0; i < 36; i++) {
    const id = await host.startWork(5);
    await new Promise(resolve => setTimeout(resolve, i % 2 === 0 ? 0 : 8));
    let cancelAccepted = false;
    try { const task = await client.cancelTask(CancelTaskRequest.fromJSON({ id }), requestOptions()); cancelAccepted = task.status?.state === TaskState.TASK_STATE_CANCELED; } catch { /* Completion may have won. */ }
    const state = await discover(client); const work = state.work.find(w => w.id === id)!;
    expect(work.state).toBe(cancelAccepted ? 'canceled' : 'completed'); outcomes.push(work.state);
  }
  expect(outcomes).toContain('canceled'); expect(outcomes).toContain('completed');
  const listed = await client.listTasks(ListTasksRequest.fromJSON({ pageSize: 100 }), requestOptions());
  expect(listed.tasks.filter(task => !task.metadata?.observation)).toHaveLength(32);
  expect((await discover(client)).work).toHaveLength(32);
});

test('a source change overlapping snapshot acquisition reaches the same ordered live stream', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-cut-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0 }); cleanup.push(host.close);
  const client = await connectClient(host.url); const state = await discover(client);
  const abort = new AbortController();
  const stream = client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ id: state.observerTaskId }), requestOptions(abort.signal));
  const first = stream.next();
  writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace('Research brief', 'Changed during recovery'));
  let event = await first, found = false;
  const timer = setTimeout(() => abort.abort(), 2000);
  try {
    while (!event.done) {
      const artifacts = event.value.payload?.$case === 'task' ? event.value.payload.value.artifacts : event.value.payload?.$case === 'artifactUpdate' ? [event.value.payload.value.artifact] : [];
      if (JSON.stringify(artifacts).includes('Changed during recovery')) { found = true; break; }
      event = await stream.next();
    }
    expect(found).toBe(true);
  } finally { clearTimeout(timer); abort.abort(); await stream.return(); }
});
test('two clients and duplicate delivery accept one exact proposal; stale source and incarnation actions fail', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-')); cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0 }); cleanup.push(host.close);
  const one = await connectClient(host.url), two = await connectClient(host.url);
  let state = await discover(one);
  await sendIntent(one, { name: 'move', objectId: 'research-review', revision: state.revision, surfaceId: state.surfaceId,
    utterance: 'Move this after lunch', clientId: 'one' });
  state = await discover(one);
  const proposal = state.proposals[0]; expect(proposal?.objectId).toBe('research-review');
  const accept = { name: 'accept' as const, proposalId: proposal!.id, revision: state.revision, surfaceId: state.surfaceId };
  const replies = await Promise.all([sendIntent(one, { ...accept, clientId: 'one' }), sendIntent(two, { ...accept, clientId: 'two' })]);
  await sendIntent(one, accept);
  expect(replies[0]?.parts[0]?.content?.value.receipt).toBe(replies[1]?.parts[0]?.content?.value.receipt);
  state = await discover(two);
  const contribution = state.turns.find(turn => turn.utterance === 'Move this after lunch');
  expect(contribution?.reference?.objectId).toBe('research-review');
  expect(contribution?.utteranceId).toBe(`${contribution?.id}:utterance`);
  const response = state.turns.find(turn => turn.respondsTo === contribution?.id);
  expect(response?.kind).toBe('agenda-proposed');
  expect(response?.utterance).toContain('research-review');
  expect(state.tasks.find(t => t.id === 'research-review')?.time).toBe('13:00');
  expect(readdirSync(join(host.vault, 'Plans'))).toHaveLength(1);
  expect(state.turns.filter(t => t.author === 'person' && t.kind === 'accept')).toHaveLength(1);
  const before = state;
  writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace('Research brief', 'Revised source brief'));
  await expect(sendIntent(one, { name: 'move', objectId: 'research-brief', revision: before.revision, surfaceId: before.surfaceId })).rejects.toThrow('Stale');
  state = await discover(one);
  await sendIntent(one, { name: 'recreate', revision: state.revision, surfaceId: state.surfaceId });
  const recreated = await discover(one);
  await expect(sendIntent(one, { name: 'select', objectId: 'research-brief', revision: recreated.revision, surfaceId: state.surfaceId })).rejects.toThrow('incarnation');
});
test('observation delivers a complete A2UI checkpoint and releases a detached standard-wire subscriber', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-'));
  cleanup.push(() => rmSync(dir, { recursive: true, force: true }));
  const host = await startHost({ stateDir: dir, port: 0 }); cleanup.push(host.close);
  const client = await connectClient(host.url);
  const state = await discover(client);
  const abort = new AbortController();
  const stream = client.resubscribeTask(SubscribeToTaskRequest.fromJSON({ id: state.observerTaskId }), requestOptions(abort.signal));
  const event = await stream.next();
  expect(event.value?.payload?.$case).toBe('task');
  if (event.value?.payload?.$case !== 'task') throw new Error('No task checkpoint');
  const part = event.value.payload.value.artifacts[0]?.parts[1];
  expect(part?.mediaType).toBe('application/a2ui+json');
  expect(part?.content?.value).toEqual(expect.arrayContaining([expect.objectContaining({ createSurface: expect.objectContaining({ surfaceId: state.surfaceId }) })]));
  abort.abort(); await stream.return();
  await new Promise(resolve => setTimeout(resolve, 300));
  const metrics = await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json();
  expect(metrics.activeStreams).toBe(0);
  expect(metrics.busListeners).toBeLessThanOrEqual(4);
});

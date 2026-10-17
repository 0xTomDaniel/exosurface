import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { Task, TaskState, type ListTasksRequest, type ListTasksResponse } from '@a2a-js/sdk';
import { type ServerCallContext, type TaskStore } from '@a2a-js/sdk/server';
import { limits } from './schema.js';

// Supported TaskStore seam. Observers are ephemeral projections; work is durable.
export class ProjectedTaskStore implements TaskStore {
  private readonly tasks = new Map<string, Task>();
  writes = 0; writeBytes = 0; saveCalls = 0;
  constructor(private readonly file: string) {
    if (existsSync(file)) {
      const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
      if (!Array.isArray(raw)) throw new Error('Invalid task checkpoint');
      for (const value of raw) {
        const task = Task.fromJSON(value);
        if (!task.id || !task.status) throw new Error('Invalid task checkpoint');
        if ([TaskState.TASK_STATE_WORKING, TaskState.TASK_STATE_SUBMITTED].includes(task.status.state)) {
          task.status.state = TaskState.TASK_STATE_FAILED;
          task.metadata = { ...task.metadata, outcome: 'Interrupted by host restart; not resumed' };
        }
        this.tasks.set(task.id, task);
      }
    }
  }
  async save(task: Task, context: ServerCallContext) {
    if (context.user?.userName !== 'owner') throw new Error('Unauthorized task save');
    this.saveCalls++;
    const copy = structuredClone(task);
    copy.history = copy.history.slice(-8);
    this.tasks.set(copy.id, copy);
    const observers = [...this.tasks.values()].filter(t => t.metadata?.observation);
    const retired = observers.filter(t => t.status?.state !== TaskState.TASK_STATE_WORKING);
    for (const value of retired.slice(0, Math.max(0, retired.length - limits.retiredObservers))) this.tasks.delete(value.id);
    const work = [...this.tasks.values()].filter(t => !t.metadata?.observation);
    const completedWork = work.filter(t => [TaskState.TASK_STATE_COMPLETED, TaskState.TASK_STATE_CANCELED, TaskState.TASK_STATE_FAILED].includes(t.status?.state ?? TaskState.TASK_STATE_UNSPECIFIED));
    for (const value of completedWork.slice(0, Math.max(0, work.length - limits.retainedWork))) this.tasks.delete(value.id);
    if (copy.metadata?.observation) return;
    const raw = JSON.stringify([...this.tasks.values()].filter(t => !t.metadata?.observation).map(t => Task.toJSON(t)));
    writeFileSync(`${this.file}.tmp`, raw, { mode: 0o600 }); renameSync(`${this.file}.tmp`, this.file);
    this.writes++; this.writeBytes += Buffer.byteLength(raw);
  }
  async load(id: string, context: ServerCallContext) {
    if (context.user?.userName !== 'owner') return undefined;
    return structuredClone(this.tasks.get(id));
  }
  async list(params: ListTasksRequest, context: ServerCallContext): Promise<ListTasksResponse> {
    if (context.user?.userName !== 'owner') return { tasks: [], nextPageToken: '', pageSize: (params.pageSize ?? 50), totalSize: 0 };
    const entries = [...this.tasks.values()].filter(t => (!params.contextId || t.contextId === params.contextId) &&
      (!params.status || t.status?.state === params.status) &&
      (!params.statusTimestampAfter || Date.parse(t.status?.timestamp ?? '') > Date.parse(params.statusTimestampAfter))).sort((a, b) => a.id.localeCompare(b.id));
    const start = params.pageToken ? Number(params.pageToken) : 0;
    if (!Number.isSafeInteger(start) || start < 0) throw new Error('Invalid page token');
    const end = start + (params.pageSize ?? 50);
    return { tasks: structuredClone(entries.slice(start, end)), nextPageToken: end < entries.length ? String(end) : '', pageSize: (params.pageSize ?? 50), totalSize: entries.length };
  }
  metrics() {
    return { taskRecords: this.tasks.size, observerRecords: [...this.tasks.values()].filter(t => t.metadata?.observation).length,
      taskSaveCalls: this.saveCalls, taskWrites: this.writes, taskWriteBytes: this.writeBytes };
  }
}

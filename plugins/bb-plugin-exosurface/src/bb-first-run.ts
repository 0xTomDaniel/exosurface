import { join } from 'node:path';
import { loadIf, save } from './store.ts';
/** SDK 0.6.15 has no atomic spawn idempotency key. Persist intent BEFORE the external operation, then fail closed
 * on uncertainty. Never adopt by title or infer that an absent local receipt means BB created nothing. */
export function bbFirstRun(stateDir: string, projectId: string, api: {
  create(key: string): Promise<{ id: string }>;
  get(id: string): Promise<{ id: string; providerId: string; projectId: string }>;
}) {
  const file = join(stateDir, 'bb-thread-intent.json');
  return {
    async findThread(key: string) {
      const intent = loadIf(file);
      if (!intent) return undefined;
      if (intent.key !== key || intent.projectId !== projectId) throw new Error('BB creation intent conflicts; refusing rebind');
      if (!intent.threadId) throw new Error(`Interrupted BB creation outcome unknown. Operation ${key}; project ${projectId}; provider exosurface; intent time ${intent.createdAt ?? "unknown"}. Candidate evidence must include exact BB thread ID, project/provider and creation time. Inspect candidate BB records and reconcile ${file} before retry; do not adopt by title. SDK spawn has no idempotency key.`);
      const th = await api.get(intent.threadId);
      if (th.providerId !== 'exosurface' || th.id !== intent.threadId || th.projectId !== projectId) throw new Error('BB primary identity/provider changed; refusing adoption');
      return { id: th.id };
    },
    async createThread(key: string) {
      save(file, { key, projectId, providerId: 'exosurface', createdAt: new Date().toISOString(), status: 'creating' });
      const th = await api.create(key);
      if (!th?.id) throw new Error('SDK spawn returned no thread ID; reconcile operation before retry');
      save(file, { ...loadIf(file), key, projectId, providerId: 'exosurface', threadId: th.id, status: 'created' });
      return { id: th.id };
    },
  };
}

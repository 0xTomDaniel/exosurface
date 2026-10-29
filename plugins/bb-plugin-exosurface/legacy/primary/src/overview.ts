import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, binding, feedback, load, runs, save } from './state.ts';

/** Bounded read-side cache. Never turn UI refreshes into full DB query storms. */
export function createOverview(list: () => Promise<any[]>, get: (id: string) => Promise<any>) {
  let cached: any[] = []; let nextRefresh = 0; let pending: Promise<any[]> | undefined;
  return async () => {
    if (Date.now() >= nextRefresh) {
      if (!pending) pending = (async () => {
        try {
          const rows = (await list()).filter(t => t.providerId === 'exo-spike');
          const file = join(HOME, 'canonical-thread.json');
          const primary = existsSync(file) ? load(file).threadId : undefined;
          if (primary && !rows.some(t => t.id === primary)) rows.unshift(await get(primary));
          cached = rows; nextRefresh = Date.now() + 60_000; return rows;
        } catch (e) { nextRefresh = Date.now() + 10_000; if (!cached.length) throw e; return cached; }
        finally { pending = undefined; }
      })();
      await pending;
    }
    return { threads: cached.map(t => {
      const state = binding(t.id);
      const ownerFile = join(HOME, 'owner', 'state.json');
      const owner = state?.runtimeKind === 'canonical' && existsSync(ownerFile) ? load(ownerFile) : undefined;
      return { id: t.id, title: t.title, status: owner?.ready ? owner.streaming ? 'running' : 'idle' : t.status,
        parentThreadId: t.parentThreadId, profile: state?.profile ?? null, childId: state?.childId ?? null,
        runtimeKind: state?.runtimeKind ?? 'offline', feedback: feedback(t.id), commands: state?.commands?.map((c: any) => c.name) ?? [],
        children: state?.profile && !state.childId ? runs(state.profile, state.runtimeKind ?? 'offline', 50).map(r => ({ id: r.id, state: r.state, report: r.report ?? null })) : [] };
    }) };
  };
}

export function updateFeedback(threadId: string, e: any) {
  const state = feedback(threadId);
  if (e.method === 'setStatus') {
    if ((state.statuses[e.statusKey] ?? '') === (e.statusText ?? '')) return;
    if (e.statusText) state.statuses[e.statusKey] = e.statusText; else delete state.statuses[e.statusKey];
  } else if (e.method === 'notify' && e.message) {
    if (state.notifications.some((n: any) => n.id === e.id)) return;
    state.notifications = [...state.notifications, { id: e.id, text: e.message, type: e.notifyType || 'info' }].slice(-20);
  } else return;
  // Latest state only. It is deliberately not BB's append-only event history.
  const file = join(HOME, 'feedback', `${threadId}.json`);
  save(file, state);
}

import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, binding, feedback, load, runs, save } from './state.ts';

import { z } from 'zod';
const threadSchema = z.object({ id: z.string(), providerId: z.string(), title: z.string().nullable(),
  status: z.string(), parentThreadId: z.string().nullable() });
const laneSchema = z.object({ ready: z.boolean().optional(), streaming: z.boolean().optional() });
const ownerSchema = laneSchema.extend({ threadId: z.string().optional(), ownerPid: z.number().optional(),
  threads: z.record(z.string(), laneSchema).optional() });
const bindingSchema = z.object({ runtimeKind: z.string().optional(), profile: z.string().optional(), childId: z.string().optional(),
  commands: z.array(z.object({ name: z.string() })).optional() });
const feedbackSchema = z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({
  id: z.string(), text: z.string(), type: z.string() })) });
const feedbackEventSchema = z.union([
  z.object({ method: z.literal('setStatus'), statusKey: z.string(), statusText: z.string().nullish() }),
  z.object({ method: z.literal('notify'), id: z.string(), message: z.string().optional(), notifyType: z.string().optional() })
]);
/** Bounded read-side cache. Never turn UI refreshes into full DB query storms. */
export function createOverview(list: () => Promise<unknown>, get: (id: string) => Promise<unknown>) {
  let cached: z.infer<typeof threadSchema>[] = []; let nextRefresh = 0; let pending: Promise<typeof cached> | undefined;
  return async () => {
    if (Date.now() >= nextRefresh) {
      if (!pending) pending = (async () => {
        try {
          const rows = z.array(threadSchema).parse(await list()).filter(t => t.providerId === 'exo-spike');
          const file = join(HOME, 'canonical-thread.json');
          const primary = existsSync(file) ? z.object({ threadId: z.string().optional() }).parse(load(file)).threadId : undefined;
          if (primary && !rows.some(t => t.id === primary)) rows.unshift(threadSchema.parse(await get(primary)));
          cached = rows; nextRefresh = Date.now() + 60_000; return rows;
        } catch (e) { nextRefresh = Date.now() + 10_000; if (!cached.length) throw e; return cached; }
        finally { pending = undefined; }
      })();
      await pending;
    }
    return { threads: cached.map(t => {
      const state = bindingSchema.optional().parse(binding(t.id));
      const ownerFile = join(HOME, 'owner', 'state.json');
      const all = state?.runtimeKind === 'canonical' && existsSync(ownerFile) ? ownerSchema.parse(load(ownerFile)) : undefined;
      // The owner's state for this thread: the primary's lane, or a bound thread's own (state.threads[id], #67).
      const owner = all && all.threadId !== t.id ? all.threads?.[t.id] : all;
      // The model as the thread's own Pi reports it on start and on each model switch (live.ts runtime info), the one Exo runs on (#129, settings).
      const infoFile = join(HOME, 'runtime-info', `${t.id}.json`);
      const info = state?.runtimeKind === 'canonical' && existsSync(infoFile) ? z.object({ model: z.object({ provider: z.string(), id: z.string() }).nullish() }).parse(load(infoFile)) : undefined;
      return { id: t.id, title: t.title, status: owner?.ready ? owner.streaming ? 'running' : 'idle' : t.status,
        parentThreadId: t.parentThreadId, profile: state?.profile ?? null,
        ready: !!owner?.ready && alive(all?.ownerPid), model: info?.model ? `${info.model.provider}/${info.model.id}` : null, feedback: feedbackSchema.parse(feedback(t.id)), commands: state?.commands?.map(c => c.name) ?? [],
        children: state?.runtimeKind === 'canonical' && !state.childId ? z.array(z.object({ id: z.string(), state: z.string(), report: z.string().nullish() })).parse(runs(z.string().parse(state.profile), 50)).map(r => ({ id: r.id, state: r.state, report: r.report ?? null })) : [] };
    }) };
  };
}

/** Whether the owner process that wrote its state is still there: a crashed owner leaves `ready` behind. */
function alive(pid: unknown) {
  if (typeof pid !== 'number') return false;
  try { process.kill(pid, 0); return true; } catch (e) { return (e as NodeJS.ErrnoException).code === 'EPERM'; }
}

export function updateFeedback(threadId: string, event: unknown) {
  const parsed = feedbackEventSchema.safeParse(event);
  if (!parsed.success) return;
  const e = parsed.data;
  const state = feedbackSchema.parse(feedback(threadId));
  if (e.method === 'setStatus') {
    if ((state.statuses[e.statusKey] ?? '') === (e.statusText ?? '')) return;
    if (e.statusText) state.statuses[e.statusKey] = e.statusText; else delete state.statuses[e.statusKey];
  } else if (e.message) {
    if (state.notifications.some(n => n.id === e.id)) return;
    state.notifications = [...state.notifications, { id: e.id, text: e.message, type: e.notifyType?.length ? e.notifyType : 'info' }].slice(-20);
  } else return;
  // Latest state only. It is deliberately not BB's append-only event history.
  const file = join(HOME, 'feedback', `${threadId}.json`);
  save(file, state);
}

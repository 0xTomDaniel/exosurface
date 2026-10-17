import { defineRpcContract, type BbPluginApi, type JsonValue } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { binding, runs, MODEL, LIVE_MODEL, CANONICAL_MODEL, feedback, save, bindingFile } from './src/state.ts';
export const rpcContract = defineRpcContract({
  overview: { input: z.null(), output: z.object({ threads: z.array(z.object({ id: z.string(), title: z.string().nullable(), status: z.string(), parentThreadId: z.string().nullable(), profile: z.string().nullable(), childId: z.string().nullable(), runtimeKind: z.enum(['offline', 'live', 'canonical']), commands: z.array(z.string()), feedback: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }), children: z.array(z.object({ id: z.string(), state: z.string(), report: z.string().nullable() })) })) }) },
  attach_child: { input: z.object({ threadId: z.string(), childId: z.string() }), output: z.object({ threadId: z.string() }) },
});
import { createOverview } from './src/overview.ts';
export default function plugin(bb: BbPluginApi) {
  const overview = createOverview(() => bb.sdk.threads.list({ limit: 50 }), id => bb.sdk.threads.get({ threadId: id }));
  bb.providers.register({
    id: 'exo-spike', displayName: 'Exo Pi / OptChat', icon: 'Bot', family: 'exo',
    strings: { signInHint: 'Fixture or isolated live trial using existing Pi authentication.', expiredHint: 'Check the existing Pi authentication route; do not paste credentials here.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Exo ' },
    maintenance: { health: false, usage: false, installation: false },
    capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['low', 'high'] },
    composerActions: [], models: { fallback: [MODEL, LIVE_MODEL, CANONICAL_MODEL], scope: 'host' }, env: { passthrough: [] },
    completedTurnDisplay: 'flat',
    deriveProviderOptions(ctx): Readonly<Record<string, JsonValue>> { const state = binding(ctx.threadId); const runtimeKind = ctx.model === CANONICAL_MODEL.id ? 'canonical' : ctx.model === LIVE_MODEL.id ? 'live' : 'offline'; return { runtimeKind, ...(state?.childId ? { attachment: { profile: state.profile, childId: state.childId } } : {}) }; },
    extensionKinds: { 'pi-ui': { state: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }) } },
  });
  // Admission runs before provider construction; initial input need not be included
  // in thread/start. Bind the existing child BEFORE any owner process can launch.
  bb.experimental_hooks.on('message.dispatch', async ctx => {
    if (ctx.thread.providerId !== 'exo-spike') return { action: 'proceed' };
    const attach = /^\/attach ([a-z0-9_-]+) ([a-zA-Z0-9-]+)$/.exec(ctx.input.text.trim());
    if (!attach) return { action: 'proceed' };
    if (!ctx.thread.parentThreadId) return { action: 'reject', message: 'Child attachment requires its native main owner.' };
    const parent = binding(ctx.thread.parentThreadId);
    if (parent?.runtimeKind && parent.runtimeKind !== 'offline') return { action: 'reject', message: 'Linked child projections are disabled for the live trial; native reports go only through OptChat.' };
    if (parent?.profile !== attach[1] || parent.childId || !runs(attach[1]).some(r => r.id === attach[2])) return { action: 'reject', message: 'This is not a native child of that main owner.' };
    const current = binding(ctx.thread.id);
    if (current && (current.profile !== attach[1] || current.childId !== attach[2])) return { action: 'reject', message: 'Cannot rebind an existing provider session.' };
    save(bindingFile(ctx.thread.id), { providerThreadId: `exo:${attach[1]}:${attach[2]}`, profile: attach[1], childId: attach[2], cursor: current?.cursor ?? 0 });
    return { action: 'proceed' };
  });
  const attaching = new Map<string, Promise<{ threadId: string }>>();
  bb.rpc.register(rpcContract, {
    overview,
    attach_child: async ({ threadId, childId }) => {
      const key = `${threadId}:${childId}`;
      const pending = attaching.get(key); if (pending) return pending;
      const work = (async () => {
        const parent = await bb.sdk.threads.get({ threadId });
        if (parent.providerId !== 'exo-spike' || !parent.environmentId) throw new Error('Attach requires a spike owner with an existing environment');
        const state = binding(threadId);
        if (state?.runtimeKind && state.runtimeKind !== 'offline') throw new Error('Linked child projections are disabled for the live trial');
        if (!state?.profile || state.childId || !runs(state.profile).some(r => r.id === childId)) throw new Error('Not a native child of this spike owner');
        const old = (await bb.sdk.threads.list()).find(t => t.parentThreadId === threadId && binding(t.id)?.childId === childId);
        if (old) return { threadId: old.id };
        const child = await bb.sdk.threads.spawn({ projectId: parent.projectId, environment: { type: 'reuse', environmentId: parent.environmentId }, providerId: 'exo-spike', model: 'offline-fixture', reasoningLevel: 'low', permissionMode: 'full', parentThreadId: threadId, title: `Exo child ${childId} (projection)`, prompt: `/attach ${state.profile} ${childId}` });
        return { threadId: child.id };
      })();
      attaching.set(key, work); try { return await work; } finally { attaching.delete(key); }
    },
  });
}

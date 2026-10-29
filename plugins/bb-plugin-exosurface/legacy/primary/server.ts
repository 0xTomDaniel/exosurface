import { defineRpcContract, type BbPluginApi, type JsonValue } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { binding, runs, MODEL, LIVE_MODEL, CANONICAL_MODEL, SOL_MODEL, isExoModel, feedback, save, bindingFile, HOME, CANONICAL_HOME, CANONICAL_PROFILE, SOURCE } from './src/state.ts';
import { local, LOCAL_CONFIG } from './src/local-config.ts';
import { canonicalSetup, setupStatus, recoverSetupLock, type CanonicalSetupPorts } from './src/canonical-setup.ts';
import { canonicalBBNativeAdapter, canonicalSystemPorts } from './src/canonical-system.ts';
import { consumeCanonicalInitialization } from './src/canonical-control.ts';
import { loadIf } from '../../src/store.ts';
import { join } from 'node:path';
const setupInput = z.object({ operationId: z.string().min(8).max(80), projectId: z.string().min(1), vault: z.string().min(1), piCli: z.string().min(1), optchat: z.string().min(1), authorizeInitialization: z.literal(true), recoverDeadLock: z.boolean().default(false) }).strict();
export const rpcContract = defineRpcContract({
  canonical_setup_status: { input: z.null(), output: z.object({ stage: z.string(), operationId: z.string().nullable(), projectId: z.string().nullable(), threadId: z.string().nullable(), nativeDispatchAllowed: z.boolean(), releaseReady: z.literal(false), defaults: z.object({ vault: z.string(), piCli: z.string(), optchat: z.string() }) }) },
  canonical_setup_projects: { input: z.null(), output: z.array(z.object({ id: z.string(), name: z.string() })) },
  canonical_setup: { input: setupInput, output: z.object({ threadId: z.string(), profile: z.string(), stage: z.string(), ownerReady: z.literal(false), releaseReady: z.literal(false) }) },
  overview: { input: z.null(), output: z.object({ threads: z.array(z.object({ id: z.string(), title: z.string().nullable(), status: z.string(), parentThreadId: z.string().nullable(), profile: z.string().nullable(), childId: z.string().nullable(), runtimeKind: z.enum(['offline', 'live', 'canonical']), commands: z.array(z.string()), feedback: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }), children: z.array(z.object({ id: z.string(), state: z.string(), report: z.string().nullable() })) })) }) },
  attach_child: { input: z.object({ threadId: z.string(), childId: z.string() }), output: z.object({ threadId: z.string() }) },
});
import { createOverview } from './src/overview.ts';
export default function plugin(bb: BbPluginApi, registerRpc = bb.rpc.register.bind(bb.rpc), setupPorts?: CanonicalSetupPorts) {
  const native = canonicalBBNativeAdapter(bb.sdk.threads, false); // Separately gated: this code never dispatches real BB setup today.
  const setup = setupPorts ?? canonicalSystemPorts({ localConfig: LOCAL_CONFIG, runtimeRoot: SOURCE, node: process.execPath, native });
  const overview = createOverview(() => bb.sdk.threads.list({ limit: 50 }), id => bb.sdk.threads.get({ threadId: id }));
  bb.providers.register({
    id: 'exo-spike', displayName: 'Exo Pi / OptChat', icon: 'Bot', family: 'exo',
    strings: { signInHint: 'Fixture or isolated live trial using existing Pi authentication.', expiredHint: 'Check the existing Pi authentication route; do not paste credentials here.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Exo ' },
    maintenance: { health: false, usage: false, installation: false },
    capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['low', 'high'] },
    composerActions: [], models: { fallback: [MODEL, LIVE_MODEL, CANONICAL_MODEL, SOL_MODEL], scope: 'host' }, env: { passthrough: [] },
    completedTurnDisplay: 'flat',
    deriveProviderOptions(ctx): Readonly<Record<string, JsonValue>> { const state = binding(ctx.threadId); const runtimeKind = isExoModel(ctx.model) ? 'canonical' : ctx.model === LIVE_MODEL.id ? 'live' : 'offline'; const candidate = loadIf(join(HOME, 'canonical-native-candidate.json')), journal = setupStatus(HOME); const setupOperation = journal && ['spawning', 'thread-ready'].includes(journal.stage) && candidate?.threadId === ctx.threadId && candidate?.projectId === ctx.projectId && candidate?.operationId === journal.request.operationId ? candidate.operationId : undefined; return { runtimeKind, ...(setupOperation ? { canonicalSetupOperation: setupOperation } : {}), ...(state?.childId ? { attachment: { profile: state.profile, childId: state.childId } } : {}) }; },
    extensionKinds: { 'pi-ui': { state: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }) } },
  });
  // Admission runs before provider construction; initial input need not be included
  // in thread/start. Bind the existing child BEFORE any owner process can launch.
  bb.experimental_hooks.on('message.dispatch', async ctx => {
    if (ctx.thread.providerId !== 'exo-spike') return { action: 'proceed' };
    if (ctx.input.text.trimStart().startsWith('/exosurface-initialize')) { consumeCanonicalInitialization(HOME, ctx.thread.id, [{ type: 'text', text: ctx.input.text }]); return { action: 'proceed' }; }
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
  registerRpc(rpcContract, {
    canonical_setup_status: async () => { const journal = setupStatus(HOME); return { stage: journal?.stage ?? 'unconfigured', operationId: journal?.request.operationId ?? null, projectId: journal?.request.projectId ?? null, threadId: journal?.threadId ?? null, nativeDispatchAllowed: setup.nativeDispatchAllowed, releaseReady: false as const, defaults: { vault: journal?.request.vault ?? local('vault'), piCli: journal?.request.piCli ?? local('piCli'), optchat: journal?.request.optchat ?? local('optchat') } }; },
    canonical_setup_projects: async () => (await bb.sdk.projects.list({ includePersonal: true })).map(project => ({ id: project.id, name: project.name })),
    canonical_setup: async input => { const { recoverDeadLock, ...values } = input; const request = { ...values, home: HOME, optchatHome: CANONICAL_HOME, profile: CANONICAL_PROFILE }; if (!setup.nativeDispatchAllowed) throw Error('Canonical native dispatch is separately gated; no setup changes made'); if (recoverDeadLock) recoverSetupLock(request); return canonicalSetup(request, setup); },
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

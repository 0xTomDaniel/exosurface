import { defineRpcContract, type BbPluginApi, type JsonValue } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { binding, CANONICAL_MODEL, SOL_MODEL, HOME, CANONICAL_HOME, CANONICAL_PROFILE, SOURCE, load, isBoundThread, mainModel, NEW_THREAD_PROMPT, PI_CLI } from './src/state.ts';
import { local, LOCAL_CONFIG, requireLocal } from './src/local-config.ts';
import { NEW_SURFACE, NAME_RECORD, namerChoice, personsFirst, personsFirstInLog, EVENT_PAGE, replyTo, namePrompt, callNamer, personName, type NameRecord } from './src/surface-name.ts';
import type { ModelChoice } from '../../src/config.ts';
import { canonicalSetup, setupStatus, recoverSetupLock, type CanonicalSetupPorts } from './src/canonical-setup.ts';
import { canonicalBBNativeAdapter, canonicalSystemPorts, vaultHost } from './src/canonical-system.ts';
import { consumeCanonicalInitialization } from './src/canonical-control.ts';
import { loadIf } from '../../src/store.ts';
import { bindThread } from './src/thread-profiles.ts';
import { join } from 'node:path';
import { latestTurn, ownerWorking, sessionOf } from './src/exo-turn.ts';
import { validatePrompt } from '../../src/input.ts';
import { existsSync } from 'node:fs';
const setupInput = z.object({ operationId: z.string().min(8).max(80), projectId: z.string().min(1), vault: z.string().min(1), piCli: z.string().min(1), optchat: z.string().min(1), authorizeInitialization: z.literal(true), recoverDeadLock: z.boolean().default(false) }).strict();
export const rpcContract = defineRpcContract({
  canonical_setup_status: { input: z.null(), output: z.object({ stage: z.string(), operationId: z.string().nullable(), projectId: z.string().nullable(), threadId: z.string().nullable(), nativeDispatchAllowed: z.boolean(), initializationAvailable: z.boolean(), releaseReady: z.literal(false), defaults: z.object({ vault: z.string(), piCli: z.string(), optchat: z.string() }) }) },
  canonical_setup_projects: { input: z.null(), output: z.array(z.object({ id: z.string(), name: z.string() })) },
  canonical_setup: { input: setupInput, output: z.object({ threadId: z.string(), profile: z.string(), stage: z.string(), ownerReady: z.literal(false), releaseReady: z.literal(false) }) },
  overview: { input: z.null(), output: z.object({ threads: z.array(z.object({ id: z.string(), title: z.string().nullable(), status: z.string(), parentThreadId: z.string().nullable(), profile: z.string().nullable(), commands: z.array(z.string()), feedback: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }), children: z.array(z.object({ id: z.string(), state: z.string(), report: z.string().nullable() })) })) }) },
  thread_bind: { input: z.object({ threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/) }).strict(), output: z.object({ threadId: z.string(), profile: z.string() }) },
  // The surface view's Exo block and input (#69, #79): the person's latest message (said) and Exo's words from that turn,
  // and a send from the input.
  exo_block: { input: z.object({ threadId: z.string() }).strict(), output: z.object({ working: z.boolean(), said: z.string(), words: z.string() }) },
  exo_send: { input: z.object({ threadId: z.string(), text: z.string() }).strict(), output: z.object({ sent: z.literal(true) }) },
  // The sidebar's surfaces (spec N1, #68: Home and a flat list only): Home (the primary thread) first, then every other.
  thread_list: { input: z.null(), output: z.object({ threads: z.array(z.object({ threadId: z.string(), title: z.string(), home: z.boolean() })) }) },
  // New surface (spec S7): a new top-level Exo thread, bound to its own profile before its provider starts.
  thread_new: { input: z.null(), output: z.object({ threadId: z.string() }) },
  // The person's rename of a surface from the sidebar (#83, spec N5, N7): any surface but Home, any time.
  thread_rename: { input: z.object({ threadId: z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/), name: z.string().max(1000) }).strict(), output: z.object({ threadId: z.string(), title: z.string() }) },
});
import { createOverview } from './src/overview.ts';
export default function plugin(bb: BbPluginApi, registerRpc = bb.rpc.register.bind(bb.rpc), setupPorts?: CanonicalSetupPorts) {
  const native = canonicalBBNativeAdapter(bb.sdk.threads, false); // Default deny; only the explicit initialization RPC below authorizes native creation.
  const setup = setupPorts ?? canonicalSystemPorts({ localConfig: LOCAL_CONFIG, runtimeRoot: SOURCE, node: process.execPath, native, ownerLabel: local('ownerLabel') || undefined });
  const overview = createOverview(() => bb.sdk.threads.list({ limit: 50 }), id => bb.sdk.threads.get({ threadId: id }));
  bb.providers.register({
    id: 'exo-spike', displayName: 'Exo Pi / OptChat', icon: 'Bot', family: 'exo',
    strings: { signInHint: 'Uses the existing Pi authentication.', expiredHint: 'Check the existing Pi authentication route; do not paste credentials here.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Exo ' },
    maintenance: { health: false, usage: false, installation: false },
    capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['low', 'high'] },
    composerActions: [], models: { fallback: [CANONICAL_MODEL, SOL_MODEL], scope: 'host' }, env: { passthrough: [] },
    completedTurnDisplay: 'flat',
    deriveProviderOptions(ctx): Readonly<Record<string, JsonValue>> { const candidate = loadIf(join(HOME, 'canonical-native-candidate.json')), journal = setupStatus(HOME); const setupOperation = journal && ['spawning', 'thread-ready'].includes(journal.stage) && candidate?.threadId === ctx.threadId && candidate?.projectId === ctx.projectId && candidate?.operationId === journal.request.operationId ? candidate.operationId : undefined; return { ...(setupOperation ? { canonicalSetupOperation: setupOperation } : {}) }; },
    extensionKinds: { 'pi-ui': { state: z.object({ statuses: z.record(z.string(), z.string()), notifications: z.array(z.object({ id: z.string(), text: z.string(), type: z.string() })) }) } },
  });
  // Admission runs before provider construction; initial input need not be included in thread/start.
  bb.experimental_hooks.on('message.dispatch', async ctx => {
    if (ctx.thread.providerId !== 'exo-spike') return { action: 'proceed' };
    if (ctx.input.text.trimStart().startsWith('/exosurface-initialize')) { consumeCanonicalInitialization(HOME, ctx.thread.id, [{ type: 'text', text: ctx.input.text }]); return { action: 'proceed' }; }
    if (ctx.input.text.trim() === NEW_THREAD_PROMPT) {
      if (ctx.thread.parentThreadId) return { action: 'reject', message: 'A new surface is a top-level thread.' };
      try { bindThread(ctx.thread.id); } catch (e) { return { action: 'reject', message: e instanceof Error ? e.message : String(e) }; }
      return { action: 'proceed' };
    }
    // The person's message on a surface (BB's author "user"; in a grouped dispatch, the person's rows): the first one starts
    // the naming beside Exo's turn, never holding the send. An agent's or the system's message starts nothing.
    const person = ctx.initiator === 'user' ? ctx.input.text : ctx.initiator === 'mixed' ? personsFirst((ctx.queuedMessages ?? []).filter(m => m.initiator === 'user').map(m => ({ type: 'client/turn/requested', data: { initiator: 'user', input: m.content } })), NEW_THREAD_PROMPT) : undefined;
    if (person !== undefined) void nameSurface(ctx.thread.id, person);
    return { action: 'proceed' };
  });
  // Surface auto-name (#82; the rule: src/surface-name.ts). Acts only on a bound surface still titled "New surface" with no
  // name record; the name is the BB thread title the sidebar lists, the record on its plugin metadata. Home is never bound.
  const naming = new Set<string>();
  // A surface's name writes (Exo's after its naming call, the person's rename) run one at a time per thread, each reading
  // the record first: a rename that lands while a naming call is in flight wins, and Exo never writes over it.
  const writes = new Map<string, Promise<unknown>>();
  const nameWrite = <T>(threadId: string, write: () => Promise<T>): Promise<T> => {
    const next = (writes.get(threadId) ?? Promise.resolve()).catch(() => {}).then(write);
    writes.set(threadId, next);
    return next.finally(() => { if (writes.get(threadId) === next) writes.delete(threadId); });
  };
  /** The surface's name if it is no longer Exo's to give: a title other than "New surface", or any name record. */
  const named = async (threadId: string) => {
    const title = (await bb.sdk.threads.get({ threadId })).title || NEW_SURFACE;
    if (title !== NEW_SURFACE) return title;
    const held = (await bb.sdk.threads.getPluginMetadata({ threadId }))?.[NAME_RECORD] as NameRecord | undefined;
    return held ? ('name' in held ? held.name : title) : undefined;
  };
  /** `sent`: the person's message being dispatched, their first when BB's event log holds none of theirs yet. */
  const nameSurface = async (threadId: string, sent?: string) => {
    if (naming.has(threadId) || !isBoundThread(threadId)) return;
    naming.add(threadId);
    try {
      if (((await bb.sdk.threads.get({ threadId })).title || NEW_SURFACE) !== NEW_SURFACE) return;
      if ((await bb.sdk.threads.getPluginMetadata({ threadId }))?.[NAME_RECORD]) return;
      const first = await personsFirstInLog(afterSeq => bb.sdk.threads.events.list({ threadId, types: ['client/turn/requested'], order: 'asc', limit: String(EVENT_PAGE), ...(afterSeq ? { afterSeq } : {}) }), NEW_THREAD_PROMPT);
      const message = first ?? (sent?.trim() ? sent : undefined);
      if (message === undefined) return; // no message from the person yet (only New surface's start, an agent's or the system's)
      const turn = { message, reply: await replyTo(sessionOf(threadId), message) };
      const record = (value: NameRecord) => bb.sdk.threads.updatePluginMetadata({ threadId, set: { [NAME_RECORD]: value } });
      let choice: ModelChoice | undefined;
      try {
        choice = namerChoice(LOCAL_CONFIG).choice;
        const { name, usage } = await callNamer(choice, namePrompt(turn.message, turn.reply), { piCli: requireLocal(PI_CLI, 'piCli'), agentDir: requireLocal(local('primaryAgentDir'), 'primaryAgentDir'), cwd: HOME });
        const used = choice;
        const person = await nameWrite(threadId, async () => {
          const person = await named(threadId);
          if (person !== undefined) return person;
          await bb.sdk.threads.update({ threadId, title: name });
          await record({ by: 'exo', state: 'named', name, model: `${used.provider}/${used.model}`, thinking: used.thinking, at: new Date().toISOString(), ...(usage ? { usage } : {}) });
        });
        if (person !== undefined) { bb.log.info(`Surface ${threadId} keeps the person's name "${person}": Exo's "${name}" is dropped`); return; }
        bb.log.info(`Surface ${threadId} named "${name}" by ${choice.provider}/${choice.model} thinking ${choice.thinking}${usage ? ` (${usage.input} in, ${usage.output} out tokens)` : ''}`);
        bb.realtime.publish('surface-names', { threadId, title: name });
      } catch (e) {
        const reason = (e instanceof Error ? e.message : String(e)).replace(/\s+/g, ' ').slice(0, 400);
        bb.log.warn(`Surface ${threadId} keeps "${NEW_SURFACE}": naming failed${choice ? ` on ${choice.provider}/${choice.model} thinking ${choice.thinking}` : ''}: ${reason}`);
        await nameWrite(threadId, async () => { if ((await named(threadId)) === undefined) await record({ by: 'exo', state: 'failed', reason, ...(choice ? { model: `${choice.provider}/${choice.model}`, thinking: choice.thinking } : {}), at: new Date().toISOString() }); });
      }
    } catch (e) { bb.log.error(`Surface ${threadId} naming check failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { naming.delete(threadId); }
  };
  // Fallback only: BB runs message.dispatch on every send but a person's Send-now on a queued row (that bypasses the hook
  // by design), so a first message sent that way is named once its turn ends, from the person's first message in BB's log.
  bb.events.on('thread.idle', ({ thread }) => { void nameSurface(thread.id); });
  const awaiting = new Map<string, { entry: string | null; text: string }>(); // thread -> its latest person's entry when the input sent, and what it sent
  registerRpc(rpcContract, {
    canonical_setup_status: async () => { const journal = setupStatus(HOME); return { stage: journal?.stage ?? 'unconfigured', operationId: journal?.request.operationId ?? null, projectId: journal?.request.projectId ?? null, threadId: journal?.threadId ?? null, nativeDispatchAllowed: setup.nativeDispatchAllowed, initializationAvailable: setupPorts?.nativeDispatchAllowed ?? true, releaseReady: false as const, defaults: { vault: journal?.request.vault ?? local('vault'), piCli: journal?.request.piCli ?? local('piCli'), optchat: journal?.request.optchat ?? local('optchat') } }; },
    canonical_setup_projects: async () => (await bb.sdk.projects.list({ includePersonal: true })).map(project => ({ id: project.id, name: project.name })),
    canonical_setup: async input => {
      // Validate here as well as at BB's public RPC boundary. No environment flag,
      // ordinary prompt or resume path can authorize first-run native creation.
      const { recoverDeadLock, ...values } = setupInput.parse(input);
      const request = { ...values, home: HOME, optchatHome: CANONICAL_HOME, profile: CANONICAL_PROFILE };
      const authorizedSetup = setupPorts ?? canonicalSystemPorts({ localConfig: LOCAL_CONFIG, runtimeRoot: SOURCE, node: process.execPath, native: canonicalBBNativeAdapter(bb.sdk.threads, true, bb.sdk.projects), ownerLabel: local('ownerLabel') || undefined });
      if (!authorizedSetup.nativeDispatchAllowed) throw Error('Canonical native dispatch is separately gated; no setup changes made');
      // Preflight before any setup change: the thread must run on the project's own source at the vault path.
      if (!setupPorts) await vaultHost(bb.sdk.projects, request as never);
      if (recoverDeadLock) recoverSetupLock(request);
      return canonicalSetup(request, authorizedSetup);
    },
    overview,
    // Binds another Exo thread to its own canonical profile (thread-profiles.ts); its turns run beside the primary's.
    thread_bind: async ({ threadId }) => {
      if ((await bb.sdk.threads.get({ threadId })).providerId !== 'exo-spike') throw new Error('Only an Exo thread can be bound');
      return bindThread(threadId);
    },
    // Exo is working from a send until the thread's journal holds a newer message from the person and the owner's turn
    // has ended; while it works, the block shows that and none of the previous turn's words.
    exo_block: async ({ threadId }) => {
      const turn = latestTurn(sessionOf(threadId)), sent = awaiting.get(threadId);
      if (sent !== undefined && sent.entry !== turn.userEntry) awaiting.delete(threadId);
      const working = awaiting.has(threadId) || ownerWorking(threadId);
      // Until the journal holds the message just sent, the person's latest message is the one the input sent.
      return { working, said: awaiting.get(threadId)?.text ?? turn.said, words: working ? '' : turn.words };
    },
    exo_send: async ({ threadId, text }) => {
      validatePrompt(text);
      if ((await bb.sdk.threads.get({ threadId })).providerId !== 'exo-spike' || binding(threadId)?.runtimeKind !== 'canonical') throw new Error('Only an Exo surface thread takes a send from its input');
      awaiting.set(threadId, { entry: latestTurn(sessionOf(threadId)).userEntry, text });
      try { await bb.sdk.threads.send({ threadId, input: [{ type: 'text', text, mentions: [] }], mode: 'auto' }); }
      catch (e) { awaiting.delete(threadId); throw e; }
      return { sent: true as const };
    },
    thread_list: async () => {
      const pointer = join(HOME, 'canonical-thread.json');
      if (!existsSync(pointer)) return { threads: [] };
      const home = load(pointer).threadId as string;
      const others = (await bb.sdk.threads.list({ hasParent: false, limit: 200 })).filter(t => t.providerId === 'exo-spike' && t.id !== home && !t.parentThreadId && isBoundThread(t.id)).sort((a, b) => a.createdAt - b.createdAt);
      return { threads: [{ threadId: home, title: 'Home', home: true }, ...others.map(t => ({ threadId: t.id, title: t.title || 'New surface', home: false }))] };
    },
    thread_new: async () => {
      const pointer = join(HOME, 'canonical-thread.json');
      if (!existsSync(pointer)) throw new Error('Initialize the primary Exo thread before starting a new surface');
      const home = await bb.sdk.threads.get({ threadId: load(pointer).threadId });
      if (home.providerId !== 'exo-spike' || !home.environmentId) throw new Error('New surface requires the primary Exo thread with its environment');
      // Same Exo (S10): the primary's provider, current model, project and environment (the vault). Its admission binds it.
      const thread = await bb.sdk.threads.spawn({ projectId: home.projectId, environment: { type: 'reuse', environmentId: home.environmentId }, providerId: 'exo-spike', model: mainModel(), reasoningLevel: 'high', permissionMode: 'full', title: 'New surface', prompt: NEW_THREAD_PROMPT });
      bindThread(thread.id);
      return { threadId: thread.id };
    },
    // The person's name: the BB thread title every view shows, and the record (by person) that keeps Exo from naming it.
    thread_rename: async ({ threadId, name }) => {
      const title = personName(name);
      const pointer = join(HOME, 'canonical-thread.json');
      if (existsSync(pointer) && load(pointer).threadId === threadId) throw new Error('Home keeps its name');
      const thread = await bb.sdk.threads.get({ threadId }).catch(() => undefined);
      if (!thread || thread.providerId !== 'exo-spike' || thread.parentThreadId || !isBoundThread(threadId)) throw new Error('Only an Exo surface can be renamed');
      await nameWrite(threadId, async () => {
        await bb.sdk.threads.updatePluginMetadata({ threadId, set: { [NAME_RECORD]: { by: 'person', state: 'named', name: title, at: new Date().toISOString() } satisfies NameRecord } });
        await bb.sdk.threads.update({ threadId, title });
      });
      bb.log.info(`Surface ${threadId} renamed "${title}" by the person`);
      bb.realtime.publish('surface-names', { threadId, title });
      return { threadId, title };
    },
  });
}

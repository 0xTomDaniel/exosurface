import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { join } from 'node:path';
import { readConfig, layout } from './config.ts';
import { loadIf } from './store.ts';
import { bootstrap, primaryThreadId } from './bootstrap.ts';
import { profileOperation } from './system.ts';
import { MODEL } from './model.ts';
import { initializationText } from './setup-input.ts';
import { ownerConnection } from './owner-client.ts';
import { ensureOwner } from './system.ts';
import { readPages } from './pages.ts';
import { bbFirstRun } from './bb-first-run.ts';
const pageId = z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const pageBase = { threadId: pageId, baseRevision: z.number().int().nonnegative(), mutationId: pageId, surfaceId: pageId, ref: pageId };
const pageValue = z.union([z.string().max(512 * 1024), z.number(), z.boolean(), z.array(z.string().max(160)).max(24)]);
const pageResult = z.object({ revision: z.number().int().positive(), duplicate: z.boolean() });
const responsePage = z.object({ title: z.string(), body: z.string() });
export const rpcContract = defineRpcContract({
  overview: { input: z.null(), output: z.object({ threadId: z.string().nullable(), page: responsePage.nullable(), problems: z.array(z.string()) }) },
  pageRead: { input: z.null(), output: z.object({ revision: z.number().int().nonnegative(), snapshot: z.unknown().nullable() }) },
  pageEdit: { input: z.object({ ...pageBase, value: pageValue }).strict(), output: pageResult },
  pagePress: { input: z.object({ ...pageBase, values: z.record(pageId, pageValue).refine(v => Object.keys(v).length <= 24, 'At most 24 submitted inputs') }).strict(), output: pageResult },
  setup: { input: z.object({ projectId: z.string() }), output: z.object({ threadId: z.string(), profile: z.string() }) },
});
export default function plugin(bb: BbPluginApi) {
  bb.providers.register({ id: 'exosurface', displayName: 'Exo', icon: 'Bot', family: 'exo',
    strings: { signInHint: 'Authenticate with Pi in your configured agentDir first.', expiredHint: 'Renew your own Pi login.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Exo ' },
    maintenance: { health: false, usage: false, installation: false }, capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['medium'] },
    composerActions: [], models: { fallback: [MODEL], scope: 'host' }, env: { passthrough: [] }, completedTurnDisplay: 'flat' });
  const pageRequest = async (threadId: string, method: 'page.edit' | 'page.press', input: object) => {
    const { config, problems } = readConfig();
    if (!config || problems.length) throw new Error('Complete installer configuration first');
    await ensureOwner(config);
    const client = ownerConnection(config, () => undefined);
    try { return await client.send(threadId, method, input); } finally { client.close(); }
  };
  bb.rpc.register(rpcContract, {
    pageRead: async () => {
      const { config, problems } = readConfig();
      if (!config || problems.length) throw new Error('Complete installer configuration first');
      const d = readPages(config.stateDir); return { revision: d?.revision ?? 0, snapshot: d?.snapshot ?? null };
    },
    pageEdit: async ({ threadId, ...input }) => pageRequest(threadId, 'page.edit', input),
    pagePress: async ({ threadId, ...input }) => pageRequest(threadId, 'page.press', input),
    overview: async () => {
      const { config, problems } = readConfig();
      if (!config || problems.length) return { threadId: null, page: null, problems: problems.map(p => `${p.code}: ${p.message}`) };
      const l = layout(config.stateDir);
      return { threadId: primaryThreadId(l) ?? null, page: responsePage.safeParse(loadIf(join(l.stateDir, 'response-page.json'))).data ?? null, problems: [] };
    },
    setup: async ({ projectId }) => {
      const { config, problems } = readConfig();
      if (!config || problems.length) throw new Error('Complete installer configuration first');
      return bootstrap(config, {
        createProfile: () => { profileOperation(config, 'create'); return Promise.resolve(); },
        configureProfile: () => { profileOperation(config, 'configure'); return Promise.resolve(); },
        validateProfile: () => { profileOperation(config, 'validate'); return Promise.resolve(); },
        ...bbFirstRun(config.stateDir, projectId, {
          get: id => bb.sdk.threads.get({ threadId: id }),
          create: key => bb.sdk.threads.spawn({ projectId, environment: { type: 'project-default' }, providerId: 'exosurface', model: 'exo', reasoningLevel: 'medium', permissionMode: 'full', title: 'Exo', prompt: initializationText(key) }),
        }),
      });
    },
  });
}

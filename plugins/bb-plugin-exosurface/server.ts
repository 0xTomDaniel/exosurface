import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { join } from 'node:path';
import { readConfig, layout } from './src/config.ts';
import { loadIf } from './src/store.ts';
import { bootstrap } from './src/bootstrap.ts';
import { profileOperation } from './src/system.ts';
import { MODEL } from './src/model.ts';
import { initializationText } from './src/setup-input.ts';
import { bbFirstRun } from './src/bb-first-run.ts';
export const rpcContract = defineRpcContract({
  overview: { input: z.null(), output: z.object({ threadId: z.string().nullable(), page: z.object({ title: z.string(), body: z.string() }).nullable(), problems: z.array(z.string()) }) },
  setup: { input: z.object({ projectId: z.string() }), output: z.object({ threadId: z.string(), profile: z.string() }) },
});
export default function plugin(bb: BbPluginApi) {
  bb.providers.register({ id: 'exosurface', displayName: 'Exo', icon: 'Bot', family: 'exo',
    strings: { signInHint: 'Authenticate with Pi in your configured agentDir first.', expiredHint: 'Renew your own Pi login.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Exo ' },
    maintenance: { health: false, usage: false, installation: false }, capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['medium'] },
    composerActions: [], models: { fallback: [MODEL], scope: 'host' }, env: { passthrough: [] }, completedTurnDisplay: 'flat' });
  bb.rpc.register(rpcContract, {
    overview: async () => {
      const { config, problems } = readConfig();
      if (!config || problems.length) return { threadId: null, page: null, problems: problems.map(p => `${p.code}: ${p.message}`) };
      const l = layout(config.stateDir);
      return { threadId: loadIf(l.primary)?.threadId ?? null, page: loadIf(join(l.stateDir, 'response-page.json')) ?? null, problems: [] };
    },
    setup: async ({ projectId }) => {
      const { config, problems } = readConfig();
      if (!config || problems.length) throw new Error('Complete installer configuration first');
      return bootstrap(config, {
        createProfile: async () => { profileOperation(config, 'create'); },
        configureProfile: async () => { profileOperation(config, 'configure'); },
        validateProfile: async () => { profileOperation(config, 'validate'); },
        ...bbFirstRun(config.stateDir, projectId, {
          get: id => bb.sdk.threads.get({ threadId: id }),
          create: key => bb.sdk.threads.spawn({ projectId, environment: { type: 'project-default' }, providerId: 'exosurface', model: 'exo', reasoningLevel: 'medium', permissionMode: 'full', title: 'Exo', prompt: initializationText(key) }),
        }),
      });
    },
  });
}

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { BbPluginApi } from '@get-bb/plugin-sdk';
import { CANONICAL_MODEL, primaryModelDefinition } from './state.ts';
import { childEnv } from '../../../src/env.ts';
import { save, loadIf, createExclusive } from '../../../src/store.ts';
import { PiRpc } from './pi-rpc.ts';
import { INITIALIZATION, canonicalRuntimeDirectories } from './canonical-fresh.ts';
import { initializationControl } from './canonical-control.ts';
import type { CanonicalSetupPorts, SetupRequest } from './canonical-setup.ts';
export interface NativeSetupApi {
  create(request: SetupRequest, prompt: string): Promise<{ id: string }>;
  get(id: string): Promise<{ id: string; providerId: string; projectId: string }>;
}
/** Gate cannot be enabled by an RPC field, environment variable or UI checkbox.
 * Production wiring passes false. Tests explicitly inject a mock API and true. */
export function canonicalNativeAdapter(api: NativeSetupApi, dispatchAllowed = false) {
  return {
    nativeDispatchAllowed: dispatchAllowed,
    async spawnThread(request: SetupRequest) {
      if (!dispatchAllowed) throw Error('Real canonical native dispatch not approved');
      return api.create(request, initializationControl(request.operationId));
    },
    async verifyThread(request: SetupRequest, id: string) {
      const thread = await api.get(id);
      if (thread.id !== id || thread.providerId !== 'exo-spike' || thread.projectId !== request.projectId) throw Error('Native canonical thread identity changed; refusing adoption');
    },
  };
}
export function canonicalBBNativeAdapter(threads: Pick<BbPluginApi['sdk']['threads'], 'spawn' | 'get'>, dispatchAllowed = false) {
  return canonicalNativeAdapter({ create: (request, prompt) => threads.spawn({ projectId: request.projectId, environment: { type: 'host', workspace: { type: 'unmanaged', path: request.vault } }, providerId: 'exo-spike', model: CANONICAL_MODEL.id, reasoningLevel: 'high', permissionMode: 'full', title: 'Exo initialization', prompt }), get: id => threads.get({ threadId: id }) }, dispatchAllowed);
}
export function canonicalSystemPorts(options: {
  localConfig: string; runtimeRoot: string; node: string;
  native: ReturnType<typeof canonicalNativeAdapter>;
  instrumentEnvironment?: (env: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
}): CanonicalSetupPorts {
  const environment = (r: SetupRequest) => {
    canonicalRuntimeDirectories(r.home, true);
    const env = childEnv({ HOME: join(r.home, 'setup-home'), TMPDIR: join(r.home, 'setup-tmp'), PATH: `${dirname(options.node)}:/usr/bin:/bin`, OPTCHAT_HOME: r.optchatHome, PI_CODING_AGENT_DIR: join(r.home, 'pi-config'), PI_OFFLINE: '1', PI_TELEMETRY: '0', NODE_DISABLE_COMPILE_CACHE: '1', EXOSURFACE_SETUP_HOME: r.home, EXOSURFACE_SETUP_OPERATION: r.operationId }, {});
    return options.instrumentEnvironment?.(env) ?? env;
  };
  const hash = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
  const profileOp = (r: SetupRequest, op: 'create' | 'validate') => {
    const helper = join(options.runtimeRoot, 'dist', 'optchat-init.js');
    const answer = spawnSync(options.node, ['--experimental-transform-types', helper, r.optchat, op, r.profile], { cwd: r.vault, env: environment(r), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
    if (answer.status !== 0 || answer.error) throw Error(`OptChat supported profile API ${op} failed`);
    const result = JSON.parse(answer.stdout);
    if (!result.ok || result.dir !== join(r.optchatHome, 'profiles', r.profile)) throw Error('OptChat profile identity mismatch');
  };
  return {
    ...options.native,
    async configureLocal(r) {
      const dirs = canonicalRuntimeDirectories(r.home);
      const pkg = JSON.parse(readFileSync(join(r.optchat, 'package.json'), 'utf8'));
      const piRoot = resolvePiPackage(r.piCli), pi = JSON.parse(readFileSync(join(piRoot, 'package.json'), 'utf8'));
      if (pkg.name !== 'pi-optchat' || pkg.version !== '0.8.6' || pi.name !== '@earendil-works/pi-coding-agent' || pi.version !== '1.1.0') throw Error('Unsupported installed OptChat/Pi provenance; no dependency repair attempted');
      const desired = { ownerLabel: 'app.exosurface.owner', primaryStateDir: r.home, primaryOptchatHome: r.optchatHome, primaryProfile: r.profile, primaryAgentDir: join(r.home, 'pi-config'), vault: r.vault, optchat: r.optchat, piCli: r.piCli };
      const old = loadIf(options.localConfig);
      if (old && Object.entries(desired).some(([key, value]) => old[key] !== value)) throw Error('Existing local canonical configuration conflicts; refusing overwrite');
      if (!old) {
        for (const dir of dirs) if (lstatSync(dir, { throwIfNoEntry: false })) throw Error('Foreign fresh runtime directory; refusing credential/state adoption');
        if (!createExclusive(options.localConfig, desired)) throw Error('Canonical configuration changed concurrently');
      }
      for (const dir of dirs) mkdirSync(dir, { recursive: true, mode: 0o700 });
    },
    async createProfile(r) {
      profileOp(r, 'create');
      save(join(r.home, 'canonical-profile-created.json'), { operationId: r.operationId, profile: r.profile, optchatHome: r.optchatHome, configHash: hash(join(r.optchatHome, 'profiles', r.profile, 'config.json')), instructionsHash: hash(join(r.optchatHome, 'profiles', r.profile, 'AGENTS.md')) });
    },
    async validateProfile(r) {
      const dir = join(r.optchatHome, 'profiles', r.profile);
      if ([dir, join(dir, 'config.json'), join(dir, 'AGENTS.md')].some(path => realpathSync(path) !== path)) throw Error('Canonical setup refuses symlink profile identity');
      const proof = loadIf(join(r.home, 'canonical-profile-created.json'));
      if (proof?.operationId !== r.operationId || proof.profile !== r.profile || proof.optchatHome !== r.optchatHome) throw Error('Interrupted profile creation outcome unknown; explicit reconciliation required');
      if (proof.configHash !== hash(join(r.optchatHome, 'profiles', r.profile, 'config.json')) || proof.instructionsHash !== hash(join(r.optchatHome, 'profiles', r.profile, 'AGENTS.md'))) throw Error('Fresh profile changed since its supported API creation; refusing foreign setup state');
      profileOp(r, 'validate');
    },
    async initializeSession(r) {
      const file = join(r.home, 'canonical-pi-intent.json'), old = loadIf(file);
      if (old && (old.operationId !== r.operationId || !existsSync(old.file))) throw Error('Interrupted Pi initialization outcome unknown; explicit reconciliation required');
      const errors: string[] = [], model = primaryModelDefinition(CANONICAL_MODEL.id);
      const args = ['--provider', model.provider, '--model', model.modelId, '--thinking', model.thinking, '--offline', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-tools', '--session-dir', join(r.optchatHome, 'pi-sessions'), '-e', r.optchat, '-e', join(options.runtimeRoot, 'dist', 'canonical-initialization.js'), '--optchat-profile', r.profile, ...(old ? ['--session', old.file] : [])];
      const rpc = new PiRpc(r.piCli, args, r.vault, environment(r), event => { if (event.type === 'extension_error') errors.push(String(event.error)); }, () => {});
      try {
        if (!old) await rpc.send('prompt', { message: '/exosurface-initialize-session' });
        const state = await rpc.send('get_state'), result = await rpc.send('get_entries');
        const intent = loadIf(file), messages = result.entries.filter((e: any) => e.type === 'message');
        if (state.model?.provider !== model.provider || state.model?.id !== model.modelId || state.thinkingLevel !== model.thinking || errors.length || !intent || intent.operationId !== r.operationId || intent.id !== state.sessionId || realpathSync(intent.file) !== realpathSync(state.sessionFile) || messages.length !== 1 || messages[0].message.role !== 'user' || messages[0].message.content?.length !== 1 || messages[0].message.content[0]?.text !== INITIALIZATION || !result.entries.some((e: any) => e.customType === 'optchat.profile' && e.data?.name === r.profile) || !result.entries.some((e: any) => e.customType === 'exosurface.setup' && e.data?.operationId === r.operationId)) throw Error('Canonical initialization readback failed; no retry with another identity');
        return { id: state.sessionId, file: realpathSync(state.sessionFile) };
      } finally { await rpc.close(); if (errors.length) throw Error('Canonical initialization extension failed; inspect isolated evidence'); }
    },
  };
}
function resolvePiPackage(cli: string) {
  const root = dirname(dirname(dirname(cli)));
  if (join(root, 'dist', 'bundle', 'cli.js') !== cli) throw Error('Supported bundled public Pi CLI required');
  return root;
}

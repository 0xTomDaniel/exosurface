import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { freshCanonicalReceipt } from './canonical-fresh.ts';
import { childEnv } from '../../../src/env.ts';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { requireLocal, local } from './local-config.ts';
import { realpathSync } from 'node:fs';
import { HOME, SOURCE, OPTCHAT, FAST, CANONICAL_HOME, CANONICAL_PROFILE, profileHome, isThreadProfile, threadProfile, threadPagesHome, save, EXO_MODELS, mainModel, primaryModelDefinition, type RuntimeKind } from './state.ts';

export async function assertNativeOwner(profile: string, kind: RuntimeKind, pid: number | undefined) {
  if (!pid) throw new Error('Pi owner PID missing');
  const socketPath = join(profileHome(profile, kind), 'profiles', profile, 'lock.sock');
  const owner = await new Promise<string>((resolve, reject) => {
    const socket = createConnection(socketPath); let result = '';
    socket.setTimeout(2000, () => { socket.destroy(); reject(new Error('Profile owner did not respond; no lock takeover')); });
    socket.on('data', chunk => { result += chunk.toString(); });
    socket.on('end', () => resolve(result)); socket.on('error', reject);
  });
  // Persisted binding entries alone do not prove this process acquired a profile:
  // a resumed session can retain an old binding after an extension startup fault.
  if (!owner.startsWith(`${profile} · PID ${pid} ·`)) throw new Error('Requested profile is not owned by this Pi process; refusing false-ready resume');
}

/** Local bindings, not a credential copy or an independent security boundary. */
export function prepareRuntime(profile: string, kind: RuntimeKind) {
  if (kind === 'canonical') {
    const dir = join(profileHome(profile, kind), 'profiles', profile);
    // A bound thread's own profile runs only beside a valid primary install and reads the primary's instructions.
    const own = isThreadProfile(profile), fresh = freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE);
    if ((profile !== CANONICAL_PROFILE && !own) || !existsSync(join(dir, 'config.json')) || (!own && !existsSync(join(dir, 'active-memory.json')) && !fresh)) throw new Error('Existing canonical profile/generation required; never initialize or replace it');
    if (own && realpathSync(join(dir, 'AGENTS.md')) !== realpathSync(join(profileHome(CANONICAL_PROFILE, kind), 'profiles', CANONICAL_PROFILE, 'AGENTS.md'))) throw new Error('Bound thread profile must read the primary Exo instructions');
    if (existsSync(join(dir, 'imports', 'pending.json'))) throw new Error('Pending canonical import must be reconciled before handoff');
    const agentDir = local('primaryAgentDir') || join(homedir(), '.pi', 'agent');
    requireLocal(agentDir, 'primaryAgentDir');
    return agentDir;
  }
  const dir = join(HOME, 'profiles', profile);
  if (!existsSync(dir)) {
    save(join(dir, 'config.json'), kind === 'live' ? {
      compactor: { provider: 'anthropic', model: 'claude-sonnet-5-5', thinking: 'medium' },
      subagent: { provider: 'anthropic', model: 'claude-opus-5-5', thinking: 'high' },
      maxAgents: 8, subagentLevels: 1, groupReports: true, previousExchange: true,
      previousExchangeKB: 16, memorySearch: false, summaryAcceptBytes: 640,
    } : { compactor: { provider: 'exo-fixture', model: 'offline', thinking: 'off' }, subagent: { provider: 'exo-fixture', model: 'offline', thinking: 'off' }, maxAgents: 4, subagentLevels: 1 });
    writeFileSync(join(dir, 'AGENTS.md'), kind === 'live'
      ? '# Isolated live BB/OptChat trial\n\nFollow the canonical vault AGENTS.md. This profile is integration-test history, not Tom’s existing exo-optchat profile. Tests are not new real-life facts, commitments, or reasons to edit vault notes. Only perform actions explicitly requested by each trial prompt.\n'
      : '# Isolated offline BB integration spike\n', { mode: 0o600 });
  }
  if (kind === 'live') return join(homedir(), '.pi', 'agent');
  const agentDir = join(HOME, 'pi-config');
  if (!existsSync(join(agentDir, 'settings.json'))) save(join(agentDir, 'settings.json'), { packages: [], compaction: { enabled: false }, cacheWarming: 'off' });
  return agentDir;
}
export function runtimeLaunch(profile: string, kind: RuntimeKind, threadId: string, sessionFile?: string) {
  if (kind !== 'offline') requireLocal(OPTCHAT, 'optchat');
  const agentDir = prepareRuntime(profile, kind);
  // Exosurface on the primary session (local config surfaceMain: on|off; off is the rollback). Same extension order as
  // the clone: the page extension loads before OptChat, the outline frame after it. Exo's own tools are untouched.
  // The consolidated artifact owns the extensions and skill; no checkout sibling or configured plugin path is used.
  // A bound thread's Pi loads them too, on its own pages folder (threadPagesHome, #68): each surface has its own pages.
  const own = kind === 'canonical' && isThreadProfile(profile) && profile === threadProfile(threadId);
  const surface = kind === 'canonical' && (profile === CANONICAL_PROFILE || own) && local('surfaceMain') !== 'off' ? SOURCE : '';
  if(surface && !existsSync(join(surface,'dist/workspace-extension.js')))throw Error('Packaged Exosurface runtime missing; refusing a shell-only launch');
  // Primary Exo starts on the model last picked in BB; the isolated live trial stays on Opus.
  const launchModel = kind === 'canonical' ? primaryModelDefinition(mainModel()) : EXO_MODELS['exo-opus-5-5'];
  const args = kind !== 'offline'
    ? ['--approve', ...(surface ? ['-e', join(surface, 'dist/workspace-extension.js')] : []), '-e', OPTCHAT, ...(surface ? ['-e', join(surface, 'dist/workspace-frame.js')] : []), '-e', join(SOURCE, 'dist/live.js'), ...(surface ? ['--skill', join(surface, 'resources/skills/exosurface')] : []), '--provider', launchModel.provider, '--model', launchModel.modelId, '--thinking', launchModel.thinking, '--session-dir', kind === 'canonical' ? join(CANONICAL_HOME, 'pi-sessions') : join(HOME, 'live-pi-sessions')]
    : ['--offline', '--no-extensions', '--no-mcp', '--no-skills', '--no-prompt-templates', '--no-context-files', '-e', join(SOURCE, 'dist/fixture.js'), '-e', FAST, '-e', OPTCHAT, '--provider', 'exo-fixture', '--model', 'offline', '--thinking', 'off', '--session-dir', join(HOME, 'pi-sessions')];
  args.push('--optchat-profile', profile);
  if (sessionFile) args.push('--session', sessionFile);
  const fresh = kind === 'canonical' && freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE);
  const env = { ...(fresh ? childEnv() : process.env), OPTCHAT_HOME: profileHome(profile, kind), PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: kind === 'offline' ? '1' : '0', PI_TELEMETRY: '0', EXO_BB_RUNTIME_KIND: kind, EXO_BB_PROFILE: profile, EXO_BB_INFO_FILE: join(HOME, 'runtime-info', `${threadId}.json`), ...(surface ? { EXOSURFACE_MODE: 'main', EXOSURFACE_HOME: own ? threadPagesHome(threadId) : HOME, EXOSURFACE_OPTCHAT_HOME: CANONICAL_HOME } : {}) };
  mkdirSync(join(HOME, 'runtime-info'), { recursive: true, mode: 0o700 });
  return { args, env };
}

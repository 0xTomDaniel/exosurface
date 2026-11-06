import { existsSync, mkdirSync } from 'node:fs';
import { freshCanonicalReceipt } from './canonical-fresh.ts';
import { childEnv } from '../../../src/env.ts';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { requireLocal, local } from './local-config.ts';
import { realpathSync } from 'node:fs';
import { HOME, SOURCE, OPTCHAT, CANONICAL_HOME, CANONICAL_PROFILE, profileHome, isThreadProfile, threadProfile, threadPagesHome, mainModel, primaryModelDefinition } from './state.ts';

export async function assertNativeOwner(profile: string, pid: number | undefined) {
  if (!pid) throw new Error('Pi owner PID missing');
  const socketPath = join(profileHome(profile), 'profiles', profile, 'lock.sock');
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
export function prepareRuntime(profile: string) {
  const dir = join(profileHome(profile), 'profiles', profile);
  // A bound thread's own profile runs only beside a valid primary install and reads the primary's instructions.
  const own = isThreadProfile(profile), fresh = freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE);
  if ((profile !== CANONICAL_PROFILE && !own) || !existsSync(join(dir, 'config.json')) || (!own && !existsSync(join(dir, 'active-memory.json')) && !fresh)) throw new Error('Existing canonical profile/generation required; never initialize or replace it');
  if (own && realpathSync(join(dir, 'AGENTS.md')) !== realpathSync(join(profileHome(CANONICAL_PROFILE), 'profiles', CANONICAL_PROFILE, 'AGENTS.md'))) throw new Error('Bound thread profile must read the primary Exo instructions');
  if (existsSync(join(dir, 'imports', 'pending.json'))) throw new Error('Pending canonical import must be reconciled before handoff');
  const agentDir = local('primaryAgentDir') || join(homedir(), '.pi', 'agent');
  requireLocal(agentDir, 'primaryAgentDir');
  return agentDir;
}
export function runtimeLaunch(profile: string, threadId: string, sessionFile?: string) {
  requireLocal(OPTCHAT, 'optchat');
  const agentDir = prepareRuntime(profile);
  // Exosurface on the primary session (local config surfaceMain: on|off; off is the rollback). Same extension order as
  // the clone: the page extension loads before OptChat, the outline frame after it. Exo's own tools are untouched.
  // The consolidated artifact owns the extensions and skill; no checkout sibling or configured plugin path is used.
  // A bound thread's Pi loads them too, on its own pages folder (threadPagesHome, #68): each surface has its own pages.
  const own = isThreadProfile(profile) && profile === threadProfile(threadId);
  const surface = (profile === CANONICAL_PROFILE || own) && local('surfaceMain') !== 'off' ? SOURCE : '';
  if(surface && !existsSync(join(surface,'dist/workspace-extension.js')))throw Error('Packaged Exosurface runtime missing; refusing a shell-only launch');
  // Primary Exo starts on the model last picked in BB.
  const launchModel = primaryModelDefinition(mainModel());
  const args = ['--approve', ...(surface ? ['-e', join(surface, 'dist/workspace-extension.js')] : []), '-e', OPTCHAT, ...(surface ? ['-e', join(surface, 'dist/workspace-frame.js')] : []), '-e', join(SOURCE, 'dist/live.js'), ...(surface ? ['--skill', join(surface, 'resources/skills/exosurface')] : []), '--provider', launchModel.provider, '--model', launchModel.modelId, '--thinking', launchModel.thinking, '--session-dir', join(CANONICAL_HOME, 'pi-sessions')];
  args.push('--optchat-profile', profile);
  if (sessionFile) args.push('--session', sessionFile);
  const fresh = freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE);
  const env = { ...(fresh ? childEnv() : process.env), OPTCHAT_HOME: profileHome(profile), PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '0', PI_TELEMETRY: '0', EXO_BB_PROFILE: profile, EXO_BB_INFO_FILE: join(HOME, 'runtime-info', `${threadId}.json`), ...(surface ? { EXOSURFACE_MODE: 'main', EXOSURFACE_HOME: own ? threadPagesHome(threadId) : HOME, EXOSURFACE_OPTCHAT_HOME: CANONICAL_HOME } : {}) };
  mkdirSync(join(HOME, 'runtime-info'), { recursive: true, mode: 0o700 });
  return { args, env };
}

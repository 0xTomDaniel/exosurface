import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { createConnection } from 'node:net';
import { join } from 'node:path';
import { requireLocal } from './local-config.ts';
import { HOME, SOURCE, OPTCHAT, FAST, CANONICAL_HOME, CANONICAL_PROFILE, profileHome, save, type RuntimeKind } from './state.ts';

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
    if (profile !== CANONICAL_PROFILE || !existsSync(join(dir, 'config.json')) || !existsSync(join(dir, 'active-memory.json'))) throw new Error('Existing canonical profile/generation required; never initialize or replace it');
    if (existsSync(join(dir, 'imports', 'pending.json'))) throw new Error('Pending canonical import must be reconciled before handoff');
    return join(homedir(), '.pi', 'agent');
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
  requireLocal(OPTCHAT, 'optchatCanvas');
  if (kind !== 'canonical') throw new Error('A2UI spike requires the cloned Exo route');
  const agentDir = prepareRuntime(profile, kind);
  // -ne: no built-in MCP/codemode/tool-search or discovered extensions in the clone; only
  // the explicit extensions below load, so the model's tools are exactly the canvas pair.
  // Order matters. workspace-extension loads BEFORE OptChat: its prompt sections exist when OptChat reads
  // the prompt, and its message_end replacement (canvas JSON → what was shown) is what OptChat logs.
  // workspace-frame loads AFTER OptChat, which assembles the final request in context_with_system.
  const args = ['--approve', '-ne', '-e', join(SOURCE, 'src/workspace-extension.ts'), '-e', OPTCHAT, '-e', join(SOURCE, 'src/workspace-frame.ts'), '-e', join(SOURCE, 'src/live.ts'), '--skill', join(SOURCE, 'skills/exosurface'), '--provider', 'anthropic', '--model', 'claude-opus-5-5', '--thinking', 'high', '--session-dir', join(CANONICAL_HOME, 'pi-sessions')];
  args.push('--optchat-profile', profile);
  if (sessionFile) args.push('--session', sessionFile);
  const env = { ...process.env, OPTCHAT_HOME: profileHome(profile, kind), PI_CODING_AGENT_DIR: agentDir, PI_OFFLINE: '0', PI_TELEMETRY: '0', EXO_A2UI_SPIKE: '1', EXO_BB_RUNTIME_KIND: kind, EXO_BB_PROFILE: profile, EXO_BB_INFO_FILE: join(HOME, 'runtime-info', `${threadId}.json`) };
  mkdirSync(join(HOME, 'runtime-info'), { recursive: true, mode: 0o700 });
  return { args, env };
}

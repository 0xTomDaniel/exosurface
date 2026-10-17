import { local } from './local-config.ts';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync } from 'node:fs';
export const HOME = join(homedir(), '.exo-bb-spike');
// The plugin root, wherever it is checked out (symlinked install paths resolve to the real location).
export const SOURCE = fileURLToPath(new URL('..', import.meta.url)).replace(/\/$/, '');
export const PI_CLI = local('piCli');
export const OPTCHAT = local('optchat');
export const FAST = local('piFast');
export function save(file: string, value: unknown) {
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, file);
}
export function load(file: string): any { return JSON.parse(readFileSync(file, 'utf8')); }
export function feedback(thread: string) {
  const file = join(HOME, 'feedback', `${thread}.json`);
  return existsSync(file) ? load(file) : { statuses: {}, notifications: [] };
}
export const bindingFile = (thread: string) => {
  if (!/^[a-zA-Z0-9_-]+$/.test(thread)) throw new Error('Invalid spike thread ID');
  return join(HOME, 'bindings', `${thread}.json`);
};
export function binding(thread: string) { const file = bindingFile(thread); return existsSync(file) ? load(file) : undefined; }
export const CANONICAL_HOME = join(homedir(), '.optchat-exocortex-test');
export const CANONICAL_PROFILE = 'exo-optchat';
export function profileHome(profile: string, kind: RuntimeKind = 'offline') {
  if (kind === 'canonical' && profile !== CANONICAL_PROFILE) throw new Error('Canonical route is bound only to exo-optchat');
  return kind === 'canonical' ? CANONICAL_HOME : HOME;
}
const recentRuns = new Map<string, { mtime: number; rows: any[] }>();
export function runs(profile: string, kind: RuntimeKind = 'offline', limit?: number): any[] {
  if (!/^[a-z0-9_-]{1,64}$/.test(profile)) throw new Error('Invalid spike profile');
  const directory = join(profileHome(profile, kind), 'profiles', profile, 'runs');
  if (!existsSync(directory)) return [];
  if (!limit) return readdirSync(directory).filter(f => f.endsWith('.optchat.json')).map(f => load(join(directory, f)));
  // Native metadata is atomically replaced: directory mtime invalidates this
  // bounded view cache. Historical reports aren't reread/transmitted per poll.
  const mtime = statSync(directory).mtimeMs, key = `${directory}:${limit}`;
  const cached = recentRuns.get(key); if (cached?.mtime === mtime) return cached.rows;
  const rows = readdirSync(directory).filter(f => f.endsWith('.optchat.json'))
    .map(f => ({ f, at: statSync(join(directory,f)).mtimeMs })).sort((a,b) => b.at-a.at).slice(0,limit)
    .map(({f}) => { const r=load(join(directory,f));return {id:r.id,state:r.state,report:r.report?.slice(0,500),model:r.model,sessionFile:r.sessionFile,started:r.started,ended:r.ended}; });
  recentRuns.set(key,{mtime,rows});return rows;
}
export function childMessages(profile: string, id: string): any[] {
  const run = runs(profile).find(r => r.id === id);
  if (!run?.sessionFile) return [];
  // Never follow the metadata pointer outside this isolated profile.
  const file = join(HOME, 'profiles', profile, 'runs', run.sessionFile.split('/').pop());
  return readFileSync(file, 'utf8').trim().split('\n').map(l => JSON.parse(l)).flatMap(e => e.type === 'message' && e.message.role === 'assistant' ? [e.message] : []);
}
export type RuntimeKind = 'offline' | 'live' | 'canonical';
export const CANONICAL_MODEL = { id: 'exo-opus-5-5', model: 'exo-opus-5-5', displayName: 'Exo — Opus 5.5 (exo-optchat)', description: 'Existing personal OptChat history; one canonical BB conversation, not a test profile', isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' as const, description: 'Existing Exo Opus setting' }], defaultReasoningEffort: 'high' as const };
export const LIVE_MODEL = { id: 'live-opus-5-5', model: 'live-opus-5-5', displayName: 'Opus 5.5 — isolated live OptChat trial', description: 'Real Anthropic model, normal Exocortex resources, separate test history; not exo-optchat', isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' as const, description: 'Existing OptChat main-agent setting' }], defaultReasoningEffort: 'high' as const };
export const VAULT = local('vault');
export const MODEL = { id: 'offline-fixture', model: 'offline-fixture', displayName: 'Exo offline fixture (not an LLM)', description: 'Isolated lifecycle tests only', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' as const, description: 'Offline fixture; no reasoning budget' }], defaultReasoningEffort: 'low' as const };

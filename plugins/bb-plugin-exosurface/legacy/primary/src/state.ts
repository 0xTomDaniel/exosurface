import { local } from './local-config.ts';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync, readdirSync, statSync } from 'node:fs';
export const HOME = local('primaryStateDir') || join(homedir(), '.exo-bb-spike');
// The plugin root, wherever it is checked out (symlinked install paths resolve to the real location). BB loads
// this module from legacy/primary/src (server) or a copied host artifact, so find the consolidated package root
// rather than assuming a fixed depth; keep the historical parent for unconsolidated copies.
function pluginRoot(start: string) {
  for (let dir = start, i = 0; i < 6; i++, dir = join(dir, '..')) {
    try { if (JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')).name === 'bb-plugin-exosurface') return dir; } catch {}
  }
  return join(start, '..');
}
export const SOURCE = pluginRoot(fileURLToPath(new URL('.', import.meta.url))).replace(/\/$/, '');
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
export const CANONICAL_HOME = local('primaryOptchatHome') || join(homedir(), '.optchat-exocortex-test');
export const CANONICAL_PROFILE = local('primaryProfile') || 'exo-optchat';
// A bound thread's own profile (#67, owner ruling option A): one OptChat profile and Pi per thread, same Exo.
const threadPrefix = `${CANONICAL_PROFILE.slice(0, 40)}-t`;
export const threadProfile = (threadId: string) => threadPrefix + createHash('sha256').update(threadId).digest('hex').slice(0, 16);
export const isThreadProfile = (profile: string) => profile.startsWith(threadPrefix) && /^[0-9a-f]{16}$/.test(profile.slice(threadPrefix.length));
/** A thread bound to its own canonical profile (thread-profiles.ts): a surface other than Home. */
export function isBoundThread(threadId: string) { const b = binding(threadId); return b?.runtimeKind === 'canonical' && !b.childId && b.profile === threadProfile(threadId); }
/** New surface (#68): the first message of a thread made by the thread_new RPC. Its admission binds the thread before any
 *  provider start; the bridge settles it without a turn, so the new thread starts with an empty activity. */
export const NEW_THREAD_PROMPT = '/exosurface-new-surface';

// Pages per bound thread (#68, spec pages-and-activity S2, S3): its page extensions keep their state (EXOSURFACE_HOME)
// and its owner state here, never in the primary's HOME.
export function threadPagesHome(threadId: string) { bindingFile(threadId); return join(HOME, 'threads', threadId); }
export function profileHome(profile: string, kind: RuntimeKind = 'offline') {
  if (kind === 'canonical' && profile !== CANONICAL_PROFILE && !isThreadProfile(profile)) throw new Error('Canonical route is bound only to exo-optchat');
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
// Models the primary Exo conversation can run on, picked in BB's model picker. Same session, history and memory;
// the choice is remembered (main-model.json) so restarts keep it. Auth comes from the owner's own Pi agent folder.
export const SOL_MODEL = { id: 'exo-gpt-6-1-sol', model: 'exo-gpt-6-1-sol', displayName: 'Exo — GPT-6.1 Sol (exo-optchat)', description: 'Same Exo history and memory, answered by GPT-6.1 Sol via the locally configured provider', isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' as const, description: 'High' }], defaultReasoningEffort: 'high' as const };
export const EXO_MODELS: Record<string, { provider: string; modelId: string; thinking: string }> = {
  'exo-opus-5-5': { provider: 'anthropic', modelId: 'claude-opus-5-5', thinking: 'high' },
  'exo-gpt-6-1-sol': { provider: 'openai-codex', modelId: 'gpt-6.1-sol', thinking: 'high' },
};
// Optional primary-only provider route. Endpoint/auth/model definitions belong in that agent directory's models.json,
// never in this public repository. Without local overrides the existing Codex route is unchanged.
export function primaryModelDefinition(id: string, solProvider = local('primarySolProvider')) {
  if (!Object.hasOwn(EXO_MODELS, id)) throw new Error('Unsupported primary Exo model');
  return { ...EXO_MODELS[id], ...(id === SOL_MODEL.id && solProvider ? { provider: solProvider } : {}) };
}
export const isExoModel = (id: unknown): id is string => typeof id === 'string' && Object.hasOwn(EXO_MODELS, id);
export const mainModelFile = () => join(HOME, 'main-model.json');
export function mainModel(): string { try { const id = load(mainModelFile()).id; return isExoModel(id) ? id : 'exo-opus-5-5'; } catch { return 'exo-opus-5-5'; } }
export const LIVE_MODEL = { id: 'live-opus-5-5', model: 'live-opus-5-5', displayName: 'Opus 5.5 — isolated live OptChat trial', description: 'Real Anthropic model, normal Exocortex resources, separate test history; not exo-optchat', isDefault: false, supportedReasoningEfforts: [{ reasoningEffort: 'high' as const, description: 'Existing OptChat main-agent setting' }], defaultReasoningEffort: 'high' as const };
export const VAULT = local('vault');
export const MODEL = { id: 'offline-fixture', model: 'offline-fixture', displayName: 'Exo offline fixture (not an LLM)', description: 'Isolated lifecycle tests only', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'low' as const, description: 'Offline fixture; no reasoning budget' }], defaultReasoningEffort: 'low' as const };

// Release configuration and state layout for the production Exosurface plugin.
//
// Owner graph rule: this file (like everything src/owner-service.ts imports) uses only `node:` builtins and relative
// files, so the owner runs from a release without node_modules. Nothing here reads or writes at import time.
//
// The config file is written by the installer (tools/release), never by this plugin. Model choices are required and
// explicit: there are no defaults and nothing is inferred from vendor environment variables or another Pi home.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATE_SCHEMA = 1;
export const OWNER_LABEL = 'app.exosurface.owner';
export const PROVIDER_ID = 'exosurface';
export const MODEL_ID = 'exo';
export const PINS = { pi: '1.1.0', optchat: '0.8.6', node: '22.19.0' } as const;
// Pi's and OptChat's own thinking levels (OptChat src/profiles.ts THINKING, Pi --thinking).
export const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Thinking = (typeof THINKING)[number];
export type ModelChoice = { provider: string; model: string; thinking: Thinking };
export type Models = { main: ModelChoice; compactor: ModelChoice; subagent: ModelChoice };
export type Problem = { code: string; message: string; fix: string };
export type Config = {
  file: string; vault: string; piCli: string; optchat: string; node: string;
  stateDir: string; agentDir: string; profile: string; models: Models; exosurfacePlugin: string;
};

export const configFile = (env: NodeJS.ProcessEnv = process.env) => env.EXO_CONFIG || join(homedir(), '.config', 'exosurface', 'config.json');
const expand = (p: string) => (p === '~' ? homedir() : p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);

/** The plugin root (directory holding this package.json), wherever BB or the release installs it. */
export function pluginRoot(from = import.meta.url): string {
  let dir = dirname(fileURLToPath(from));
  for (let i = 0; i < 6; i++) {
    const pkg = join(dir, 'package.json');
    if (existsSync(pkg)) { try { if (JSON.parse(readFileSync(pkg, 'utf8')).name === 'bb-plugin-exosurface') return dir; } catch {} }
    dir = dirname(dir);
  }
  throw new Error('bb-plugin-exosurface package root not found');
}

export function modelChoice(value: unknown): value is ModelChoice {
  const v = value as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && typeof v.provider === 'string' && !!v.provider.trim() && typeof v.model === 'string' && !!v.model.trim()
    && THINKING.includes(v.thinking as Thinking);
}

/** Never throws: problems are returned with the fix a person (or the installer) should apply. */
export function readConfig(env: NodeJS.ProcessEnv = process.env): { config?: Config; problems: Problem[] } {
  const file = configFile(env), problems: Problem[] = [];
  const setup = `Write it with the Exosurface installer (tools/release), or edit ${file} directly.`;
  if (!existsSync(file)) return { problems: [{ code: 'config-missing', message: `No Exosurface config at ${file}.`, fix: setup }] };
  let raw: Record<string, unknown>;
  try { raw = JSON.parse(readFileSync(file, 'utf8')); if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('not an object'); }
  catch (e) { return { problems: [{ code: 'config-invalid', message: `${file} is not a JSON object (${e instanceof Error ? e.message : String(e)}).`, fix: setup }] }; }
  const path = (key: string, required: boolean, fallback = '') => {
    const v = raw[key];
    if (v === undefined || v === '') {
      if (required) problems.push({ code: `${key}-missing`, message: `Config key "${key}" is not set.`, fix: setup });
      return fallback;
    }
    if (typeof v !== 'string') { problems.push({ code: `${key}-invalid`, message: `Config key "${key}" must be a path string.`, fix: setup }); return fallback; }
    const p = expand(v);
    if (!isAbsolute(p)) problems.push({ code: `${key}-invalid`, message: `Config key "${key}" must be absolute or start with ~/.`, fix: setup });
    return p;
  };
  const stateDir = env.EXO_STATE_DIR || path('stateDir', false, join(homedir(), '.exosurface'));
  if (!isAbsolute(stateDir)) problems.push({ code: 'stateDir-invalid', message: 'EXO_STATE_DIR must be absolute.', fix: setup });
  const config: Config = {
    file, vault: path('vault', true), piCli: path('piCli', true), optchat: path('optchat', true),
    node: path('node', false, process.execPath), stateDir, agentDir: path('agentDir', false, join(stateDir, 'pi-agent')),
    profile: typeof raw.profile === 'string' && raw.profile ? raw.profile : 'exo',
    exosurfacePlugin: path('exosurfacePlugin', false),
    models: undefined as unknown as Models,
  };
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(config.profile)) problems.push({ code: 'profile-invalid', message: `Profile name "${config.profile}" is not a valid OptChat profile name.`, fix: 'Use 1–64 lowercase letters, digits, hyphens or underscores.' });
  const models = (raw.models ?? {}) as Record<string, unknown>;
  const missing = (['main', 'compactor', 'subagent'] as const).filter(k => !modelChoice(models[k]));
  if (missing.length) problems.push({
    code: 'models-missing',
    message: `Model choices missing or invalid: ${missing.join(', ')}. Each needs {"provider","model","thinking"}; Exosurface never picks one for you.`,
    fix: `Re-run the installer with --models '<json>' or add "models": {"main":{...},"compactor":{...},"subagent":{...}} to ${file}. thinking is one of ${THINKING.join(', ')}.`,
  });
  else config.models = { main: models.main as ModelChoice, compactor: models.compactor as ModelChoice, subagent: models.subagent as ModelChoice };
  return problems.length ? { config, problems } : { config, problems };
}

export type Layout = ReturnType<typeof layout>;
export function layout(stateDir: string) {
  const owner = join(stateDir, 'owner');
  return {
    stateDir, schemaFile: join(stateDir, 'state-schema.json'), optchatHome: join(stateDir, 'optchat'),
    sessions: join(stateDir, 'pi-sessions'), firstRun: join(stateDir, 'first-run.json'), primary: join(stateDir, 'primary-thread.json'),
    ownerDir: owner, ownerState: join(owner, 'state.json'), ownerSocket: join(owner, 'rpc.sock'), cursor: join(owner, 'projection.json'),
    runtimeInfo: join(stateDir, 'runtime-info.json'), feedback: join(stateDir, 'feedback.json'), audit: join(stateDir, 'audit.jsonl'),
  };
}
export const profileDir = (config: Pick<Config, 'stateDir' | 'profile'>) => join(layout(config.stateDir).optchatHome, 'profiles', config.profile);

/** Read-only check of <stateDir>/state-schema.json. An unsupported or unreadable file is never rewritten. */
export function schemaState(l: Layout): 'absent' | 'supported' | { unsupported: string } {
  if (!existsSync(l.schemaFile)) return 'absent';
  try {
    if (!statSync(l.schemaFile).isFile()) return { unsupported: 'not a file' };
    const v = JSON.parse(readFileSync(l.schemaFile, 'utf8'));
    return v?.schema === STATE_SCHEMA ? 'supported' : { unsupported: JSON.stringify(v?.schema ?? null) };
  } catch (e) { return { unsupported: e instanceof Error ? e.message : String(e) }; }
}

/** Compares dotted versions numerically; `actual` may carry a leading "v". */
export function atLeast(actual: string, minimum: string) {
  const a = actual.replace(/^v/, '').split('.').map(Number), b = minimum.split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) > (b[i] ?? 0); }
  return true;
}

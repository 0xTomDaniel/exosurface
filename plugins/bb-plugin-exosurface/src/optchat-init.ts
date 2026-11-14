// Runs in its own Node process with OPTCHAT_HOME set by the caller (src/system.ts), because OptChat resolves its data
// home from the environment at call time. Uses only OptChat's own exported profile API (src/profiles.ts, v0.8.6):
// createProfile, profilePath, loadConfig, saveConfig. No file formats are written by hand here, and nothing creates
// active-memory.json: OptChat writes that pointer itself (only for imports); a fresh profile has none.
//
// Usage: node --experimental-transform-types optchat-init.ts <optchatSourceDir> create|configure <profile> [choicesJson]
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isRecord } from './store.ts';

/** The OptChat profile API this helper calls; its config records stay untyped JSON objects. */
interface ProfileApi {
  profilePath(name: string): string;
  createProfile(name: string): void;
  loadConfig(dir: string): unknown;
  saveConfig(dir: string, config: unknown): void;
  instructions(dir: string): unknown;
}
const isProfileApi = (v: unknown): v is ProfileApi => isRecord(v)
  && ['profilePath', 'createProfile', 'loadConfig', 'saveConfig', 'instructions'].every(f => typeof v[f] === 'function');
const record = (v: unknown, what: string) => { if (!isRecord(v)) throw new TypeError(`${what} is not an object`); return v; };

const [source, op, name, choices] = process.argv.slice(2);
const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
try {
  if (!process.env["OPTCHAT_HOME"]) throw new Error('OPTCHAT_HOME must be set explicitly');
  if (source === undefined || op === undefined || name === undefined) throw new Error('Usage: optchat-init <optchatSourceDir> <operation> <profile> [choicesJson]');
  const api: unknown = await import(pathToFileURL(join(source, 'src', 'profiles.ts')).href);
  if (!isProfileApi(api)) throw new Error('OptChat profile API not found');
  const dir = api.profilePath(name);
  if (op === 'create') { api.createProfile(name); out({ ok: true, dir }); }
  else if (op === 'validate') { api.loadConfig(dir); api.instructions(dir); out({ ok: true, dir }); }
  else if (op === 'configure') {
    const chosen = record(JSON.parse(choices ?? 'undefined'), 'Model choices');
    const compactor = record(chosen['compactor'], 'compactor choice'), subagent = record(chosen['subagent'], 'subagent choice');
    const current = record(api.loadConfig(dir), 'OptChat profile config');
    const same = (v: unknown, b: Readonly<Record<string, unknown>>) => { const a = record(v, 'Current model choice'); return a['provider'] === b['provider'] && a['model'] === b['model'] && a['thinking'] === b['thinking']; };
    if (same(current['compactor'], compactor) && same(current['subagent'], subagent)) out({ ok: true, changed: false });
    else { api.saveConfig(dir, { ...current, compactor, subagent }); api.loadConfig(dir); out({ ok: true, changed: true }); }
  } else throw new Error(`Unknown operation ${op}`);
} catch (e) {
  out({ ok: false, error: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
}

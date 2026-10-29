// Runs in its own Node process with OPTCHAT_HOME set by the caller (src/system.ts), because OptChat resolves its data
// home from the environment at call time. Uses only OptChat's own exported profile API (src/profiles.ts, v0.8.6):
// createProfile, profilePath, loadConfig, saveConfig. No file formats are written by hand here, and nothing creates
// active-memory.json: OptChat writes that pointer itself (only for imports); a fresh profile has none.
//
// Usage: node --experimental-transform-types optchat-init.ts <optchatSourceDir> create|configure <profile> [choicesJson]
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [source, op, name, choices] = process.argv.slice(2);
const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
try {
  if (!process.env.OPTCHAT_HOME) throw new Error('OPTCHAT_HOME must be set explicitly');
  const api = await import(pathToFileURL(join(source, 'src', 'profiles.ts')).href);
  const dir = api.profilePath(name);
  if (op === 'create') { api.createProfile(name); out({ ok: true, dir }); }
  else if (op === 'validate') { api.loadConfig(dir); api.instructions(dir); out({ ok: true, dir }); }
  else if (op === 'configure') {
    const { compactor, subagent } = JSON.parse(choices);
    const current = api.loadConfig(dir);
    const same = (a: any, b: any) => a.provider === b.provider && a.model === b.model && a.thinking === b.thinking;
    if (same(current.compactor, compactor) && same(current.subagent, subagent)) out({ ok: true, changed: false });
    else { api.saveConfig(dir, { ...current, compactor, subagent }); api.loadConfig(dir); out({ ok: true, changed: true }); }
  } else throw new Error(`Unknown operation ${op}`);
} catch (e) {
  out({ ok: false, error: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
}

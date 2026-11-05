// Runs in its own Node process with OPTCHAT_HOME set by the caller (src/system.ts), because OptChat resolves its data
// home from the environment at call time. Uses only OptChat's own exported profile API (src/profiles.ts, v0.8.6):
// createProfile, profilePath, loadConfig, saveConfig. No file formats are written by hand here, and nothing creates
// active-memory.json: OptChat writes that pointer itself (only for imports); a fresh profile has none.
//
// Usage: node --experimental-transform-types optchat-init.ts <optchatSourceDir> create|configure <profile> [choicesJson]
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { modelChoice } from './config.ts';

const [source, op, name, choices] = process.argv.slice(2);
const out = (value: unknown) => process.stdout.write(JSON.stringify(value) + '\n');
try {
  if (!process.env.OPTCHAT_HOME) throw new Error('OPTCHAT_HOME must be set explicitly');
  const api = await import(pathToFileURL(join(source, 'src', 'profiles.ts')).href);
  const dir = api.profilePath(name);
  if (op === 'create') { api.createProfile(name); out({ ok: true, dir }); }
  else if (op === 'validate') { api.loadConfig(dir); api.instructions(dir); out({ ok: true, dir }); }
  else if (op === 'configure') {
    // namer (#82): the surface naming model, beside compactor with its shape. OptChat's loadConfig keeps only the keys it
    // knows, so the file's own namer is read raw and kept; an invalid one is refused here, never written.
    const { compactor, subagent, namer } = JSON.parse(choices);
    const current = api.loadConfig(dir), file = JSON.parse(readFileSync(join(dir, 'config.json'), 'utf8'));
    const same = (a: any, b: any) => a?.provider === b?.provider && a?.model === b?.model && a?.thinking === b?.thinking;
    if (namer !== undefined && !modelChoice(namer)) throw new Error('Invalid namer: needs {"provider","model","thinking"} like compactor');
    const keep = namer ?? file.namer;
    if (same(current.compactor, compactor) && same(current.subagent, subagent) && (namer === undefined || same(file.namer, namer))) out({ ok: true, changed: false });
    else { api.saveConfig(dir, { ...current, compactor, subagent, ...(keep !== undefined ? { namer: keep } : {}) }); api.loadConfig(dir); out({ ok: true, changed: true }); }
  } else throw new Error(`Unknown operation ${op}`);
} catch (e) {
  out({ ok: false, error: e instanceof Error ? e.message : String(e) });
  process.exitCode = 1;
}

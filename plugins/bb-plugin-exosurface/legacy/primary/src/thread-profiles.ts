// Bound canonical threads (#67, owner ruling option A on #33): each bound BB thread is its own OptChat profile and Pi in
// the owner, so its turns run beside the primary's (spec pages-and-activity S9). Same Exo (S10): the profile's AGENTS.md
// is the primary profile's (symlink, one source), its compactor/subagent choices are the primary's, and Pi runs on the
// vault with the primary model (runtime.ts). Profiles are made only through OptChat's own API (src/optchat-init.ts).
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { childEnv } from '../../../src/env.ts';
import { createExclusive } from '../../../src/store.ts';
import { local, requireLocal } from './local-config.ts';
import { HOME, SOURCE, CANONICAL_HOME, CANONICAL_PROFILE, OPTCHAT, VAULT, load, binding, bindingFile, threadProfile } from './state.ts';

function optchat(op: 'create' | 'validate' | 'configure', profile: string, choices?: unknown) {
  const built = join(SOURCE, 'dist', 'optchat-init.js'), helper = existsSync(built) ? built : join(SOURCE, 'src', 'optchat-init.ts');
  const agentDir = requireLocal(local('primaryAgentDir'), 'primaryAgentDir');
  const answer = spawnSync(process.execPath, ['--experimental-transform-types', helper, requireLocal(OPTCHAT, 'optchat'), op, profile, ...(choices ? [JSON.stringify(choices)] : [])],
    { cwd: requireLocal(VAULT, 'vault'), env: childEnv({ OPTCHAT_HOME: CANONICAL_HOME, PI_CODING_AGENT_DIR: agentDir }), encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024 });
  let result: any; try { result = JSON.parse(answer.stdout); } catch { result = undefined; }
  if (answer.error || answer.status !== 0 || !result?.ok) throw new Error(`OptChat ${op} failed: ${(answer.error?.message ?? result?.error ?? (answer.stderr || `exit ${answer.status}`)).replace(/\s+/g, ' ').trim().slice(0, 400)}`);
  return result;
}

/** Binds a BB thread to its own canonical profile. Idempotent; a retry finishes an interrupted binding on the same profile. */
export function bindThread(threadId: string) {
  const file = bindingFile(threadId), pointer = join(HOME, 'canonical-thread.json');
  if (!existsSync(pointer)) throw new Error('Initialize the primary Exo thread before binding another');
  if (load(pointer).threadId === threadId) throw new Error('The primary Exo thread is already bound');
  const profile = threadProfile(threadId), old = binding(threadId);
  if (old) {
    if (old.profile !== profile || old.runtimeKind !== 'canonical' || old.childId) throw new Error('Thread already has another binding');
    return { threadId, profile };
  }
  const dir = join(CANONICAL_HOME, 'profiles', profile), agents = join(dir, 'AGENTS.md'), primary = join(CANONICAL_HOME, 'profiles', CANONICAL_PROFILE);
  if (!existsSync(dir)) optchat('create', profile);
  if (!lstatSync(agents, { throwIfNoEntry: false })?.isSymbolicLink()) { rmSync(agents, { force: true }); symlinkSync(join(primary, 'AGENTS.md'), agents); }
  const { compactor, subagent } = JSON.parse(readFileSync(join(primary, 'config.json'), 'utf8'));
  optchat('configure', profile, { compactor, subagent });
  optchat('validate', profile);
  if (!createExclusive(file, { providerThreadId: `exo:${profile}:main`, profile, runtimeKind: 'canonical', cursor: 0 })) throw new Error('Thread binding changed concurrently');
  return { threadId, profile };
}

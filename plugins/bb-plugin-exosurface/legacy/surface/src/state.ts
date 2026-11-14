import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
// Deployment. The isolated clone is the default. The primary Exo session loads the same Pi extensions with
// EXOSURFACE_MODE=main and names its own state folder and OptChat home (set by the primary plugin's launcher).
export const CLONE_HOME = join(homedir(), '.exo-a2ui-spike');
const CLONE_OPTCHAT_HOME = join(homedir(), '.optchat-exo-a2ui');
export const MAIN_MODE = process.env["EXOSURFACE_MODE"] === 'main';
export const HOME = MAIN_MODE ? (process.env["EXOSURFACE_HOME"] ?? '') : CLONE_HOME;
export function save(file: string, value: unknown) {
  mkdirSync(join(file, '..'), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${String(process.pid)}.tmp`;
  writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 }); renameSync(temporary, file);
}
export function load(file: string): any { return JSON.parse(readFileSync(file, 'utf8')); }
// 'canonical' is the reused adapter mode, but its entire home is the ISOLATED clone.
const CANONICAL_HOME = MAIN_MODE ? (process.env["EXOSURFACE_OPTCHAT_HOME"] ?? '') : CLONE_OPTCHAT_HOME;
export const CANONICAL_MODEL = { id: 'a2ui-clone-opus', model: 'a2ui-clone-opus', displayName: 'A2UI — cloned Exo / Opus 5.5', description: 'Private cloned OptChat home, separate session and owner; NOT main Exo', isDefault: true, supportedReasoningEfforts: [{ reasoningEffort: 'high' as const, description: 'Existing Exo Opus setting' }], defaultReasoningEffort: 'high' as const };

/** Accident guard for the Pi extensions: the clone runs only on the cloned home; main mode only on a primary home that is
 *  explicitly named and is never the clone's. Same-user guard, not a security boundary. */
export function assertDeployment(env: NodeJS.ProcessEnv = process.env) {
  if (MAIN_MODE) {
    if (!HOME || !CANONICAL_HOME || HOME === CLONE_HOME || CANONICAL_HOME === CLONE_OPTCHAT_HOME || env["OPTCHAT_HOME"] !== CANONICAL_HOME || !existsSync(join(HOME, 'owner', 'state.json')))
      throw Error('Exosurface main mode requires the primary home and its OptChat home, never the clone');
  } else if (env["EXO_A2UI_SPIKE"] !== '1' || env["OPTCHAT_HOME"] !== CANONICAL_HOME || !existsSync(join(HOME, 'clone.json')))
    throw Error('Exosurface clone mode requires the explicitly cloned home; never main');
}

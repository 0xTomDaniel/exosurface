import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { layout, type Config } from './config.ts';
import { childEnv } from './env.ts';

/** OptChat profile management in a fresh explicit environment. No provider/auth/network requests. */
export function profileOperation(config: Config, op: 'create' | 'configure' | 'validate') {
  const js = fileURLToPath(new URL('./optchat-init.js', import.meta.url));
  const helper = existsSync(js) ? js : fileURLToPath(new URL('./optchat-init.ts', import.meta.url));
  const result = spawnSync(config.node, ['--experimental-transform-types', helper, config.optchat, op, config.profile, JSON.stringify(config.models)], {
    env: childEnv({ OPTCHAT_HOME: layout(config.stateDir).optchatHome, PI_CODING_AGENT_DIR: config.agentDir }),
    cwd: config.vault, encoding: 'utf8', timeout: 15000, maxBuffer: 1024 * 1024,
  });
  if (result.error || result.status !== 0) throw new Error(`OptChat ${op} failed: ${result.error?.message || result.stdout || result.stderr}`);
  const answer = JSON.parse(result.stdout.trim());
  if (!answer.ok) throw new Error(answer.error || 'OptChat profile operation failed');
  return answer;
}

/** Runtime only: installer owns the job; never -k/replace another owner. Tests use an already-listening fixture socket. */
export async function ensureOwner(config: Config) {
  const socket = layout(config.stateDir).ownerSocket;
  if (existsSync(socket)) return;
  if (process.platform !== 'darwin' || !process.getuid) throw new Error('Start the installed Exosurface owner service before sending');
  const result = spawnSync('/bin/launchctl', ['kickstart', `gui/${process.getuid()}/app.exosurface.owner`], {
    env: childEnv(), encoding: 'utf8', timeout: 5000,
  });
  if (result.error || result.status !== 0) throw new Error('Owner service is not installed or could not start; run installer/start and inspect owner status');
  for (let i = 0; i < 100; i++) {
    if (existsSync(socket)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Owner startup timed out; inspect owner status and fresh-owner authentication');
}

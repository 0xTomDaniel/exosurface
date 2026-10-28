// Single explicit entry: starter apply -> starter verify -> release install.
// Paths are supplied, never discovered from a developer checkout. No dependency installs.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { homedir } from 'node:os';
import { install, readReceipt, defaultPaths } from './lifecycle.mjs';
import { fail, readJson, sanitizedEnv } from './util.mjs';

export function setup(opts) {
  for (const k of ['starterScript', 'starterArtifact', 'python', 'vault', 'artifact', 'ownerTimezone'])
    if (!opts[k]) fail(`setup requires --${k.replace(/[A-Z]/g, x => '-' + x.toLowerCase())}`);
  if (opts.ownerTimezone === 'unconfigured') fail('Owner timezone must be configured before setup');
  try { new Intl.DateTimeFormat('en', { timeZone: opts.ownerTimezone }); } catch { fail('Invalid IANA owner timezone'); }
  const script = realpathSync(resolve(opts.starterScript));
  const python = realpathSync(resolve(opts.python)); // caller supplies a real interpreter, not an ambient shim
  const vault = resolve(opts.vault), home = resolve(opts.home ?? homedir());
  const run = args => {
    const r = spawnSync(python, args, { env: sanitizedEnv({ HOME: home }), encoding: 'utf8', timeout: 55_000 });
    if (r.status !== 0) fail(`Starter command failed (${r.status ?? r.signal}): ${(r.stderr || r.stdout || r.error?.message || '').trim()}`, r.status === 3 ? 3 : 2);
    return r.stdout;
  };
  const version = run(['-c', 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"']);
  void version;
  const artifact = readJson(join(resolve(opts.starterArtifact), 'starter-artifact.json'));
  if (artifact.contract !== 'exo-mac-starter/0') fail('Unknown starter artifact contract');
  const apply = [script, 'apply', '--artifact', resolve(opts.starterArtifact), '--vault', vault, '--owner-timezone', opts.ownerTimezone];
  if (opts.ownerName) apply.push('--owner-name', opts.ownerName);
  run(apply);
  const verification = run([script, 'verify', '--vault', vault]);
  let report; try { report = JSON.parse(verification); } catch { fail('Starter verify did not return JSON'); }
  if (report.ok !== true) fail('Starter verification is not complete; product was not installed');
  const prefix = resolve(opts.prefix ?? defaultPaths(home).prefix);
  if (existsSync(join(prefix, 'install.json'))) {
    const r = readReceipt(prefix);
    if (r.paths.vault !== vault) fail('Existing release is bound to a different vault');
    return { action: 'setup', installed: false, detail: 'Starter verified; existing installation kept. Use models to fill missing roles, doctor to check, or update for a new artifact.' };
  }
  return { action: 'setup', starterVerified: true, release: install({ ...opts, home, vault }) };
}

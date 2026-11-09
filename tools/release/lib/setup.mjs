// Single explicit entry: starter apply -> starter verify -> release install.
// Paths are supplied, never discovered from a developer checkout. No dependency installs.
import { spawnSync } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { install, readReceipt, defaultPaths, FULL_ACCESS_NOTICE } from './lifecycle.mjs';
import { fail, readJson, sanitizedEnv } from './util.mjs';

export function setup(opts) {
  if (!opts.acceptFullAccess) fail(FULL_ACCESS_NOTICE, 3);
  for (const k of ['starterScript', 'starterArtifact', 'python', 'vault', 'artifact', 'ownerTimezone'])
    if (!opts[k]) fail(`setup requires --${k.replace(/[A-Z]/g, x => '-' + x.toLowerCase())}`);
  if (opts.ownerTimezone === 'unconfigured') fail('Owner timezone must be configured before setup');
  try { new Intl.DateTimeFormat('en', { timeZone: opts.ownerTimezone }); } catch { fail('Invalid IANA owner timezone'); }
  const script = realpathSync(resolve(opts.starterScript));
  const python = resolve(opts.python);
  if (!existsSync(python) || python.split('/').includes('shims')) fail('Supply an existing real Python interpreter, not a version-manager shim'); // caller supplies a real interpreter, not an ambient shim
  const node = realpathSync(resolve(opts.node ?? process.execPath));
  const path = [dirname(node), dirname(python), ...(process.env.PATH ?? '').split(':').filter(p => p && !p.endsWith('/mise/shims')), '/usr/bin', '/bin'].filter((v, i, a) => a.indexOf(v) === i).join(':');
  const vault = resolve(opts.vault), home = resolve(opts.home ?? homedir());
  const run = args => {
    const r = spawnSync(python, args, { env: sanitizedEnv({ HOME: home, PATH: path }), encoding: 'utf8', timeout: 55_000 });
    if (r.status !== 0) fail(`Starter command failed (${r.status ?? r.signal}): ${(r.stderr || r.stdout || r.error?.message || '').trim()}`, r.status === 3 ? 3 : 2);
    return r.stdout;
  };
  const version = run(['-c', 'import sys; assert sys.version_info >= (3,9), "Python 3.9+ required"']);
  void version;
  const artifact = readJson(join(resolve(opts.starterArtifact), 'starter-artifact.json'));
  if (artifact.contract !== 'exo-mac-starter/0') fail('Unknown starter artifact contract');
  const apply = [script, 'apply', '--artifact', resolve(opts.starterArtifact), '--vault', vault, '--owner-timezone', opts.ownerTimezone];
  if (opts.ownerName) apply.push('--owner-name', opts.ownerName);
  const receiptFile = join(vault, '.exo', 'starter-receipt.json');
  if (existsSync(receiptFile)) {
    const prior = readJson(receiptFile);
    if (prior.contract !== artifact.contract || prior.starter_version !== artifact.starter_version || prior.source?.commit !== artifact.source?.commit || prior.bindings?.owner_timezone !== opts.ownerTimezone || (opts.ownerName && prior.bindings?.owner_name !== opts.ownerName)) fail('Existing starter receipt does not match this setup; nothing overwritten', 3);
  } else run(apply);
  const verifyArgs = [script, 'verify', '--vault', vault, '--node', node];
  if (opts.validatorPython) verifyArgs.push('--validator-python', resolve(opts.validatorPython));
  const verification = run(verifyArgs);
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

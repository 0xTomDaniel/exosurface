// doctor / preflight: read-only checks with honest statuses.
//   ok | warn | fail | unsupported (cannot be checked from here) | skip (not applicable yet)
// Doctor never installs anything, never writes, never executes a tool that might trigger a
// macOS install prompt, and only queries launchd when --query-launchd is passed.
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { resolveArtifact, selftest, verifyArtifact } from './artifact.mjs';
import { defaultPaths, MODEL_ROLES, readReceipt, stateSchema } from './lifecycle.mjs';
import { compareVersions, sanitizedEnv, isExecutable, isWritable, minimumOf, readJson, satisfies, which } from './util.mjs';

const VERSION_MANAGERS = /\/(\.local\/share\/mise|\.nvm|\.asdf|\.fnm|\.volta|\.local\/state\/fnm_multishells)\//;

function run(cmd, args) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', timeout: 10_000, env: sanitizedEnv() });
  return r.status === 0 ? r.stdout.trim() : undefined;
}
function packageJsonAbove(file, name) {
  let dir = dirname(file);
  for (let i = 0; i < 8; i++) {
    const p = join(dir, 'package.json');
    if (existsSync(p)) { try { const j = readJson(p); if (!name || j.name === name) return j; } catch {} }
    const up = dirname(dir); if (up === dir) break; dir = up;
  }
  return undefined;
}

export function doctor(opts = {}) {
  const env = opts.env ?? process.env;
  const home = resolve(opts.home ?? homedir());
  const checks = [];
  const add = (id, status, detail, fix) => checks.push({ id, status, detail, ...(fix ? { fix } : {}) });
  const platform = opts.platform ?? process.platform;

  // ---- what are we checking against? -------------------------------------------------------
  const d = defaultPaths(home);
  const prefix = resolve(opts.prefix ?? d.prefix);
  let receipt, manifest, cleanup = () => {};
  if (existsSync(join(prefix, 'install.json'))) {
    try { receipt = readReceipt(prefix); } catch (e) { add('install', 'fail', e.message); }
  }
  try {
    if (opts.artifact) { const r = resolveArtifact(opts.artifact); cleanup = r.cleanup; manifest = verifyArtifact(r.dir); add('artifact', 'ok', `${manifest.id} ${manifest.version} verified (${manifest.files.length} files)`); opts.artifactDir = r.dir; }
    else if (receipt) {
      const dir = join(prefix, 'releases', receipt.current);
      try { manifest = verifyArtifact(dir); add('install', 'ok', `${receipt.id} ${receipt.current} at ${prefix}; release files match manifest`); opts.artifactDir = dir; }
      catch (e) { add('install', 'fail', e.message, 'Reinstall that version; a release directory must never be edited'); }
      const link = join(prefix, 'current');
      let target; try { target = lstatSync(link).isSymbolicLink() && realpathSync(link); } catch {}
      if (target !== join(prefix, 'releases', receipt.current)) add('current-link', 'fail', `${link} does not point at releases/${receipt.current}`, 'Rerun update or rollback to repair the link');
    } else add('install', 'skip', `no installation at ${prefix}; pass --artifact for a preflight`);
  } catch (e) { add('artifact', 'fail', e.message); }

  const paths = { ...d, ...(receipt?.paths ?? {}), ...Object.fromEntries(Object.entries({ vault: opts.vault, stateDir: opts.stateDir, config: opts.config }).filter(([, v]) => v).map(([k, v]) => [k, resolve(v)])) };
  const contract = manifest?.contract;

  try {
    // ---- platform -------------------------------------------------------------------------
    if (platform !== 'darwin') add('platform', 'fail', `${platform} is unsupported; this release targets macOS (launchd, BB.app)`);
    else add('platform', 'ok', `macOS ${run('sw_vers', ['-productVersion']) ?? '(version unknown)'} ${process.arch}`);

    // ---- node ------------------------------------------------------------------------------
    const nodePath = resolve(opts.node ?? receipt?.paths.node ?? process.execPath);
    if (!isExecutable(nodePath)) add('node', 'fail', `${nodePath} is missing or not executable`, receipt ? 'Rerun install/update with --node <stable node path> to regenerate the launchd job' : 'Install Node yourself (this tool installs nothing)');
    else {
      const v = run(nodePath, ['--version'])?.replace(/^v/, '');
      const min = minimumOf(contract?.requires.node ?? '>=22.19.0');
      if (!v) add('node', 'fail', `${nodePath} did not report a version`);
      else if (compareVersions(v, min) < 0) add('node', 'fail', `Node ${v} at ${nodePath} is below ${min}`, `Install Node ${min}+ and pass --node`);
      else if (VERSION_MANAGERS.test(nodePath)) add('node', 'warn', `Node ${v} at ${nodePath} belongs to a version manager; an upgrade or prune can delete it and stop the owner`, 'Prefer a Node that is not pruned on upgrade, or rerun update with --node after upgrading');
      else add('node', 'ok', `Node ${v} at ${nodePath}`);
    }

    // ---- tools (presence on PATH; never executed, except python3 version when safe) -------
    const pathValue = env.PATH ?? '';
    const declaredTools = contract?.requires.tools ?? { required: ['git'], recommended: ['gh'] };
    const tools = { required: [...new Set([...(declaredTools.required ?? []), 'uv'])], recommended: (declaredTools.recommended ?? []).filter(t => t !== 'uv') };
    for (const [list, missingStatus] of [[tools.required ?? [], 'fail'], [tools.recommended ?? [], 'warn']]) for (const t of list) {
      if (t === 'python3') continue;
      const p = which(t, pathValue);
      add(`tool:${t}`, p ? 'ok' : missingStatus, p ? p : `${t} not found on PATH`, p ? undefined : `Install ${t} yourself; the launchd job's PATH is built from where tools are found at install time`);
    }
    // python3 >= 3.9 is needed by the starter's apply/verify. /usr/bin/python3 on a Mac without
    // Command Line Tools is a stub that opens an install dialog, so it is not executed then.
    const py = opts.python ?? which('python3', pathValue);
    if (!py) add('tool:python3', 'fail', 'python3 not found on PATH (the starter needs Python 3.9+)', 'Install Python 3.9+ (e.g. Xcode Command Line Tools) yourself');
    else if (py === '/usr/bin/python3' && run('/usr/bin/xcode-select', ['-p']) === undefined) add('tool:python3', 'fail', '/usr/bin/python3 is the Command Line Tools stub; not run because it would open an installer', 'Install the Command Line Tools (xcode-select --install) or another Python 3.9+');
    else {
      const v = run(py, ['-c', 'import sys;print("%d.%d.%d"%sys.version_info[:3])']);
      add('tool:python3', v && compareVersions(v, '3.9.0') >= 0 ? 'ok' : 'fail', v ? `Python ${v} at ${py}` : `${py} did not run`, v && compareVersions(v, '3.9.0') >= 0 ? undefined : 'Install Python 3.9+');
    }

    add('metadata-validator-runtime', 'unsupported', 'Starter stage/apply needs Python >=3.9; the metadata validator separately needs Python >=3.11 plus PyYAML or a usable uv environment/cache. Presence of uv alone does not prove this.', 'Run starter verify on this Mac; unavailable verification is a failure');

    // ---- BB --------------------------------------------------------------------------------
    const bbApp = resolve(opts.bbApp ?? '/Applications/bb.app');
    const info = join(bbApp, 'Contents', 'Info.plist');
    if (!existsSync(info)) add('bb-app', 'fail', `${bbApp} not found`, 'Install BB from getbb.app yourself');
    else {
      const v = run('/usr/bin/plutil', ['-extract', 'CFBundleShortVersionString', 'raw', '-o', '-', info]);
      const need = contract?.requires.bb;
      if (!v) add('bb-app', 'warn', `${bbApp} present; version unreadable`);
      else if (need && !satisfies(v, need)) add('bb-app', 'fail', `BB ${v} is older than ${need}`, 'Update BB');
      else add('bb-app', 'ok', `BB ${v}`);
    }
    add('bb-plugin-source', 'unsupported', `Whether BB has ${join(prefix, 'current', 'plugin')} registered as a plugin source is not checked: reading BB's database or settings is out of bounds`, 'In BB, add that folder as a local plugin source once');
    add('model-auth', 'unsupported', "The owner's own Pi login is not inspected; credential files are never read", 'Sign in through the first-run flow');

    // ---- config ----------------------------------------------------------------------------
    let config;
    if (!existsSync(paths.config)) add('config', receipt ? 'fail' : 'skip', `${paths.config} does not exist`);
    else {
      try { config = readJson(paths.config); } catch (e) { add('config', 'fail', `${paths.config} is not valid JSON: ${e.message}`); }
      if (config) {
        const problems = [];
        for (const k of ['vault', 'piCli', 'optchat']) if (!config[k]) problems.push(`${k} missing`); else if (!existsSync(config[k])) problems.push(`${k} → ${config[k]} does not exist`);
        add('config', problems.length ? 'fail' : 'ok', problems.length ? problems.join('; ') : paths.config, problems.length ? `Edit ${paths.config}` : undefined);
        const missing = MODEL_ROLES.filter(r => !['provider', 'model', 'thinking'].every(k => typeof config.models?.[r]?.[k] === 'string' && config.models[r][k]));
        add('models', missing.length ? 'fail' : 'ok', missing.length ? `models.${missing.join(', models.')} missing; nothing is chosen for you` : MODEL_ROLES.map(r => `${r}=${config.models[r].provider}/${config.models[r].model}`).join(' '),
          missing.length ? 'exo-release models --models <file> fills only the missing roles' : undefined);
      }
    }

    // ---- pins ------------------------------------------------------------------------------
    for (const [name, pin] of Object.entries(contract?.pins ?? {})) {
      const where = name === 'pi' ? config?.piCli : name === 'optchat' ? config?.optchat : undefined;
      if (!where) { add(`pin:${name}`, 'skip', `no configured path for ${name}`); continue; }
      if (!existsSync(where)) { add(`pin:${name}`, 'fail', `${where} does not exist`); continue; }
      if (pin.npm) {
        const pj = packageJsonAbove(realpathSync(where), pin.npm);
        add(`pin:${name}`, pj?.version === pin.version ? 'ok' : 'fail', pj ? `${pin.npm} ${pj.version} (pinned ${pin.version})` : `no ${pin.npm} package.json above ${where}`, pj?.version === pin.version ? undefined : `Install ${pin.npm}@${pin.version} yourself and point piCli at it`);
      } else if (pin.git) {
        const git = which('git', env.PATH ?? '');
        const head = git ? run(git, ['-C', where, 'rev-parse', 'HEAD']) : undefined;
        add(`pin:${name}`, head === pin.commit ? 'ok' : 'fail', head ? `${where} at ${head.slice(0, 12)} (pinned ${pin.tag ?? ''} ${pin.commit.slice(0, 12)})` : `${where} is not a git checkout`, head === pin.commit ? undefined : `git -C ${where} checkout ${pin.commit}`);
      }
    }

    // ---- vault + starter -------------------------------------------------------------------
    const vault = paths.vault ?? config?.vault;
    if (!vault) add('vault', 'skip', 'no vault given (pass --vault for a preflight)');
    else if (!existsSync(vault) || !statSync(vault).isDirectory()) add('vault', 'fail', `${vault} does not exist`, 'Create it with the starter (exo-release setup)');
    else {
      add('vault', isWritable(vault) ? 'ok' : 'fail', vault);
      const receiptFile = join(vault, '.exo', 'starter-receipt.json');
      if (!existsSync(receiptFile)) add('starter', 'fail', `${vault} has no starter receipt; it was not created by the starter, so skills/bindings are unverified`);
      else {
        let sr; try { sr = readJson(receiptFile); } catch {}
        add('starter', sr ? 'ok' : 'fail', sr ? `starter receipt ${sr.contract ?? ''} ${sr.source?.commit?.slice?.(0, 12) ?? ''}`.trim() : `${receiptFile} unreadable`);
        // Provisional field names from the starter lane (98b80a89); accept either spelling.
        let tz;
        try { tz = /^owner_timezone:\s*"?([^"\n]*)"?\s*$/m.exec(readFileSync(join(vault, 'Exo', 'Owner.md'), 'utf8'))?.[1]?.trim(); } catch {}
        let validTimezone = false;
        try { if (tz && tz !== 'unconfigured') { new Intl.DateTimeFormat('en', { timeZone: tz }); validTimezone = true; } } catch {}
        if (!validTimezone) add('owner-timezone', 'fail', 'owner timezone is unconfigured; dated planning and automation would guess', 'Re-apply the starter with --owner-timezone <IANA zone>, e.g. America/Denver');
        else add('owner-timezone', 'ok', tz);
      }
    }

    // ---- state -----------------------------------------------------------------------------
    const s = stateSchema(paths.stateDir);
    if (s.kind === 'absent') add('state', 'ok', `${paths.stateDir} empty; first run will create it`);
    else if (s.kind === 'unknown') add('state', 'fail', `${paths.stateDir} has files but no readable state-schema.json`, 'Use a dedicated, empty state directory');
    else if (contract && !contract.stateSchema.reads.includes(s.schema)) add('state', 'fail', `state schema ${s.schema}; this release reads ${contract.stateSchema.reads.join(', ')}`);
    else add('state', 'ok', `state schema ${s.schema}`);
    const ownerState = join(paths.stateDir, 'owner', 'state.json');
    if (existsSync(ownerState)) { try { const o = readJson(ownerState); add('owner', o.ready ? 'ok' : 'warn', o.ready ? `ready (pid ${o.ownerPid ?? '?'})` : `not ready${o.error ? `: ${o.error}` : ''}`, o.error === 'awaiting-first-run' ? 'Open Exosurface in BB and finish first run' : undefined); } catch { add('owner', 'warn', `${ownerState} unreadable`); } }

    // ---- launchd ---------------------------------------------------------------------------
    if (receipt?.plist) {
      const p = receipt.plist.path;
      if (!existsSync(p)) add('launchd-plist', 'fail', `${p} missing`, 'Rerun update to regenerate it');
      else {
        const lint = spawnSync('/usr/bin/plutil', ['-lint', p], { encoding: 'utf8', env: sanitizedEnv() });
        let program; try { program = JSON.parse(run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', p]) ?? 'null'); } catch {}
        const args = program?.ProgramArguments ?? [];
        const problems = [];
        if (lint.status !== 0) problems.push('plutil -lint failed');
        if (program?.Label !== contract?.owner.launchdLabel) problems.push(`label ${program?.Label} ≠ release ${contract?.owner.launchdLabel}`);
        if (!isExecutable(args[0] ?? '')) problems.push(`${args[0]} not executable`);
        if (!existsSync(args.at(-1) ?? '')) problems.push(`${args.at(-1)} missing`);
        if (!program?.StandardErrorPath || program.StandardErrorPath === '/dev/null') problems.push('no error log');
        add('launchd-plist', problems.length ? 'fail' : 'ok', problems.length ? problems.join('; ') : `${p}; logs in ${dirname(program.StandardErrorPath)}`);
      }
      if (opts.queryLaunchd) {
        const uid = process.getuid?.();
        const out = spawnSync(opts.launchctl ?? '/bin/launchctl', ['print', `gui/${uid}/${receipt.plist.label}`], { encoding: 'utf8', env: sanitizedEnv() });
        add('launchd-loaded', out.status === 0 ? 'ok' : 'warn', out.status === 0 ? (/state = (\w+)/.exec(out.stdout)?.[1] ?? 'loaded') : 'not loaded', out.status === 0 ? undefined : `launchctl bootstrap gui/${uid} ${JSON.stringify(receipt.plist.path)}`);
      } else add('launchd-loaded', 'unsupported', 'not queried (pass --query-launchd to ask launchd, read-only)');
    }

    // The owner exposes a read-only protocol; no credentials are inspected and no provider is called.
    if (opts.artifactDir && manifest && config) {
      const owner = manifest.contract.owner;
      const result = spawnSync(nodePath, [...(owner.nodeArgs ?? []), join(opts.artifactDir, manifest.owner.entry), '--readiness'], {
        encoding: 'utf8', timeout: 10_000,
        env: sanitizedEnv({ HOME: home, EXO_CONFIG: paths.config, EXO_STATE_DIR: paths.stateDir,
          EXO_RELEASE_ROOT: opts.artifactDir, EXO_RELEASE: opts.artifactDir }),
      });
      let readiness;
      try { readiness = JSON.parse(result.stdout); } catch {}
      if (readiness?.schema !== 'exosurface-readiness/0') add('owner-readiness', 'fail', 'Owner did not return supported readiness protocol');
      else {
        add('owner-config', readiness.config?.ready ? 'ok' : 'fail', (readiness.config?.codes ?? []).join(', ') || 'configuration accepted');
        add('fresh-owner-auth', readiness.authentication?.status === 'verified' ? 'ok' : 'unsupported', readiness.authentication?.reason ?? 'fresh-owner authentication unverified', 'Complete the own-account login flow and a separately authorized connectivity test; this doctor never calls providers');
        add('owner-connectivity', readiness.connectivity?.status === 'verified' ? 'ok' : 'unsupported', readiness.connectivity?.reason ?? 'connectivity unverified');
        add('owner-runtime', readiness.runtime?.ready ? 'ok' : 'warn', readiness.runtime?.ready ? 'ready' : 'first-run/runtime not ready');
        if (result.status === 1) add('owner-readiness-schema', 'fail', 'Owner rejected the state schema');
      }
    }

    // ---- executes on this Node ---------------------------------------------------------------
    if (opts.artifactDir && manifest) {
      const r = selftest(opts.artifactDir, nodePath);
      add('owner-selftest', r.status === 'ok' ? 'ok' : r.status === 'unverified' ? 'warn' : 'fail', `${r.version ? `Node ${r.version}: ` : ''}${r.detail}`);
    }
  } finally { cleanup(); }

  const failed = checks.filter(c => c.status === 'fail').length;
  return { ok: failed === 0, ready: failed === 0 && !checks.some(c => c.status === 'unsupported' || c.status === 'warn'), failed, checks };
}

export function formatDoctor(result) {
  const w = Math.max(...result.checks.map(c => c.id.length));
  return result.checks.map(c => `${c.status.padEnd(11)} ${c.id.padEnd(w)}  ${c.detail}${c.fix ? `\n${' '.repeat(13 + w)}→ ${c.fix}` : ''}`).join('\n') +
    `\n\n${result.ok ? 'No failing checks.' : `${result.failed} failing check(s).`} "unsupported" means this tool cannot check it, not that it passed.\n`;
}

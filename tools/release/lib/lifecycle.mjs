// Install, update, rollback and uninstall of immutable releases under one prefix.
//
//   <prefix>/releases/<version>/   read-only copy of a verified artifact
//   <prefix>/current -> releases/<version>   (relative symlink, swapped atomically)
//   <prefix>/install.json          receipt: paths, activation history, files this tool wrote
//
// This tool never runs launchctl, never edits BB, and never deletes the vault, state
// (OptChat history) or logs. Service control is printed for the person to run.
import { copyFileSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, readlinkSync, renameSync, rmSync, symlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { resolveArtifact, verifyArtifact } from './artifact.mjs';
import { compareVersions, fail, isExecutable, isExactVersion, readJson, removeTree, setReadOnly, sha256, sha256File, walk, which, withLock, writeFileAtomic, writeJsonAtomic, toPlist } from './util.mjs';

export const RECEIPT_FORMAT = 'exosurface-install/0';
export const MODEL_ROLES = ['main', 'compactor', 'subagent'];

export function defaultPaths(home = homedir()) {
  return {
    prefix: join(home, 'Library', 'Application Support', 'Exosurface'),
    stateDir: join(home, '.exosurface'),
    config: join(home, '.config', 'exosurface', 'config.json'),
    launchAgentsDir: join(home, 'Library', 'LaunchAgents'),
    logsDir: join(home, 'Library', 'Logs', 'Exosurface'),
  };
}
const receiptFile = prefix => join(prefix, 'install.json');
export function readReceipt(prefix) {
  const file = receiptFile(resolve(prefix));
  if (!existsSync(file)) fail(`No installation at ${resolve(prefix)} (missing install.json)`);
  const r = readJson(file);
  if (r.format !== RECEIPT_FORMAT) fail(`${file} has unknown format ${r.format}`);
  return r;
}

// ---- state schema ---------------------------------------------------------------------------
/** absent: no state yet; unknown: state exists without a readable marker; known: schema N. */
export function stateSchema(stateDir) {
  if (!existsSync(stateDir) || readdirSync(stateDir).filter(n => n !== '.DS_Store').length === 0) return { kind: 'absent' };
  const marker = join(stateDir, 'state-schema.json');
  try { const n = readJson(marker).schema; if (Number.isInteger(n)) return { kind: 'known', schema: n }; } catch {}
  return { kind: 'unknown' };
}
export function checkStateCompatible(stateDir, contract, action) {
  const s = stateSchema(stateDir), reads = contract.stateSchema.reads;
  if (s.kind === 'absent') return s;
  if (s.kind === 'unknown') fail(`Refusing ${action}: ${stateDir} holds state without a readable state-schema.json, so compatibility cannot be shown. Point --state-dir at an Exosurface state directory (or an empty one); nothing was changed.`, 4);
  if (!reads.includes(s.schema)) fail(`Refusing ${action}: state at ${stateDir} is schema ${s.schema}, but ${contract.id} reads only schema ${reads.join(', ')}. ` +
    `There is no automatic downgrade or migration here. Stay on a release that reads schema ${s.schema}, or restore a state backup taken before that schema was written. Nothing was changed.`, 4);
  return s;
}

// ---- config ---------------------------------------------------------------------------------
export function readModels(file) {
  if (!file) return undefined;
  const raw = readJson(resolve(file));
  const models = raw.models ?? raw;
  const errors = [];
  for (const role of Object.keys(models)) if (!MODEL_ROLES.includes(role)) errors.push(`unknown role "${role}"`);
  for (const role of MODEL_ROLES) {
    const m = models[role];
    if (m === undefined) continue;
    for (const k of ['provider', 'model', 'thinking']) if (typeof m?.[k] !== 'string' || !m[k].trim()) errors.push(`models.${role}.${k} must be a non-empty string`);
    for (const k of Object.keys(m ?? {})) if (!['provider', 'model', 'thinking'].includes(k)) errors.push(`models.${role}.${k} is not allowed (credentials and endpoints belong to the owner's own Pi login, not this file)`);
  }
  if (errors.length) fail(`Invalid --models file:\n  - ${errors.join('\n  - ')}`);
  return models;
}
/**
 * Create the config if absent; otherwise only fill model roles that are missing. Existing values
 * (including model selections) are never overwritten. Returns what happened, for the receipt.
 */
export function writeConfig(file, base, models) {
  if (!existsSync(file)) {
    const value = { ...base, ...(models && Object.keys(models).length ? { models } : {}) };
    writeJsonAtomic(file, value, 0o600);
    return { created: true, filled: Object.keys(models ?? {}), kept: [], sha256: sha256File(file) };
  }
  const before = sha256File(file);
  const current = readJson(file);
  const have = current.models ?? {};
  const filled = [], kept = [];
  for (const role of Object.keys(models ?? {})) (have[role] === undefined ? filled : kept).push(role);
  if (filled.length) {
    const next = { ...current, models: { ...have, ...Object.fromEntries(filled.map(r => [r, models[r]])) } };
    writeJsonAtomic(file, next, 0o600);
  }
  return { created: false, filled, kept, before, sha256: sha256File(file) };
}
export const missingModels = file => { try { const m = readJson(file).models ?? {}; return MODEL_ROLES.filter(r => !m[r]); } catch { return MODEL_ROLES; } };

// ---- launchd --------------------------------------------------------------------------------
/** PATH for the service: directories of resolved tools first, then system dirs. No dotfiles involved. */
export function servicePath(nodePath, tools, pathValue = process.env.PATH) {
  const dirs = [dirname(nodePath)];
  for (const t of tools) { const p = which(t, pathValue); if (p) dirs.push(dirname(p)); }
  dirs.push('/usr/bin', '/bin', '/usr/sbin', '/sbin');
  return [...new Set(dirs)].join(':');
}
export function launchdPlist({ label, nodePath, nodeArgs, entry, home, path, config, stateDir, prefix, logsDir }) {
  return toPlist({
    Label: label,
    ProgramArguments: [nodePath, ...nodeArgs, entry],
    WorkingDirectory: stateDir,
    EnvironmentVariables: { HOME: home, PATH: path, EXO_CONFIG: config, EXO_STATE_DIR: stateDir, EXO_RELEASE_ROOT: join(prefix, 'current'), EXO_RELEASE: join(prefix, 'current') },
    RunAtLoad: true,
    // Exit 0 (e.g. awaiting first run) stays down until the plugin kickstarts; crashes restart.
    KeepAlive: { SuccessfulExit: false },
    ThrottleInterval: 10,
    ProcessType: 'Interactive',
    StandardOutPath: join(logsDir, 'owner.out.log'),
    StandardErrorPath: join(logsDir, 'owner.err.log'),
  });
}
const launchctlHints = (label, plist) => {
  const uid = process.getuid?.() ?? '$(id -u)';
  return { load: `launchctl bootstrap gui/${uid} ${JSON.stringify(plist)}`, restart: `launchctl kickstart -k gui/${uid}/${label}`, unload: `launchctl bootout gui/${uid}/${label}` };
};

// ---- path safety ----------------------------------------------------------------------------
const inside = (child, parent) => { const r = relative(parent, child); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };
function checkLayout(p) {
  for (const k of ['prefix', 'stateDir', 'config', 'launchAgentsDir', 'logsDir', 'vault']) if (p[k] && !isAbsolute(p[k])) fail(`${k} must be absolute`);
  const home = p.home;
  if (inside(p.config, p.prefix) || inside(p.launchAgentsDir, p.prefix)) fail('Config and launchAgentsDir must be outside the release prefix');
  if (p.prefix === '/' || p.prefix === home) fail(`Refusing prefix ${p.prefix}: it must be a dedicated directory`);
  for (const k of ['vault', 'stateDir', 'logsDir']) if (p[k] && (inside(p[k], p.prefix) || inside(p.prefix, p[k]))) fail(`Refusing: ${k} (${p[k]}) and prefix (${p.prefix}) overlap; uninstall must be able to remove the prefix without touching ${k}`);
  if (p.vault && (inside(p.stateDir, p.vault) || inside(p.vault, p.stateDir))) fail('Refusing: vault and stateDir overlap');
}

// ---- activation -----------------------------------------------------------------------------
function copyRelease(artifactDir, prefix, manifest) {
  const dest = join(prefix, 'releases', manifest.version);
  if (existsSync(dest)) {
    const have = verifyArtifact(dest);
    if (sha256(JSON.stringify(have.files)) !== sha256(JSON.stringify(manifest.files))) fail(`${dest} exists with different content; release versions are immutable. Bump the version.`);
    return dest; // identical: idempotent
  }
  const staging = join(prefix, 'releases', `.${manifest.version}.${process.pid}`);
  removeTree(staging);
  for (const e of walk(artifactDir)) {
    const to = join(staging, e.rel);
    if (e.kind === 'dir') mkdirSync(to, { recursive: true });
    else if (e.kind === 'file') { mkdirSync(dirname(to), { recursive: true }); copyFileSync(e.abs, to); }
    else fail(`${e.rel}: unexpected ${e.kind} in artifact`);
  }
  setReadOnly(staging);
  verifyArtifact(staging);
  renameSync(staging, dest);
  return dest;
}
function pointCurrent(prefix, version) {
  const link = join(prefix, 'current'), tmp = `${link}.${process.pid}.tmp`;
  rmSync(tmp, { force: true });
  symlinkSync(join('releases', version), tmp);
  renameSync(tmp, link); // atomic replace; a running owner keeps the files it already resolved
}
export function currentVersion(prefix) {
  const link = join(prefix, 'current');
  if (!existsSync(link) || !lstatSync(link).isSymbolicLink()) return undefined;
  return readlinkSync(link).split(sep).at(-1);
}

function writePlist(receipt, manifest) {
  const { paths } = receipt;
  const label = manifest.contract.owner.launchdLabel;
  const plistFile = join(paths.launchAgentsDir, `${label}.plist`);
  const text = launchdPlist({ label, nodePath: paths.node, nodeArgs: manifest.contract.owner.nodeArgs ?? [], entry: join(paths.prefix, 'current', manifest.owner.entry),
    home: paths.home, path: paths.servicePath, config: paths.config, stateDir: paths.stateDir, prefix: paths.prefix, logsDir: paths.logsDir });
  const previous = receipt.plist;
  if (existsSync(plistFile) && (!previous || previous.path !== plistFile || sha256File(plistFile) !== previous.sha256))
    fail(`Refusing to overwrite ${plistFile}: it was not written by this installer (or was edited). Move it aside deliberately.`);
  const changed = !existsSync(plistFile) || readFileSync(plistFile, 'utf8') !== text;
  mkdirSync(paths.logsDir, { recursive: true, mode: 0o700 }); // launchd does not create log directories
  if (changed) writeFileAtomic(plistFile, text, 0o644);
  const stalePlist = previous && previous.path !== plistFile ? previous : undefined;
  if (stalePlist) (receipt.retiredPlists ??= []).push(stalePlist);
  receipt.plist = { path: plistFile, label, sha256: sha256File(plistFile) };
  return { plistFile, changed, label, stalePlist };
}

export const FULL_ACCESS_NOTICE = 'Exo and its skills run with your macOS user permissions: they can read and write files, execute commands and use your authenticated tools. This is not a sandbox. Review the trusted artifact, then explicitly pass --accept-full-access to continue. No installation files were written.';
export function install(opts) {
  if (!opts.acceptFullAccess) fail(FULL_ACCESS_NOTICE, 3);
  const home = resolve(opts.home ?? homedir());
  const d = defaultPaths(home);
  const paths = {
    home, prefix: resolve(opts.prefix ?? d.prefix), stateDir: resolve(opts.stateDir ?? d.stateDir), config: resolve(opts.config ?? d.config),
    launchAgentsDir: resolve(opts.launchAgentsDir ?? d.launchAgentsDir), logsDir: resolve(opts.logsDir ?? d.logsDir),
    vault: opts.vault ? resolve(opts.vault) : undefined, node: resolve(opts.node ?? process.execPath),
  };
  if (!paths.vault) fail('--vault is required (create it first with the starter; the installer never seeds a vault)');
  if (!existsSync(paths.vault) || !lstatSync(paths.vault).isDirectory()) fail(`Vault ${paths.vault} does not exist. Run the starter first (exo-release setup does both).`);
  checkLayout(paths);
  if (!isExecutable(paths.node)) fail('Node executable is unavailable; pass --node with an absolute executable');
  if (existsSync(paths.prefix) && lstatSync(paths.prefix).isSymbolicLink()) fail('Release prefix must not be a symlink');
  if (existsSync(paths.config)) {
    const existing = readJson(paths.config);
    for (const key of ['vault', 'stateDir']) if (existing[key] && resolve(existing[key]) !== paths[key]) fail(`Existing config ${key} differs; use explicit matching paths or a separate config (nothing overwritten)`);
  }
  if (existsSync(receiptFile(paths.prefix))) fail(`${paths.prefix} already has an installation; use update.`);
  const models = readModels(opts.models);
  const { dir, cleanup } = resolveArtifact(opts.artifact, join(paths.prefix, '.scratch'));
  try {
    const manifest = verifyArtifact(dir);
    checkStateCompatible(paths.stateDir, manifest.contract, 'install');
    const tools = [...(manifest.contract.requires.tools?.required ?? []), ...(manifest.contract.requires.tools?.recommended ?? [])];
    paths.servicePath = servicePath(paths.node, tools, opts.pathValue);
    return withLock(paths.prefix, () => {
      copyRelease(dir, paths.prefix, manifest);
      pointCurrent(paths.prefix, manifest.version);
      const receipt = { format: RECEIPT_FORMAT, id: manifest.id, paths, current: manifest.version, history: [{ version: manifest.version, at: new Date().toISOString(), action: 'install' }] };
      const pluginDir = join(paths.prefix, 'current', 'plugin');
      const base = { vault: paths.vault, stateDir: paths.stateDir, exosurfacePlugin: pluginDir, node: paths.node, ...(opts.piCli ? { piCli: resolve(opts.piCli) } : {}), ...(opts.optchat ? { optchat: resolve(opts.optchat) } : {}) };
      const config = writeConfig(paths.config, base, models);
      receipt.config = { path: paths.config, createdByInstaller: config.created, sha256: config.sha256 };
      const plist = writePlist(receipt, manifest);
      writeJsonAtomic(receiptFile(paths.prefix), receipt);
      return { action: 'install', version: manifest.version, receipt, config, plist, pluginDir, missingModels: missingModels(paths.config), commands: launchctlHints(plist.label, plist.plistFile) };
    });
  } finally { cleanup(); removeTree(join(paths.prefix, '.scratch')); }
}

export function update(opts) {
  const prefix = resolve(opts.prefix ?? defaultPaths(opts.home).prefix);
  const receipt = readReceipt(prefix);
  const models = readModels(opts.models);
  const { dir, cleanup } = resolveArtifact(opts.artifact, join(prefix, '.scratch'));
  try {
    const manifest = verifyArtifact(dir);
    if (manifest.id !== receipt.id) fail(`Artifact is ${manifest.id}, installation is ${receipt.id}`);
    const cmp = compareVersions(manifest.version, receipt.current);
    if (cmp === 0) fail(`${manifest.version} is already current`);
    if (cmp < 0) fail(`${manifest.version} is older than current ${receipt.current}; use rollback, which checks state compatibility`);
    checkStateCompatible(receipt.paths.stateDir, manifest.contract, 'update');
    return withLock(prefix, () => {
      copyRelease(dir, prefix, manifest);
      const plist = writePlist(receipt, manifest); // label/args may change between releases
      pointCurrent(prefix, manifest.version);
      const config = existsSync(receipt.paths.config) ? writeConfig(receipt.paths.config, {}, models) : { created: false, filled: [], kept: [] }; // never rewrites existing values
      syncConfigHash(receipt, config);
      receipt.previous = receipt.current; receipt.current = manifest.version;
      receipt.history.push({ version: manifest.version, at: new Date().toISOString(), action: 'update', from: receipt.previous });
      writeJsonAtomic(receiptFile(prefix), receipt);
      return { action: 'update', from: receipt.previous, version: manifest.version, plist, config, missingModels: missingModels(receipt.paths.config), commands: launchctlHints(plist.label, plist.plistFile) };
    });
  } finally { cleanup(); removeTree(join(prefix, '.scratch')); }
}

export function rollback(opts) {
  const prefix = resolve(opts.prefix ?? defaultPaths(opts.home).prefix);
  const receipt = readReceipt(prefix);
  const target = opts.to ?? receipt.previous;
  if (target && !isExactVersion(target)) fail('Invalid rollback version');
  if (!target) fail('No previous release recorded; pass --to <version>');
  if (target === receipt.current) fail(`${target} is already current`);
  const dir = join(prefix, 'releases', target);
  if (!existsSync(dir)) fail(`Release ${target} is not installed under ${prefix}/releases`);
  const manifest = verifyArtifact(dir);
  // The important refusal: an older release must be able to read the state the newer one wrote.
  const state = checkStateCompatible(receipt.paths.stateDir, manifest.contract, `rollback to ${target}`);
  return withLock(prefix, () => {
    const plist = writePlist(receipt, manifest);
    pointCurrent(prefix, target);
    const from = receipt.current;
    receipt.previous = from; receipt.current = target;
    receipt.history.push({ version: target, at: new Date().toISOString(), action: 'rollback', from });
    writeJsonAtomic(receiptFile(prefix), receipt);
    return { action: 'rollback', from, version: target, state, plist, note: 'Rollback switches code only. Vault notes and OptChat history written since are kept as-is.', commands: launchctlHints(plist.label, plist.plistFile) };
  });
}

const syncConfigHash = (receipt, result) => {
  if (receipt.config?.createdByInstaller && result.filled?.length && result.before === receipt.config.sha256) receipt.config.sha256 = result.sha256;
};
/** Recover from an install without models: fills only missing roles, never replaces a selection. */
export function setModels(opts) {
  const prefix = resolve(opts.prefix ?? defaultPaths(opts.home).prefix);
  const receipt = existsSync(receiptFile(prefix)) ? readReceipt(prefix) : undefined;
  const file = resolve(opts.config ?? receipt?.paths.config ?? defaultPaths(opts.home).config);
  if (!existsSync(file)) fail(`${file} does not exist; run install first`);
  const models = readModels(opts.models);
  if (!models) fail('--models <file> is required');
  const result = writeConfig(file, {}, models);
  if (receipt && receipt.paths.config === file) withLock(prefix, () => { syncConfigHash(receipt, result); writeJsonAtomic(receiptFile(prefix), receipt); });
  return { action: 'models', config: file, ...result, missingModels: missingModels(file) };
}

/**
 * Removes only what this installer wrote: the plist (if unchanged), the prefix (releases,
 * current, receipt) and the config (only if the installer created it and it is unchanged).
 * Vault, state/history and logs are always kept.
 */
export function uninstall(opts) {
  const prefix = resolve(opts.prefix ?? defaultPaths(opts.home).prefix);
  const receipt = readReceipt(prefix);
  const removed = [], kept = [];
  const p = receipt.plist;
  const unload = [p, ...(receipt.retiredPlists ?? [])].filter(Boolean).map(x => launchctlHints(x.label, x.path).unload);
  // Removing a release under a loaded KeepAlive job would leave launchd restarting a missing
  // entry. This tool cannot see launchd state without touching it, so the person confirms.
  if (!opts.serviceStopped) fail(`Stop the service first, then rerun with --service-stopped:\n  ${unload.join('\n  ')}`, 5);
  return withLock(prefix, () => {
    for (const x of [p, ...(receipt.retiredPlists ?? [])].filter(Boolean)) {
      if (!existsSync(x.path)) continue;
      if (sha256File(x.path) === x.sha256) { rmSync(x.path); removed.push(x.path); }
      else kept.push(`${x.path} (edited after install; remove it yourself)`);
    }
    const c = receipt.config;
    if (c?.createdByInstaller && existsSync(c.path) && !opts.keepConfig) {
      // Model roles filled later change the hash; anything else edited by a person is kept.
      if (sha256File(c.path) === c.sha256) { rmSync(c.path); removed.push(c.path); }
      else kept.push(`${c.path} (changed since install)`);
    } else if (c && existsSync(c.path)) kept.push(`${c.path} (${c.createdByInstaller ? '--keep-config' : 'existed before install'})`);
    kept.push(`${receipt.paths.vault} (vault)`, `${receipt.paths.stateDir} (state and history)`, `${receipt.paths.logsDir} (logs)`);
    return { removed, kept };
  }) && finishUninstall(prefix, removed, kept);
}
function finishUninstall(prefix, removed, kept) {
  // The lock file lives inside the prefix, so the prefix is removed after the lock is released.
  removeTree(prefix); removed.push(prefix);
  return { action: 'uninstall', removed, kept, commands: { bb: 'In BB, remove the Exosurface plugin source from its plugin settings (this tool never edits BB).' } };
}

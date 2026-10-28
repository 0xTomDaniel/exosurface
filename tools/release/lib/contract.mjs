// The package contract (release.json) and the static checks that prove a package can ship:
// allowlist + denylist, privacy scan, owner import graph (no node_modules at runtime),
// TypeScript entry parses on this Node, pins are exact and mutually compatible, and the
// launchd label the installer writes is the one the shipped client kickstarts.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, posix } from 'node:path';
import { builtinModules, stripTypeScriptTypes } from 'node:module';
import { compareVersions, fail, globToRegExp, isExactVersion, minimumOf, readJson, walk } from './util.mjs';

export const CONTRACT = 'exosurface-package/0';
export const ARTIFACT_FORMAT = 'exosurface-artifact/0';

// Files that must never ship, even when an allowlist glob matches them. Matching is an error,
// not a silent skip, so the package owner notices and fixes the allowlist or the tree.
const DENY_SEGMENTS = new Set(['node_modules', 'evidence', '.git', '__pycache__', 'bindings', 'profiles', 'pi-sessions', 'optchat']);
const DENY_NAMES = [/^auth\.json$/, /^mcp\.json$/, /^mcp-auth\.json$/, /^trust\.json$/, /^canonical-thread\.json$/, /^primary-thread\.json$/,
  /^main-model\.json$/, /^\.env/, /\.pem$/, /\.key$/, /\.p12$/, /^id_(rsa|ed25519|ecdsa)/, /\.sqlite3?$/, /\.db$/, /\.jsonl$/, /\.log$/, /\.review$/];
const SILENT_SKIP = [/(^|\/)\.DS_Store$/];
export function deniedReason(rel) {
  const parts = rel.split('/');
  const seg = parts.find(p => DENY_SEGMENTS.has(p) || p.endsWith('.review'));
  if (seg) return `path segment "${seg}"`;
  const name = parts.at(-1);
  const rule = DENY_NAMES.find(r => r.test(name));
  return rule ? `file name matches ${rule}` : undefined;
}

// Content patterns: personal paths, key material, common token shapes, plus a project list.
const BUILTIN_CONTENT_DENY = [
  { re: /\/Users\/(?!Shared\/)[A-Za-z0-9._-]+\//, why: 'absolute macOS home path' },
  { re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, why: 'private key material' },
  { re: /\bsk-ant-[A-Za-z0-9_-]{16,}/, why: 'Anthropic-style API key' },
  { re: /\bsk-[A-Za-z0-9]{32,}/, why: 'OpenAI-style API key' },
  { re: /\b(ghp|gho|ghs)_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}/, why: 'GitHub token' },
  { re: /\bxox[abpr]-[A-Za-z0-9-]{10,}/, why: 'Slack token' },
];
export function loadDenyPatterns(file) {
  if (!file || !existsSync(file)) return [];
  return readFileSync(file, 'utf8').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#')).map(line => {
    const m = /^\/(.*)\/([a-z]*)$/.exec(line);
    return { re: m ? new RegExp(m[1], m[2]) : new RegExp(line.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), why: `deny pattern ${line}` };
  });
}
export function scanContent(rel, buffer, extra = []) {
  if (buffer.length > 8 * 1024 * 1024 || buffer.includes(0)) return [];
  const text = buffer.toString('utf8'), problems = [];
  for (const { re, why } of [...BUILTIN_CONTENT_DENY, ...extra]) {
    const m = re.exec(text);
    if (m) {
      const line = text.slice(0, m.index).split('\n').length;
      problems.push(`${rel}:${line}: ${why} (${JSON.stringify(m[0].slice(0, 40))})`);
    }
  }
  return problems;
}

// ---- contract validation --------------------------------------------------------------------
// Minimum Node versions for flags an owner may need.
const NODE_FLAG_MIN = { '--experimental-transform-types': '22.7.0', '--experimental-strip-types': '22.6.0' };
const NODE_UNFLAGGED_TS = '22.18.0';

export function loadContract(packageDir) {
  const file = join(packageDir, 'release.json');
  if (!existsSync(file)) fail(`${file} is missing: a shippable package declares its release contract there (see docs/release/bundle-contract.md)`);
  return validateContract(readJson(file), packageDir);
}

export function validateContract(c, packageDir) {
  const errors = [];
  const need = (cond, msg) => { if (!cond) errors.push(msg); };
  need(c.contract === CONTRACT, `contract must be "${CONTRACT}"`);
  need(typeof c.id === 'string' && /^[a-z][a-z0-9-]{1,40}$/.test(c.id), 'id must be a lowercase slug');
  need(Array.isArray(c.files) && c.files.length > 0 && c.files.every(f => typeof f === 'string' && !f.startsWith('/') && !f.split('/').includes('..')), 'files must be a non-empty list of relative globs');
  const o = c.owner ?? {};
  need(typeof o.entry === 'string' && !o.entry.startsWith('/') && !o.entry.includes('..'), 'owner.entry must be a relative path');
  need(Array.isArray(o.nodeArgs ?? []) && (o.nodeArgs ?? []).every(a => typeof a === 'string' && a.startsWith('--')), 'owner.nodeArgs must be a list of --flags');
  need(typeof o.launchdLabel === 'string' && /^[A-Za-z0-9-]+(\.[A-Za-z0-9-]+){2,}$/.test(o.launchdLabel), 'owner.launchdLabel must be reverse-DNS, e.g. app.exosurface.owner');
  need(o.selftestArgs === undefined || (Array.isArray(o.selftestArgs) && o.selftestArgs.every(a => typeof a === 'string')), 'owner.selftestArgs must be a list of strings');
  const s = c.stateSchema ?? {};
  need(Number.isInteger(s.writes) && s.writes >= 1, 'stateSchema.writes must be a positive integer');
  need(Array.isArray(s.reads) && s.reads.every(Number.isInteger) && s.reads.includes(s.writes), 'stateSchema.reads must list integers and include writes');
  const r = c.requires ?? {};
  need(minimumOf(r.node), 'requires.node must be ">=x.y.z"');
  need(minimumOf(r.bb), 'requires.bb must be ">=x.y.z"');
  const tools = r.tools ?? {};
  need([...(tools.required ?? []), ...(tools.recommended ?? [])].every(t => /^[A-Za-z0-9._+-]+$/.test(t)), 'requires.tools entries must be executable names');
  for (const [name, pin] of Object.entries(c.pins ?? {})) {
    if (pin.npm !== undefined) {
      need(typeof pin.npm === 'string' && isExactVersion(pin.version), `pins.${name}: npm pins need an exact version (no ^, ~ or ranges)`);
      need(pin.nodeEngine === undefined || minimumOf(pin.nodeEngine), `pins.${name}.nodeEngine must be ">=x.y.z"`);
    } else if (pin.git !== undefined) {
      need(typeof pin.git === 'string' && /^[0-9a-f]{40}$/.test(pin.commit ?? ''), `pins.${name}: git pins need a full 40-hex commit`);
      need(pin.version === undefined || isExactVersion(pin.version), `pins.${name}.version must be exact`);
    } else errors.push(`pins.${name} must be an npm or git pin`);
  }
  if (!errors.length) {
    const nodeMin = minimumOf(r.node);
    for (const flag of o.nodeArgs ?? []) {
      const min = NODE_FLAG_MIN[flag];
      if (min && compareVersions(nodeMin, min) < 0) errors.push(`owner.nodeArgs uses ${flag}, which needs Node ${min}+, but requires.node allows ${nodeMin}`);
    }
    if (/\.[mc]?ts$/.test(o.entry) && !(o.nodeArgs ?? []).some(a => NODE_FLAG_MIN[a]) && compareVersions(nodeMin, NODE_UNFLAGGED_TS) < 0)
      errors.push(`owner.entry is TypeScript but no type-stripping flag is set and requires.node allows Node < ${NODE_UNFLAGGED_TS}`);
    for (const [name, pin] of Object.entries(c.pins ?? {}))
      if (pin.nodeEngine && compareVersions(nodeMin, minimumOf(pin.nodeEngine)) < 0)
        errors.push(`pins.${name} needs Node ${pin.nodeEngine}, but requires.node allows ${nodeMin}`);
  }
  if (packageDir && !errors.length) errors.push(...packageConsistency(c, packageDir));
  if (errors.length) fail(`release.json is invalid:\n  - ${errors.join('\n  - ')}`);
  return c;
}

/** The contract must agree with package.json (engines, pinned dev/runtime packages). */
function packageConsistency(c, packageDir) {
  const errors = [], pkgFile = join(packageDir, 'package.json');
  if (!existsSync(pkgFile)) return ['package.json is missing'];
  const pkg = readJson(pkgFile);
  if (!isExactVersion(pkg.version)) errors.push(`package.json version "${pkg.version}" is not exact semver`);
  const bbEngine = minimumOf(pkg.engines?.bb);
  if (bbEngine && compareVersions(minimumOf(c.requires.bb), bbEngine) < 0) errors.push(`requires.bb ${c.requires.bb} is looser than package.json engines.bb ${pkg.engines.bb}`);
  const declared = { ...pkg.devDependencies, ...pkg.dependencies };
  for (const [name, pin] of Object.entries(c.pins ?? {}))
    if (pin.npm && declared[pin.npm] !== undefined && declared[pin.npm] !== pin.version)
      errors.push(`pins.${name} is ${pin.npm}@${pin.version} but package.json declares ${declared[pin.npm]}`);
  return errors;
}

// ---- file selection -------------------------------------------------------------------------
export function selectFiles(packageDir, contract) {
  const globs = [...new Set([...contract.files, 'release.json', 'package.json'])].map(globToRegExp);
  const selected = [], errors = [];
  for (const e of walk(packageDir)) {
    // Skip denied directories early without failing: they are only an error if a file in them is selected.
    if (e.kind === 'dir') continue;
    if (!globs.some(g => g.test(e.rel)) || SILENT_SKIP.some(r => r.test(e.rel))) continue;
    const denied = deniedReason(e.rel);
    if (denied) { errors.push(`${e.rel}: allowlisted but denied (${denied})`); continue; }
    if (e.kind === 'symlink') { errors.push(`${e.rel}: symlinks are not shippable (artifact must be self-contained)`); continue; }
    if (e.kind !== 'file') { errors.push(`${e.rel}: not a regular file`); continue; }
    selected.push(e);
  }
  if (errors.length) fail(`Package file selection failed:\n  - ${errors.join('\n  - ')}`);
  return selected;
}

// ---- owner import graph ---------------------------------------------------------------------
const IMPORT_RE = /(?:^|[\n;])[ \t]*(import|export)\s+(type\s+)?(?:[\s\S]*?\sfrom\s*)?['"]([^'"\n]+)['"]/g;
const DYNAMIC_RE = /\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g;
const BUILTINS = new Set(builtinModules);
export function importsOf(code) {
  const found = [];
  for (const m of code.matchAll(IMPORT_RE)) if (!m[2]) found.push(m[3]);
  for (const m of code.matchAll(DYNAMIC_RE)) found.push(m[1]);
  return found;
}
/** Follow the owner's static + literal dynamic imports. Returns the graph or fails with every problem. */
export function ownerGraph(packageDir, entry, shipped) {
  const ship = new Set(shipped), seen = new Set(), errors = [], queue = [entry];
  while (queue.length) {
    const rel = queue.shift();
    if (seen.has(rel)) continue; seen.add(rel);
    if (!ship.has(rel)) { errors.push(`${rel}: imported by the owner but not in the shipped allowlist`); continue; }
    const code = readFileSync(join(packageDir, rel), 'utf8');
    if (/\.[mc]?ts$/.test(rel)) {
      try { stripTypeScriptTypes(code, { mode: 'transform' }); }
      catch (e) { errors.push(`${rel}: Node ${process.versions.node} cannot strip/transform this TypeScript: ${e.message.split('\n')[0]}`); }
    }
    for (const spec of importsOf(code)) {
      if (spec.startsWith('node:') || BUILTINS.has(spec)) continue;
      if (spec.startsWith('./') || spec.startsWith('../')) {
        const target = posix.normalize(posix.join(posix.dirname(rel), spec));
        if (target.startsWith('..')) { errors.push(`${rel}: import ${spec} escapes the package`); continue; }
        if (!existsSync(join(packageDir, target))) { errors.push(`${rel}: import ${spec} does not exist (ESM needs exact file names)`); continue; }
        if (/\.(m?[jt]s|cjs|cts)$/.test(target)) queue.push(target);
        continue;
      }
      errors.push(`${rel}: bare import "${spec}" would need node_modules at runtime; the owner may use node: builtins and relative files only`);
    }
  }
  if (errors.length) fail(`Owner import graph is not self-contained:\n  - ${errors.join('\n  - ')}`);
  return [...seen].sort();
}

// ---- launchd label agreement ----------------------------------------------------------------
const KICKSTART_RE = /gui\/\$\{[^}]*\}\/([A-Za-z0-9._-]+)|gui\/\d+\/([A-Za-z0-9._-]+)/g;
export function checkLabel(packageDir, files, label) {
  let present = false; const others = new Set();
  for (const rel of files) {
    if (rel === 'release.json' || rel.endsWith('.map') || !/\.(m?[jt]sx?|cjs|cts|json)$/.test(rel)) continue;
    const text = readFileSync(join(packageDir, rel), 'utf8');
    if (text.includes(label)) present = true;
    for (const m of text.matchAll(KICKSTART_RE)) { const l = m[1] ?? m[2]; if (l !== label) others.add(`${rel}: ${l}`); }
  }
  const errors = [];
  if (!present) errors.push(`launchd label ${label} does not appear in any shipped code: the client could not kickstart the service the installer writes`);
  for (const o of others) errors.push(`shipped code kickstarts a different label (${o})`);
  if (errors.length) fail(`launchd label check failed:\n  - ${errors.join('\n  - ')}`);
}

export const packageVersion = packageDir => readJson(join(packageDir, 'package.json')).version;
export { dirname };

// Small shared helpers for the release tool. Node built-ins only: the tool must run on a
// machine that has nothing but a supported Node, so it has no npm dependencies.
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, mkdirSync, openSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, chmodSync, statSync, accessSync, constants } from 'node:fs';
import { delimiter, dirname, join, relative, sep } from 'node:path';

export class ReleaseError extends Error {
  constructor(message, code = 2) { super(message); this.exitCode = code; }
}
export const fail = (message, code) => { throw new ReleaseError(message, code); };

// ---- versions -------------------------------------------------------------------------------
const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;
export const isExactVersion = v => typeof v === 'string' && SEMVER.test(v);
export function parseVersion(v) {
  const m = SEMVER.exec(String(v).trim().replace(/^v/, ''));
  if (!m) {
    // Tolerate "0.45" style versions reported by apps and engines fields.
    const short = /^(\d+)\.(\d+)$/.exec(String(v).trim().replace(/^v/, ''));
    if (short) return [Number(short[1]), Number(short[2]), 0, ''];
    return undefined;
  }
  return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ?? ''];
}
export function compareVersions(a, b) {
  const x = parseVersion(a), y = parseVersion(b);
  if (!x || !y) throw new ReleaseError(`Cannot compare versions ${a} and ${b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  if (x[3] === y[3]) return 0;
  if (!x[3]) return 1; if (!y[3]) return -1;
  return x[3] < y[3] ? -1 : 1;
}
// Only the two range forms the contract allows: exact "1.2.3" or minimum ">=1.2.3".
export function minimumOf(range) {
  const m = /^>=\s*(\d+\.\d+(?:\.\d+)?)$/.exec(String(range ?? '').trim());
  return m ? m[1] : undefined;
}
export function satisfies(version, range) {
  if (isExactVersion(range)) return compareVersions(version, range) === 0;
  const min = minimumOf(range);
  if (!min) throw new ReleaseError(`Unsupported version range "${range}" (use exact x.y.z or >=x.y.z)`);
  return compareVersions(version, min) >= 0;
}

// ---- hashing / files ------------------------------------------------------------------------
export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const sha256File = file => sha256(readFileSync(file));
export const readJson = file => JSON.parse(readFileSync(file, 'utf8'));
export function writeJsonAtomic(file, value, mode = 0o644) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2) + '\n', { mode });
  renameSync(tmp, file);
}
export function writeFileAtomic(file, text, mode = 0o644) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, text, { mode });
  renameSync(tmp, file);
}
/** Every entry below root as POSIX relative paths. Symlinks are reported, never followed. */
export function walk(root) {
  const out = [];
  const visit = dir => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name), st = lstatSync(abs);
      const rel = relative(root, abs).split(sep).join('/');
      if (st.isSymbolicLink()) out.push({ rel, abs, kind: 'symlink' });
      else if (st.isDirectory()) { out.push({ rel, abs, kind: 'dir' }); visit(abs); }
      else if (st.isFile()) out.push({ rel, abs, kind: 'file', size: st.size, mode: st.mode & 0o777 });
      else out.push({ rel, abs, kind: 'other' });
    }
  };
  visit(root);
  return out;
}
export function setReadOnly(root) {
  for (const e of walk(root).reverse()) if (e.kind === 'file') chmodSync(e.abs, 0o444); else if (e.kind === 'dir') chmodSync(e.abs, 0o555);
  chmodSync(root, 0o555);
}
export function removeTree(root) {
  if (!existsSync(root)) return;
  // Releases are read-only on purpose; restore owner write bits only so they can be removed.
  if (lstatSync(root).isDirectory()) { chmodSync(root, 0o755); for (const e of walk(root)) if (e.kind === 'dir') chmodSync(e.abs, 0o755); }
  rmSync(root, { recursive: true, force: true });
}
export const isWritable = p => { try { accessSync(p, constants.W_OK); return true; } catch { return false; } };
export const isExecutable = p => { try { accessSync(p, constants.X_OK); return statSync(p).isFile(); } catch { return false; } };

// ---- globs ----------------------------------------------------------------------------------
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') { i++; if (glob[i + 1] === '/') { i++; re += '(?:.*/)?'; } else re += '.*'; }
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${re}$`);
}

// ---- PATH lookup (never executes the candidate) ---------------------------------------------
export function which(name, pathValue = process.env.PATH ?? '') {
  for (const dir of pathValue.split(delimiter)) {
    if (!dir) continue;
    const candidate = join(dir, name);
    if (isExecutable(candidate)) return candidate;
  }
  return undefined;
}

// ---- mutual exclusion -----------------------------------------------------------------------
export function withLock(dir, fn) {
  mkdirSync(dir, { recursive: true });
  const lock = join(dir, '.lock');
  let fd;
  try { fd = openSync(lock, 'wx'); }
  catch { fail(`Another release operation holds ${lock}. If no exo-release command is running, remove that file and retry.`); }
  try { writeFileSync(fd, String(process.pid)); return fn(); }
  finally { closeSync(fd); rmSync(lock, { force: true }); }
}

// ---- plist (XML) ----------------------------------------------------------------------------
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function plistValue(v, indent) {
  const pad = '  '.repeat(indent);
  if (typeof v === 'boolean') return `${pad}<${v}/>`;
  if (typeof v === 'number') return `${pad}<integer>${v}</integer>`;
  if (typeof v === 'string') return `${pad}<string>${esc(v)}</string>`;
  if (Array.isArray(v)) return `${pad}<array>\n${v.map(x => plistValue(x, indent + 1)).join('\n')}\n${pad}</array>`;
  const keys = Object.keys(v);
  return `${pad}<dict>\n${keys.map(k => `${pad}  <key>${esc(k)}</key>\n${plistValue(v[k], indent + 1)}`).join('\n')}\n${pad}</dict>`;
}
export const toPlist = obj => `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0">\n${plistValue(obj, 0)}\n</plist>\n`;

// ---- child environments ---------------------------------------------------------------------
// The tool is often run from inside a live Exo/Pi session whose environment selects real
// state (EXOSURFACE_HOME, OPTCHAT_HOME, PI_SESSION_FILE, EXO_BB_PROFILE, ...). HOME alone does
// not isolate, so every child process gets these removed; only values passed explicitly survive.
export const LIVE_ENV = /^(EXO|EXOSURFACE|EXO_BB|EXO_A2UI|OPTCHAT|PI|HERDR|BB|CLAUDE|CODEX|ANTHROPIC|OPENAI|OPENROUTER|NODE_OPTIONS$|NODE_PATH$)/;
export function sanitizedEnv(explicit = {}, base = process.env) {
  // Allowlist, not a blacklist: credentials and unknown runtime selectors never transit.
  const env = {};
  for (const k of ['PATH', 'HOME', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'SYSTEMROOT'])
    if (typeof base[k] === 'string') env[k] = base[k];
  return { ...env, ...explicit };
}

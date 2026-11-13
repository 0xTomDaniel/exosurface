// Fresh canonical binding primitives. Pi/OptChat own their native files; this module
// writes only Exosurface's receipt and existing binding/pointer formats.
import { createHash } from 'node:crypto';
// Owner artifacts relocate without node_modules; keep file validation builtin-only.
function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function document(bytes: string) {
  const value: unknown = JSON.parse(bytes);
  if (!isRecord(value)) throw Error('Invalid canonical setup document');
  return value;
}
interface SessionEntry {
  type: string; id?: unknown; customType?: unknown; data?: unknown;
  message?: { role?: unknown; content?: { type?: unknown; text?: unknown }[] | null } | null;
}
function isSessionEntry(value: unknown): value is SessionEntry {
  if (!isRecord(value) || typeof value['type'] !== 'string') return false;
  const message = value['message'];
  if (message == null) return true;
  if (!isRecord(message)) return false;
  const content = message['content'];
  return content == null || (Array.isArray(content) && content.every(isRecord));
}
function sessionEntry(bytes: string) {
  const value: unknown = JSON.parse(bytes);
  if (!isSessionEntry(value)) throw Error('Invalid canonical session entry');
  return value;
}
interface Receipt extends FreshBinding { schema?: unknown; sessionPrefix: number; sessionPrefixHash: string; }
function isReceipt(value: unknown): value is Receipt {
  return isRecord(value) && ['operationId', 'home', 'optchatHome', 'profile', 'threadId', 'sessionFile', 'sessionId', 'sessionPrefixHash'].every(key => typeof value[key] === 'string') && typeof value['sessionPrefix'] === 'number';
}
function receiptDocument(bytes: string) {
  const value: unknown = JSON.parse(bytes);
  if (!isReceipt(value)) throw Error('Invalid canonical setup receipt');
  return value;
}
import { existsSync, lstatSync, readFileSync, openSync, readSync, closeSync, statSync } from 'node:fs';
import { createExclusive } from '../../../src/store.ts';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
export const INITIALIZATION = 'Exosurface disposable setup initialization. User-authorized session creation only; no inference requested.';
export interface FreshBinding {
  operationId: string; home: string; optchatHome: string; profile: string;
  threadId: string; sessionFile: string; sessionId: string;
}
const digest = (file: string) => createHash('sha256').update(readFileSync(file)).digest('hex');
/** Recheck every setup attempt and immediately before constructing child env.
 * lstat (not exists/realpath) also sees dangling links. This is a fail-closed
 * filesystem preflight, not protection against concurrent same-account swaps. */
export function canonicalRuntimeDirectories(home: string, requireCreated = false) {
  if (!isAbsolute(home) || resolve(home) !== home) throw Error('Canonical setup requires explicit normalized absolute paths');
  const dirs = ['pi-config', 'setup-home', 'setup-tmp'].map(name => join(home, name));
  for (const dir of dirs) {
    const ancestors: string[] = [];
    for (let path = dir;; path = dirname(path)) { ancestors.push(path); if (dirname(path) === path) break; }
    // Inspect parents first: a non-directory ancestor must not be followed by
    // lstat of a descendant, mkdir, env construction or child initialization.
    for (const path of ancestors.reverse()) {
      const entry = lstatSync(path, { throwIfNoEntry: false });
      if (entry && !entry.isDirectory()) throw Error('Canonical setup runtime paths must be real directories; refusing foreign state');
      if (requireCreated && path === dir && !entry) throw Error('Canonical setup runtime directory missing; refusing child initialization');
    }
  }
  return dirs;
}
function noLinks(file: string) {
  for (let p = resolve(file);; p = dirname(p)) {
    if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw Error('Canonical setup refuses symlink paths');
    if (dirname(p) === p) break;
  }
}
function inside(root: string, file: string) {
  if (!isAbsolute(root) || !isAbsolute(file)) throw Error('Explicit absolute canonical paths required');
  const r = relative(root, file);
  if (!r || r.startsWith('..') || isAbsolute(r)) throw Error('Canonical session outside isolated session directory');
  noLinks(file);
}
function facts(input: FreshBinding) {
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(input.profile) || !/^[a-zA-Z0-9_-]+$/.test(input.threadId) || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.operationId)) throw Error('Invalid canonical setup identity');
  noLinks(input.home); noLinks(input.optchatHome);
  inside(join(input.optchatHome, 'pi-sessions'), input.sessionFile);
  if (statSync(input.sessionFile).size > 65536) throw Error('Fresh canonical session exceeds setup bound');
  const bytes = readFileSync(input.sessionFile, 'utf8');
  // A fresh proof is bounded. Later ordinary conversations are checked by the
  // immutable prefix rather than re-reading unbounded history.
  if (bytes.length > 65536) throw Error('Fresh canonical session exceeds setup bound');
  const entries = bytes.trim().split('\n').map(line => sessionEntry(line));
  if (entries[0]?.type !== 'session' || entries[0].id !== input.sessionId) throw Error('Canonical Pi session identity mismatch');
  const messages = entries.filter(e => e.type === 'message');
  if (messages.length !== 1 || messages[0]?.message?.role !== 'user' || messages[0].message.content?.length !== 1 || messages[0].message.content[0]?.type !== 'text' || messages[0].message.content[0].text !== INITIALIZATION) throw Error('Exactly one authorized initialization user record required');
  if (!entries.some(e => e.type === 'custom' && e.customType === 'optchat.profile' && isRecord(e.data) && e.data['name'] === input.profile)) throw Error('Real OptChat session binding required');
  const dir = join(input.optchatHome, 'profiles', input.profile);
  noLinks(dir);
  if (existsSync(join(dir, 'active-memory.json')) || existsSync(join(dir, 'imports', 'pending.json'))) throw Error('Fresh setup cannot adopt imported or pending profile state');
  noLinks(join(dir, 'config.json')); noLinks(join(dir, 'AGENTS.md'));
  const config = document(readFileSync(join(dir, 'config.json'), 'utf8'));
  if (!config['compactor'] || !config['subagent'] || !readFileSync(join(dir, 'AGENTS.md'), 'utf8')) throw Error('OptChat API profile validation required');
  return { profileConfigHash: digest(join(dir, 'config.json')), profileInstructionsHash: digest(join(dir, 'AGENTS.md')), sessionPrefix: Buffer.byteLength(bytes), sessionPrefixHash: digest(input.sessionFile) };
}
export function validateFreshCanonicalSession(input: Omit<FreshBinding, 'threadId'>) { return facts({ ...input, threadId: 'pending-canonical-setup' }); }
function exclusiveOrEqual(file: string, value: unknown) {
  const bytes = JSON.stringify(value, null, 2) + '\n';
  noLinks(file);
  if (!createExclusive(file, value) && readFileSync(file, 'utf8') !== bytes) throw Error('Foreign canonical setup state; refusing overwrite');
}
export function commitFreshCanonicalBinding(input: FreshBinding) {
  const evidence = facts(input), providerThreadId = `exo:${input.profile}:main`;
  // Intent receipt before writes. Committed marker only after both binding and
  // canonical pointer exist. Journaled orchestration must serialize this writer.
  const receipt = { schema: 'exosurface-canonical-fresh/0', ...input, ...evidence };
  const receiptFile = join(input.home, 'canonical-fresh.json');
  const bindingFile = join(input.home, 'bindings', `${input.threadId}.json`), pointerFile = join(input.home, 'canonical-thread.json');
  const binding = { providerThreadId, profile: input.profile, runtimeKind: 'canonical', sessionFile: input.sessionFile, cursor: 0 };
  const pointer = { threadId: input.threadId, profile: input.profile, providerThreadId, sessionFile: input.sessionFile };
  const markerFile = join(input.home, 'canonical-fresh-committed.json'), marker = { operationId: input.operationId, receiptHash: createHash('sha256').update(JSON.stringify(receipt, null, 2) + '\n').digest('hex') };
  // Refuse foreign state BEFORE introducing a fresh marker into a legacy owner.
  for (const [file, value] of [[receiptFile, receipt], [bindingFile, binding], [pointerFile, pointer], [markerFile, marker]] as const) {
    noLinks(file);
    if (existsSync(file) && readFileSync(file, 'utf8') !== JSON.stringify(value, null, 2) + '\n') throw Error('Foreign canonical setup state; refusing overwrite');
  }
  exclusiveOrEqual(receiptFile, receipt);
  exclusiveOrEqual(bindingFile, binding);
  exclusiveOrEqual(pointerFile, pointer);
  exclusiveOrEqual(markerFile, marker);
  return receipt;
}
export function freshCanonicalReceipt(home: string, optchatHome: string, profile: string) {
  const file = join(home, 'canonical-fresh.json');
  if (!existsSync(file)) return undefined;
  noLinks(file); noLinks(join(home, 'canonical-fresh-committed.json'));
  const receipt = receiptDocument(readFileSync(file, 'utf8'));
  if (!/^[a-zA-Z0-9_-]+$/.test(receipt.threadId) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(profile)) throw Error('Invalid canonical receipt identity');
  const committed = document(readFileSync(join(home, 'canonical-fresh-committed.json'), 'utf8'));
  if (receipt.schema !== 'exosurface-canonical-fresh/0' || receipt.home !== home || receipt.optchatHome !== optchatHome || receipt.profile !== profile || committed['operationId'] !== receipt.operationId || committed['receiptHash'] !== digest(file)) throw Error('Uncommitted or mismatched canonical setup receipt');
  // Native session must remain the exact file issued by setup, even after turns.
  inside(join(optchatHome, 'pi-sessions'), receipt.sessionFile);
  if (!Number.isSafeInteger(receipt.sessionPrefix) || receipt.sessionPrefix < 1 || receipt.sessionPrefix > 65536) throw Error('Invalid canonical session receipt bound');
  const prefix = Buffer.alloc(receipt.sessionPrefix), fd = openSync(receipt.sessionFile, 'r');
  try { if (readSync(fd, prefix, 0, prefix.length, 0) !== prefix.length || createHash('sha256').update(prefix).digest('hex') !== receipt.sessionPrefixHash) throw Error('Canonical initialization journal changed'); } finally { closeSync(fd); }
  const dir = join(optchatHome, 'profiles', profile); noLinks(dir);
  for (const path of [join(dir, 'config.json'), join(dir, 'AGENTS.md'), join(home, 'canonical-thread.json'), join(home, 'bindings', `${receipt.threadId}.json`)]) noLinks(path);
  if (!existsSync(join(dir, 'config.json')) || !existsSync(join(dir, 'AGENTS.md'))) throw Error('Missing fresh canonical profile');
  const pointer = document(readFileSync(join(home, 'canonical-thread.json'), 'utf8'));
  const binding = document(readFileSync(join(home, 'bindings', `${receipt.threadId}.json`), 'utf8'));
  if (pointer['threadId'] !== receipt.threadId || pointer['profile'] !== profile || pointer['providerThreadId'] !== `exo:${profile}:main` || binding['providerThreadId'] !== `exo:${profile}:main` || pointer['sessionFile'] !== receipt.sessionFile || binding['profile'] !== profile || binding['runtimeKind'] !== 'canonical' || binding['sessionFile'] !== receipt.sessionFile) throw Error('Canonical setup binding/receipt mismatch');
  return receipt as FreshBinding;
}

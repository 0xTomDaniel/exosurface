// Small JSON state helpers. Adapted from bb-plugin-exo-spike/src/state.ts (save/load) at 368cba4.
import { appendFileSync, closeSync, fsyncSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, writeFileSync, writeSync } from 'node:fs';
import { dirname } from 'node:path';

export function save(file: string, value: unknown) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.tmp`;
  const fd = openSync(temporary, 'w', 0o600);
  try { writeSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  renameSync(temporary, file);
  const dir = openSync(dirname(file), 'r');
  try { fsyncSync(dir); } finally { closeSync(dir); }
}
export function load(file: string): any { return JSON.parse(readFileSync(file, 'utf8')); }
export function loadIf(file: string): any { return existsSync(file) ? load(file) : undefined; }

/** Creates `file` only if it does not exist yet. Returns false (and writes nothing) when it already exists. */
export function createExclusive(file: string, value: unknown): boolean {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  let fd: number;
  try { fd = openSync(file, 'wx', 0o600); }
  catch (e) { if ((e as NodeJS.ErrnoException).code === 'EEXIST') return false; throw e; }
  try { writeSync(fd, JSON.stringify(value, null, 2) + '\n'); fsyncSync(fd); } finally { closeSync(fd); }
  return true;
}

export function audit(file: string, event: string, extra: Record<string, unknown> = {}) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), event, ...extra }) + '\n', { mode: 0o600 });
}

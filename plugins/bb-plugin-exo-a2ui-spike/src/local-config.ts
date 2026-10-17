// Machine-specific locations are never committed: they come from a local JSON file
// (EXO_CONFIG, default ~/.config/exo/exosurface.json), with "~/" expanded. Missing values are
// empty strings here and rejected by `requireLocal` where a process is actually launched.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
export const LOCAL_CONFIG = process.env.EXO_CONFIG ?? join(homedir(), '.config', 'exo', 'exosurface.json');
const raw: Record<string, unknown> = existsSync(LOCAL_CONFIG) ? JSON.parse(readFileSync(LOCAL_CONFIG, 'utf8')) : {};
const expand = (p: string) => (p.startsWith('~/') ? join(homedir(), p.slice(2)) : p);
export function local(key: 'vault' | 'piCli' | 'piFast' | 'optchat' | 'optchatCanvas' | 'playwright'): string {
  const v = raw[key];
  return typeof v === 'string' && v ? expand(v) : '';
}
export function requireLocal(value: string, key: string): string {
  if (!value || !existsSync(value)) throw new Error(`Set "${key}" in ${LOCAL_CONFIG} to an existing path`);
  return value;
}

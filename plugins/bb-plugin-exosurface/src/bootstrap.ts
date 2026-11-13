// First-run state machine. BB calls are dependency-injected, never guessed or run at import time.
import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { layout, profileDir, schemaState, type Config, type Layout } from './config.ts';
import { loadIf, save, createExclusive } from './store.ts';

export interface Ports {
  createProfile(): Promise<void>;
  configureProfile(): Promise<void>;
  validateProfile(): Promise<void>;
  // Lookup must use a stable durable idempotency key; title matching is NOT sufficient.
  findThread(key: string): Promise<{ id: string } | undefined>;
  createThread(key: string): Promise<{ id: string }>;
}
const journalSchema = z.object({ version: z.literal(1), key: z.string(), vault: z.string(), profile: z.string(), profileClaimed: z.boolean(), profileConfigured: z.boolean().optional(), threadId: z.string().optional() });
type Journal = z.output<typeof journalSchema>;
const primaryBinding = z.object({ key: z.string(), threadId: z.string().optional() });
/** The bound primary thread for readers that only route by it, or undefined when none is stored. */
export const primaryThreadId = (l: Layout) => primaryBinding.pick({ threadId: true }).safeParse(loadIf(l.primary)).data?.threadId;

export async function bootstrap(config: Config, ports: Ports) {
  const l = layout(config.stateDir), schema = schemaState(l);
  if (typeof schema === 'object') throw new Error(`Unsupported state schema: ${schema.unsupported}`);
  // Starter must already exist. Do not populate or modify the vault.
  if (!existsSync(join(config.vault, 'AGENTS.md'))) throw new Error('Apply Exocortex starter before first-run (vault AGENTS.md missing)');
  const vault = realpathSync(config.vault);
  mkdirSync(l.stateDir, { recursive: true, mode: 0o700 });
  const lock = join(l.stateDir, 'first-run.lock');
  // An interrupted lock fails closed, never timeout-steals another process's setup.
  const fd = openSync(lock, 'wx', 0o600);
  try {
    const stored: unknown = loadIf(l.firstRun);
    let j: Journal | undefined = stored === undefined ? undefined : journalSchema.safeParse(stored).data;
    if (stored !== undefined && (j?.vault !== vault || j.profile !== config.profile)) throw new Error('First-run journal binding conflict; refusing rebind');
    if (!j) {
      if (existsSync(profileDir(config)) || existsSync(l.primary)) throw new Error('Existing profile or primary binding without first-run journal; refusing adoption');
      j = { version: 1, key: randomUUID(), vault, profile: config.profile, profileClaimed: true };
      save(l.firstRun, j);
    }
    createExclusive(l.schemaFile, { schema: 1 });
    if (!existsSync(profileDir(config))) await ports.createProfile();
    // An interrupted create can leave partial files: validate, never overwrite/recreate them.
    await ports.validateProfile();
    if (!j.profileConfigured) {
      await ports.configureProfile();
      j.profileConfigured = true; save(l.firstRun, j);
    }
    const storedBinding: unknown = loadIf(l.primary);
    const binding = storedBinding === undefined ? undefined : primaryBinding.safeParse(storedBinding).data;
    if (storedBinding !== undefined && !binding) throw new Error('Primary thread binding conflict');
    if (binding && (binding.key !== j.key || (j.threadId && binding.threadId !== j.threadId))) throw new Error('Primary thread binding conflict');
    if (!j.threadId) {
      const thread = await ports.findThread(j.key) ?? await ports.createThread(j.key);
      if (!thread.id) throw new Error('BB did not return a thread id');
      j.threadId = thread.id; save(l.firstRun, j);
    }
    if (binding && binding.threadId !== j.threadId) throw new Error('Primary thread binding conflict');
    createExclusive(l.primary, { key: j.key, threadId: j.threadId, profile: config.profile });
    return { threadId: j.threadId, profile: config.profile };
  } finally { closeSync(fd); unlinkSync(lock); }
}

// The setup store rule: docs/pnpm-migration.md (`just setup-dependencies`; #235, #236). Drives the
// real `just setup-dependencies` in a scratch second checkout under the OS temp dir: the working-tree files of the
// checkout under test (so an uncommitted fix is what runs), installed with pnpm offline by env only, against the store
// the checkout under test was installed from. Evidence is pnpm's own install record (node_modules/.modules.yaml).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, readlinkSync, symlinkSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { reaped } from './reap.ts';

const repoRoot = resolve(import.meta.dirname, '../../..');
const AUX = 'plugins/bb-plugin-exo-a2ui-spike';

// No git or store configuration from a caller (a hook's GIT_DIR, a store-dir override) reaches the recipe: the store
// is what the recipe and the checkout's own config select.
function callerEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env))
    if (!name.startsWith('GIT_') && !/^(npm_config_store[-_]dir|pnpm_store_dir)$/iu.test(name)) env[name] = value;
  return env;
}

/** The store an install used, as pnpm recorded it (top-level `storeDir:` of node_modules/.modules.yaml). */
function storeOf(project: string): string {
  const record = join(project, 'node_modules/.modules.yaml');
  assert.ok(existsSync(record), `no pnpm install record at ${record}`);
  const store = /^storeDir: (\S+)$/mu.exec(readFileSync(record, 'utf8'))?.[1];
  assert.ok(store !== undefined, `no storeDir in ${record}`);
  return store;
}

const inside = (path: string, dir: string) => { const r = relative(dir, path); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

function pnpmStores(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.name === '.pnpm-store').map((entry) => join(entry.parentPath, entry.name));
}

/** The checkout's working-tree files (tracked and untracked, not ignored), copied into a new directory. */
function scratchCheckout(): string {
  const scratch = mkdtempSync(join(tmpdir(), 'setup-shared-store-'));
  const listed = execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], { cwd: repoRoot, env: callerEnv(), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  for (const file of new Set(listed.split('\0').filter(Boolean))) {
    const from = join(repoRoot, file);
    const stat = lstatSync(from, { throwIfNoEntry: false });
    if (stat === undefined) continue; // deleted in the working tree
    const to = join(scratch, file);
    mkdirSync(dirname(to), { recursive: true });
    if (stat.isSymbolicLink()) symlinkSync(readlinkSync(from), to); else copyFileSync(from, to);
  }
  return scratch;
}

void test('setup-shared-store: just setup-dependencies in a second checkout installs both workspaces from the shared store outside it', async (t) => {
  const store = storeOf(repoRoot);
  assert.equal(storeOf(join(repoRoot, AUX)), store, 'the checkout under test was installed from two stores');
  const scratch = scratchCheckout();
  const child = reaped(spawn('just', ['setup-dependencies'], {
    cwd: scratch, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
    // Offline: the store the checkout under test was installed from must already hold everything; nothing downloads.
    env: { ...callerEnv(), npm_config_offline: 'true', MISE_TRUSTED_CONFIG_PATHS: scratch },
  }));
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null && child.pid !== undefined) {
      const exited = new Promise((done) => child.once('exit', done));
      try { process.kill(-child.pid, 'SIGKILL'); } catch { /* group already gone */ }
      await exited;
    }
    await rm(scratch, { recursive: true, force: true });
  });
  let output = '';
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString(); });
  const status = await new Promise<number | null>((done, fail) => { child.once('error', fail); child.once('close', done); });

  assert.equal(status, 0, `just setup-dependencies failed in the scratch checkout:\n${output.slice(-4000)}`);
  assert.deepEqual(pnpmStores(scratch), [], 'a pnpm store was created inside the scratch checkout');
  assert.equal(storeOf(scratch), store, 'root install used another store than the checkout under test');
  assert.equal(storeOf(join(scratch, AUX)), store, 'auxiliary install used another store than the checkout under test');
  assert.ok(!inside(store, scratch) && !inside(store, repoRoot), `shared store ${store} lies inside a checkout`);
});

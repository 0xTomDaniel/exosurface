// Disposable repositories for driving the root gate commands (scripts/lint.ts, scripts/check-languages.ts) as a
// caller does: real git, the real source-inventory command, real TypeScript/ESLint/knip from the installed root
// node_modules (symlinked, nothing installed). Used by test/standards-gate.test.ts.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const repoRoot = resolve(import.meta.dirname, '../../..');
export const lintCommand = join(repoRoot, 'scripts/lint.ts');
export const languagesCommand = join(repoRoot, 'scripts/check-languages.ts');

// Git with a fixed identity and no user/system configuration or inherited repository env.
export function cleanEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) if (!name.startsWith('GIT_')) env[name] = value;
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_AUTHOR_NAME: 'gate-fixture', GIT_AUTHOR_EMAIL: 'gate-fixture@invalid',
    GIT_COMMITTER_NAME: 'gate-fixture', GIT_COMMITTER_EMAIL: 'gate-fixture@invalid', ...extra };
}

export function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, env: cleanEnv(), encoding: 'utf8', timeout: 30_000 });
}

interface Fixture { root: string; write: (file: string, text: string) => void; remove: () => void }

/** A git repository holding the real source-inventory command, a literal registry and the owner-deferred trees. */
export function gateFixture(registry: object = { version: 1, integrity: {} }): Fixture {
  const root = mkdtempSync(join(tmpdir(), 'gate-fixture-'));
  const write = (file: string, text: string) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), text); };
  git(root, 'init', '-q');
  mkdirSync(join(root, 'scripts'));
  copyFileSync(join(repoRoot, 'scripts/source-inventory.py'), join(root, 'scripts/source-inventory.py'));
  write('scripts/source-inventory.json', `${JSON.stringify(registry)}\n`);
  for (const tree of ['plugins/bb-plugin-exo-spike', 'spikes/a2a-pi', 'spikes/ag-ui-pi']) mkdirSync(join(root, tree), { recursive: true });
  write('tsconfig.json', `${JSON.stringify({ compilerOptions: { strict: true, noEmit: true, types: [], lib: ['es2022'], target: 'es2022', module: 'nodenext', moduleResolution: 'nodenext' }, include: ['src/**/*.ts'] })}\n`);
  return { root, write, remove: () => { rmSync(root, { recursive: true, force: true }); } };
}

/** Root package tools (ESLint, knip) through `pnpm exec`, resolving from the installed root node_modules. */
export function withPackageTools(fixture: Fixture): void {
  symlinkSync(join(repoRoot, 'node_modules'), join(fixture.root, 'node_modules'), 'dir');
  fixture.write('.gitignore', 'node_modules\n');
  fixture.write('package.json', `${JSON.stringify({ name: 'gate-fixture', private: true, type: 'module' })}\n`);
  copyFileSync(join(repoRoot, 'eslint.config.js'), join(fixture.root, 'eslint.config.js'));
}

interface Run { status: number | null; stdout: string; stderr: string }

export function run(cwd: string, command: string, args: string[], env: NodeJS.ProcessEnv = cleanEnv()): Run {
  const result = spawnSync(process.execPath, [command, ...args], { cwd, env, encoding: 'utf8', timeout: 90_000, maxBuffer: 16 * 1024 * 1024 });
  if (result.error !== undefined) throw result.error;
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

/** The gate's own summary/deferral lines from a run, in order (every other line is native tool output). */
export function gateLines(output: string): string[] {
  return output.split('\n').filter((line) => /^\S+: \d+ findings, baseline \d+;|^ {2}\S.* \(\d+ > baseline \d+\): |DEFERRED BY OWNER|unanswered|refused/u.test(line));
}

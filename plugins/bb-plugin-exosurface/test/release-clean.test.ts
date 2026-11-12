// Gate leaves a clean tree (#139, owner ruling 2026-11-06 #110): the runtime build, run over the dependencies a full
// frozen pnpm setup installed before the offline gate, rewrites the tracked release manifest to the same bytes on any platform.
// The build runs in a scratch copy of this plugin that shares its installed node_modules, so the bundles and resources
// other tests read here are never rewritten under them; the copy's git holds release.json as this checkout's git tracks it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { PARENT_WATCH, reaped } from './reap.ts';
import { settled } from './wait.ts';

const plugin = join(import.meta.dirname, '..');
const root = resolve(plugin, '../..');
const gitAt = (cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) => execFileSync('git', ['-c', 'user.name=release-clean', '-c', 'user.email=release-clean@invalid', ...args], { cwd, env, encoding: 'utf8', timeout: 60_000 });
// Anchor the worktree without replacing the caller's staged (possibly commit-temporary) index.
const callerGit = (worktree: string, cwd: string, env: NodeJS.ProcessEnv, ...args: string[]) => gitAt(cwd, env, '--work-tree', worktree, ...args);
const git = (cwd: string, ...args: string[]) => callerGit(root, cwd, process.env, ...args);
function scratchGitEnv(template: string, inherited: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const env = { ...inherited };
  for (const name of Object.keys(env)) if (name === 'GIT_CONFIG' || name.startsWith('GIT_CONFIG_')) delete env[name];
  Object.assign(env, { GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TEMPLATE_DIR: template });
  for (const name of gitAt(template, env, 'rev-parse', '--local-env-vars').trim().split('\n')) delete env[name];
  return { ...env, GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_SYSTEM: '/dev/null', GIT_CONFIG_GLOBAL: '/dev/null', GIT_TEMPLATE_DIR: template,
    GIT_AUTHOR_NAME: 'release-clean', GIT_AUTHOR_EMAIL: 'release-clean@invalid', GIT_COMMITTER_NAME: 'release-clean', GIT_COMMITTER_EMAIL: 'release-clean@invalid' };
}

test('linked caller reads its staged release while scratch Git stays independent', t => {
  const home = mkdtempSync(join(tmpdir(), 'exosurface-git-context-'));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const template = join(home, 'template'), main = join(home, 'main'), linked = join(home, 'linked'), other = join(home, 'other');
  for (const dir of [template, main, other]) mkdirSync(dir);
  const clean = scratchGitEnv(template);
  const message = join(home, 'message'); writeFileSync(message, 'test(fixture): seed public release metadata\n');
  gitAt(main, clean, 'init', '-q');
  const relative = 'plugins/bb-plugin-exosurface', fixturePlugin = join(linked, relative);
  mkdirSync(join(main, relative), { recursive: true });
  writeFileSync(join(main, relative, 'release.json'), '{"authority":"HEAD"}\n');
  gitAt(main, clean, 'add', '--', relative); gitAt(main, clean, 'commit', '-q', '-F', message);
  gitAt(main, clean, 'worktree', 'add', '-q', '-b', 'public-linked', linked, 'HEAD');
  writeFileSync(join(fixturePlugin, 'release.json'), '{"authority":"INDEX"}\n');
  gitAt(linked, clean, 'add', '--', relative);
  writeFileSync(join(fixturePlugin, 'release.json'), '{"authority":"DISK"}\n');
  const index = gitAt(linked, clean, 'rev-parse', '--path-format=absolute', '--git-path', 'index').trim();
  const inherited = { ...clean, GIT_DIR: gitAt(linked, clean, 'rev-parse', '--absolute-git-dir').trim(), GIT_INDEX_FILE: index, GIT_PREFIX: '' };
  const before = readFileSync(index);
  assert.equal(gitAt(linked, clean, 'show', `HEAD:${relative}/release.json`), '{"authority":"HEAD"}\n');
  assert.equal(readFileSync(join(fixturePlugin, 'release.json'), 'utf8'), '{"authority":"DISK"}\n');
  assert.equal(callerGit(linked, fixturePlugin, inherited, 'show', ':./release.json'), '{"authority":"INDEX"}\n');
  const isolated = scratchGitEnv(template, inherited);
  gitAt(other, isolated, 'init', '-q'); writeFileSync(join(other, 'release.json'), '{"authority":"OTHER"}\n');
  gitAt(other, isolated, 'add', '--', 'release.json'); gitAt(other, isolated, 'commit', '-q', '-F', message);
  assert.equal(gitAt(other, isolated, 'rev-parse', '--show-toplevel').trim(), other);
  assert.equal(gitAt(other, isolated, 'show', ':release.json'), '{"authority":"OTHER"}\n');
  assert.deepEqual(readFileSync(index), before);
  assert.equal(callerGit(linked, fixturePlugin, inherited, 'show', ':./release.json'), '{"authority":"INDEX"}\n');
});

test('the runtime build leaves the tracked release.json unchanged', async t => {
  for (const modules of ['node_modules', 'legacy/surface/node_modules', 'legacy/surface/composition/node_modules'])
    assert.ok(existsSync(join(plugin, modules)), `${modules} missing: run just setup (frozen pnpm installation) before the offline gate`);
  const copy = mkdtempSync(join(tmpdir(), 'exosurface-release-clean-'));
  t.after(() => rmSync(copy, { recursive: true, force: true }));
  // The plugin as this checkout has it: tracked files with their working bytes, untracked unignored files too.
  for (const file of git(plugin, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0')) {
    if (!file || !existsSync(join(plugin, file))) continue;
    mkdirSync(dirname(join(copy, file)), { recursive: true });
    cpSync(join(plugin, file), join(copy, file));
  }
  // release.json as tracked (git's index), not as a build before this one (the gate's own) left it on disk.
  writeFileSync(join(copy, 'release.json'), git(plugin, 'show', ':./release.json'));
  for (const modules of ['node_modules', 'legacy/surface/node_modules', 'legacy/surface/composition/node_modules']) symlinkSync(join(plugin, modules), join(copy, modules), 'dir');
  const control = mkdtempSync(join(tmpdir(), 'exosurface-git-control-'));
  t.after(() => rmSync(control, { recursive: true, force: true }));
  const template = join(control, 'template'); mkdirSync(template);
  const env = scratchGitEnv(template);
  const message = join(control, 'message'); writeFileSync(message, 'test(fixture): track release manifest\n');
  gitAt(copy, env, 'init', '-q'); gitAt(copy, env, 'add', 'release.json'); gitAt(copy, env, 'commit', '-q', '-F', message);

  const build = reaped(spawn(process.execPath, [...PARENT_WATCH, 'build-runtime.mjs'], { cwd: copy, env, stdio: ['ignore', 'pipe', 'pipe'] }));
  let output = ''; build.stdout.on('data', c => output += c); build.stderr.on('data', c => output += c);
  let code: number | null | undefined; build.on('exit', (c, signal) => code = c ?? (signal ? -1 : null));
  assert.ok(await settled(() => code !== undefined, 240_000), 'runtime build did not finish within 240 s');
  assert.equal(code, 0, `runtime build failed:\n${output}`);

  const status = gitAt(copy, env, 'status', '--porcelain', '--', 'release.json');
  const diff = status ? gitAt(copy, env, 'diff', '--', 'release.json').split('\n').filter(l => /^[-+] /.test(l)).slice(0, 40).join('\n') : '';
  assert.equal(status, '', `runtime build rewrote release.json:\n${diff}`);
});

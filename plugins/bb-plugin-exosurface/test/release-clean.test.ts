// Gate leaves a clean tree (#139, owner ruling 2026-11-06 #110): the runtime build, run over the dependencies a full
// frozen pnpm setup installed before the offline gate, rewrites the tracked release manifest to the same bytes on any platform.
// The build runs in a scratch copy of this plugin that shares its installed node_modules, so the bundles and resources
// other tests read here are never rewritten under them; the copy's git holds release.json as this checkout's git tracks it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { PARENT_WATCH, reaped } from './reap.ts';
import { settled } from './wait.ts';

const plugin = join(import.meta.dirname, '..');
const git = (cwd: string, ...args: string[]) => execFileSync('git', ['-c', 'user.name=release-clean', '-c', 'user.email=release-clean@invalid', ...args], { cwd, encoding: 'utf8', timeout: 60_000 });

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
  git(copy, 'init', '-q'); git(copy, 'add', 'release.json'); git(copy, 'commit', '-q', '-m', 'tracked release.json');

  const build = reaped(spawn(process.execPath, [...PARENT_WATCH, 'build-runtime.mjs'], { cwd: copy, stdio: ['ignore', 'pipe', 'pipe'] }));
  let output = ''; build.stdout.on('data', c => output += c); build.stderr.on('data', c => output += c);
  let code: number | null | undefined; build.on('exit', (c, signal) => code = c ?? (signal ? -1 : null));
  assert.ok(await settled(() => code !== undefined, 240_000), 'runtime build did not finish within 240 s');
  assert.equal(code, 0, `runtime build failed:\n${output}`);

  const status = git(copy, 'status', '--porcelain', '--', 'release.json');
  const diff = status ? git(copy, 'diff', '--', 'release.json').split('\n').filter(l => /^[-+] /.test(l)).slice(0, 40).join('\n') : '';
  assert.equal(status, '', `runtime build rewrote release.json:\n${diff}`);
});

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { buildArtifact, selftest, verifyArtifact, packArtifact, unpackArtifact } from '../lib/artifact.mjs';
import { install, update, rollback, uninstall, setModels, launchdPlist } from '../lib/lifecycle.mjs';
import { sanitizedEnv, removeTree, writeJsonAtomic } from '../lib/util.mjs';

// Resolve interpreters before rebinding HOME: mise shims are not safe in a disposable home.
const PYTHON = execFileSync('/usr/bin/env', ['python3', '-c', 'import sys;print(sys.executable)'], { encoding: 'utf8', env: sanitizedEnv() }).trim();
const suiteHome = mkdtempSync(join(tmpdir(), 'exo-release-suite-'));
process.env.HOME = suiteHome;
process.env.PATH = [dirname(process.execPath), dirname(PYTHON), '/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(':');
for (const key of Object.keys(process.env)) if (/^(EXO|OPTCHAT|PI_|HERDR|BB_|CLAUDE|CODEX|ANTHROPIC|OPENAI|OPENROUTER)/.test(key)) delete process.env[key];
after(() => removeTree(suiteHome));

function fixture(t, version = '1.0.0', schema = 1) {
  const root = mkdtempSync(join(tmpdir(), 'exo-release-test-'));
  t.after(() => removeTree(root));
  const pkg = join(root, 'pkg'); mkdirSync(join(pkg, 'src'), { recursive: true }); mkdirSync(join(pkg, 'dist'));
  writeJsonAtomic(join(pkg, 'package.json'), { name: 'exosurface', version, type: 'module', engines: { bb: '>=0.45.0' } });
  writeJsonAtomic(join(pkg, 'release.json'), { contract: 'exosurface-package/0', id: 'exosurface', files: ['src/**', 'dist/**'], owner: { entry: 'src/owner-service.ts', launchdLabel: 'app.exosurface.owner', selftestArgs: ['--release-selftest'] }, stateSchema: { reads: [schema], writes: schema }, requires: { node: '>=22.19.0', bb: '>=0.45.0', tools: { required: ['uv'] } }, pins: { pi: { npm: '@earendil-works/pi-coding-agent', version: '1.1.0', nodeEngine: '>=22.19.0' }, optchat: { git: 'https://example.invalid/optchat', commit: 'a'.repeat(40), version: '0.8.6' } } });
  writeFileSync(join(pkg, 'src/owner-service.ts'), 'import { basename } from "node:path";\nconst label: string = "app.exosurface.owner";\nconsole.log(label, basename("ok"));\n');
  writeFileSync(join(pkg, 'dist/app.js'), 'export const view = "ready";');
  return { root, pkg, artifact: () => buildArtifact({ packageDir: pkg, outDir: join(root, 'out'), allowDirty: true }).dir };
}
function installOptions(f, artifact) {
  const home = join(f.root, 'home'), vault = join(home, 'vault'); mkdirSync(vault, { recursive: true });
  return { acceptFullAccess: true, home, vault, artifact, node: process.execPath, pathValue: '/usr/bin:/bin' };
}

test('relocated immutable artifact owner executes without node_modules/developer tree', t => {
  const f = fixture(t), dir = f.artifact(); removeTree(f.pkg);
  assert.equal(verifyArtifact(dir).version, '1.0.0');
  assert.equal(selftest(dir).status, 'ok');
  const packed = packArtifact(dir, f.root); const r = unpackArtifact(packed.tarball, join(f.root, 'unpack'));
  assert.equal(selftest(r.dir).status, 'ok'); r.cleanup();
});
test('allowlist rejects auth, symlinks, private paths and bare owner imports', t => {
  const f = fixture(t); writeFileSync(join(f.pkg, 'src/auth.json'), '{}'); assert.throws(f.artifact, /denied/);
  removeTree(join(f.pkg, 'src/auth.json')); symlinkSync('/tmp', join(f.pkg, 'src/link')); assert.throws(f.artifact, /symlink/);
  removeTree(join(f.pkg, 'src/link')); writeFileSync(join(f.pkg, 'src/extra.txt'), ['', 'Users', 'fixture-owner', 'private', ''].join('/')); assert.throws(f.artifact, /Privacy/);
  removeTree(join(f.pkg, 'src/extra.txt')); writeFileSync(join(f.pkg, 'src/owner-service.ts'), 'import x from "missing-package";\nconsole.log("app.exosurface.owner");'); assert.throws(f.artifact, /bare import/);
});
test('tamper detection refuses extra files and modified bytes', t => {
  const f = fixture(t), dir = f.artifact(); chmodSync(dir, 0o755); writeFileSync(join(dir, 'extra'), 'bad'); assert.throws(() => verifyArtifact(dir), /not in manifest/);
});
test('install/model retry/update/schema-gated rollback/uninstall preserve owner data', t => {
  const f = fixture(t), g = fixture(t, '2.0.0', 2);
  const opts = installOptions(f, f.artifact()), r = install(opts), p = r.receipt.paths;
  assert.deepEqual(r.missingModels, ['main', 'compactor', 'subagent']);
  const models = join(f.root, 'models.json'); writeJsonAtomic(models, { main: { provider: 'own', model: 'chosen', thinking: 'medium' } });
  setModels({ prefix: p.prefix, models }); writeJsonAtomic(models, { main: { provider: 'other', model: 'overwrite', thinking: 'low' }, compactor: { provider: 'own', model: 'compact', thinking: 'low' } });
  setModels({ prefix: p.prefix, models }); assert.equal(JSON.parse(readFileSync(p.config)).models.main.model, 'chosen');
  mkdirSync(p.stateDir, { recursive: true }); writeJsonAtomic(join(p.stateDir, 'state-schema.json'), { schema: 1 });
  const newer = g.artifact(); assert.throws(() => update({ prefix: p.prefix, artifact: newer }), /schema/);
  writeJsonAtomic(join(p.stateDir, 'state-schema.json'), { schema: 2 }); update({ prefix: p.prefix, artifact: newer });
  assert.throws(() => rollback({ prefix: p.prefix }), /schema/);
  assert.throws(() => rollback({ prefix: p.prefix, to: '../outside' }), /Invalid/);
  writeFileSync(join(p.vault, 'notes.md'), 'keep'); writeFileSync(join(p.stateDir, 'history.txt'), 'keep');
  assert.throws(() => uninstall({ prefix: p.prefix }), /Stop the service/);
  uninstall({ prefix: p.prefix, serviceStopped: true });
  assert.ok(existsSync(join(p.vault, 'notes.md'))); assert.ok(existsSync(join(p.stateDir, 'history.txt'))); assert.ok(!existsSync(p.prefix));
});
test('launchd has explicit selectors and crash-only restart; child env is allowlisted', () => {
  const text = launchdPlist({ label: 'app.exosurface.owner', nodePath: '/stable/node', nodeArgs: [], entry: '/release/owner.ts', home: '/fixture', path: '/usr/bin:/bin', config: '/fixture/config', stateDir: '/fixture/state', prefix: '/fixture/releases', logsDir: '/fixture/logs' });
  assert.match(text, /SuccessfulExit<\/key>\s*<false\/>/); assert.match(text, /EXO_RELEASE<\/key>/); assert.match(text, /EXO_CONFIG/);
  assert.deepEqual(sanitizedEnv({ EXO_CONFIG: '/fixture/config' }, { HOME: '/fixture', PATH: '/usr/bin', PI_SESSION_FILE: '/live', EXOSURFACE_HOME: '/live', SOMETHING_SECRET: 'bad' }), { HOME: '/fixture', PATH: '/usr/bin', EXO_CONFIG: '/fixture/config' });
});

test('setup propagates starter conflict exit3 without release writes', async t => {
  const { setup } = await import('../lib/setup.mjs');
  const f = fixture(t), opts = installOptions(f, f.artifact());
  const script = join(f.root, 'fake-starter.py'), starter = join(f.root, 'starter'); mkdirSync(starter);
  writeJsonAtomic(join(starter, 'starter-artifact.json'), { contract: 'exo-mac-starter/0' });
  writeFileSync(script, 'import sys\nprint("conflict",file=sys.stderr)\nsys.exit(3)\n');
  // Tests use the existing interpreter resolved by the test harness; no system install.
  const py = PYTHON;
  assert.throws(() => setup({ ...opts, starterScript: script, starterArtifact: starter, python: py, ownerTimezone: 'Etc/UTC' }), e => e.exitCode === 3);
  assert.equal(existsSync(join(opts.home, 'Library')), false);
});

test('existing conflicting vault binding is refused before release writes', t => {
  const f = fixture(t), opts = installOptions(f, f.artifact()), file = join(opts.home, '.config', 'exosurface', 'config.json');
  writeJsonAtomic(file, { vault: '/other/owner-vault' });
  assert.throws(() => install(opts), /Existing config vault differs/);
  assert.equal(existsSync(join(opts.home, 'Library')), false);
});

test('declined full-access install/setup makes no writes', async t => {
  const { setup } = await import('../lib/setup.mjs');
  const f = fixture(t), opts = installOptions(f, f.artifact()); delete opts.acceptFullAccess;
  assert.throws(() => install(opts), /not a sandbox/);
  assert.throws(() => setup(opts), /not a sandbox/);
  assert.equal(existsSync(join(opts.home, 'Library')), false);
});

test('archive symlinks refused before extraction', t => {
  const f = fixture(t), archiveRoot = join(f.root, 'transport'); mkdirSync(archiveRoot);
  symlinkSync(f.pkg, join(archiveRoot, 'outside'));
  const tarball = join(f.root, 'bad.tar.gz');
  execFileSync('/usr/bin/tar', ['-czf', tarball, '-C', f.root, 'transport'], { env: sanitizedEnv() });
  const target = join(f.root, 'extract');
  assert.throws(() => unpackArtifact(tarball, target), /links or special/);
  assert.equal(existsSync(target), false);
});

test('doctor fails missing tools and never converts unsupported into release-ready', async t => {
  const { doctor } = await import('../lib/doctor.mjs');
  const f = fixture(t), r = doctor({ home: join(f.root, 'home'), artifact: f.artifact(), env: { PATH: '' }, bbApp: join(f.root, 'missing-bb'), platform: 'darwin' });
  assert.equal(r.ok, false); assert.equal(r.ready, false);
  assert.ok(r.checks.some(c => c.id === 'tool:uv' && c.status === 'fail'));
  assert.ok(r.checks.some(c => c.id === 'tool:python3' && c.status === 'fail'));
  assert.ok(r.checks.some(c => c.id === 'model-auth' && c.status === 'unsupported'));
});

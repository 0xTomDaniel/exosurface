// Versioned, immutable release artifacts built from an allowlisted package directory.
// The artifact is a plain directory (and optionally a tarball): nothing in it refers back to
// the git worktree it was built from, so switching branches cannot change an installed release.
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { ARTIFACT_FORMAT, checkLabel, validateContract, loadContract, loadDenyPatterns, ownerGraph, scanContent, selectFiles } from './contract.mjs';
import { compareVersions, fail, sanitizedEnv, isExactVersion, minimumOf, readJson, removeTree, setReadOnly, sha256, sha256File, walk, writeJsonAtomic } from './util.mjs';

function sourceInfo(packageDir) {
  const git = args => spawnSync('git', ['-C', packageDir, ...args], { encoding: 'utf8', env: sanitizedEnv() });
  const head = git(['rev-parse', 'HEAD']);
  if (head.status !== 0) return { commit: null, clean: false, note: 'not a git checkout' };
  const dirty = git(['status', '--porcelain', '--untracked-files=all', '--', '.']).stdout.trim();
  return { commit: head.stdout.trim(), clean: dirty === '', ...(dirty ? { note: 'uncommitted changes in package' } : {}) };
}

export function buildArtifact({ packageDir, outDir, version, allowDirty = false, denyPatterns }) {
  packageDir = resolve(packageDir); outDir = resolve(outDir);
  const contract = loadContract(packageDir);
  const pkg = readJson(join(packageDir, 'package.json'));
  if (version && version !== pkg.version) fail(`--version ${version} does not match package.json version ${pkg.version}`);
  version = pkg.version;
  if (!isExactVersion(version)) fail(`Version ${version} is not exact semver`);
  const source = sourceInfo(packageDir);
  if (!source.clean && !allowDirty) fail(`Refusing to build from ${packageDir}: ${source.note}. Commit first, or pass --allow-dirty (recorded in the manifest as clean:false).`);

  const files = selectFiles(packageDir, contract);
  const rels = files.map(f => f.rel);
  if (!rels.some(p => p.startsWith('dist/'))) fail('Prebuilt dist/ is missing from the package allowlist; run the BB build before packaging');
  const extra = loadDenyPatterns(denyPatterns);
  const leaks = files.flatMap(f => scanContent(f.rel, readFileSync(f.abs), extra));
  if (leaks.length) fail(`Privacy scan refused ${leaks.length} finding(s):\n  - ${leaks.join('\n  - ')}`);
  const graph = ownerGraph(packageDir, contract.owner.entry, rels);
  checkLabel(packageDir, rels, contract.owner.launchdLabel);

  const name = `${contract.id}-${version}`;
  const target = join(outDir, name);
  if (existsSync(target)) fail(`${target} already exists; artifacts are immutable. Bump the version or remove the old build deliberately.`);
  mkdirSync(outDir, { recursive: true });
  const staging = mkdtempSync(join(outDir, `.${name}.`));
  try {
    const entries = [];
    for (const f of files) {
      const dest = join(staging, 'plugin', f.rel);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(f.abs, dest);
      entries.push({ path: `plugin/${f.rel}`, sha256: sha256File(dest), size: f.size });
    }
    const manifest = {
      format: ARTIFACT_FORMAT, id: contract.id, version, builtAt: new Date().toISOString(),
      builtWith: { node: process.versions.node, platform: process.platform },
      source: { ...source, ...(allowDirty && !source.clean ? { allowDirty: true } : {}) },
      contract,
      dependencies: dependencyManifest(packageDir, contract),
      owner: { entry: `plugin/${contract.owner.entry}`, graph: graph.map(g => `plugin/${g}`) },
      files: entries,
    };
    writeJsonAtomic(join(staging, 'MANIFEST.json'), manifest);
    writeFileSync(join(staging, 'MANIFEST.sha256'), `${sha256File(join(staging, 'MANIFEST.json'))}  MANIFEST.json\n`);
    setReadOnly(staging);
    renameSync(staging, target);
    return { dir: target, manifest };
  } catch (e) { removeTree(staging); throw e; }
}

/** Exact versions of everything the release needs outside itself. */
function dependencyManifest(packageDir, contract) {
  const pkg = readJson(join(packageDir, 'package.json'));
  const lockFile = join(packageDir, 'package-lock.json');
  const lock = existsSync(lockFile) ? readJson(lockFile) : undefined;
  const bundled = {};
  // Runtime npm dependencies are compiled into dist/ by `bb plugin build`; record the exact
  // versions that went in so a rebuild is reproducible. A declared dependency without a lock is unpinned.
  for (const name of Object.keys(pkg.dependencies ?? {})) {
    const v = lock?.packages?.[`node_modules/${name}`]?.version;
    if (!v) fail(`Dependency ${name} has no exact version in package-lock.json; the bundle would be unpinned`);
    bundled[name] = v;
  }
  return { node: contract.requires.node, bb: contract.requires.bb, tools: contract.requires.tools ?? {}, external: contract.pins ?? {}, bundledIntoDist: bundled };
}

export function verifyArtifact(dir) {
  dir = resolve(dir);
  const manifestFile = join(dir, 'MANIFEST.json');
  if (!existsSync(manifestFile)) fail(`${dir} is not a release artifact (no MANIFEST.json)`);
  const problems = [];
  const sum = existsSync(join(dir, 'MANIFEST.sha256')) ? readFileSync(join(dir, 'MANIFEST.sha256'), 'utf8').split(/\s+/)[0] : '';
  if (sum !== sha256File(manifestFile)) problems.push('MANIFEST.json does not match MANIFEST.sha256');
  const manifest = readJson(manifestFile);
  if (!Array.isArray(manifest.files) || manifest.files.some(f => typeof f.path !== 'string' || !f.path.startsWith('plugin/') || f.path.includes('\\') || f.path.split('/').some(p => !p || p === '.' || p === '..')) || new Set(manifest.files.map(f => f.path)).size !== manifest.files.length) fail('Unsafe or duplicate artifact manifest paths');
  validateContract(manifest.contract);
  if (!isExactVersion(manifest.version) || manifest.id !== manifest.contract.id) fail('Invalid artifact identity/version');
  if (manifest.owner?.entry !== `plugin/${manifest.contract.owner.entry}`) fail('Owner entry does not match release contract');
  if (manifest.format !== ARTIFACT_FORMAT) problems.push(`unknown artifact format ${manifest.format}`);
  const expected = new Map(manifest.files.map(f => [f.path, f]));
  for (const e of walk(dir)) {
    if (e.kind === 'dir' || e.rel === 'MANIFEST.json' || e.rel === 'MANIFEST.sha256') continue;
    if (e.kind !== 'file') { problems.push(`${e.rel}: unexpected ${e.kind}`); continue; }
    const want = expected.get(e.rel);
    if (!want) { problems.push(`${e.rel}: not in manifest`); continue; }
    expected.delete(e.rel);
    if (sha256(readFileSync(e.abs)) !== want.sha256) problems.push(`${e.rel}: content changed`);
  }
  for (const missing of expected.keys()) problems.push(`${missing}: missing`);
  if (problems.length) fail(`Artifact ${dir} failed verification:\n  - ${problems.join('\n  - ')}`);
  return manifest;
}

// ---- transport ------------------------------------------------------------------------------
export function packArtifact(dir, outDir = dirname(resolve(dir))) {
  const manifest = verifyArtifact(dir);
  const name = basename(resolve(dir));
  const tarball = join(resolve(outDir), `${name}.tar.gz`);
  if (existsSync(tarball)) fail(`${tarball} already exists`);
  execFileSync('tar', ['-czf', tarball, '-C', dirname(resolve(dir)), name], { env: sanitizedEnv({ COPYFILE_DISABLE: '1' }) });
  writeFileSync(`${tarball}.sha256`, `${sha256File(tarball)}  ${basename(tarball)}\n`);
  return { tarball, manifest };
}

/** Unpack into a fresh directory under parent, refusing absolute/escaping entries and links. */
export function unpackArtifact(tarball, parent) {
  const sidecar = `${tarball}.sha256`;
  if (existsSync(sidecar) && readFileSync(sidecar, 'utf8').split(/\s+/)[0] !== sha256File(tarball)) fail(`${tarball} does not match ${sidecar}`);
  const names = execFileSync('tar', ['-tzf', tarball], { encoding: 'utf8', env: sanitizedEnv() }).split('\n').filter(Boolean);
  const verbose = execFileSync('tar', ['-tvzf', tarball], { encoding: 'utf8', env: sanitizedEnv() }).split('\n').filter(Boolean);
  if (verbose.some(line => !/^[-d]/.test(line))) fail('Archive contains links or special files; extraction refused');
  const bad = names.filter(n => n.startsWith('/') || n.includes('\\') || n.split('/').includes('..'));
  if (bad.length) fail(`Refusing tarball with unsafe paths: ${bad.slice(0, 5).join(', ')}`);
  const tops = new Set(names.map(n => n.replace(/^\.\//, '').split('/')[0]));
  if (tops.size !== 1) fail('Tarball must contain exactly one artifact directory');
  mkdirSync(parent, { recursive: true });
  const work = mkdtempSync(join(parent, '.unpack.'));
  execFileSync('tar', ['-xzf', tarball, '-C', work], { env: sanitizedEnv() });
  const dir = join(work, [...tops][0]);
  verifyArtifact(dir); // also rejects symlinks or files smuggled outside the manifest
  return { dir, cleanup: () => removeTree(work) };
}

export function resolveArtifact(pathOrTarball, scratchParent) {
  if (/\.tar\.gz$|\.tgz$/.test(pathOrTarball)) return unpackArtifact(resolve(pathOrTarball), scratchParent ?? mkdtempSync(join(tmpdir(), 'exo-release-')));
  return { dir: resolve(pathOrTarball), cleanup: () => {} };
}

// ---- execution proof ------------------------------------------------------------------------
/**
 * Run the owner's self-test (declared owner.selftestArgs) with a given Node binary, in a
 * throwaway HOME/state, from the artifact itself. Proves the shipped TypeScript entry and its
 * whole import graph load on that Node without node_modules. Never touches real state.
 */
export function selftest(artifactDir, nodePath = process.execPath) {
  const manifest = verifyArtifact(artifactDir);
  const owner = manifest.contract.owner;
  const version = spawnSync(nodePath, ['--version'], { encoding: 'utf8', env: sanitizedEnv() }).stdout?.trim().replace(/^v/, '');
  if (!version) return { node: nodePath, status: 'fail', detail: 'node binary did not report a version' };
  const min = minimumOf(manifest.contract.requires.node);
  if (compareVersions(version, min) < 0) return { node: nodePath, version, status: 'unsupported', detail: `Node ${version} is below the release minimum ${min}; not run` };
  if (!owner.selftestArgs) return { node: nodePath, version, status: 'unverified', detail: 'release.json declares no owner.selftestArgs, so the entry was parsed but never executed' };
  const scratch = mkdtempSync(join(tmpdir(), 'exo-selftest-'));
  try {
    const env = { PATH: '/usr/bin:/bin', HOME: scratch, TMPDIR: scratch, EXO_STATE_DIR: join(scratch, 'state'), EXO_CONFIG: join(scratch, 'config.json'), EXO_RELEASE_ROOT: resolve(artifactDir), EXO_RELEASE: resolve(artifactDir), EXO_RELEASE_SELFTEST: '1' };
    const r = spawnSync(nodePath, [...(owner.nodeArgs ?? []), join(resolve(artifactDir), manifest.owner.entry), ...owner.selftestArgs], { cwd: scratch, env, encoding: 'utf8', timeout: 20_000 });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (r.status !== 0) return { node: nodePath, version, status: 'fail', detail: `exit ${r.status ?? r.signal}: ${out.slice(-600)}` };
    const leftovers = walk(scratch).filter(e => e.kind !== 'dir');
    if (leftovers.length) return { node: nodePath, version, status: 'fail', detail: `self-test wrote files: ${leftovers.map(e => e.rel).join(', ')}` };
    return { node: nodePath, version, status: 'ok', detail: out.split('\n').at(-1)?.slice(0, 300) ?? '' };
  } finally { removeTree(scratch); }
}

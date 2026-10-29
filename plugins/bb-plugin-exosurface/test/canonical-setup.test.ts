// Synthetic unit transport/files only; real OptChat/Pi proof is recorded separately.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, realpathSync, appendFileSync, symlinkSync, lstatSync, readdirSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { canonicalSetup, setupStatus, recoverSetupLock, type SetupRequest, type CanonicalSetupPorts } from '../legacy/primary/src/canonical-setup.ts';
import { INITIALIZATION, freshCanonicalReceipt } from '../legacy/primary/src/canonical-fresh.ts';
import { canonicalNativeAdapter, canonicalBBNativeAdapter, canonicalSystemPorts, vaultHost } from '../legacy/primary/src/canonical-system.ts';
import { consumeCanonicalInitialization, initializationControl } from '../legacy/primary/src/canonical-control.ts';
import { save } from '../src/store.ts';
function fixture() {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'cu-'))), vault = join(root, 'vault'); mkdirSync(vault);
  const request: SetupRequest = { operationId: 'unit-operation-01', authorizeInitialization: true, home: join(root, 'state'), optchatHome: join(root, 'optchat-home'), profile: 'unit', vault, piCli: join(root, 'cli.js'), optchat: join(root, 'optchat-code'), projectId: 'unit-project' };
  const count = { profiles: 0, userRecords: 0, spawns: 0, modelRequests: 0 };
  const session = { id: 'unit-session', file: join(request.optchatHome, 'pi-sessions', 'unit-session.jsonl') };
  const ports: CanonicalSetupPorts = {
    nativeDispatchAllowed: true, async configureLocal() {},
    async createProfile(r) { count.profiles++; const dir = join(r.optchatHome, 'profiles', r.profile); mkdirSync(dir, { recursive: true }); save(join(dir, 'config.json'), { compactor: {}, subagent: {} }); writeFileSync(join(dir, 'AGENTS.md'), '# synthetic unit fixture only'); },
    async validateProfile(r) { assert.ok(existsSync(join(r.optchatHome, 'profiles', r.profile, 'config.json'))); },
    async initializeSession(r) { if (!existsSync(session.file)) { count.userRecords++; mkdirSync(join(r.optchatHome, 'pi-sessions'), { recursive: true }); writeFileSync(session.file, [{ type: 'session', id: session.id }, { type: 'message', message: { role: 'user', content: [{ type: 'text', text: INITIALIZATION }] } }, { type: 'custom', customType: 'optchat.profile', data: { name: r.profile } }].map(e => JSON.stringify(e)).join('\n') + '\n'); } return session; },
    async spawnThread(r) { count.spawns++; assert.equal(setupStatus(r.home)?.stage, 'spawning'); assert.deepEqual(consumeCanonicalInitialization(r.home, 'unit-thread', [{ type: 'text', text: initializationControl(r.operationId) }]), { providerThreadId: 'exo:unit:main' }); return { id: 'unit-thread' }; },
    async verifyThread() {},
  };
  return { root, request, ports, session, count, close: () => rmSync(root, { recursive: true, force: true }) };
}
test('canonical setup exact retry + committed native journal prefix preserves initialization identity', async () => {
  const f = fixture(); try { const first = await canonicalSetup(f.request, f.ports); appendFileSync(f.session.file, JSON.stringify({ type: 'model_change', provider: 'unit', modelId: 'unit' }) + '\n'); assert.deepEqual(await canonicalSetup(f.request, f.ports), first); assert.deepEqual(f.count, { profiles: 1, userRecords: 1, spawns: 1, modelRequests: 0 }); assert.equal(freshCanonicalReceipt(f.request.home, f.request.optchatHome, 'unit')?.sessionId, f.session.id); } finally { f.close(); }
});
test('canonical setup native production gate makes zero writes/calls', async () => { const f = fixture(); try { await assert.rejects(canonicalSetup(f.request, { ...f.ports, nativeDispatchAllowed: false }), /separately gated/); assert.ok(!existsSync(f.request.home)); assert.equal(f.count.spawns, 0); const native = canonicalNativeAdapter({ async create() { throw Error('must not dispatch'); }, async get() { throw Error('must not read'); } }); await assert.rejects(native.spawnThread(f.request), /not approved/); } finally { f.close(); } });
test('unknown spawn fails closed across retry; no title/absence adoption', async () => { const f = fixture(); try { f.ports.spawnThread = async () => { f.count.spawns++; throw Error('connection lost after dispatch'); }; await assert.rejects(canonicalSetup(f.request, f.ports), /connection lost/); assert.equal(setupStatus(f.request.home)?.stage, 'spawning'); await assert.rejects(canonicalSetup(f.request, f.ports), /outcome unknown; explicit reconciliation required/); assert.equal(f.count.spawns, 1); assert.equal(f.count.userRecords, 1); } finally { f.close(); } });
test('interrupted Pi append resumes same identity without second user record', async () => { const f = fixture(); try { const real = f.ports.initializeSession; let once = true; f.ports.initializeSession = async r => { const value = await real(r); if (once) { once = false; throw Error('simulated interruption'); } return value; }; await assert.rejects(canonicalSetup(f.request, f.ports), /simulated/); assert.equal(setupStatus(f.request.home)?.stage, 'session-intent'); await canonicalSetup(f.request, f.ports); assert.equal(f.count.userRecords, 1); } finally { f.close(); } });
test('interrupted verify/binding retries known native ID without dispatch', async () => { const f = fixture(); try { let once = true; f.ports.verifyThread = async () => { if (once) { once = false; throw Error('interrupted before binding'); } }; await assert.rejects(canonicalSetup(f.request, f.ports), /interrupted/); assert.equal(setupStatus(f.request.home)?.stage, 'thread-ready'); await canonicalSetup(f.request, f.ports); assert.equal(f.count.spawns, 1); } finally { f.close(); } });
test('concurrent presses refuse while owner holds exclusive setup lock', async () => { const f = fixture(); try { let release!: () => void, entered!: () => void; const barrier = new Promise<void>(r => { release = r; }), started = new Promise<void>(r => { entered = r; }); const real = f.ports.createProfile; f.ports.createProfile = async r => { entered(); await barrier; await real(r); }; const first = canonicalSetup(f.request, f.ports); await started; await assert.rejects(canonicalSetup(f.request, f.ports), /EEXIST/); release(); await first; assert.equal(f.count.profiles, 1); assert.equal(f.count.spawns, 1); } finally { f.close(); } });
test('foreign profile/home and existing owner pointer are never adopted or poisoned', async () => { for (const kind of ['profile', 'pointer']) { const f = fixture(); try { if (kind === 'profile') mkdirSync(f.request.optchatHome); else save(join(f.request.home, 'canonical-thread.json'), { threadId: 'foreign' }); await assert.rejects(canonicalSetup(f.request, f.ports), /Foreign/); assert.equal(f.count.profiles, 0); assert.ok(!existsSync(join(f.request.home, 'canonical-fresh.json'))); if (kind === 'pointer') assert.deepEqual(JSON.parse(readFileSync(join(f.request.home, 'canonical-thread.json'), 'utf8')), { threadId: 'foreign' }); } finally { f.close(); } } });
test('different operation, project, workspace, or authorization refuses rebind', async () => { const f = fixture(); try { await canonicalSetup(f.request, f.ports); for (const patch of [{ operationId: 'different-operation' }, { projectId: 'foreign-project' }]) await assert.rejects(canonicalSetup({ ...f.request, ...patch }, f.ports), /exact-operation conflict/); await assert.rejects(canonicalSetup({ ...f.request, authorizeInitialization: false } as unknown as SetupRequest, f.ports), /authorization/); assert.equal(f.count.spawns, 1); } finally { f.close(); } });
test('explicit dead-lock recovery refuses live PID and foreign operations', async () => { const f = fixture(); try { await canonicalSetup(f.request, f.ports); const lock = join(f.request.home, 'canonical-setup.lock'); save(lock, { operationId: f.request.operationId, pid: process.pid }); assert.throws(() => recoverSetupLock(f.request), /still running/); save(lock, { operationId: f.request.operationId, pid: 99999999 }); assert.throws(() => recoverSetupLock({ ...f.request, operationId: 'foreign-operation' }), /Foreign/); recoverSetupLock(f.request); assert.ok(!existsSync(lock)); } finally { f.close(); } });
test('native adapter refuses foreign provider/project/id evidence', async () => { const f = fixture(); try { const api = canonicalNativeAdapter({ async create() { return { id: 'unit-thread' }; }, async get() { return { id: 'unit-thread', projectId: 'wrong', providerId: 'exo-spike' }; } }, true); await assert.rejects(api.verifyThread(f.request, 'unit-thread'), /identity changed/); } finally { f.close(); } });
test('reserved controls are consumed idempotently; stale, mixed, unknown controls fail without forwarding', async () => { const f = fixture(); try { await canonicalSetup(f.request, f.ports); const input = [{ type: 'text', text: initializationControl(f.request.operationId) }]; assert.ok(consumeCanonicalInitialization(f.request.home, 'unit-thread', input)); assert.throws(() => consumeCanonicalInitialization(f.request.home, 'other-thread', input), /Invalid/); assert.throws(() => consumeCanonicalInitialization(f.request.home, 'unit-thread', [{ type: 'text', text: '/exosurface-initialize wrong' }]), /Invalid/); assert.throws(() => consumeCanonicalInitialization(f.request.home, 'unit-thread', [...input, { type: 'text', text: 'ordinary prompt' }]), /Invalid/); assert.equal(consumeCanonicalInitialization(f.request.home, 'unit-thread', [{ type: 'text', text: 'ordinary prompt' }]), undefined); assert.equal(f.count.modelRequests, 0); } finally { f.close(); } });
test('known partial binding files resume; missing commit marker never starts owner', async () => { for (const missing of ['canonical-fresh.json', 'canonical-fresh-committed.json', 'canonical-thread.json', 'bindings/unit-thread.json']) { const f = fixture(); try { await canonicalSetup(f.request, f.ports); rmSync(join(f.request.home, missing)); const journal = setupStatus(f.request.home)!; journal.stage = 'thread-ready'; save(join(f.request.home, 'canonical-setup.json'), journal); rmSync(join(f.request.home, 'canonical-fresh-committed.json'), { force: true }); if (missing !== 'canonical-fresh.json') assert.throws(() => freshCanonicalReceipt(f.request.home, f.request.optchatHome, 'unit'), /ENOENT/); await canonicalSetup(f.request, f.ports); assert.equal(f.count.spawns, 1); } finally { f.close(); } } });
test('commit-before-journal crash accepts validated immutable prefix after later native metadata', async () => { const f = fixture(); try { await canonicalSetup(f.request, f.ports); const journal = setupStatus(f.request.home)!; journal.stage = 'thread-ready'; save(join(f.request.home, 'canonical-setup.json'), journal); appendFileSync(f.session.file, JSON.stringify({ type: 'thinking_level_change', thinkingLevel: 'high' }) + '\n'); await canonicalSetup(f.request, f.ports); assert.equal(setupStatus(f.request.home)?.stage, 'bound'); assert.equal(f.count.spawns, 1); } finally { f.close(); } });
test('native journal tamper, binding/provider tamper and foreign marker fail closed', async () => { for (const kind of ['prefix', 'provider', 'marker']) { const f = fixture(); try { await canonicalSetup(f.request, f.ports); if (kind === 'prefix') writeFileSync(f.session.file, readFileSync(f.session.file, 'utf8').replace('initialization.', 'INITIALIZATION.')); if (kind === 'provider') { const file = join(f.request.home, 'bindings/unit-thread.json'); const value = JSON.parse(readFileSync(file, 'utf8')); value.providerThreadId = 'exo:foreign:main'; save(file, value); } if (kind === 'marker') save(join(f.request.home, 'canonical-fresh-committed.json'), { operationId: 'foreign' }); await assert.rejects(canonicalSetup(f.request, f.ports)); assert.equal(f.count.spawns, 1); } finally { f.close(); } } });
test('oversize and imported/pending native state refuse BEFORE any native spawn', async () => { for (const kind of ['oversize', 'pending', 'active-memory']) { const f = fixture(); try { const initialize = f.ports.initializeSession; f.ports.initializeSession = async r => { const session = await initialize(r); if (kind === 'oversize') appendFileSync(session.file, JSON.stringify({ type: 'custom', data: 'x'.repeat(65536) }) + '\n'); else save(join(r.optchatHome, 'profiles', r.profile, kind === 'pending' ? 'imports/pending.json' : 'active-memory.json'), {}); return session; }; await assert.rejects(canonicalSetup(f.request, f.ports), /bound|pending|imported/); assert.equal(f.count.spawns, 0); assert.ok(!existsSync(join(f.request.home, 'canonical-fresh.json'))); } finally { f.close(); } } });
test('long socket names fail before local/profile/session/native writes', async () => { const f = fixture(); try { await assert.rejects(canonicalSetup({ ...f.request, optchatHome: join(f.root, 'a'.repeat(110)) }, f.ports), /socket paths/); assert.equal(f.count.profiles, 0); assert.ok(!existsSync(f.request.home)); } finally { f.close(); } });
test('exact platform socket boundary succeeds; one extra UTF-8 byte refuses with zero setup writes', async () => { const limit = process.platform === 'darwin' ? 103 : 107; for (const extra of [0, 1]) { const f = fixture(); try { const suffix = `/profiles/${f.request.profile}/windows.sock`; const optchatHome = join(f.root, 's'.repeat(limit - Buffer.byteLength(f.root + '/') - Buffer.byteLength(suffix) + extra)); assert.equal(Buffer.byteLength(optchatHome + suffix), limit + extra); f.session.file = join(optchatHome, 'pi-sessions', 'unit-session.jsonl'); let localWrites = 0; f.ports.configureLocal = () => { localWrites++; }; if (!extra) { await canonicalSetup({ ...f.request, optchatHome }, f.ports); assert.equal(f.count.spawns, 1); } else { await assert.rejects(canonicalSetup({ ...f.request, optchatHome }, f.ports), /socket paths/); assert.equal(localWrites, 0); assert.equal(f.count.profiles, 0); assert.equal(f.count.userRecords, 0); assert.equal(f.count.spawns, 0); assert.ok(!existsSync(f.request.home)); assert.ok(!existsSync(optchatHome)); } } finally { f.close(); } } });
test('symlink profile inputs and a concurrent recovery guard fail closed without native effects', async () => { for (const kind of ['symlink', 'recovery']) { const f = fixture(); try { if (kind === 'symlink') { const initialize = f.ports.initializeSession; f.ports.initializeSession = async r => { const session = await initialize(r), config = join(r.optchatHome, 'profiles', r.profile, 'config.json'), target = join(f.root, 'foreign.json'); writeFileSync(target, readFileSync(config)); rmSync(config); symlinkSync(target, config); return session; }; await assert.rejects(canonicalSetup(f.request, f.ports), /symlink/); } else { mkdirSync(f.request.home); writeFileSync(join(f.request.home, 'canonical-setup-recovery.lock'), 'owned by another recovery'); await assert.rejects(canonicalSetup(f.request, f.ports), /recovery/); assert.equal(f.count.profiles, 0); } assert.equal(f.count.spawns, 0); } finally { f.close(); } } });
test('foreign symlink and unknown-stage journals refuse before configuration or external effects', async () => { for (const kind of ['symlink', 'unknown-stage']) { const f = fixture(); try { let localWrites = 0; f.ports.configureLocal = async () => { localWrites++; }; mkdirSync(f.request.home, { recursive: true }); const target = join(f.root, 'foreign-journal.json'), journal = join(f.request.home, 'canonical-setup.json'), bytes = JSON.stringify({ schema: 'exosurface-canonical-setup/0', request: f.request, stage: kind === 'symlink' ? 'claimed' : 'future-stage' }); writeFileSync(target, bytes); if (kind === 'symlink') symlinkSync(target, journal); else writeFileSync(journal, bytes); await assert.rejects(canonicalSetup(f.request, f.ports), /regular file|exact-operation conflict/); assert.equal(readFileSync(target, 'utf8'), bytes); assert.equal(localWrites, 0); assert.deepEqual(f.count, { profiles: 0, userRecords: 0, spawns: 0, modelRequests: 0 }); assert.equal(existsSync(f.request.optchatHome), false); } finally { f.close(); } } });

// Synthetic package provenance/transport only; no public CLI, profile helper or
// native API runs in these focused filesystem regressions.
function systemFixture() {
  const f = fixture(), localConfig = join(f.root, 'local.json');
  f.request.piCli = join(f.root, 'pi', 'dist', 'bundle', 'cli.js');
  save(join(f.request.optchat, 'package.json'), { name: 'pi-optchat', version: '0.8.6' });
  save(join(f.root, 'pi', 'package.json'), { name: '@earendil-works/pi-coding-agent', version: '1.1.0' });
  let environments = 0;
  const system = canonicalSystemPorts({ localConfig, runtimeRoot: f.root, node: process.execPath,
    native: { nativeDispatchAllowed: true, spawnThread: f.ports.spawnThread, verifyThread: f.ports.verifyThread },
    instrumentEnvironment(env) { environments++; return env; },
  });
  return { ...f, localConfig, system, environments: () => environments };
}
test('runtime leaf links, including dangling links, refuse fresh setup and matching-config retry before effects', async () => {
  for (const name of ['pi-config', 'setup-home', 'setup-tmp']) for (const resume of [false, true]) for (const dangling of [false, true]) {
    const f = systemFixture(); try {
      if (resume) await f.system.configureLocal(f.request); else mkdirSync(f.request.home);
      const before = resume ? readFileSync(f.localConfig, 'utf8') : undefined;
      const path = join(f.request.home, name), target = join(f.root, 'foreign');
      rmSync(path, { recursive: true, force: true }); if (!dangling) mkdirSync(target); symlinkSync(target, path);
      for (let retry = 0; retry < 2; retry++) {
        await assert.rejects(f.system.configureLocal(f.request), /runtime paths must be real directories/);
        await assert.rejects(canonicalSetup(f.request, { ...f.ports, configureLocal: f.system.configureLocal }), /runtime paths must be real directories/);
      }
      // Also reject a changed directory immediately before env/child creation,
      // even when the caller bypasses orchestration/configuration on retry.
      await assert.rejects(f.system.createProfile(f.request), /runtime (paths|directory)/);
      await assert.rejects(f.system.initializeSession(f.request), /runtime (paths|directory)/);
      assert.equal(f.environments(), 0); assert.deepEqual(f.count, { profiles: 0, userRecords: 0, spawns: 0, modelRequests: 0 });
      assert.ok(lstatSync(path).isSymbolicLink());
      if (dangling) assert.equal(existsSync(target), false); else assert.deepEqual(readdirSync(target), []);
      assert.equal(existsSync(f.localConfig), resume); if (resume) assert.equal(readFileSync(f.localConfig, 'utf8'), before);
      assert.equal(existsSync(join(f.request.home, 'canonical-setup.json')), false);
    } finally { f.close(); }
  }
});
test('runtime ancestor links and non-directory entries refuse before mkdir/config/env/child', async () => {
  for (const kind of ['live-ancestor', 'dangling-ancestor', 'file-ancestor', 'file-leaf']) {
    const f = systemFixture(); try {
      await f.system.configureLocal(f.request); const before = readFileSync(f.localConfig, 'utf8');
      const path = kind === 'file-leaf' ? join(f.request.home, 'pi-config') : f.request.home, backup = join(f.root, 'owned-backup'), target = join(f.root, 'foreign');
      renameSync(path, backup);
      if (kind === 'live-ancestor') { mkdirSync(target); symlinkSync(target, path); }
      else if (kind === 'dangling-ancestor') symlinkSync(target, path);
      else writeFileSync(path, 'foreign directory entry');
      await assert.rejects(f.system.configureLocal(f.request), /runtime paths must be real directories/);
      await assert.rejects(canonicalSetup(f.request, { ...f.ports, configureLocal: f.system.configureLocal }), /runtime paths must be real directories|refuses symlink paths/);
      assert.equal(readFileSync(f.localConfig, 'utf8'), before); assert.equal(f.environments(), 0);
      assert.deepEqual(f.count, { profiles: 0, userRecords: 0, spawns: 0, modelRequests: 0 });
      if (kind === 'live-ancestor') assert.deepEqual(readdirSync(target), []); else assert.equal(existsSync(target), false);
      if (kind.startsWith('file-')) assert.equal(readFileSync(path, 'utf8'), 'foreign directory entry');
      rmSync(path); renameSync(backup, path); await f.system.configureLocal(f.request); // owned exact retry remains usable
    } finally { f.close(); }
  }
});
test('valid configured runtime directories preserve state across normal setup and exact-operation retry', async () => {
  const f = systemFixture(); try {
    const ports = { ...f.ports, configureLocal: f.system.configureLocal };
    const first = await canonicalSetup(f.request, ports), file = join(f.request.home, 'pi-config', 'owned.json');
    writeFileSync(file, 'owned state'); const before = readFileSync(f.localConfig, 'utf8');
    const inodes = ['pi-config', 'setup-home', 'setup-tmp'].map(name => lstatSync(join(f.request.home, name)).ino);
    assert.deepEqual(await canonicalSetup(f.request, ports), first);
    assert.deepEqual(['pi-config', 'setup-home', 'setup-tmp'].map(name => lstatSync(join(f.request.home, name)).ino), inodes);
    assert.equal(readFileSync(file, 'utf8'), 'owned state'); assert.equal(readFileSync(f.localConfig, 'utf8'), before);
    assert.deepEqual(f.count, { profiles: 1, userRecords: 1, spawns: 1, modelRequests: 0 });
  } finally { f.close(); }
});

test('public BB native adapter remains denied by default; explicitly authorized adapter uses only initialization control', async () => {
  const f = fixture(); let calls = 0;
  const threads = { async spawn(input: any) { calls++; assert.deepEqual(input, { projectId: f.request.projectId, environment: { type: 'host', workspace: { type: 'unmanaged', path: f.request.vault } }, providerId: 'exo-spike', model: 'exo-opus-5-5', reasoningLevel: 'high', permissionMode: 'full', title: 'Exo initialization', prompt: initializationControl(f.request.operationId) }); return { id: 'unit-thread' }; }, async get() { return { id: 'unit-thread', projectId: f.request.projectId, providerId: 'exo-spike' }; } };
  try {
    await assert.rejects(canonicalBBNativeAdapter(threads as any).spawnThread(f.request), /not approved/); assert.equal(calls, 0);
    const authorized = canonicalBBNativeAdapter(threads as any, true);
    assert.deepEqual(await authorized.spawnThread(f.request), { id: 'unit-thread' }); await authorized.verifyThread(f.request, 'unit-thread'); assert.equal(calls, 1);
  } finally { f.close(); }
});
test('authorized BB adapter runs on the project source host at the vault path; other projects refuse before spawn', async () => {
  const f = fixture(); const spawned: any[] = [];
  const threads = { async spawn(input: any) { spawned.push(input); return { id: 'unit-thread' }; }, async get() { return { id: 'unit-thread', projectId: f.request.projectId, providerId: 'exo-spike' }; } };
  const projects = (sources: any[]) => ({ async get() { return { id: f.request.projectId, sources }; } });
  try {
    await canonicalBBNativeAdapter(threads as any, true, projects([{ hostId: 'host_a', path: f.request.vault }, { hostId: 'host_b', path: '/elsewhere' }]) as any).spawnThread(f.request);
    assert.equal(spawned[0].environment.hostId, 'host_a'); assert.deepEqual(spawned[0].environment.workspace, { type: 'unmanaged', path: f.request.vault });
    await assert.rejects(vaultHost(projects([{ hostId: 'host_b', path: '/elsewhere' }]) as any, f.request), /exactly the workspace path/);
    await assert.rejects(vaultHost(projects([]) as any, f.request), /exactly the workspace path/); assert.equal(spawned.length, 1);
  } finally { f.close(); }
});
test('system configuration preserves an explicitly selected isolated owner supervisor label', async () => {
  const f = systemFixture(); try {
    const isolated = canonicalSystemPorts({ localConfig: f.localConfig, runtimeRoot: f.root, node: process.execPath, native: f.ports, ownerLabel: 'app.exosurface.owner.disposable' });
    await isolated.configureLocal(f.request); const before = readFileSync(f.localConfig, 'utf8');
    assert.equal(JSON.parse(before).ownerLabel, 'app.exosurface.owner.disposable');
    await isolated.configureLocal(f.request); assert.equal(readFileSync(f.localConfig, 'utf8'), before);
  } finally { f.close(); }
});
test('runtime root resolves to the consolidated plugin package, not legacy/primary', async () => {
  const { SOURCE } = await import('../legacy/primary/src/state.ts');
  assert.equal(JSON.parse(readFileSync(join(SOURCE, 'package.json'), 'utf8')).name, 'bb-plugin-exosurface');
  assert.ok(existsSync(join(SOURCE, 'build-runtime.mjs')));
});

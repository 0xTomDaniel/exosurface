import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, realpathSync, existsSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { bootstrap, type Ports } from '../src/bootstrap.ts';
import { layout, profileDir, type Config } from '../src/config.ts';
import { childEnv } from '../src/env.ts';
import { save } from '../src/store.ts';
import { startOwner } from '../src/owner-runtime.ts';
import { ownerConnection } from '../src/owner-client.ts';
import { fixtureCleanup } from './fixture-cleanup.ts';
import { settled } from './wait.ts';
import { PARENT_WATCH, reaped, reapOnExit } from './reap.ts';

const model = { provider: 'fixture', model: 'mock', thinking: 'medium' as const };
function fixture(t: any) {
  const home = mkdtempSync(join(tmpdir(), 'exo-fr-')), cleanup = fixtureCleanup(t, home);
  const vault = join(home, 'vault'); mkdirSync(vault); writeFileSync(join(vault, 'AGENTS.md'), '# Generic owner\n');
  const config: Config = { file: join(home, 'config.json'), vault, stateDir: join(home, 'state'), agentDir: join(home, 'agent'), profile: 'exo', piCli: join(home, 'pi.mjs'), optchat: join(home, 'optchat'), node: process.execPath, models: { main: model, compactor: model, subagent: model }, exosurfacePlugin: '' };
  save(config.file, config); return { home, config, cleanup };
}
function ports(config: Config) {
  let created = 0, configured = 0; const threads = new Map<string, { id: string }>();
  const p: Ports = {
    async createProfile() { mkdirSync(profileDir(config), { recursive: true }); save(join(profileDir(config), 'config.json'), { fixture: true }); },
    async validateProfile() { assert.ok(existsSync(join(profileDir(config), 'config.json'))); },
    async configureProfile() { configured++; },
    async findThread(key) { return threads.get(key); },
    async createThread(key) { created++; const th = { id: `thread-${created}` }; threads.set(key, th); return th; },
  };
  return { p, threads, counts: () => ({ created, configured }) };
}
void test('fresh + retry use one profile/thread; no active-memory fabricated; preserve vault', async t => {
  const { config } = fixture(t), m = ports(config), before = readFileSync(join(config.vault, 'AGENTS.md'), 'utf8');
  assert.deepEqual(await bootstrap(config, m.p), { threadId: 'thread-1', profile: 'exo' });
  await bootstrap(config, m.p); assert.deepEqual(m.counts(), { created: 1, configured: 1 });
  assert.equal(existsSync(join(profileDir(config), 'active-memory.json')), false);
  assert.equal(readFileSync(join(config.vault, 'AGENTS.md'), 'utf8'), before);
});
void test('profile configured interrupted; retries without replacement', async t => {
  const { config } = fixture(t), m = ports(config); let fail = true;
  const configure = m.p.configureProfile; m.p.configureProfile = async () => { if (fail) { fail = false; throw Error('interrupted'); } await configure(); };
  await assert.rejects(bootstrap(config, m.p), /interrupted/);
  writeFileSync(join(profileDir(config), 'owner-note'), 'retain'); await bootstrap(config, m.p);
  assert.equal(readFileSync(join(profileDir(config), 'owner-note'), 'utf8'), 'retain');
});
void test('existing profile unclaimed or newer state refuses, zero overwrite', async t => {
  const { config } = fixture(t), m = ports(config); mkdirSync(profileDir(config), { recursive: true });
  await assert.rejects(bootstrap(config, m.p), /refusing adoption/);
  save(layout(config.stateDir).schemaFile, { schema: 2 });
  await assert.rejects(bootstrap(config, m.p), /Unsupported state schema/);
  assert.equal(readFileSync(layout(config.stateDir).schemaFile, 'utf8'), '{\n  "schema": 2\n}\n');
});
void test('durable lookup recovers BB-created thread before local receipt, never unrelated candidate', async t => {
  const { config } = fixture(t), m = ports(config); const create = m.p.createThread; let fail = true;
  m.p.createThread = async key => { const th = await create(key); if (fail) { fail = false; throw Error('after durable BB metadata'); } return th; };
  await assert.rejects(bootstrap(config, m.p));
  m.threads.set('unrelated', { id: 'unrelated-thread' });
  assert.equal((await bootstrap(config, m.p)).threadId, 'thread-1'); assert.equal(m.counts().created, 1);
});
void test('uncertain BB creation before/after spawn fails closed, no second spawn', async t => {
  for (const afterSpawn of [false, true]) {
    const f = fixture(t), m = ports(f.config); let intent = false, calls = 0;
    m.p.findThread = async () => { if (intent) throw Error('unknown outcome; operation marker op-1; reconcile candidate using provider/project evidence'); return undefined; };
    m.p.createThread = async () => { intent = true; if (afterSpawn) calls++; throw Error('process interrupted'); };
    await assert.rejects(bootstrap(f.config, m.p));
    await assert.rejects(bootstrap(f.config, m.p), /unknown outcome/);
    assert.equal(calls, afterSpawn ? 1 : 0);
  }
});
void test('environment allowlist strips inherited live selectors and vendor credentials', () => {
  const env = childEnv({ OPTCHAT_HOME: '/fixture' }, { HOME: '/fixture', EXOSURFACE_HOME: '/live', PI_CODING_AGENT_DIR: '/live-pi', OPENAI_API_KEY: 'secret', EXO_CONFIG: '/live.json', OPTCHAT_HOME: '/live-optchat' });
  assert.deepEqual(env, { HOME: '/fixture', OPTCHAT_HOME: '/fixture' });
});
void test('relocated dist selftest/readiness side-effect free; missing config exits zero; newer schema fails', t => {
  const { config, home } = fixture(t), relocated = join(home, 'release');
  cpSync(resolve(import.meta.dirname, '../dist'), relocated, { recursive: true });
  // Plain .js needs package type after relocation, as in actual release artifact.
  save(join(home, 'package.json'), { type: 'module' });
  const absent = join(home, 'absent.json'), state = join(home, 'unwritten');
  const env = childEnv({ HOME: home, EXO_CONFIG: absent, EXO_STATE_DIR: state });
  const entry = join(relocated, 'first-run-shell-owner-service.js');
  const selftest = spawnSync(process.execPath, [entry, '--release-selftest'], { env, encoding: 'utf8' });
  assert.equal(selftest.status, 0, selftest.stderr); assert.equal(existsSync(state), false);
  const readiness = spawnSync(process.execPath, [entry, '--readiness'], { env, encoding: 'utf8' });
  assert.equal(readiness.status, 2); assert.equal(JSON.parse(readiness.stdout).connectivity.status, 'unverified'); assert.equal(existsSync(state), false);
  const missing = spawnSync(process.execPath, [entry], { env, encoding: 'utf8' }); assert.equal(missing.status, 0, missing.stderr);
  assert.equal(JSON.parse(readFileSync(join(state, 'owner/state.json'), 'utf8')).ready, false);
  save(join(state, 'state-schema.json'), { schema: 99 }); const before = readFileSync(join(state, 'owner/state.json'), 'utf8');
  const newer = spawnSync(process.execPath, [entry], { env, encoding: 'utf8' }); assert.equal(newer.status, 1); assert.match(newer.stderr, /Unsupported state schema/);
  assert.equal(readFileSync(join(state, 'owner/state.json'), 'utf8'), before);
});
void test('real socket → mock Pi RPC → response page; full long input; wrong thread refused', async t => {
  const { config, cleanup } = fixture(t); save(layout(config.stateDir).primary, { threadId: 'primary' }); mkdirSync(config.agentDir); save(join(config.agentDir, 'auth.json'), {});
  writeFileSync(config.piCli, `import{createInterface}from'node:readline';import{createServer}from'node:net';import{mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';
writeFileSync(join(process.env.EXO_PAGE_STATE,'fixture-pi.pid'),String(process.pid));
process.on('exit',code=>writeFileSync(join(process.env.EXO_PAGE_STATE,'fixture-pi-exit.json'),JSON.stringify({pid:process.pid,code})));
const dir=join(process.env.OPTCHAT_HOME,'profiles','exo');mkdirSync(dir,{recursive:true});const lock=createServer(s=>s.end('exo · PID '+process.pid+' · fixture'));await new Promise(r=>lock.listen(join(dir,'lock.sock'),r));
const out=x=>console.log(JSON.stringify(x));for await(const line of createInterface({input:process.stdin})){const r=JSON.parse(line);out({type:'response',id:r.id,success:true,data:{}});if(r.type==='prompt'){if(r.message==='detached owner proof')await new Promise(r=>setTimeout(r,250));out({type:'message_end',message:{role:'assistant',content:[{type:'text',text:r.message}]}});out({type:'agent_end'});}}lock.close();`);
  const owner = await startOwner(config);
  // The owner runs in this process; the Pi it starts is reaped even if this process is killed.
  await settled(() => existsSync(join(config.stateDir, 'fixture-pi.pid')), 10000, 10); reapOnExit(Number(readFileSync(join(config.stateDir, 'fixture-pi.pid'), 'utf8')));
  cleanup.beforeRemove(async () => { const pid = Number(readFileSync(join(config.stateDir, 'fixture-pi.pid'), 'utf8')); await owner.close(); assert.deepEqual(JSON.parse(readFileSync(join(config.stateDir, 'fixture-pi-exit.json'), 'utf8')), {pid,code:0}); cleanup.verifyGone(pid); });
  const text = 'x'.repeat(1800), events: any[] = []; let finish: () => void; const done = new Promise<void>(r => { finish = r; });
  const client = ownerConnection(config, e => { events.push(e); if (e.type === 'agent_end') finish(); }); cleanup.beforeRemove(() => client.close());
  await assert.rejects(client.send('unrelated', 'prompt', text), /Not the primary/);
  await client.send('primary', 'prompt', text);
  await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(Error('event timeout')), 3000))]);
  assert.equal(JSON.parse(readFileSync(join(config.stateDir, 'response-page.json'), 'utf8')).body, text);
  assert.equal(events[0].message.content[0].text.length, 1800);
  await assert.rejects(client.send('primary', 'prompt', 'x'.repeat(512 * 1024 + 1)), /524289 bytes.*Nothing was sent/);
  assert.equal(JSON.parse(readFileSync(join(config.stateDir, 'response-page.json'), 'utf8')).body, text);
  const proof = 'compiled provider proof\n' + 'Multiline 🧪 user text\n'.repeat(100) + 'FINAL FULL-TEXT SENTINEL';
  // Actual BB-built provider -> socket owner -> mock Pi -> native BB deltas and response page.
  const hostFile = resolve(import.meta.dirname, '../dist/first-run-shell-host.js');
  assert.ok(existsSync(hostFile), 'Run isolated bb plugin build before this integration test');
  const shim = `import{createInterface}from'node:readline';const{handleLine}=await import(${JSON.stringify(pathToFileURL(hostFile).href)});for await(const line of createInterface({input:process.stdin}))handleLine(line);`;
  const host = spawn(process.execPath, [...PARENT_WATCH, '--input-type=module', '-e', shim], { cwd: config.vault,
    env: { HOME: config.vault, TMPDIR: config.vault, PATH: '/usr/bin:/bin', EXO_CONFIG: config.file }, stdio: ['pipe', 'pipe', 'pipe'] });
  cleanup.child(reaped(host));
  let output = '', errors = ''; host.stdout.on('data', b => { output += b; }); host.stderr.on('data', b => { errors += b; });
  host.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'thread/start', params: {
    threadId: 'primary', cwd: config.vault, instructionMode: 'append', options: { permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null },
  } }) + '\n');
  host.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'turn/start', params: {
    threadId: 'primary', providerThreadId: 'exo:primary', clientRequestId: 'creq_23456789ab',
    options: { permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null }, input: [{ type: 'text', text: proof }],
  } }) + '\n');
  await settled(() => output.includes('compiled provider proof') && output.includes('turn.boundary'), 10000, 20);
  assert.match(output, /compiled provider proof/, errors);
  assert.match(output, /turn.boundary/);
  assert.equal(output.split('\n').filter(Boolean).map(line => JSON.parse(line)).some(v => v.error), false, output);
  assert.equal(JSON.parse(readFileSync(join(config.stateDir, 'response-page.json'), 'utf8')).body, proof);
  host.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 3, method: 'turn/start', params: {
    threadId: 'primary', providerThreadId: 'exo:primary', clientRequestId: 'creq_23456789ac',
    options: { permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null }, input: [{ type: 'text', text: 'detached owner proof' }],
  } }) + '\n');
  await settled(() => JSON.parse(readFileSync(layout(config.stateDir).ownerState, 'utf8')).busy, 10000, 10);
  assert.equal(JSON.parse(readFileSync(layout(config.stateDir).ownerState, 'utf8')).busy, true);
  await assert.rejects(client.send('primary', 'prompt', 'must not be admitted while busy'), /Owner is busy/);
  assert.equal(JSON.parse(readFileSync(layout(config.stateDir).ownerState, 'utf8')).busy, true, 'rejected prompt cannot clear admitted turn');
  host.kill(); // Simulated view/bridge loss must not abort independently owned Pi work.
  await settled(() => JSON.parse(readFileSync(join(config.stateDir, 'response-page.json'), 'utf8')).body === 'detached owner proof' && !JSON.parse(readFileSync(layout(config.stateDir).ownerState, 'utf8')).busy, 10000, 10);
  assert.equal(JSON.parse(readFileSync(join(config.stateDir, 'response-page.json'), 'utf8')).body, 'detached owner proof');
  assert.equal(JSON.parse(readFileSync(layout(config.stateDir).ownerState, 'utf8')).busy, false);

});

import { bbFirstRun } from '../src/bb-first-run.ts';
void test('concrete BB adapter uncertain before/after external create cannot duplicate or adopt unrelated', async t => {
  for (const createHappened of [false, true]) {
    const { config } = fixture(t); let calls = 0;
    const adapter = bbFirstRun(config.stateDir, 'project-1', {
      async create() { if (createHappened) calls++; throw Error('crash'); },
      async get() { throw Error('must not guess candidate'); },
    });
    await assert.rejects(adapter.createThread('operation-1'));
    await assert.rejects(adapter.findThread('operation-1'), /Operation operation-1; project project-1; provider exosurface/);
    await assert.rejects(adapter.findThread('unrelated'), /conflicts/);
    assert.equal(calls, createHappened ? 1 : 0);
  }
});
void test('concrete BB receipt survives interruption before bootstrap local receipt', async t => {
  const { config } = fixture(t); let calls = 0;
  const adapter = bbFirstRun(config.stateDir, 'project-1', { async create() { calls++; return { id: 'bb-created' }; }, async get(id) { return { id, providerId: 'exosurface', projectId: 'project-1' }; } });
  await adapter.createThread('operation-1');
  assert.deepEqual(await adapter.findThread('operation-1'), { id: 'bb-created' }); assert.equal(calls, 1);
  const changed = bbFirstRun(config.stateDir, 'project-1', { async create() { throw Error('no duplicate'); }, async get(id) { return { id, providerId: 'unrelated', projectId: 'project-1' }; } });
  await assert.rejects(changed.findThread('operation-1'), /refusing adoption/);
});

void test('BB nonempty initialization input settles locally without Pi, auth, binding or launchctl', async t => {
  const { config, cleanup } = fixture(t), key = 'setup-operation-fixture';
  save(layout(config.stateDir).firstRun, { key, profile: config.profile, vault: realpathSync(config.vault) });
  save(join(config.stateDir, 'bb-thread-intent.json'), { key, providerId: 'exosurface', projectId: 'project-1', threadId: 'new-primary', status: 'created' });
  const hostFile = resolve(import.meta.dirname, '../dist/first-run-shell-host.js');
  const shim = `import{createInterface}from'node:readline';const{handleLine}=await import(${JSON.stringify(pathToFileURL(hostFile).href)});for await(const line of createInterface({input:process.stdin}))handleLine(line);`;
  const host = spawn(process.execPath, [...PARENT_WATCH, '--input-type=module', '-e', shim], { cwd: config.vault,
    env: { HOME: config.vault, TMPDIR: config.vault, PATH: '/usr/bin:/bin', EXO_CONFIG: config.file }, stdio: ['pipe', 'pipe', 'pipe'] });
  cleanup.child(reaped(host)); let output = '', errors = '';
  host.stdout.on('data', b => { output += b; }); host.stderr.on('data', b => { errors += b; });
  host.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'thread/start', params: {
    threadId: 'new-primary', cwd: config.vault, instructionMode: 'append',
    options: { permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null },
    input: [{ type: 'text', text: `EXOSURFACE_INITIALIZE:${key}` }],
  } }) + '\n');
  await settled(() => output.includes('turn.boundary'), 10000, 10);
  assert.match(output, /turn.boundary/, errors); assert.doesNotMatch(output, /Not sent|"failed"|"error"/);
  assert.equal(existsSync(config.piCli), false); assert.equal(existsSync(config.agentDir), false);
  assert.equal(existsSync(layout(config.stateDir).ownerDir), false);
  assert.equal(existsSync(layout(config.stateDir).primary), false);
});

void test('initialization requires exact operation/vault/profile/thread and cannot replay or match ordinary text', async t => {
  const { config } = fixture(t), { consumeInitialization, initializationText } = await import('../src/setup-input.ts');
  const journal = { key: 'bound-operation', profile: config.profile, vault: realpathSync(config.vault), threadId: 'bound-thread' };
  const intent = { key: journal.key, providerId: 'exosurface', projectId: 'fixture-project', threadId: journal.threadId, status: 'created' };
  const reset = () => { save(layout(config.stateDir).firstRun, journal); save(join(config.stateDir, 'bb-thread-intent.json'), intent); };
  reset();
  for (const text of ['hello', initializationText('stale-operation'), initializationText(journal.key) + ' ', ' ' + initializationText(journal.key)]) {
    assert.equal(await consumeInitialization(config, journal.threadId, text), false);
  }
  assert.equal(await consumeInitialization(config, 'unrelated-thread', initializationText(journal.key)), false);
  assert.equal(await consumeInitialization({ ...config, profile: 'wrong-profile' }, journal.threadId, initializationText(journal.key)), false);
  save(join(config.stateDir, 'bb-thread-intent.json'), { ...intent, key: 'unrelated-operation' });
  assert.equal(await consumeInitialization(config, journal.threadId, initializationText(journal.key)), false);
  reset(); assert.equal(await consumeInitialization(config, journal.threadId, initializationText(journal.key)), true);
  assert.equal(await consumeInitialization(config, journal.threadId, initializationText(journal.key)), false, 'replay must use ordinary authenticated prompt path');
});

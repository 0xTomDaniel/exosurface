// OS-process crashes using real profile API, real supported CLI initialization,
// real binding writer and ONLY an injected mock native thread adapter.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { settled } from './wait.ts';
const plugin = resolve(process.argv[2]), root = process.env.PROOF_ROOT;
assert.ok(root && process.env.HOME.startsWith(root + '/'));
const cases = ['profile-api-no-receipt', 'profile-receipt', 'session-ready', 'native-spawning', 'pi-intent'];
if (process.argv[3] === '--worker') {
  const scenario = process.argv[4], mode = process.argv[5], base = process.env.PROOF_CASE_ROOT;
  assert.ok(cases.includes(scenario) && base.startsWith(root + '/'));
  const { canonicalSetup, recoverSetupLock } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-setup.ts')));
  const { canonicalSystemPorts, canonicalNativeAdapter } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-system.ts')));
  const home = join(base, 's'), optchatHome = join(base, 'o'), profile = 'exo-optchat';
  const request = { operationId: 'process-crash-proof', authorizeInitialization: true, projectId: 'mock-project', home, optchatHome, profile, vault: root + '/vault', piCli: process.env.PROOF_PI_CLI, optchat: root + '/optchat' };
  let stalled;
  const stall = async phase => { writeFileSync(join(base, 'phase.json'), JSON.stringify({ phase, pid: process.pid })); stalled = setInterval(() => {}, 1000); await new Promise(() => {}); };
  const native = canonicalNativeAdapter({ async create() { appendFileSync(join(base, 'mock-native.jsonl'), JSON.stringify({ id: 'crash-mock-thread' }) + '\n'); if (mode === 'crash' && scenario === 'native-spawning') await stall('native-spawning'); return { id: 'crash-mock-thread' }; }, async get(id) { return { id, projectId: request.projectId, providerId: 'exo-spike' }; } }, true);
  const ports = canonicalSystemPorts({ localConfig: join(base, 'config.json'), runtimeRoot: plugin, node: process.execPath, native, instrumentEnvironment: env => ({ ...env, NODE_OPTIONS: process.env.NODE_OPTIONS, PROOF_ROOT: root, PROOF_ALLOW_PI: '1', PROOF_PI_CLI: request.piCli, PROOF_PROFILE_DIR: join(optchatHome, 'profiles', profile), ...(mode === 'crash' && scenario === 'pi-intent' ? { PROOF_CRASH_PI_INTENT: '1', PROOF_PHASE_FILE: join(base, 'phase.json') } : {}) }) });
  const create = ports.createProfile, initialize = ports.initializeSession;
  ports.createProfile = async r => { await create(r); if (mode === 'crash' && scenario === 'profile-receipt') await stall('profile-receipt'); };
  ports.initializeSession = async r => { const session = await initialize(r); if (mode === 'crash' && scenario === 'session-ready') await stall('session-ready'); return session; };
  try { if (mode === 'retry') recoverSetupLock(request); const result = await canonicalSetup(request, ports); console.log(JSON.stringify({ ok: true, result })); }
  catch (error) { console.log(JSON.stringify({ ok: false, error: error.message })); process.exitCode = 2; }
  finally { if (stalled) clearInterval(stalled); }
} else {
  const series = process.env.PROOF_CRASH_RUN || 'crashes'; assert.match(series, /^crashes(?:[0-9]+)?$/);
  const directory = join(root, series); mkdirSync(directory, { recursive: true });
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const results = [];
  for (let i = 0; i < cases.length; i++) {
    const scenario = cases[i], base = join(directory, 'c' + i); mkdirSync(base, { recursive: true });
    const run = mode => {
      const env = { HOME: join(base, 'h'), TMPDIR: root + '/tmp', PATH: process.env.PATH, NODE_OPTIONS: process.env.NODE_OPTIONS, PROOF_ROOT: root, PROOF_PI_CLI: process.env.PROOF_PI_CLI, PROOF_CASE_ROOT: base, PROOF_ALLOW_PI: '1', PROOF_PROFILE_DIR: join(base, 'o/profiles/exo-optchat'), ...(mode === 'crash' && scenario === 'profile-api-no-receipt' ? { PROOF_CRASH_PROFILE_API: '1', PROOF_PHASE_FILE: join(base, 'phase.json') } : {}) };
      mkdirSync(env.HOME, { recursive: true });
      const child = spawn(process.execPath, ['--experimental-transform-types', join(plugin, 'test/canonical-process-crash.mjs'), plugin, '--worker', scenario, mode], { cwd: base, env, stdio: ['ignore', 'pipe', 'pipe'] });
      const done = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal }))); let stdout = '', stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; }); child.stderr.on('data', chunk => { stderr += chunk; });
      return { child, done, capture: () => ({ stdout, stderr }) };
    };
    const first = run('crash'); let reached = false;
    await settled(() => existsSync(join(base, 'phase.json')) || first.child.exitCode !== null || first.child.signalCode !== null, 20000, 100);
    reached = existsSync(join(base, 'phase.json'));
    assert.ok(reached, scenario + ' did not reach crash boundary: ' + JSON.stringify(first.capture()));
    let liveConcurrency;
    if (scenario === 'native-spawning') {
      const concurrent = run('retry'), exit = await concurrent.done;
      writeFileSync(join(directory, scenario + '-concurrent.json'), JSON.stringify({ exit, ...concurrent.capture() }, null, 2));
      liveConcurrency = JSON.parse(concurrent.capture().stdout.trim().split('\n').at(-1));
      assert.equal(liveConcurrency.ok, false); assert.match(liveConcurrency.error, /still running/);
    }
    if (!['profile-api-no-receipt', 'pi-intent'].includes(scenario)) first.child.kill('SIGKILL');
    const firstExit = await first.done;
    writeFileSync(join(directory, scenario + '-crash.json'), JSON.stringify({ exit: firstExit, ...first.capture() }, null, 2));
    const retry = run('retry'), retryExit = await retry.done;
    writeFileSync(join(directory, scenario + '-retry.json'), JSON.stringify({ exit: retryExit, ...retry.capture() }, null, 2));
    const reply = JSON.parse(retry.capture().stdout.trim().split('\n').at(-1));
    const spawns = existsSync(join(base, 'mock-native.jsonl')) ? readFileSync(join(base, 'mock-native.jsonl'), 'utf8').trim().split('\n').length : 0;
    const intentFile = join(base, 's/canonical-pi-intent.json'), intent = existsSync(intentFile) ? JSON.parse(readFileSync(intentFile)) : undefined;
    const entries = intent && existsSync(intent.file) ? readFileSync(intent.file, 'utf8').trim().split('\n').map(JSON.parse) : [];
    const userRecords = entries.filter(e => e.type === 'message' && e.message.role === 'user').length;
    if (['profile-receipt', 'session-ready'].includes(scenario)) { assert.equal(reply.ok, true); assert.equal(spawns, 1); assert.equal(userRecords, 1); }
    else { assert.equal(reply.ok, false); assert.match(reply.error, /unknown|readback failed|extension failed/); assert.equal(spawns, scenario === 'native-spawning' ? 1 : 0); assert.ok(userRecords <= 1); }
    results.push({ scenario, ...(liveConcurrency ? { liveConcurrency } : {}), crashBoundary: JSON.parse(readFileSync(join(base, 'phase.json'))), firstExit, retryExit, recovered: reply.ok, spawns, userRecords, ...(intent ? { sessionId: intent.id } : {}) });
  }
  console.log(JSON.stringify({ passed: true, realProfileAPI: true, realCLI: true, nativeMockOnly: true, OSProcessCrashes: results, providerDispatch: false, releaseReady: false }, null, 2));
}

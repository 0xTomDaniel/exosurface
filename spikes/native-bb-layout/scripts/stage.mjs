#!/usr/bin/env node
// Disposable BB staging runtime for the native-layout spike.
//
// Uses BB's own documented launcher flags (`bb-app --data-dir --server-port --host-daemon-port`)
// plus a disposable HOME and a minimal PATH. These are ACCIDENT GUARDS, not a sandbox: the staging
// processes still run as the same macOS user (same Keychain, same filesystem permissions).
//
//   node scripts/stage.mjs start | status | stop | env | cli <bb args...>
//
// Never stops anything it did not start: stop signals only the process group it recorded.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, openSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { stageEnv, assertClean } from './stage-env.mjs';

const BB_APP = '/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app';
const LAUNCHER = join(BB_APP, 'dist/bb-app.js');
const CLI = join(BB_APP, 'host-daemon/dist/bb');
const STAGE = process.env.NLS_STAGE ?? '/tmp/nls-stage';
const SERVER_PORT = Number(process.env.NLS_SERVER_PORT ?? 39886);
const DAEMON_PORT = Number(process.env.NLS_DAEMON_PORT ?? 39887);
const state = join(STAGE, 'stage.json');
const env = () => assertClean(stageEnv({ stage: STAGE, serverPort: SERVER_PORT, daemonPort: DAEMON_PORT }), STAGE);

// Validate roots/ports for EVERY command, including stop/destroy.
env();

async function assertPortFree(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => server.close(resolve));
  });
}
function running() {
  if (!existsSync(state)) return null;
  const s = JSON.parse(readFileSync(state, 'utf8'));
  if (s.stage !== STAGE || !Number.isInteger(s.pid) || s.pid <= 1 || s.pgid !== s.pid) throw new Error('Invalid staging process receipt');
  try { process.kill(s.pid, 0); } catch { return null; }
  const args = execFileSync('/bin/ps', ['-p', String(s.pid), '-o', 'command='], { encoding: 'utf8' });
  if (!args.includes(LAUNCHER) || !args.includes(join(STAGE, 'data'))) throw new Error('PID receipt no longer matches staging launcher; refusing signal');
  return s;
}

const [cmd, ...rest] = process.argv.slice(2);
if (cmd === 'start') {
  if (running()) { console.log(JSON.stringify(running())); process.exit(0); }
  const e = env();
  await assertPortFree(SERVER_PORT); await assertPortFree(DAEMON_PORT);
  for (const d of [e.HOME, e.BB_DATA_DIR, e.TMPDIR, join(STAGE, 'logs')]) mkdirSync(d, { recursive: true, mode: 0o700 });
  const out = openSync(join(STAGE, 'logs', 'launcher.log'), 'a');
  const child = spawn(process.execPath, [LAUNCHER, '--data-dir', e.BB_DATA_DIR, '--server-port', String(SERVER_PORT), '--host-daemon-port', String(DAEMON_PORT), '--server-bind-host', '127.0.0.1', '--bundled'],
    { env: e, cwd: e.HOME, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  const s = { pid: child.pid, pgid: child.pid, startedAt: new Date().toISOString(), stage: STAGE, serverUrl: e.BB_SERVER_URL, daemonPort: DAEMON_PORT };
  writeFileSync(state, JSON.stringify(s, null, 2));
  console.log(JSON.stringify(s));
} else if (cmd === 'status') {
  console.log(JSON.stringify({ running: running(), stage: STAGE }));
} else if (cmd === 'stop') {
  const s = running(); if (!s) { console.log('not running'); process.exit(0); }
  try { process.kill(-s.pgid, 'SIGTERM'); } catch (e) { console.error(String(e)); }
  console.log(`sent SIGTERM to process group ${s.pgid}`);
} else if (cmd === 'env') {
  console.log(JSON.stringify(env(), null, 2));
} else if (cmd === 'cli') {
  const e = env();
  const out = execFileSync(process.execPath, [CLI, ...rest], { env: e, cwd: e.HOME, encoding: 'utf8', timeout: 55_000, maxBuffer: 20_000_000 });
  process.stdout.write(out);
} else if (cmd === 'destroy') {
  if (running()) throw new Error('stop first');
  rmSync(STAGE, { recursive: true, force: true }); console.log(`removed ${STAGE}`);
} else {
  console.error('usage: stage.mjs start|status|stop|env|cli <args>|destroy'); process.exit(2);
}

// Independent local Pi owner. BB connections are disposable views, not owners.
// One lane per thread: the primary canonical thread, plus each thread bound to its own profile (thread-profiles.ts, #67);
// every lane has its own Pi, session, view client and projection cursor (spec pages-and-activity S9).
import { createServer, createConnection, type Socket } from 'node:net';
import { existsSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { replayJournalSuffix } from './journal.ts';
import { requireLocal } from './local-config.ts';
import { HOME, CANONICAL_HOME, CANONICAL_PROFILE, PI_CLI, VAULT, load, save, binding, threadProfile, threadPagesHome } from './state.ts';
import { PiRpc } from './pi-rpc.ts';
import { runtimeLaunch, assertNativeOwner } from './runtime.ts';
import { freshCanonicalReceipt } from './canonical-fresh.ts';
import { updateFeedback } from './overview.ts';
import { OWNER_DIR, OWNER_SOCKET } from './owner-client.ts';
// An intent receipt is not an owner binding. Refuse incomplete setup before
// loading the canonical pointer; the normal existing-session route is unchanged.
if (existsSync(join(HOME, 'canonical-fresh.json'))) freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE);
const primary = load(join(HOME, 'canonical-thread.json')).threadId;
const original = binding(primary);
if (!original?.sessionFile || original.runtimeKind !== 'canonical') throw new Error('Existing canonical session required');
mkdirSync(OWNER_DIR, { recursive: true, mode: 0o700 });
type Lane = {
  threadId: string; profile: string; sessionFile: string; cursorFile: string; pi: PiRpc;
  ready: boolean; streaming: boolean; client?: Socket; attached: boolean; sequence: number;
  tail: any[]; tailBytes: number; checkpoints: Map<number, number>; acknowledged: number; startup: Promise<void>;
};
const lanes = new Map<string, Lane>();
const size = (file: string) => existsSync(file) ? statSync(file).size : 0;
/** The lane's projection cursor: where its BB view has acknowledged the native journal up to. */
function cursor(lane: Pick<Lane, 'cursorFile' | 'sessionFile'>) {
  if (existsSync(lane.cursorFile)) return load(lane.cursorFile).offset;
  const offset = size(lane.sessionFile); save(lane.cursorFile, { sessionFile: lane.sessionFile, offset }); return offset;
}
let shuttingDown = false;
const lanePrimary = () => lanes.get(primary);
const state = (error?: string) => {
  const p = lanePrimary();
  save(join(OWNER_DIR, 'state.json'), { version: 2, ready: p?.ready ?? false, streaming: p?.streaming ?? false, ownerPid: process.pid, piPid: p?.pi?.pid,
    threadId: primary, profile: CANONICAL_PROFILE, sessionFile: original.sessionFile, clients: p?.attached ? 1 : 0,
    threads: Object.fromEntries([...lanes.values()].filter(l => l.threadId !== primary).map(l => [l.threadId, { profile: l.profile, ready: l.ready, streaming: l.streaming, piPid: l.pi?.pid, clients: l.attached ? 1 : 0 }])),
    updatedAt: new Date().toISOString(), ...(error ? { error } : {}) });
  // Each bound thread's own pages folder carries its lane's state, as the primary's HOME carries the primary's (#68).
  for (const l of lanes.values()) if (l.threadId !== primary) save(join(threadPagesHome(l.threadId), 'owner', 'state.json'), { version: 2, ready: l.ready, streaming: l.streaming, ownerPid: process.pid, piPid: l.pi?.pid,
    threadId: l.threadId, profile: l.profile, sessionFile: l.sessionFile, clients: l.attached ? 1 : 0, updatedAt: new Date().toISOString(), ...(error ? { error } : {}) });
};
const write = (socket: Socket, value: any) => {
  if (socket.destroyed) return;
  // A slow view must never backpressure the native owner indefinitely.
  if (socket.writableLength > 16 * 1024 * 1024) { socket.destroy(); return; }
  socket.write(JSON.stringify(value) + '\n');
};
function outgoing(lane: Lane, event: any, checkpoint?: number) {
  const value = { kind: 'event', event, ...(checkpoint ? { checkpoint } : {}) };
  const bytes = JSON.stringify(value).length;
  lane.tail.push(value); lane.tailBytes += bytes;
  while (lane.tail.length > 4000 || lane.tailBytes > 8 * 1024 * 1024) lane.tailBytes -= JSON.stringify(lane.tail.shift()).length;
  if (lane.attached && lane.client) write(lane.client, value);
}
function onEvent(lane: Lane, e: any) {
  // Thinking/argument partial snapshots aren't needed by this presentation.
  if (e.type === 'message_update') {
    if (e.assistantMessageEvent?.type !== 'text_delta') return;
    e = { type: e.type, assistantMessageEvent: { type: 'text_delta', delta: e.assistantMessageEvent.delta } };
  }
  if (e.type === 'extension_ui_request') {
    if (['notify', 'setStatus'].includes(e.method)) updateFeedback(lane.threadId, e);
    else if (['select', 'confirm', 'input', 'editor'].includes(e.method)) lane.pi.notify('extension_ui_response', { id: e.id, cancelled: true });
    return; // Feedback is latest state, not thousands of BB event snapshots.
  }
  if (!['agent_start','agent_end','agent_settled','message_start','message_update','message_end','tool_execution_start','tool_execution_end','extension_error'].includes(e.type)) return;
  if (e.type === 'agent_start') { lane.streaming = true; lane.tail = []; lane.tailBytes = 0; state(); }
  let checkpoint: number | undefined;
  if (e.type === 'agent_settled') {
    lane.streaming = false; checkpoint = ++lane.sequence;
    lane.checkpoints.set(checkpoint, size(lane.sessionFile)); state();
  }
  outgoing(lane, e, checkpoint);
}

// Read only the unprojected suffix of the authoritative native journal. No extra
// full-content journal, full-history RPC frame, or old-conversation replay.
function replayJournal(lane: Lane, socket: Socket, through: number) {
  return replayJournalSuffix(lane.sessionFile, lane.acknowledged, through, event => write(socket, { kind: 'event', event })).opened;
}

/** Starts a thread's own Pi on its own profile. Never takes over a profile another process holds. */
function launch(threadId: string, profile: string, sessionFile: string | undefined, cursorFile: string, lost: (lane: Lane) => void): Lane {
  const lane = { threadId, profile, sessionFile: sessionFile ?? '', cursorFile, ready: false, streaming: false, attached: false, sequence: 0, tail: [], tailBytes: 0, checkpoints: new Map() } as unknown as Lane;
  lanes.set(threadId, lane); state(); // A bound thread's page extensions refuse to load before its pages folder has owner state.
  // A known session's cursor is taken before Pi starts, as the primary always has; a new session's once Pi names it.
  if (sessionFile) lane.acknowledged = cursor(lane);
  lane.startup = (async () => {
    const nativeSocket = join(CANONICAL_HOME, 'profiles', profile, 'lock.sock');
    const busy = await new Promise<boolean>(resolve => {
      const socket = createConnection(nativeSocket); socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
    if (busy) throw new Error('An existing native owner must release normally before service startup');
    const run = runtimeLaunch(profile, 'canonical', threadId, sessionFile);
    requireLocal(PI_CLI, 'piCli'); requireLocal(VAULT, 'vault');
    lane.pi = new PiRpc(PI_CLI, run.args, VAULT, run.env, e => {
      try { onEvent(lane, e); } catch { state('View/feedback projection failed; Pi remains independent'); }
    }, () => { lane.ready = false; lost(lane); });
    const native = await lane.pi.send('get_state'); await assertNativeOwner(profile, 'canonical', lane.pi.pid);
    if (sessionFile ? native.sessionFile !== sessionFile : typeof native.sessionFile !== 'string') throw new Error('Native session mismatch');
    lane.sessionFile = native.sessionFile;
    const info = load(join(HOME,'runtime-info',`${threadId}.json`));
    if (info.boundProfile !== profile) throw new Error('Native profile binding missing');
    if (!sessionFile) lane.acknowledged = cursor(lane);
    lane.streaming = native.isStreaming; lane.ready = true; state();
  })();
  return lane;
}
/** The lane a view of this thread attaches to: the primary's, or a bound thread's own (started on first attach). */
async function laneFor(threadId: unknown) {
  if (typeof threadId !== 'string') throw new Error('Thread identity required');
  let lane = lanes.get(threadId);
  if (!lane) {
    const bound = binding(threadId);
    if (threadId === primary || bound?.runtimeKind !== 'canonical' || bound.profile !== threadProfile(threadId)) throw new Error('Only the existing primary Exo thread or a bound Exo thread may attach');
    lane = launch(threadId, bound.profile, bound.sessionFile, join(OWNER_DIR, 'projection', `${threadId}.json`), l => {
      state(); lanes.delete(l.threadId); l.client?.destroy(); state();
    });
    try { await lane.startup; } catch (e) { lanes.delete(threadId); await lane.pi?.close(); state(); throw e; }
  }
  await lane.startup;
  return lane;
}

let resolveReady: () => void, rejectReady: (e: Error) => void;
const startup = new Promise<void>((resolve,reject) => { resolveReady = resolve; rejectReady = reject; });
void startup.catch(() => {});
const server = createServer(socket => {
  let buffer = '', lane: Lane | undefined; socket.setEncoding('utf8');
  socket.on('error', () => {});
  socket.on('close', () => { if (lane && lane.client === socket) { lane.client = undefined; lane.attached = false; state(); } });
  socket.on('data', chunk => {
    buffer += chunk; let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0,at); buffer = buffer.slice(at+1);
      void (async () => {
        let m: any;
        try {
          m = JSON.parse(line); await startup;
          const p = lanePrimary()!;
          // Exosurface page commands (same as the clone's owner): idle-only, revision-checked commits by code; no model
          // call and no view attachment. Same-user accident guards, not a sandbox.
          if (m.type === 'canvas-data' || m.type === 'canvas-restore') {
            // A thread's page command reaches only that thread's Pi and pages folder (#68).
            const page = m.threadId === primary ? p : await laneFor(m.threadId);
            if (page.streaming || JSON.stringify(m.request).length > 20000) throw new Error('Idle Exo page command required'); // 20000: MAX_OWNER_COMMAND_UNITS (legacy/surface/src/canvas-input.ts)
            const file = join(page === p ? HOME : threadPagesHome(page.threadId), 'workspace', 'latest.json'), rev = () => existsSync(file) ? load(file).workspace?.revision ?? 0 : 0;
            const before = rev();
            if (m.type === 'canvas-data' && before !== m.request?.revision) { write(socket, { kind: 'response', id: m.id, ok: false, error: `stale_revision ${before}` }); return; }
            await page.pi.send('prompt', { message: (m.type === 'canvas-data' ? '/workspace-data ' : '/workspace-restore ') + JSON.stringify(m.request) });
            const after = rev();
            write(socket, after === before + 1 ? { kind: 'response', id: m.id, ok: true, data: { revision: after } } : { kind: 'response', id: m.id, ok: false, error: `not_applied ${after}` }); return;
          }
          if (m.type === 'hello') {
            const target = await laneFor(m.threadId);
            lane = target; target.client?.destroy(); target.client = socket; target.attached = false; state();
            write(socket, { kind: 'response', id: m.id, ok: true, data: { piPid: target.pi.pid, ownerPid: process.pid, profile: target.profile, journalReplay: 2 } }); return;
          }
          if (!lane) throw new Error('Primary view identity required');
          const own = lane;
          if (m.type === 'attach') {
            const snapshot = size(own.sessionFile);
            // Pi writes a new session's file only with its first message: nothing past the cursor, nothing to replay.
            const replayed = snapshot > own.acknowledged && replayJournal(own, socket, snapshot);
            if (!own.streaming && snapshot > own.acknowledged) {
              const checkpoint = ++own.sequence; own.checkpoints.set(checkpoint, snapshot);
              write(socket, { kind: 'event', event: { type: 'agent_settled', replayed: true }, checkpoint });
            } else if (own.streaming) {
              // Completed messages came from disk; only the current incomplete
              // message's live stream tail must be restored from RAM.
              let start = -1;
              for (let i=0;i<own.tail.length;i++) if (own.tail[i].event.type==='message_start') start=i;
              if (start >= 0 && !own.tail.slice(start).some(v=>v.event.type==='message_end')) {
                if (!replayed) write(socket,{kind:'event',event:{type:'agent_start',replayed:true}});
                for (const event of own.tail.slice(start)) write(socket,event);
              }
            }
            own.attached = true; state(); write(socket, { kind: 'response', id: m.id, ok: true, data: {} }); return;
          }
          if (m.type === 'ack') {
            const offset = own.checkpoints.get(m.checkpoint);
            if (offset !== undefined && offset >= own.acknowledged) { own.acknowledged = offset; save(own.cursorFile, { sessionFile: own.sessionFile, offset }); for (const [k,v] of own.checkpoints) if (v <= offset) own.checkpoints.delete(k); }
            return;
          }
          const allowed = ['prompt','get_state','get_commands','get_session_stats','abort','clear_queue','set_model','set_thinking_level'];
          if (!allowed.includes(m.type)) throw new Error('Command outside owner view contract');
          const { id, type, ...fields } = m; const data = await own.pi.send(type, fields);
          write(socket, { kind: 'response', id, ok: true, data });
        } catch {
          // Never print provider output or credentials. Detailed native evidence
          // remains in Pi's authoritative session, not an extra gateway log.
          if (m?.id) write(socket,{ kind:'response',id:m.id,ok:false,error:'Owner request failed; native owner/state and session evidence must be checked' });
        }
      })();
    }
    if (buffer.length > 1024 * 1024) socket.destroy();
  });
});
server.on('error', () => { state('Gateway socket unavailable; no native lock takeover'); process.exitCode = 1; });
server.listen(OWNER_SOCKET, async () => {
  chmodSync(OWNER_SOCKET, 0o600); state();
  const p = launch(primary, CANONICAL_PROFILE, original.sessionFile, join(OWNER_DIR, 'projection.json'), l => {
    state('Native Pi exited; no automatic paid-work restart'); server.close(); l.client?.destroy();
  });
  try { await p.startup; resolveReady!(); }
  catch (e) { p.ready = false; state('Native startup failed; no lock takeover'); rejectReady!(e as Error); await p.pi?.close(); server.close(); }
});
async function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  for (const l of lanes.values()) l.ready = false;
  state('Explicit owner shutdown');
  for (const l of lanes.values()) l.client?.destroy();
  await Promise.all([...lanes.values()].map(l => l.pi?.close())); server.close();
}
process.on('SIGTERM', () => { void shutdown(); }); process.on('SIGINT', () => { void shutdown(); });

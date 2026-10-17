// Independent local Pi owner. BB connections are disposable views, not owners.
import { createServer, createConnection, type Socket } from 'node:net';
import { existsSync, mkdirSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { replayJournalSuffix } from './journal.ts';
import { requireLocal } from './local-config.ts';
import { HOME, CANONICAL_HOME, CANONICAL_PROFILE, PI_CLI, VAULT, load, save, binding } from './state.ts';
import { PiRpc } from './pi-rpc.ts';
import { runtimeLaunch, assertNativeOwner } from './runtime.ts';
import { updateFeedback } from './overview.ts';
import { OWNER_DIR, OWNER_SOCKET } from './owner-client.ts';
const primary = load(join(HOME, 'canonical-thread.json')).threadId;
const original = binding(primary);
if (!original?.sessionFile || original.runtimeKind !== 'canonical') throw new Error('Existing canonical session required');
mkdirSync(OWNER_DIR, { recursive: true, mode: 0o700 });
const cursorFile = join(OWNER_DIR, 'projection.json');
const initialSize = statSync(original.sessionFile).size;
let acknowledged = existsSync(cursorFile) ? load(cursorFile).offset : initialSize;
if (!existsSync(cursorFile)) save(cursorFile, { sessionFile: original.sessionFile, offset: acknowledged });
let ready = false, streaming = false, composing = false, shuttingDown = false;
let client: Socket | undefined; let attached = false; let sequence = 0;
let tail: any[] = []; let tailBytes = 0;
const checkpoints = new Map<number, number>();
let pi: PiRpc;
const state = (error?: string) => save(join(OWNER_DIR, 'state.json'), { version: 2, ready, streaming, composing, ownerPid: process.pid, piPid: pi?.pid,
  threadId: primary, profile: CANONICAL_PROFILE, sessionFile: original.sessionFile, clients: attached ? 1 : 0,
  updatedAt: new Date().toISOString(), ...(error ? { error } : {}) });
const write = (socket: Socket, value: any) => {
  if (socket.destroyed) return;
  // A slow view must never backpressure the native owner indefinitely.
  if (socket.writableLength > 16 * 1024 * 1024) { socket.destroy(); return; }
  socket.write(JSON.stringify(value) + '\n');
};
function outgoing(event: any, checkpoint?: number) {
  const value = { kind: 'event', event, ...(checkpoint ? { checkpoint } : {}) };
  const bytes = JSON.stringify(value).length;
  tail.push(value); tailBytes += bytes;
  while (tail.length > 4000 || tailBytes > 8 * 1024 * 1024) tailBytes -= JSON.stringify(tail.shift()).length;
  if (attached && client) write(client, value);
}
function onEvent(e: any) {
  // Thinking/argument partial snapshots aren't needed by this presentation.
  if (e.type === 'message_update') {
    if (e.assistantMessageEvent?.type !== 'text_delta') return;
    e = { type: e.type, assistantMessageEvent: { type: 'text_delta', delta: e.assistantMessageEvent.delta } };
  }
  if (e.type === 'extension_ui_request') {
    if (['notify', 'setStatus'].includes(e.method)) updateFeedback(primary, e);
    else if (['select', 'confirm', 'input', 'editor'].includes(e.method)) pi.notify('extension_ui_response', { id: e.id, cancelled: true });
    return; // Feedback is latest state, not thousands of BB event snapshots.
  }
  if (!['agent_start','agent_end','agent_settled','message_start','message_update','message_end','tool_execution_start','tool_execution_end','extension_error'].includes(e.type)) return;
  if (e.type === 'agent_start') { streaming = true; tail = []; tailBytes = 0; state(); }
  let checkpoint: number | undefined;
  if (e.type === 'agent_settled') {
    streaming = false; checkpoint = ++sequence;
    checkpoints.set(checkpoint, statSync(original.sessionFile).size); state();
  }
  outgoing(e, checkpoint);
}

// Read only the unprojected suffix of the authoritative native journal. No extra
// full-content journal, full-history RPC frame, or old-conversation replay.
function replayJournal(socket: Socket, through: number) {
  return replayJournalSuffix(original.sessionFile, acknowledged, through, event => write(socket, { kind: 'event', event })).opened;
}

let resolveReady: () => void, rejectReady: (e: Error) => void;
const startup = new Promise<void>((resolve,reject) => { resolveReady = resolve; rejectReady = reject; });
void startup.catch(() => {});
const server = createServer(socket => {
  let buffer = '', authorized = false; socket.setEncoding('utf8');
  socket.on('error', () => {});
  socket.on('close', () => { if (client === socket) { client = undefined; attached = false; state(); } });
  socket.on('data', chunk => {
    buffer += chunk; let at: number;
    while ((at = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0,at); buffer = buffer.slice(at+1);
      void (async () => {
        let m: any;
        try {
          m = JSON.parse(line); await startup;
          // A bounded presentation command does not attach/steal the BB view socket.
          // Unix permissions/thread/home checks are same-user accident guards, not a sandbox.
          if(m.type==='recover-offer'){
            if(m.threadId!==primary||streaming||composing||typeof m.toolCallId!=='string'||m.toolCallId.length>256)throw Error('Exact failed clone call required');
            composing=true;state();try{await pi.send('prompt',{message:'/workspace-recover-offer '+JSON.stringify(m.toolCallId)});write(socket,{kind:'response',id:m.id,ok:true,data:{}});}finally{composing=false;state();}return;
          }
          if(m.type==='observer-cancel'){
            const matches=()=>{const p=load(join(HOME,'workspace/latest.json'));return m.threadId===primary&&p.observer?.id===m.request?.runId&&p.observer?.running;};
            if(!matches())throw Error('Exact active observer test required');const before=await pi.send('get_state');if(!matches())throw Error('Observer test changed');
            await pi.send('prompt',{message:'/workspace-observer-cancel '+JSON.stringify(m.request.runId)});await pi.send('abort');const after=await pi.send('get_state');
            write(socket,{kind:'response',id:m.id,ok:true,data:{aborted:true,pendingBefore:before.pendingMessageCount,pendingAfter:after.pendingMessageCount}});return;
          }
          if(m.type==='observer-replay'){
            if(m.threadId!==primary||streaming||composing||JSON.stringify(m.request).length>500)throw Error('Idle exact-source clone replay required');
            composing=true;state();try{await pi.send('prompt',{message:'/workspace-observer-replay '+JSON.stringify(m.request)});write(socket,{kind:'response',id:m.id,ok:true,data:{}});}finally{composing=false;state();}return;
          }
          if(m.type==='canvas-data'){
            // Shared canvas state: idle-only, revision-checked commit by code; no model call, no attachment.
            const rev=()=>load(join(HOME,'workspace/latest.json')).workspace?.revision;
            if(m.threadId!==primary||streaming||composing||JSON.stringify(m.request).length>12000)throw Error('Idle clone canvas edit required');
            const before=rev();if(before!==m.request?.revision){write(socket,{kind:'response',id:m.id,ok:false,error:`stale_revision ${before}`});return;}
            await pi.send('prompt',{message:'/workspace-data '+JSON.stringify(m.request)});
            const after=rev();write(socket,after===before+1?{kind:'response',id:m.id,ok:true,data:{revision:after}}:{kind:'response',id:m.id,ok:false,error:`not_applied ${after}`});return;
          }
          if(m.type==='observer-arm'){
            if(m.threadId!==primary||streaming||composing||!['sidecar','direct','off'].includes(m.request?.route)||JSON.stringify(m.request).length>400)throw Error('Idle clone observer command required');
            composing=true;state();try{await pi.send('prompt',{message:'/workspace-observer '+JSON.stringify(m.request)});write(socket,{kind:'response',id:m.id,ok:true,data:{}});}finally{composing=false;state();}return;
          }
          if(m.type==='compose'){
            if(m.threadId!==primary||streaming||composing||!['jev','haiku','haiku-both'].includes(m.request?.mode)||typeof m.request?.prompt!=='string'||JSON.stringify(m.request).length>2400)throw Error('Idle clone composition request required');
            composing=true;state();try{await pi.send('prompt',{message:'/workspace-compose '+JSON.stringify(m.request)});write(socket,{kind:'response',id:m.id,ok:true,data:{}});}finally{composing=false;state();}return;
          }
          if (m.type === 'hello') {
            if (m.threadId !== primary) throw new Error('Only the existing primary Exo thread may attach');
            authorized = true; client?.destroy(); client = socket; attached = false; state();
            write(socket, { kind: 'response', id: m.id, ok: true, data: { piPid: pi.pid, ownerPid: process.pid, profile: CANONICAL_PROFILE, journalReplay: 2 } }); return;
          }
          if (!authorized) throw new Error('Primary view identity required');
          if (m.type === 'attach') {
            const snapshot = statSync(original.sessionFile).size;
            const replayed = replayJournal(socket, snapshot);
            if (!streaming && snapshot > acknowledged) {
              const checkpoint = ++sequence; checkpoints.set(checkpoint, snapshot);
              write(socket, { kind: 'event', event: { type: 'agent_settled', replayed: true }, checkpoint });
            } else if (streaming) {
              // Completed messages came from disk; only the current incomplete
              // message's live stream tail must be restored from RAM.
              let start = -1;
              for (let i=0;i<tail.length;i++) if (tail[i].event.type==='message_start') start=i;
              if (start >= 0 && !tail.slice(start).some(v=>v.event.type==='message_end')) {
                if (!replayed) write(socket,{kind:'event',event:{type:'agent_start',replayed:true}});
                for (const event of tail.slice(start)) write(socket,event);
              }
            }
            attached = true; state(); write(socket, { kind: 'response', id: m.id, ok: true, data: {} }); return;
          }
          if (m.type === 'ack') {
            const offset = checkpoints.get(m.checkpoint);
            if (offset !== undefined && offset >= acknowledged) { acknowledged = offset; save(cursorFile, { sessionFile: original.sessionFile, offset }); for (const [k,v] of checkpoints) if (v <= offset) checkpoints.delete(k); }
            return;
          }
          const allowed = ['prompt','get_state','get_commands','get_session_stats','abort','clear_queue','set_model','set_thinking_level'];
          if (!allowed.includes(m.type)) throw new Error('Command outside owner view contract');
          const { id, type, ...fields } = m; const data = await pi.send(type, fields);
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
  try {
    const nativeSocket = join(CANONICAL_HOME, 'profiles', CANONICAL_PROFILE, 'lock.sock');
    const busy = await new Promise<boolean>(resolve => {
      const socket = createConnection(nativeSocket); socket.setTimeout(1000);
      socket.once('connect', () => { socket.destroy(); resolve(true); });
      socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(true); });
    });
    if (busy) throw new Error('An existing native owner must release normally before service startup');
    const launch = runtimeLaunch(CANONICAL_PROFILE, 'canonical', primary, original.sessionFile);
    requireLocal(PI_CLI, 'piCli'); requireLocal(VAULT, 'vault');
    pi = new PiRpc(PI_CLI, launch.args, VAULT, launch.env, e => {
      try { onEvent(e); } catch { state('View/feedback projection failed; Pi remains independent'); }
    }, () => { ready = false; state('Native Pi exited; no automatic paid-work restart'); server.close(); client?.destroy(); });
    const native = await pi.send('get_state'); await assertNativeOwner(CANONICAL_PROFILE, 'canonical', pi.pid);
    if (native.sessionFile !== original.sessionFile) throw new Error('Native session mismatch');
    const info = load(join(HOME,'runtime-info',`${primary}.json`));
    if (info.boundProfile !== CANONICAL_PROFILE) throw new Error('Native profile binding missing');
    streaming = native.isStreaming; ready = true; state(); resolveReady!();
  } catch (e) { ready = false; state('Native startup failed; no lock takeover'); rejectReady!(e as Error); await pi?.close(); server.close(); }
});
async function shutdown() { if (shuttingDown) return; shuttingDown = true; ready = false; state('Explicit owner shutdown'); client?.destroy(); await pi?.close(); server.close(); }
process.on('SIGTERM', () => { void shutdown(); }); process.on('SIGINT', () => { void shutdown(); });

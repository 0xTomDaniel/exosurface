// Real owner-socket provider bridge; public protocol pattern adapted from native-bb-layout/host.ts and original spike.
import {
  createBridgeIo, experimental_defineProviderBridge, runBridgeRequest,
  PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_GRAMMAR_V3,
  initializeParamsSchema, modelListParamsSchema, threadStartParamsSchema,
  threadResumeParamsSchema, threadStopParamsSchema, turnStartParamsSchema, turnSteerParamsSchema,
  type ThreadDelta,
} from '@get-bb/plugin-sdk/provider-bridge';
import { readConfig, layout } from './src/config.ts';
import { loadIf } from './src/store.ts';
import { ensureOwner } from './src/system.ts';
import { ownerConnection } from './src/owner-client.ts';
import { MODEL } from './src/model.ts';

const io = createBridgeIo<any>();
type Session = { threadId: string; handle: string; open: boolean; serial: number; timer?: NodeJS.Timeout; done?: () => void };
const sessions = new Map<string, Session>();
const emit = (s: Session, deltas: ThreadDelta[]) => io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: s.threadId, deltas } });
const textOf = (input: any[] = []) => input.filter(p => p.type === 'text').map(p => p.text).join('');

function settle(s: Session, status: 'completed' | 'interrupted' | 'failed' = 'completed') {
  emit(s, [{ kind: 'turn.boundary', status, ...(!s.open ? { claimIfIdle: true } : {}) }]);
  s.open = false; s.timer = undefined; s.done = undefined;
}
const connections = new Map<string, ReturnType<typeof ownerConnection>>();
async function attach(s: Session) {
  if (connections.get(s.threadId)?.alive) return;
  connections.delete(s.threadId);
  const { config, problems } = readConfig();
  if (!config || problems.length) throw new Error('Complete first-run configuration before opening Exo');
  if (loadIf(layout(config.stateDir).primary)?.threadId !== s.threadId) throw new Error('Only the first-run primary thread can attach');
  await ensureOwner(config);
  const connection = ownerConnection(config, e => {
    if (e.type === 'message_end' && e.message?.role === 'assistant') {
    const text = (e.message.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('\n');
    const key = { providerItemId: `exo-${++s.serial}` };
    emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } }, { kind: 'item.textClose', key, channel: 'agentMessage', text }]);
    }
    if (e.type === 'agent_end' && s.open) settle(s);
    if (e.type === 'owner_error' && s.open) settle(s, 'failed');
  });
  connections.set(s.threadId, connection);
 }
async function turn(s: Session, input: any[], requestId?: string) {
  if (s.open) throw new Error('Turn already running');
  s.open = true; emit(s, [{ kind: 'turn.open' }]);
  if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
  try { await attach(s); await connections.get(s.threadId)!.send(s.threadId, 'prompt', textOf(input)); }
  catch (e) {
    const key = { providerItemId: `exo-${++s.serial}` };
    emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } }, { kind: 'item.textClose', key, channel: 'agentMessage', text: `Not sent: ${e instanceof Error ? e.message : String(e)}` }]); settle(s, 'failed');
  }
}
const schemas: Record<string, any> = { initialize: initializeParamsSchema, 'model/list': modelListParamsSchema, 'thread/start': threadStartParamsSchema, 'thread/resume': threadResumeParamsSchema, 'thread/stop': threadStopParamsSchema, 'turn/start': turnStartParamsSchema, 'turn/steer': turnSteerParamsSchema };

async function request(id: string | number, method: string, p: any) {
  if (method === 'initialize') return io.sendResult(id, { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, capabilities: { grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3], sessionRestore: true, fork: 'none', threadArchive: false, threadRename: false, threadGoalClear: false, approvalEnforcedBy: 'provider', steerMode: 'queue' } });
  if (method === 'model/list') return io.sendResult(id, { models: [MODEL], selectedOnlyModels: [] });
  if (method === 'thread/start' || method === 'thread/resume') {
    if (sessions.has(p.threadId)) throw new Error('Thread already attached');
    const s: Session = { threadId: p.threadId, handle: p.providerThreadId ?? `exo:${p.threadId}`, open: false, serial: Date.now() };
    sessions.set(p.threadId, s);
    io.send({ jsonrpc: '2.0', method: 'thread/identity', params: { threadId: p.threadId, providerThreadId: s.handle } });
    emit(s, [{ kind: 'session.reset' }]);
    io.sendResult(id, { providerThreadId: s.handle, sessionRestorable: true });
    if (p.input?.length) await turn(s, p.input);
    return;
  }
  const s = sessions.get(p.threadId);
  if (!s) throw new Error('No attached Exo session; resume first');
  if (method === 'turn/start') { io.sendResult(id, {}); await turn(s, p.input, p.clientRequestId); return; }
  if (method === 'turn/steer') return io.sendError(id, -32003, 'Exo bridge does not steer; BB queues instead');
  if (method === 'thread/stop') {
    if (p.intent === 'interrupt') { await connections.get(p.threadId)?.send(p.threadId, 'abort'); return io.sendResult(id, {}); }
    connections.get(p.threadId)?.close(); connections.delete(p.threadId);
    sessions.delete(p.threadId); return io.sendResult(id, {});
  }
}
export function handleLine(line: string) {
  let value: any; try { value = JSON.parse(line); } catch { return; }
  if ((typeof value.id !== 'string' && typeof value.id !== 'number') || typeof value.method !== 'string') return;
  const schema = schemas[value.method];
  if (!schema) return io.sendError(value.id, -32601, `Method not found: ${value.method}`);
  const parsed = schema.safeParse(value.params);
  if (!parsed.success) return io.sendError(value.id, -32602, 'Invalid params', parsed.error.issues);
  runBridgeRequest({ request: value, sendError: io.sendError, handleRequest: async () => { await request(value.id, value.method, parsed.data); } });
}
const closeAll = async () => { for (const c of connections.values()) c.close(); connections.clear(); for (const s of sessions.values()) if (s.timer) { clearTimeout(s.timer); s.done?.(); } sessions.clear(); };
export const experimental_providerBridge = experimental_defineProviderBridge({ handleLine, onClose: closeAll, onSigterm: closeAll, onSigint: closeAll });

// Deterministic provider bridge for the native-layout spike. Pattern adapted from
// plugins/bb-plugin-exo-spike/host.ts (same public provider-bridge seams), minus Pi/OptChat.
import {
  createBridgeIo, experimental_defineProviderBridge, runBridgeRequest,
  PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_GRAMMAR_V3,
  initializeParamsSchema, modelListParamsSchema, threadStartParamsSchema,
  threadResumeParamsSchema, threadStopParamsSchema, turnStartParamsSchema, turnSteerParamsSchema,
  type ThreadDelta,
} from '@get-bb/plugin-sdk/provider-bridge';
import { MODEL, reply } from './src/fixture.ts';

const io = createBridgeIo<any>();
type Session = { threadId: string; handle: string; open: boolean; serial: number; timer?: NodeJS.Timeout; done?: () => void };
const sessions = new Map<string, Session>();
const emit = (s: Session, deltas: ThreadDelta[]) => io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: s.threadId, deltas } });
const textOf = (input: any[] = []) => input.filter(p => p.type === 'text').map(p => p.text).join('');

function settle(s: Session, status: 'completed' | 'interrupted' | 'failed' = 'completed') {
  emit(s, [{ kind: 'turn.boundary', status, ...(!s.open ? { claimIfIdle: true } : {}) }]);
  s.open = false; s.timer = undefined; s.done = undefined;
}
function turn(s: Session, input: any[], requestId?: string) {
  if (s.open) throw new Error('Turn already running');
  const r = reply(textOf(input));
  s.open = true; emit(s, [{ kind: 'turn.open' }]);
  if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
  const key = { providerItemId: `nls-${++s.serial}` };
  return new Promise<void>(resolve => {
    s.done = resolve;
    s.timer = setTimeout(() => {
      emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } }, { kind: 'item.textClose', key, channel: 'agentMessage', text: r.text }]);
      settle(s); resolve();
    }, r.delayMs);
  });
}
const schemas: Record<string, any> = { initialize: initializeParamsSchema, 'model/list': modelListParamsSchema, 'thread/start': threadStartParamsSchema, 'thread/resume': threadResumeParamsSchema, 'thread/stop': threadStopParamsSchema, 'turn/start': turnStartParamsSchema, 'turn/steer': turnSteerParamsSchema };

async function request(id: string | number, method: string, p: any) {
  if (method === 'initialize') return io.sendResult(id, { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, capabilities: { grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3], sessionRestore: true, fork: 'none', threadArchive: false, threadRename: false, threadGoalClear: false, approvalEnforcedBy: 'provider', steerMode: 'queue' } });
  if (method === 'model/list') return io.sendResult(id, { models: [MODEL], selectedOnlyModels: [] });
  if (method === 'thread/start' || method === 'thread/resume') {
    if (sessions.has(p.threadId)) throw new Error('Thread already attached');
    const s: Session = { threadId: p.threadId, handle: p.providerThreadId ?? `nls:${p.threadId}`, open: false, serial: Date.now() };
    sessions.set(p.threadId, s);
    io.send({ jsonrpc: '2.0', method: 'thread/identity', params: { threadId: p.threadId, providerThreadId: s.handle } });
    emit(s, [{ kind: 'session.reset' }]);
    io.sendResult(id, { providerThreadId: s.handle, sessionRestorable: true });
    if (p.input?.length) await turn(s, p.input);
    return;
  }
  const s = sessions.get(p.threadId);
  if (!s) throw new Error('No attached fixture session; resume first');
  if (method === 'turn/start') { io.sendResult(id, {}); await turn(s, p.input, p.clientRequestId); return; }
  if (method === 'turn/steer') return io.sendError(id, -32003, 'Fixture does not steer; BB queues instead');
  if (method === 'thread/stop') {
    if (s.timer) { clearTimeout(s.timer); const done = s.done; settle(s, 'interrupted'); done?.(); }
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
const closeAll = async () => { for (const s of sessions.values()) if (s.timer) { clearTimeout(s.timer); s.done?.(); } sessions.clear(); };
export const experimental_providerBridge = experimental_defineProviderBridge({ handleLine, onClose: closeAll, onSigterm: closeAll, onSigint: closeAll });

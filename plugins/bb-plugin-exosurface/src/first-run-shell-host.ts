// Real owner-socket provider bridge; public protocol pattern adapted from native-bb-layout/host.ts and original spike.
import {
  createBridgeIo, experimental_defineProviderBridge, runBridgeRequest,
  PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_GRAMMAR_V3,
  initializeParamsSchema, modelListParamsSchema, threadStartParamsSchema,
  threadResumeParamsSchema, threadStopParamsSchema, turnStartParamsSchema, turnSteerParamsSchema,
  type ThreadDelta,
} from '@get-bb/plugin-sdk/provider-bridge';
import { z } from 'zod';
import { readConfig, layout } from './config.ts';
import { primaryThreadId } from './bootstrap.ts';
import { consumeInitialization } from './setup-input.ts';
import { validatePrompt } from './input.ts';
import { ensureOwner } from './system.ts';
import { ownerConnection } from './owner-client.ts';
import { MODEL } from './model.ts';

// Invalid params carry the zod issue list as error data, which the SDK's sendError data type does not admit.
type Outbound =
  | { jsonrpc: '2.0'; method: 'thread/delta'; params: { threadId: string; deltas: ThreadDelta[] } }
  | { jsonrpc: '2.0'; method: 'thread/identity'; params: { threadId: string; providerThreadId: string } }
  | { jsonrpc: '2.0'; id: string | number; error: { code: -32602; message: 'Invalid params'; data: z.core.$ZodIssue[] } };
const io = createBridgeIo<Outbound>();
interface Session { threadId: string; handle: string; open: boolean; serial: number; timer?: NodeJS.Timeout | undefined; done?: (() => void) | undefined }
const sessions = new Map<string, Session>();
const emit = (s: Session, deltas: ThreadDelta[]) => { io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: s.threadId, deltas } }); };
type Input = z.output<typeof turnStartParamsSchema>['input'];
const textOf = (input: Input = []) => input.filter(p => p.type === 'text').map(p => p.text).join('');

function settle(s: Session, status: 'completed' | 'interrupted' | 'failed' = 'completed') {
  emit(s, [{ kind: 'turn.boundary', status, ...(!s.open ? { claimIfIdle: true } : {}) }]);
  s.open = false; s.timer = undefined; s.done = undefined;
}
// Owner socket events: every event has a type; only an assistant message_end carries text to show.
const ownerEvent = z.object({ type: z.unknown().optional(), message: z.unknown().optional() });
const assistantMessage = z.object({ role: z.literal('assistant'), content: z.array(z.object({ type: z.unknown().optional(), text: z.unknown().optional() })).nullish() });
const connections = new Map<string, ReturnType<typeof ownerConnection>>();
async function attach(s: Session) {
  const existing = connections.get(s.threadId);
  if (existing?.alive) return existing;
  connections.delete(s.threadId);
  const { config, problems } = readConfig();
  if (!config || problems.length) throw new Error('Complete first-run configuration before opening Exo');
  if (primaryThreadId(layout(config.stateDir)) !== s.threadId) throw new Error('Only the first-run primary thread can attach');
  await ensureOwner(config);
  const connection = ownerConnection(config, (raw: unknown) => {
    const e = ownerEvent.safeParse(raw).data;
    if (!e) return;
    const message = e.type === 'message_end' ? assistantMessage.safeParse(e.message).data : undefined;
    if (message) {
    const text = (message.content ?? []).filter(c => c.type === 'text').map(c => c.text).join('\n');
    const key = { providerItemId: `exo-${String(++s.serial)}` };
    emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } }, { kind: 'item.textClose', key, channel: 'agentMessage', text }]);
    }
    if (e.type === 'agent_end' && s.open) settle(s);
    if (e.type === 'owner_error' && s.open) settle(s, 'failed');
  });
  connections.set(s.threadId, connection);
  return connection;
 }
async function turn(s: Session, input: Input | undefined, requestId?: string) {
  if (s.open) throw new Error('Turn already running');
  s.open = true; emit(s, [{ kind: 'turn.open' }]);
  if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
  try {
    const text = textOf(input), { config, problems } = readConfig();
    if (config && !problems.length && await consumeInitialization(config, s.threadId, text)) { settle(s); return; }
    validatePrompt(text);
    const connection = await attach(s); await connection.send(s.threadId, 'prompt', text);
  }
  catch (e) {
    const key = { providerItemId: `exo-${String(++s.serial)}` };
    emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } }, { kind: 'item.textClose', key, channel: 'agentMessage', text: `Not sent: ${e instanceof Error ? e.message : String(e)}` }]); settle(s, 'failed');
  }
}
// thread/start may carry the provider handle and thread/resume the opening input; both stay optional.
const threadStartParams = threadStartParamsSchema.extend({ providerThreadId: z.string().optional() });
const threadResumeParams = threadResumeParamsSchema.extend({ input: threadStartParamsSchema.shape.input });
type Decoded<M extends string, P> = { ok: true; call: { method: M; params: P } } | { ok: false; issues: z.core.$ZodIssue[] };
const decoded = <M extends string, P>(method: M, result: z.ZodSafeParseResult<P>): Decoded<M, P> =>
  result.success ? { ok: true, call: { method, params: result.data } } : { ok: false, issues: result.error.issues };
function decode(method: string, params: unknown) {
  switch (method) {
    case 'initialize': return decoded(method, initializeParamsSchema.safeParse(params));
    case 'model/list': return decoded(method, modelListParamsSchema.safeParse(params));
    case 'thread/start': return decoded(method, threadStartParams.safeParse(params));
    case 'thread/resume': return decoded(method, threadResumeParams.safeParse(params));
    case 'thread/stop': return decoded(method, threadStopParamsSchema.safeParse(params));
    case 'turn/start': return decoded(method, turnStartParamsSchema.safeParse(params));
    case 'turn/steer': return decoded(method, turnSteerParamsSchema.safeParse(params));
    default: return undefined;
  }
}
type Call = Extract<NonNullable<ReturnType<typeof decode>>, { ok: true }>['call'];

async function request(id: string | number, call: Call) {
  if (call.method === 'initialize') { io.sendResult(id, { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, capabilities: { grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3], sessionRestore: true, fork: 'none', threadArchive: false, threadRename: false, threadGoalClear: false, approvalEnforcedBy: 'provider', steerMode: 'queue' } }); return; }
  if (call.method === 'model/list') { io.sendResult(id, { models: [MODEL], selectedOnlyModels: [] }); return; }
  if (call.method === 'thread/start' || call.method === 'thread/resume') {
    const p = call.params;
    if (sessions.has(p.threadId)) throw new Error('Thread already attached');
    const s: Session = { threadId: p.threadId, handle: p.providerThreadId ?? `exo:${p.threadId}`, open: false, serial: Date.now() };
    sessions.set(p.threadId, s);
    io.send({ jsonrpc: '2.0', method: 'thread/identity', params: { threadId: p.threadId, providerThreadId: s.handle } });
    emit(s, [{ kind: 'session.reset' }]);
    io.sendResult(id, { providerThreadId: s.handle, sessionRestorable: true });
    if (p.input?.length) await turn(s, p.input);
    return;
  }
  const p = call.params;
  const s = sessions.get(p.threadId);
  if (!s) throw new Error('No attached Exo session; resume first');
  if (call.method === 'turn/start') { io.sendResult(id, {}); await turn(s, call.params.input, call.params.clientRequestId); return; }
  if (call.method === 'turn/steer') { io.sendError(id, -32003, 'Exo bridge does not steer; BB queues instead'); return; }
  if (call.params.intent === 'interrupt') { await connections.get(p.threadId)?.send(p.threadId, 'abort'); io.sendResult(id, {}); return; }
  connections.get(p.threadId)?.close(); connections.delete(p.threadId);
  sessions.delete(p.threadId); io.sendResult(id, {});
}
const envelope = z.object({ id: z.union([z.string(), z.number()]), method: z.string(), params: z.unknown().optional() });
export function handleLine(line: string) {
  let value: unknown; try { value = JSON.parse(line); } catch { return; }
  const message = envelope.safeParse(value).data;
  if (!message) return;
  const parsed = decode(message.method, message.params);
  if (!parsed) { io.sendError(message.id, -32601, `Method not found: ${message.method}`); return; }
  if (!parsed.ok) { io.send({ jsonrpc: '2.0', id: message.id, error: { code: -32602, message: 'Invalid params', data: parsed.issues } }); return; }
  runBridgeRequest({ request: message, sendError: io.sendError, handleRequest: async () => { await request(message.id, parsed.call); } });
}
const closeAll = () => { for (const c of connections.values()) c.close(); connections.clear(); for (const s of sessions.values()) if (s.timer) { clearTimeout(s.timer); s.done?.(); } sessions.clear(); };
export const experimental_providerBridge = experimental_defineProviderBridge({ handleLine, onClose: closeAll, onSigterm: closeAll, onSigint: closeAll });

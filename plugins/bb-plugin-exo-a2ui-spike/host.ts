import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBridgeIo, experimental_defineProviderBridge, runBridgeRequest,
  PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_GRAMMAR_V3,
  initializeParamsSchema, modelListParamsSchema, threadStartParamsSchema,
  threadResumeParamsSchema, threadStopParamsSchema, turnStartParamsSchema, turnSteerParamsSchema,
  type ThreadDelta,
} from '@get-bb/plugin-sdk/provider-bridge';
import { PiRpc } from './src/pi-rpc.ts';
import { OwnerClient } from './src/owner-client.ts';
import { updateFeedback } from './src/overview.ts';
import { HOME, PI_CLI, MODEL, LIVE_MODEL, CANONICAL_MODEL, CANONICAL_PROFILE, VAULT, load, save, binding, bindingFile, runs, childMessages, feedback, type RuntimeKind } from './src/state.ts';
import { runtimeLaunch, assertNativeOwner } from './src/runtime.ts';

const io = createBridgeIo<any>();
const sessions = new Map<string, Session>();
type Session = {
  threadId: string; profile: string; providerThreadId: string; cwd: string;
  rpc?: PiRpc | OwnerClient; closing: boolean; open: boolean; failed: boolean; serial: number;
  messageKey?: string; childId?: string; cursor: number; poll?: NodeJS.Timeout; runtimeKind: RuntimeKind;
};
const emit = (s: Session, deltas: ThreadDelta[]) => io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: s.threadId, deltas } });
const text = (content: any) => typeof content === 'string' ? content : (content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
function audit(s: Session, event: string, extra: Record<string, unknown> = {}) {
  const directory = join(HOME, 'audit'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  appendFileSync(join(directory, `${s.threadId}.jsonl`), JSON.stringify({ at: Date.now(), event, profile: s.profile, ...extra }) + '\n', { mode: 0o600 });
}
function open(s: Session) { if (!s.open) { s.open = true; s.failed = false; emit(s, [{ kind: 'turn.open' }]); } }
function message(s: Session, value: string) {
  open(s); const key = { providerItemId: `exo-${++s.serial}` };
  emit(s, [{ kind: 'item.open', key, item: { type: 'agentMessage', text: '' } },
    { kind: 'item.textClose', key, channel: 'agentMessage', text: value }]);
}
function settle(s: Session, status: 'completed' | 'interrupted' | 'failed' = 'completed') {
  emit(s, [{ kind: 'turn.boundary', status, ...(!s.open ? { claimIfIdle: true } : {}) }]); s.open = false; s.messageKey = undefined;
}
function event(s: Session, e: any) {
  if (s.closing) return;
  audit(s, e.type, e.type === 'extension_ui_request' ? { method: e.method } : {});
  if (e.type === 'agent_start') open(s);
  if (e.type === 'message_start' && e.message.role === 'assistant') {
    open(s); s.messageKey = `exo-${++s.serial}`;
    emit(s, [{ kind: 'item.open', key: { providerItemId: s.messageKey }, item: { type: 'agentMessage', text: '' } }]);
  }
  if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta' && s.messageKey)
    emit(s, [{ kind: 'item.textDelta', key: { providerItemId: s.messageKey }, channel: 'agentMessage', text: e.assistantMessageEvent.delta }]);
  if (e.type === 'message_end' && e.message.role === 'assistant' && s.messageKey) {
    emit(s, [{ kind: 'item.textClose', key: { providerItemId: s.messageKey }, channel: 'agentMessage', text: text(e.message.content) || (e.message.stopReason === 'toolUse' ? '[Tool request]' : e.message.errorMessage || '') }]);
    s.failed ||= e.message.stopReason === 'error'; s.messageKey = undefined;
  }
  if (e.type === 'tool_execution_start') {
    open(s); emit(s, [{ kind: 'item.open', key: { providerItemId: e.toolCallId }, item: { type: 'tool', tool: e.toolName, args: e.args } }]);
  }
  if (e.type === 'tool_execution_end' && e.toolName === 'update_exosurface') {
    // Surfaces are conversation history: a successful draw or edit shows as a clickable surface card where it
    // happened (display-only; never in Exo's context) and the plain tool row is hidden. Failures stay visible.
    const ok = !e.isError, cards = ok && Array.isArray(e.result?.details?.cards) ? e.result.details.cards : [];
    emit(s, [{ kind: 'item.close', key: { providerItemId: e.toolCallId }, status: ok ? 'completed' : 'failed', item: { type: 'tool', tool: e.toolName, result: text(e.result?.content) },
      presentation: { icon: { glyph: 'PanelsTopLeft' }, label: { pending: 'Updating the canvas', completed: ok ? 'Updated the canvas' : 'Canvas update failed' }, suppress: ok && cards.length > 0 } }]);
    for (const c of cards) if (/^[a-zA-Z0-9_-]{1,80}$/.test(c.surface) && Number.isInteger(c.revision)) message(s, `::exo-surface{surface="${c.surface}" revision="${c.revision}" action="${c.action === 'edited' ? 'edited' : 'drew'}"}`);
  } else if (e.type === 'tool_execution_end') emit(s, [{ kind: 'item.close', key: { providerItemId: e.toolCallId }, status: e.isError ? 'failed' : 'completed', item: { type: 'tool', tool: e.toolName, result: text(e.result?.content) } }]);
  if (e.type === 'message_end' && e.message.role === 'custom' && e.message.display) message(s, `[OptChat report]\n${text(e.message.content)}`);
  if (e.type === 'agent_settled') { audit(s, 'bb-settle'); settle(s, e.aborted ? 'interrupted' : s.failed ? 'failed' : 'completed'); }
  // agent_end intentionally does NOT settle BB: Pi 1.1 may continue.
  if (e.type === 'extension_ui_request') {
    if (e.method === 'notify' || e.method === 'setStatus') {
      updateFeedback(s.threadId, e);
      // Latest feedback is read by the panel. Never append transient status
      // snapshots to BB's indefinitely growing conversational event history.
    } else if (['select', 'confirm', 'input', 'editor'].includes(e.method)) {
      // Fail closed: this spike does not implement dialog parity.
      s.rpc?.notify('extension_ui_response', { id: e.id, cancelled: true });
    }
    // setTitle/widget/editor are deliberately outside this bounded spike.
  }
  if (e.type === 'extension_error') { s.failed = true; message(s, `[Pi extension error] ${e.error}`); }
}
async function construct(threadId: string, cwd: string, providerThreadId?: string, attach?: { profile: string; childId: string }, runtimeKind: RuntimeKind = 'offline') {
  // Personal BB threads have a managed artifact workspace. Exo's local Adapter
  // deliberately roots Pi in the vault, like the existing pi-optchat launcher.
  // Only full-permission mode is advertised; this is not a workspace sandbox.
  if (runtimeKind !== 'offline') cwd = VAULT;
  if (runtimeKind !== 'offline' && attach) throw new Error('Linked child projections are disabled outside the offline proof');
  if (runtimeKind === 'canonical') {
    const file = join(HOME, 'canonical-thread.json');
    if (!existsSync(file)) {
      const clone = load(join(HOME, 'clone.json'));
      if (!clone.sessionFile.startsWith(`${process.env.HOME}/.optchat-exo-a2ui/pi-sessions/`)) throw new Error('Clone session required; never main');
      const providerThreadId = `exo-a2ui:${CANONICAL_PROFILE}:main`;
      save(bindingFile(threadId), {providerThreadId, profile:CANONICAL_PROFILE, runtimeKind:'canonical', sessionFile:clone.sessionFile, cursor:0});
      save(file, {threadId, profile:CANONICAL_PROFILE, providerThreadId, sessionFile:clone.sessionFile});
    }
    if (existsSync(file) && load(file).threadId !== threadId) throw new Error(`Open the existing canonical BB conversation ${load(file).threadId}; do not start another owner thread`);
  }
  if (sessions.has(threadId)) throw new Error('Thread already has an attached runtime');
  let profile = attach?.profile ?? (providerThreadId ? providerThreadId.split(':')[1] : runtimeKind === 'canonical' ? CANONICAL_PROFILE : `${runtimeKind === 'live' ? 'live-' : ''}${randomUUID().replaceAll('-', '').slice(0, 20)}`);
  if (!/^[a-z0-9_-]{1,64}$/.test(profile)) throw new Error('Invalid profile identity');
  const childId = attach?.childId ?? (providerThreadId?.split(':')[2] !== 'main' ? providerThreadId?.split(':')[2] : undefined);
  const handle = `exo-a2ui:${profile}:${childId ?? 'main'}`;
  if ([...sessions.values()].some(s => s.providerThreadId === handle)) throw new Error('This provider session already belongs to a BB thread');
  const old = binding(threadId);
  if (old && (old.runtimeKind ?? 'offline') !== runtimeKind) throw new Error('Cannot switch a persisted proof conversation between fixture and live models; create a separate thread');
  if (runtimeKind === 'canonical' && (profile !== CANONICAL_PROFILE || childId)) throw new Error('Canonical route requires the existing main exo-optchat identity');
  if (runtimeKind === 'live' && (!profile.startsWith('live-') || childId)) throw new Error('Live trial cannot claim the existing personal profile or a linked child');
  if (!childId && old?.sessionFile && !providerThreadId && runtimeKind !== 'canonical') throw new Error('Existing spike conversation must resume its provider identity, not start a new profile on an old transcript');
  if (providerThreadId && old?.providerThreadId && old.providerThreadId !== providerThreadId) throw new Error('Provider identity does not match saved binding');
  const s: Session = { threadId, profile, providerThreadId: handle, cwd, closing: false, open: false, failed: false, serial: Date.now(), childId, cursor: old?.cursor ?? 0, runtimeKind };
  sessions.set(threadId, s);
  io.send({ jsonrpc: '2.0', method: 'thread/identity', params: { threadId, providerThreadId: handle } });
  emit(s, [{ kind: 'session.reset' }]);
  try {
    if (childId) {
      if (!runs(profile).some(r => r.id === childId)) throw new Error('No native OptChat child with that identity');
    } else {
      const launch = runtimeLaunch(profile, runtimeKind, threadId, old?.sessionFile);
      const lost = (error: Error) => {
        if (!s.closing) { audit(s, 'unexpected-exit'); io.send({ jsonrpc: '2.0', method: 'error', params: { threadId, message: error.message } }); if (s.open) settle(s, 'failed'); }
      };
      s.rpc = runtimeKind === 'canonical'
        ? await OwnerClient.open(threadId, e => event(s, e), lost)
        : new PiRpc(PI_CLI, launch.args, cwd, launch.env, e => event(s, e), lost);
      const state = await s.rpc.send('get_state');
      const commands = await s.rpc.send('get_commands');
      await assertNativeOwner(profile, runtimeKind, s.rpc.pid);
      // Whole-history get_entries RPC would eventually exceed any frame bound.
      // Canonical diagnostics expose only the branch's profile binding.
      const bound = runtimeKind === 'canonical'
        ? load(join(HOME, 'runtime-info', `${threadId}.json`)).boundProfile === profile
        : (await s.rpc.send('get_entries')).entries.some((e: any) => e.type === 'custom' && e.customType === 'optchat.profile' && e.data?.name === profile);
      if (!bound) throw new Error('OptChat did not bind the requested profile; refusing a false-ready runtime');
      save(bindingFile(threadId), { providerThreadId: handle, profile, runtimeKind, sessionFile: state.sessionFile, commands: commands?.commands?.map((c: any) => ({ name: c.name, description: c.description })), cursor: 0 });
      if (runtimeKind === 'canonical') save(join(HOME, 'canonical-thread.json'), { threadId, profile, providerThreadId: handle, sessionFile: state.sessionFile });
      audit(s, runtimeKind === 'canonical' ? 'view-attached' : 'owner-started', { sessionId: state.sessionId });
      if (runtimeKind === 'canonical') await s.rpc.send('attach');
    }
    // Settle startup status before accepting the first submitted prompt.
    if (s.open) settle(s);
    if (childId) { save(bindingFile(threadId), { providerThreadId: handle, profile, childId, cursor: s.cursor }); audit(s, 'child-view-attached', { childId }); }
    return s;
  } catch (error) { await close(s); throw error; }
}
async function close(s: Session) {
  s.closing = true; if (s.poll) clearInterval(s.poll);
  await s.rpc?.close(); sessions.delete(s.threadId); audit(s, s.runtimeKind === 'canonical' ? 'view-detached' : 'owner-released');
}
async function prompt(s: Session, input: any[], requestId?: string) {
  if (input.some(p => p.type !== 'text')) throw new Error('Attachments are outside this spike');
  const value = input.map(p => p.text).join('');
  if (s.childId) {
    if (value !== '/refresh' && !value.startsWith('/attach ')) throw new Error('Child projection is read-only in this spike; use native tell from its owner');
    if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
    project(s); settle(s); return;
  }
  const response = await s.rpc!.send('prompt', { message: value });
  audit(s, 'prompt-response', { disposition: response?.disposition });
  if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
  if (response?.disposition === 'handled') {
    const state = await s.rpc!.send('get_state');
    if (!state.isStreaming && !state.isCompacting && !state.pendingMessageCount) settle(s);
  }
}
function project(s: Session) {
  if (!s.childId || s.closing) return;
  const messages = childMessages(s.profile, s.childId);
  for (const m of messages.slice(s.cursor)) if (text(m.content)) message(s, text(m.content));
  s.cursor = messages.length;
  save(bindingFile(s.threadId), { providerThreadId: s.providerThreadId, profile: s.profile, childId: s.childId, cursor: s.cursor });
}
const schemas: Record<string, any> = { initialize: initializeParamsSchema, 'model/list': modelListParamsSchema, 'thread/start': threadStartParamsSchema, 'thread/resume': threadResumeParamsSchema, 'thread/stop': threadStopParamsSchema, 'turn/start': turnStartParamsSchema, 'turn/steer': turnSteerParamsSchema };
async function request(id: string | number, method: string, p: any) {
  if (method === 'initialize') return io.sendResult(id, { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, capabilities: { grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3], sessionRestore: true, fork: 'none', threadArchive: false, threadRename: false, threadGoalClear: false, approvalEnforcedBy: 'provider', steerMode: 'queue' } });
  if (method === 'model/list') return io.sendResult(id, { models: [CANONICAL_MODEL], selectedOnlyModels: [] });
  if (method === 'thread/start' || method === 'thread/resume') {
    const initial = (p.input ?? []).filter((i: any) => i.type === 'text').map((i: any) => i.text).join('');
    const match = /^\/attach ([a-z0-9_-]+) ([a-zA-Z0-9-]+)$/.exec(initial);
    const attachment = p.options.providerOptions?.attachment;
    const runtimeKind: RuntimeKind = p.options.providerOptions?.runtimeKind === 'canonical' || p.options.model === CANONICAL_MODEL.id ? 'canonical' : p.options.providerOptions?.runtimeKind === 'live' || p.options.model === LIVE_MODEL.id ? 'live' : 'offline';
    const s = await construct(p.threadId, p.cwd, p.providerThreadId, attachment ?? (match ? { profile: match[1], childId: match[2] } : undefined), runtimeKind);
    io.sendResult(id, { providerThreadId: s.providerThreadId, sessionRestorable: true });
    if (p.input?.length) await prompt(s, p.input);
    if (s.childId) s.poll = setInterval(() => { try { const before = s.cursor; project(s); if (s.cursor !== before) settle(s); } catch { audit(s, 'child-projection-error'); } }, 250);
    return;
  }
  const s = sessions.get(p.threadId);
  if (!s) throw new Error('No attached spike runtime; resume first');
  if (p.options?.providerOptions?.runtimeKind && p.options.providerOptions.runtimeKind !== s.runtimeKind) throw new Error('Cannot change fixture/live runtime on an existing conversation');
  if (method === 'turn/start') {
    io.sendResult(id, {});
    try { await prompt(s, p.input, p.clientRequestId); }
    catch (error) { message(s, `[Rejected] ${error instanceof Error ? error.message : String(error)}`); settle(s, 'failed'); }
    return;
  }
  if (method === 'turn/steer') {
    if (!s.rpc || !s.open) return io.sendError(id, -32003, 'No active main turn to steer');
    const value = p.input.map((i: any) => i.text ?? '').join('');
    await s.rpc.send('prompt', { message: value, streamingBehavior: 'steer' });
    if (p.clientRequestId) emit(s, [{ kind: 'input.accepted', clientRequestId: p.clientRequestId }]);
    return io.sendResult(id, {});
  }
  if (method === 'thread/stop') {
    if (p.intent === 'interrupt' && s.rpc) {
      await s.rpc.send('clear_queue'); await s.rpc.send('abort');
      // Closing the owner also stops native in-process children: deliberately not detached jobs.
    }
    await close(s); return io.sendResult(id, {});
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
export const experimental_providerBridge = experimental_defineProviderBridge({ handleLine,
  onClose: async () => { await Promise.allSettled([...sessions.values()].map(close)); },
  onSigterm: async () => { await Promise.allSettled([...sessions.values()].map(close)); },
  onSigint: async () => { await Promise.allSettled([...sessions.values()].map(close)); },
});

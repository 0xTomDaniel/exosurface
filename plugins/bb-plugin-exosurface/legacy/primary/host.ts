import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createBridgeIo, experimental_defineProviderBridge, runBridgeRequest,
  PROVIDER_BRIDGE_PROTOCOL_VERSION, THREAD_DELTA_GRAMMAR_V3,
  initializeParamsSchema, modelListParamsSchema, threadStartParamsSchema,
  threadResumeParamsSchema, threadStopParamsSchema, turnStartParamsSchema, turnSteerParamsSchema,
  type ThreadDelta,
} from '@get-bb/plugin-sdk/provider-bridge';
import { OwnerClient } from './src/owner-client.ts';
import { updateFeedback } from './src/overview.ts';
import { HOME, CANONICAL_MODEL, SOL_MODEL, CANONICAL_PROFILE, VAULT, load, save, binding, bindingFile, threadProfile, isBoundThread, NEW_THREAD_PROMPT } from './src/state.ts';
import { prepareRuntime, assertNativeOwner } from './src/runtime.ts';
import { promptWithPrimaryModel } from './src/model-selection.ts';
import { consumeCanonicalInitialization, consumeAdmittedCanonicalStart } from './src/canonical-control.ts';
import { setupStatus } from './src/canonical-setup.ts';

const io = createBridgeIo<any>();
const sessions = new Map<string, Session>();
type Session = {
  threadId: string; profile: string; providerThreadId: string; cwd: string;
  rpc?: OwnerClient; closing: boolean; open: boolean; failed: boolean; serial: number;
  messageKey?: string;
};
const emit = (s: Session, deltas: ThreadDelta[]) => io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: s.threadId, deltas } });
const text = (content: any) => typeof content === 'string' ? content : (content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
function audit(s: Session, event: string, extra: Record<string, unknown> = {}) {
  const directory = join(HOME, 'audit'); mkdirSync(directory, { recursive: true, mode: 0o700 });
  appendFileSync(join(directory, `${s.threadId}.jsonl`), JSON.stringify({ at: Date.now(), event, profile: s.profile, ...extra }) + '\n', { mode: 0o600 });
}
function open(s: Session) { if (!s.open) { s.open = true; s.failed = false; emit(s, [{ kind: 'turn.open' }]); } }
function message(s: Session, value: string) {
  open(s); const key = { providerItemId: `exo-${String(++s.serial)}` };
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
    open(s); s.messageKey = `exo-${String(++s.serial)}`;
    emit(s, [{ kind: 'item.open', key: { providerItemId: s.messageKey }, item: { type: 'agentMessage', text: '' } }]);
  }
  if (e.type === 'message_update' && e.assistantMessageEvent.type === 'text_delta' && s.messageKey)
    emit(s, [{ kind: 'item.textDelta', key: { providerItemId: s.messageKey }, channel: 'agentMessage', text: e.assistantMessageEvent.delta }]);
  if (e.type === 'message_end' && e.message.role === 'assistant' && s.messageKey) {
    emit(s, [{ kind: 'item.textClose', key: { providerItemId: s.messageKey }, channel: 'agentMessage', text: text(e.message.content) || (e.message.stopReason === 'toolUse' ? '[Tool request]' : e.message.errorMessage || '') }]);
    s.failed ||= e.message.stopReason === 'error'; s.messageKey = undefined;
  }
  if (e.type === 'tool_execution_start') {
    // Canvas calls are hidden from the first event: BB decides a row's visibility when it opens. Success shows as a
    // surface card, failure as a short visible line (below), so no half-hidden row is ever left behind.
    const canvas = e.toolName === 'update_exosurface';
    open(s); emit(s, [{ kind: 'item.open', key: { providerItemId: e.toolCallId }, item: { type: 'tool', tool: e.toolName, args: e.args },
      ...(canvas ? { presentation: { icon: { glyph: 'PanelsTopLeft' }, label: { pending: 'Updating a page', completed: 'Updated a page' }, suppress: true } } : {}) }]);
  }
  if (e.type === 'tool_execution_end' && e.toolName === 'update_exosurface') {
    // Surfaces are conversation history: a successful draw or edit shows as a clickable surface card where it
    // happened (display-only; never in Exo's context) and the plain tool row is hidden. Failures stay visible.
    const ok = !e.isError, cards = ok && Array.isArray(e.result?.details?.cards) ? e.result.details.cards : [];
    emit(s, [{ kind: 'item.close', key: { providerItemId: e.toolCallId }, status: ok ? 'completed' : 'failed', item: { type: 'tool', tool: e.toolName, result: text(e.result?.content) },
      presentation: { icon: { glyph: 'PanelsTopLeft' }, label: { pending: 'Updating a page', completed: ok ? 'Updated a page' : 'Page update failed' }, suppress: true } }]);
    if (!ok) message(s, `Page update failed: ${text(e.result?.content).slice(0, 300)}`);
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
async function construct(threadId: string, cwd: string, providerThreadId?: string) {
  // Personal BB threads have a managed artifact workspace. Exo's local Adapter
  // deliberately roots Pi in the vault, like the existing pi-optchat launcher.
  // Only full-permission mode is advertised; this is not a workspace sandbox.
  cwd = VAULT;
  // A thread bound to its own canonical profile (thread-profiles.ts) runs beside the primary, never as it.
  const bound = binding(threadId), own = bound?.runtimeKind === 'canonical' && bound.profile === threadProfile(threadId);
  const file = join(HOME, 'canonical-thread.json');
  if (existsSync(file) && load(file).threadId !== threadId && !own) throw new Error(`Open the existing canonical BB conversation ${load(file).threadId}; do not start another owner thread`);
  if (sessions.has(threadId)) throw new Error('Thread already has an attached runtime');
  let profile = providerThreadId ? providerThreadId.split(':')[1] : own ? bound.profile : CANONICAL_PROFILE;
  if (!/^[a-z0-9_-]{1,64}$/.test(profile)) throw new Error('Invalid profile identity');
  const childId = providerThreadId?.split(':')[2] !== 'main' ? providerThreadId?.split(':')[2] : undefined;
  const handle = `exo:${profile}:${childId ?? 'main'}`;
  if ([...sessions.values()].some(s => s.providerThreadId === handle)) throw new Error('This provider session already belongs to a BB thread');
  const old = binding(threadId);
  if (old && old.runtimeKind !== 'canonical') throw new Error('This conversation is not bound to the canonical Exo runtime; create a separate thread');
  if ((profile !== CANONICAL_PROFILE && !(own && profile === bound.profile)) || childId) throw new Error('Canonical route requires the existing main exo-optchat identity');
  if (old?.sessionFile && !providerThreadId) throw new Error('Existing spike conversation must resume its provider identity, not start a new profile on an old transcript');
  if (providerThreadId && old?.providerThreadId && old.providerThreadId !== providerThreadId) throw new Error('Provider identity does not match saved binding');
  const s: Session = { threadId, profile, providerThreadId: handle, cwd, closing: false, open: false, failed: false, serial: Date.now() };
  sessions.set(threadId, s);
  io.send({ jsonrpc: '2.0', method: 'thread/identity', params: { threadId, providerThreadId: handle } });
  emit(s, [{ kind: 'session.reset' }]);
  try {
    // The canonical owner is a separate process that validates/launches its own runtime; BB's copied host
    // artifact has no packaged runtime beside it. It still validates the profile/generation here (fail closed)
    // before attaching to the owner.
    prepareRuntime(profile);
    const lost = (error: Error) => {
      if (!s.closing) { audit(s, 'unexpected-exit'); io.send({ jsonrpc: '2.0', method: 'error', params: { threadId, message: error.message } }); if (s.open) settle(s, 'failed'); }
    };
    s.rpc = await OwnerClient.open(threadId, e => event(s, e), lost);
    const state = await s.rpc.send('get_state');
    const commands = await s.rpc.send('get_commands');
    await assertNativeOwner(profile, s.rpc.pid);
    // Whole-history get_entries RPC would eventually exceed any frame bound.
    // Canonical diagnostics expose only the branch's profile binding.
    if (load(join(HOME, 'runtime-info', `${threadId}.json`)).boundProfile !== profile) throw new Error('OptChat did not bind the requested profile; refusing a false-ready runtime');
    save(bindingFile(threadId), { providerThreadId: handle, profile, runtimeKind: 'canonical', sessionFile: state.sessionFile, commands: commands?.commands?.map((c: any) => ({ name: c.name, description: c.description })), cursor: 0 });
    if (!own) save(join(HOME, 'canonical-thread.json'), { threadId, profile, providerThreadId: handle, sessionFile: state.sessionFile });
    audit(s, 'view-attached', { sessionId: state.sessionId });
    await s.rpc.send('attach');
    // Settle startup status before accepting the first submitted prompt.
    if (s.open) settle(s);
    return s;
  } catch (error) { await close(s); throw error; }
}
async function close(s: Session) {
  s.closing = true;
  await s.rpc?.close(); sessions.delete(s.threadId); audit(s, 'view-detached');
}
// New surface (#68): the thread_new RPC's first message only bound the thread at admission; no turn reaches Pi.
const newSurface = (s: Session, input: any[] | undefined) => isBoundThread(s.threadId) && (input ?? []).map((i: any) => i.text ?? '').join('').trim() === NEW_THREAD_PROMPT;
async function selectedPrompt(s: Session, picked: unknown, input: any[], requestId?: string) {
  const send = () => prompt(s, input, requestId);
  if (!s.rpc) return send();
  return promptWithPrimaryModel(s.rpc, picked, async () => {
    audit(s, 'model-verified', { model: picked });
    return send();
  });
}
async function prompt(s: Session, input: any[], requestId?: string) {
  if (input.some(p => p.type !== 'text')) throw new Error('Attachments are outside this spike');
  const value = input.map(p => p.text).join('');
  const response = await s.rpc!.send('prompt', { message: value });
  audit(s, 'prompt-response', { disposition: response?.disposition });
  if (requestId) emit(s, [{ kind: 'input.accepted', clientRequestId: requestId }]);
  if (response?.disposition === 'handled') {
    const state = await s.rpc!.send('get_state');
    if (!state.isStreaming && !state.isCompacting && !state.pendingMessageCount) settle(s);
  }
}
const schemas: Record<string, any> = { initialize: initializeParamsSchema, 'model/list': modelListParamsSchema, 'thread/start': threadStartParamsSchema, 'thread/resume': threadResumeParamsSchema, 'thread/stop': threadStopParamsSchema, 'turn/start': turnStartParamsSchema, 'turn/steer': turnSteerParamsSchema };
async function request(id: string | number, method: string, p: any) {
  if (method === 'initialize') return io.sendResult(id, { protocolVersion: PROVIDER_BRIDGE_PROTOCOL_VERSION, capabilities: { grammarVersions: [THREAD_DELTA_GRAMMAR_V3, THREAD_DELTA_GRAMMAR_V3], sessionRestore: true, fork: 'none', threadArchive: false, threadRename: false, threadGoalClear: false, approvalEnforcedBy: 'provider', steerMode: 'queue' } });
  if (method === 'model/list') return io.sendResult(id, { models: [CANONICAL_MODEL, SOL_MODEL], selectedOnlyModels: [] });
  if (method === 'thread/start' || method === 'turn/start') {
    const setupOperation = p.options?.providerOptions?.canonicalSetupOperation;
    const setup = method === 'thread/start' && !p.input?.length && typeof setupOperation === 'string' && setupStatus(HOME)?.stage !== 'bound'
      ? consumeAdmittedCanonicalStart(HOME, p.threadId, setupOperation)
      : consumeCanonicalInitialization(HOME, p.threadId, p.input);
    if (setup) {
      io.sendResult(id, method === 'thread/start' ? { providerThreadId: setup.providerThreadId, sessionRestorable: true } : {});
      if (method === 'turn/start') io.send({ jsonrpc: '2.0', method: 'thread/delta', params: { threadId: p.threadId, deltas: [{ kind: 'turn.boundary', status: 'completed', claimIfIdle: true }] } });
      return;
    }
  }
  // BB may start the setup-created thread only after setup has already committed `bound` (provisioning is slower
  // than setup). That start carries no provider identity: reuse ONLY the committed fresh binding for this exact
  // thread. Without input, defer owner attachment to the first turn (the owner may not be started yet).
  let providerThreadId = p.providerThreadId;
  if (method === 'thread/start' && !providerThreadId) {
    const journal = setupStatus(HOME), canonical = binding(p.threadId);
    if (journal?.stage === 'bound' && journal.threadId === p.threadId && canonical?.runtimeKind === 'canonical') {
      providerThreadId = canonical.providerThreadId;
      if (!p.input?.length) return io.sendResult(id, { providerThreadId, sessionRestorable: true });
    }
  }
  if (method === 'thread/start' || method === 'thread/resume') {
    const s = await construct(p.threadId, p.cwd, providerThreadId);
    io.sendResult(id, { providerThreadId: s.providerThreadId, sessionRestorable: true });
    if (p.input?.length && newSurface(s, p.input)) settle(s);
    else if (p.input?.length) {
      try { await selectedPrompt(s, p.options?.model, p.input); }
      catch (error) { message(s, `[Rejected] ${error instanceof Error ? error.message : String(error)}`); settle(s, 'failed'); }
    }
    return;
  }
  let s = sessions.get(p.threadId);
  // Setup's control-only start intentionally did not attach a Pi. The first
  // ordinary turn may attach ONLY the committed fresh canonical binding.
  if (!s && method === 'turn/start' && setupStatus(HOME)?.stage === 'bound') {
    const canonical = binding(p.threadId), journal = setupStatus(HOME);
    if (journal?.threadId === p.threadId && canonical?.runtimeKind === 'canonical') s = await construct(p.threadId, VAULT, canonical.providerThreadId);
  }
  if (!s) throw new Error('No attached spike runtime; resume first');
  if (method === 'turn/start') {
    io.sendResult(id, {});
    if (newSurface(s, p.input)) { if (p.clientRequestId) emit(s, [{ kind: 'input.accepted', clientRequestId: p.clientRequestId }]); settle(s); return; }
    try { await selectedPrompt(s, p.options?.model, p.input, p.clientRequestId); }
    catch (error) { message(s, `[Rejected] ${error instanceof Error ? error.message : String(error)}`); settle(s, 'failed'); }
    return;
  }
  if (method === 'turn/steer') {
    if (!s.rpc || !s.open) return io.sendError(id, -32003, 'No active main turn to steer');
    const value = p.input.map((i: any) => i.text ?? '').join('');
    const send = () => s.rpc!.send('prompt', { message: value, streamingBehavior: 'steer' });
    await promptWithPrimaryModel(s.rpc, p.options?.model, send);
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

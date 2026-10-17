import { build } from './typed.js';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { AgentCard, Artifact, Message, SendMessageRequest, Task, TaskState, TaskStatus, TaskStatusUpdateEvent, TaskArtifactUpdateEvent, formatSSEEvent } from '@a2a-js/sdk';
import { AgentEvent, DefaultExecutionEventBus, DefaultRequestHandler, JsonRpcTransportHandler, ServerCallContext,
  type AgentExecutor, type ExecutionEventBus, type ExecutionEventBusManager, type RequestContext } from '@a2a-js/sdk/server';
import { UnsupportedOperationError } from '@a2a-js/sdk/errors';
import { A2uiClientMessageListSchema } from '@a2ui/web_core/v0_9';
import { Thread } from './thread.js';
import { ProjectedTaskStore } from './task-store.js';
import { dataPart } from './client.js';
import { surfaceMessages } from './surface.js';
import { A2UI_MIME, A2UI_URI, CATALOG, limits, THREAD } from './schema.js';
import { runPi } from './pi.js';

type BusListener = ((event: import('@a2a-js/sdk/server').AgentExecutionEvent) => void) | (() => void);
class MeasuredBus extends DefaultExecutionEventBus {
  private tracked = new Map<string, Set<BusListener>>();
  override on(name: 'event' | 'finished', listener: BusListener): this {
    const list = this.tracked.get(name) ?? new Set<BusListener>(); list.add(listener); this.tracked.set(name, list);
    if (name === 'event') super.on(name, listener); else super.on(name, listener as () => void);
    return this;
  }
  override off(name: 'event' | 'finished', listener: BusListener): this {
    this.tracked.get(name)?.delete(listener);
    if (name === 'event') super.off(name, listener); else super.off(name, listener as () => void);
    return this;
  }
  override removeAllListeners(name?: 'event' | 'finished'): this {
    if (name) this.tracked.delete(name); else this.tracked.clear();
    super.removeAllListeners(name); return this;
  }
  get listenerCount() { return [...this.tracked.values()].reduce((n, set) => n + set.size, 0); }
}
class MeasuredBuses implements ExecutionEventBusManager {
  readonly buses = new Map<string, MeasuredBus>();
  createOrGetByTaskId(id: string) { let bus = this.buses.get(id); if (!bus) { bus = new MeasuredBus(); this.buses.set(id, bus); } return bus; }
  getByTaskId(id: string) { return this.buses.get(id); }
  cleanupByTaskId(id: string) { this.buses.delete(id); }
  metrics() { return { buses: this.buses.size, busListeners: [...this.buses.values()].reduce((n, b) => n + b.listenerCount, 0) }; }
}

export type HostOptions = { stateDir: string; port?: number; bootWorkMs?: number; leaseMs?: number; crashAfterPlanWrite?: boolean };
export async function startHost(options: HostOptions) {
  const thread = new Thread(options.stateDir, options.crashAfterPlanWrite ? () => process.kill(process.pid, 'SIGKILL') : undefined);
  const store = new ProjectedTaskStore(join(options.stateDir, 'tasks.json'));
  const buses = new MeasuredBuses();
  const owner = new ServerCallContext({ requestedVersion: '1.0', user: { isAuthenticated: true, userName: 'owner' } });
  const pending = new Map<string, { abort: AbortController; done: Promise<void> }>();
  let closing = false;
  let observerId = '';
  let observerReady: Promise<void> = Promise.resolve();
  let publishTimer: ReturnType<typeof setTimeout> | undefined;
  const metrics = { activeStreams: 0, openedStreams: 0, closedStreams: 0, maxStreams: 0,
    slowDrops: 0, maxFrameBytes: 0, maxWritableBytes: 0, publications: 0, sourceErrors: 0, maxDrainMs: 0 };
  function checkpoint() {
    const snapshot = thread.snapshot();
    return build(Artifact, { artifactId: 'live-checkpoint', name: 'Current Exosurface',
      parts: [dataPart(snapshot), dataPart(surfaceMessages(snapshot), A2UI_MIME)],
      extensions: [A2UI_URI], metadata: { revision: snapshot.revision, bootId: snapshot.bootId } });
  }
  function status(id: string, state: TaskState) {
    return AgentEvent.statusUpdate(build(TaskStatusUpdateEvent, { taskId: id, contextId: THREAD,
      status: build(TaskStatus, { state, timestamp: new Date().toISOString() }) }));
  }
  function publish() {
    if (closing) return;
    const bus = buses.getByTaskId(observerId);
    if (!bus) return;
    const artifact = checkpoint();
    if (Buffer.byteLength(JSON.stringify(Artifact.toJSON(artifact))) > limits.checkpointBytes) throw new Error('Checkpoint capacity reached');
    bus.publish(AgentEvent.artifactUpdate(build(TaskArtifactUpdateEvent, { taskId: observerId,
      contextId: THREAD, artifact, append: false, lastChunk: true })));
    metrics.publications++;
  }
  thread.onChange = () => {
    if (!publishTimer && !closing) publishTimer = setTimeout(() => { publishTimer = undefined; publish(); }, limits.publishMs);
  };
  const executor: AgentExecutor = {
    async execute(ctx: RequestContext, bus: ExecutionEventBus) {
      if (ctx.context.user?.userName !== 'owner' || ctx.contextId !== THREAD) throw new Error('Unauthorized thread');
      const requestPart = ctx.userMessage.parts.find(p => p.content?.$case === 'data');
      const data: unknown = requestPart?.content?.$case === 'data' ? requestPart.content.value : undefined;
      const request = typeof data === 'object' && data !== null && 'request' in data ? data.request : undefined;
      if (request === 'observe' || request === 'work') {
        const observer = request === 'observe';
        if (observer) { observerId = ctx.taskId; thread.state.observerTaskId = observerId; }
        const abort = new AbortController();
        const workData = data as { kind?: string; turnId?: string; durationMs?: number };
        if (!observer) thread.work(ctx.taskId, workData.kind === 'pi' ? 'pi-conversation' : 'agenda-review');
        const task = build(Task, { id: ctx.taskId, contextId: THREAD,
          status: build(TaskStatus, { state: TaskState.TASK_STATE_WORKING, timestamp: new Date().toISOString() }),
          metadata: { observation: observer }, artifacts: observer ? [checkpoint()] : [] });
        bus.publish(AgentEvent.task(task));
        const heartbeat = setInterval(() => bus.publish(status(ctx.taskId, TaskState.TASK_STATE_WORKING)), limits.heartbeatMs);
        const duration = observer ? options.leaseMs ?? limits.leaseMs : Number((data as { durationMs?: number }).durationMs ?? 800);
        const done = (async () => {
          try {
            if (workData.kind === 'pi') {
              const turn = thread.state.turns.find(t => t.id === workData.turnId);
              const visual = turn?.reference && thread.visuals.get(turn.reference.revision);
              if (!turn || !visual) throw new Error('Pi reference missing');
              const response = await runPi(options.stateDir, thread.snapshot(), visual, turn, abort.signal);
              if (!closing && !abort.signal.aborted) {
                thread.state.model = response.model; thread.state.modelResponse = response;
                thread.publish('exo', 'pi-visual-response', { respondsTo: turn.id, reference: turn.reference, utterance: response.utterance });
              }
            } else await delay(duration, undefined, { signal: abort.signal });
            if (abort.signal.aborted) throw new Error('Canceled');
            if (!closing) {
              if (!observer) thread.finish(ctx.taskId, 'completed', workData.kind === 'pi' ? 'Pi produced a validated visual contribution' : 'Agenda reviewed independently of observers');
              bus.publish(status(ctx.taskId, TaskState.TASK_STATE_COMPLETED));
            }
          } catch (error) {
            if (!closing && abort.signal.aborted) {
              if (!observer) thread.finish(ctx.taskId, 'canceled', 'Stopped before completion; no effects were applied');
              bus.publish(status(ctx.taskId, TaskState.TASK_STATE_CANCELED));
            } else if (!closing) {
              thread.finish(ctx.taskId, 'failed', error instanceof Error ? error.message.replace(/(Bearer\s+|sk-)[^\s]+/g, '[redacted]') : 'Execution failed');
              bus.publish(status(ctx.taskId, TaskState.TASK_STATE_FAILED));
            }
          } finally { clearInterval(heartbeat); pending.delete(ctx.taskId); }
        })();
        pending.set(ctx.taskId, { abort, done });
        await done;
        if (observer && !closing) setTimeout(() => { observerReady = beginObserver(); }, 0);
        return;
      }
      const reply = (value: unknown, text?: string, historicalUi?: unknown[]) => {
        const message = build(Message, { messageId: randomUUID(), contextId: THREAD, role: 2,
          parts: [dataPart(value)], metadata: { respondsTo: ctx.userMessage.messageId } });
        if (text) message.parts.push({ content: { $case: 'text', value: text }, mediaType: 'text/plain', filename: '', metadata: {} });
        if (historicalUi) message.parts.push(dataPart(historicalUi, A2UI_MIME));
        bus.publish(AgentEvent.message(message));
      };
      try {
        if (request === 'discover') { thread.reconcile(); await observerReady; reply(thread.snapshot()); return; }
        if (request === 'history') {
          const revision = Number((data as { revision: number }).revision);
          const visual = thread.visuals.get(revision);
          if (!visual) throw new Error('Historical revision not found');
          const turns = thread.state.turns.filter(t => t.revision === revision);
          reply({ visual, operations: surfaceMessages(visual), turns }, turns[0]?.utterance, surfaceMessages(visual)); return;
        }
        if (requestPart?.mediaType !== A2UI_MIME) throw new Error('Expected an A2UI action');
        const actionMessages = A2uiClientMessageListSchema.parse(data);
        if (actionMessages.length !== 1) throw new Error('Submit one semantic action per message');
        const actionMessage = actionMessages[0];
        if (!actionMessage || !('action' in actionMessage)) throw new Error('Expected one action');
        const action = actionMessage.action;
        const utterance = ctx.userMessage.parts.filter(p => p.content?.$case === 'text').map(p => p.content?.value).join('') || undefined;
        const result = thread.intent({ ...action.context, name: action.name, surfaceId: action.surfaceId,
          actionId: ctx.userMessage.messageId, utterance });
        const workId = result.intent.name === 'ask' ? await startWork(0, result.person.id) : undefined;
        reply({ accepted: true, turnId: result.person.id, workId, receipt: result.receipt, duplicate: result.duplicate, revision: thread.state.revision });
      } catch (error) { reply({ error: error instanceof Error ? error.message : 'Invalid request' }); }
    },
    async cancelTask(id, bus) {
      const work = pending.get(id);
      if (!work) throw new Error('Work already completed or interrupted');
      work.abort.abort(); await work.done;
      // The executor publishes the truthful final state before this returns.
      void bus;
    },
  };
  let url = '';
  const card = AgentCard.fromJSON({ name: 'Exo · A2A / Pi spike', version: '0.1.0', description: 'A temporal visual conversation',
    supportedInterfaces: [{ url: '', protocolBinding: 'JSONRPC', protocolVersion: '1.0' }],
    defaultInputModes: ['text/plain', A2UI_MIME, 'application/json'], defaultOutputModes: ['text/plain', A2UI_MIME, 'application/json'],
    securitySchemes: { demoBearer: { httpAuthSecurityScheme: { scheme: 'Bearer', description: 'Loopback fixture identity only' } } },
    securityRequirements: [{ schemes: { demoBearer: { list: [] } } }],
    capabilities: { streaming: true, extensions: [{ uri: A2UI_URI, required: false, description: 'A2UI v0.9 basic catalog', params: { supportedCatalogIds: [CATALOG] } }] },
  });
  const handler = new DefaultRequestHandler(card, store, executor, buses);
  const rpc = new JsonRpcTransportHandler(handler);
  async function beginObserver() {
    await handler.sendMessage(build(SendMessageRequest, { message: build(Message, { messageId: randomUUID(), contextId: THREAD, role: 1,
      parts: [dataPart({ request: 'observe' })] }), configuration: { returnImmediately: true, acceptedOutputModes: [], historyLength: 0, taskPushNotificationConfig: undefined } }), owner);
  }
  async function startWork(durationMs = 800, turnId?: string) {
    const response = await handler.sendMessage(build(SendMessageRequest, { message: build(Message, { messageId: randomUUID(), contextId: THREAD, role: 1,
      parts: [dataPart({ request: 'work', durationMs, kind: turnId ? 'pi' : 'fixture', turnId })] }), configuration: { returnImmediately: true, acceptedOutputModes: [], historyLength: 0, taskPushNotificationConfig: undefined } }), owner);
    if (!('id' in response)) throw new Error('Expected work task'); return response.id;
  }
  const server = createServer((req, res) => { void serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end(); }); });
  async function serve(req: IncomingMessage, res: ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:61011');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, A2A-Version, A2A-Extensions');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
    if (req.url === '/.well-known/agent-card.json') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(AgentCard.toJSON(card))); return; }
    const token = req.headers.authorization;
    if (token !== 'Bearer demo-owner' && token !== 'Bearer demo-outsider') { res.writeHead(401); res.end('Authentication required'); return; }
    const context = token === 'Bearer demo-owner' ? owner : new ServerCallContext({ requestedVersion: '1.0', user: { isAuthenticated: true, userName: 'outsider' } });
    if (req.url === '/metrics' && token === 'Bearer demo-owner') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ ...metrics, ...buses.metrics(), ...store.metrics(),
        threadWrites: thread.writes, threadWriteBytes: thread.writeBytes, revisions: thread.visuals.size,
        checkpointBytes: Buffer.byteLength(JSON.stringify(checkpoint())), memory: process.memoryUsage() })); return;
    }
    if (req.url !== '/rpc' || req.method !== 'POST') { res.writeHead(404); res.end(); return; }
    let body = ''; for await (const chunk of req) { body += String(chunk); if (Buffer.byteLength(body) > limits.requestBytes) { res.writeHead(413); res.end(); return; } }
    const parsed: unknown = JSON.parse(body);
    if (token === 'Bearer demo-outsider' && !(typeof parsed === 'object' && parsed !== null && 'method' in parsed && ['GetTask', 'ListTasks'].includes(String(parsed.method)))) {
      res.writeHead(403); res.end('Thread access denied'); return;
    }
    if (typeof parsed === 'object' && parsed !== null && 'method' in parsed && parsed.method === 'SendStreamingMessage') {
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ jsonrpc: '2.0', id: 'id' in parsed ? parsed.id : null,
        error: JsonRpcTransportHandler.mapToJSONRPCError(new UnsupportedOperationError('Use SendMessage admission and SubscribeToTask observation')) })); return;
    }
    const result = await rpc.handle(body, context);
    if (!(Symbol.asyncIterator in result)) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(result)); return; }
    if (metrics.activeStreams >= limits.observers) { res.writeHead(429); res.end('Observer capacity'); await result.return(); return; }
    metrics.activeStreams++; metrics.openedStreams++; metrics.maxStreams = Math.max(metrics.maxStreams, metrics.activeStreams);
    let detached = false;
    // Returning a generator suspended in next() settles at the next public status
    // heartbeat (<=200ms). We never stop its bus or access its private queue.
    const close = () => { detached = true; void result.return(); };
    res.once('close', close);
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    try {
      for await (const event of result) {
        if (detached) break;
        const frame = formatSSEEvent(event);
        const bytes = Buffer.byteLength(frame);
        metrics.maxFrameBytes = Math.max(metrics.maxFrameBytes, bytes);
        if (bytes > limits.checkpointBytes || res.writableLength > limits.writerBytes) { metrics.slowDrops++; res.destroy(); break; }
        const ready = res.write(frame);
        metrics.maxWritableBytes = Math.max(metrics.maxWritableBytes, res.writableLength);
        if (!ready) {
          const start = performance.now();
          const drained = await new Promise<boolean>(resolve => {
            const finish = (ok: boolean) => { clearTimeout(timer); res.off('drain', drain); res.off('close', stop); resolve(ok); };
            const drain = () => finish(true), stop = () => finish(false);
            const timer = setTimeout(() => finish(false), limits.drainMs);
            res.once('drain', drain); res.once('close', stop);
          });
          metrics.maxDrainMs = Math.max(metrics.maxDrainMs, performance.now() - start);
          if (!drained) { metrics.slowDrops++; res.destroy(); break; }
        }
      }
    } catch (error) {
      if (!detached && !res.destroyed) res.write(formatSSEEvent({ jsonrpc: '2.0',
        id: typeof parsed === 'object' && parsed !== null && 'id' in parsed ? parsed.id : null,
        error: JsonRpcTransportHandler.mapToJSONRPCError(error) }));
    } finally {
      res.off('close', close); await result.return(); res.end();
      metrics.activeStreams--; metrics.closedStreams++;
    }
  }
  await new Promise<void>(resolve => server.listen(options.port ?? 61001, '127.0.0.1', resolve));
  const address = server.address(); if (typeof address !== 'object' || !address) throw new Error('No listener');
  url = `http://127.0.0.1:${address.port}`; card.supportedInterfaces[0]!.url = `${url}/rpc`;
  observerReady = beginObserver(); await observerReady;
  if (options.bootWorkMs !== undefined) await startWork(options.bootWorkMs);
  const watcher = setInterval(() => { try { thread.reconcile(); } catch { metrics.sourceErrors++; } }, 100);
  return { url, vault: thread.vault, startWork,
    close: async () => {
      closing = true; clearInterval(watcher); if (publishTimer) clearTimeout(publishTimer);
      for (const item of pending.values()) item.abort.abort();
      await Promise.allSettled([...pending.values()].map(item => item.done));
      server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    } };
}

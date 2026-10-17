// Offline lifecycle fixture, not a production LLM or production provider.
import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type Api, type TranscriptContext, type SimpleStreamOptions } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
const text = (content: any) => typeof content === 'string' ? content : (content ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
export default function fixture(pi: ExtensionAPI) {
  let continuation = false;
  pi.on('input', event => { if (event.text === 'EXO_CONTINUE') continuation = true; });
  pi.on('agent_before_settle', () => {
    if (!continuation) return;
    continuation = false;
    return { continue: true, entries: [{ type: 'custom_message', customType: 'exo-spike/continuation', content: 'EXO_SECOND_PASS', display: true }] }; // A real Pi 1.1 boundary continuation.
  });
  pi.registerCommand('exo-noop', { description: 'Offline zero-work settlement proof', handler: async () => {} });
  pi.registerCommand('exo-status', { description: 'Offline command-only feedback proof', handler: async (_args, ctx) => {
    ctx.ui.setStatus('exo-proof', 'EXO_STATUS_VISIBLE');
    ctx.ui.notify('EXO_NOTIFICATION_VISIBLE', 'info');
  } });
  pi.registerProvider('exo-fixture', {
    baseUrl: 'http://offline.invalid', apiKey: 'offline-fixture-not-a-secret', api: 'exo-offline',
    models: [{ id: 'offline', name: 'Exo offline lifecycle fixture', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 8192 }],
    streamSimple: (model: Model<Api>, context: TranscriptContext, options?: SimpleStreamOptions) => {
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [], timestamp: Date.now(), stopReason: 'pending', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      void (async () => {
        try {
          const messages = context.messages;
          const last = messages.findLast(m => m.role !== 'system');
          const request = text(last && 'content' in last ? last.content : '').trim();
          await options?.onPayload?.({ fixture: true, operation: 'offline' }, model);
          await options?.onResponse?.({ status: 200, headers: new Headers() }, model);
          stream.push({ type: 'start', partial: message });
          if (request === 'EXO_BACKGROUND' && last?.role === 'user') {
            const call = { type: 'toolCall' as const, id: randomUUID(), name: 'spawn', arguments: { tasks: [{ task: 'EXO_CHILD_WORK', cwd: process.cwd() }] } };
            message.content.push(call);
            stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
            stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: call, partial: message });
            message.stopReason = 'toolUse'; stream.push({ type: 'done', reason: 'toolUse', message }); stream.end(); return;
          }
          const guidance = /^EXO_TELL ([a-zA-Z0-9-]+) ([\s\S]+)$/.exec(request);
          if (guidance && last?.role === 'user') {
            const call = { type: 'toolCall' as const, id: randomUUID(), name: 'tell', arguments: { id: guidance[1], message: guidance[2] } };
            message.content.push(call);
            stream.push({ type: 'toolcall_start', contentIndex: 0, partial: message });
            stream.push({ type: 'toolcall_end', contentIndex: 0, toolCall: call, partial: message });
            message.stopReason = 'toolUse'; stream.push({ type: 'done', reason: 'toolUse', message }); stream.end(); return;
          }
          let reply = request.includes('EXO_CHILD_WORK') ? 'EXO_CHILD_REPORT: native OptChat child completed.'
            : (request === 'EXO_SECOND_PASS' || request === 'EXO_CONTINUATION_FIRST') ? 'EXO_CONTINUATION_FINAL'
            : request === 'EXO_CONTINUE' ? 'EXO_CONTINUATION_FIRST'
            : last?.role === 'toolResult' ? `EXO_TOOL_ACK: ${request}`
            : /^\[[a-zA-Z0-9-]+\]/.test(request) ? `EXO_MAIN_RECEIVED_REPORT: ${request}`
            : `EXO_REPLY: ${request}`;
          const delay = request.includes('EXO_CHILD_WORK') ? 4000 : request === 'EXO_SLOW' ? 10_000 : 100;
          await sleep(delay, undefined, { signal: options?.signal });
          message.content.push({ type: 'text', text: '' });
          stream.push({ type: 'text_start', contentIndex: 0, partial: message });
          const cut = Math.max(1, Math.floor(reply.length / 2));
          for (const delta of [reply.slice(0, cut), reply.slice(cut)]) {
            (message.content[0] as any).text += delta;
            stream.push({ type: 'text_delta', contentIndex: 0, delta, partial: message });
            await sleep(40, undefined, { signal: options?.signal });
          }
          stream.push({ type: 'text_end', contentIndex: 0, content: reply, partial: message });
          message.stopReason = 'stop'; stream.push({ type: 'done', reason: 'stop', message }); stream.end();
        } catch (error) {
          message.stopReason = options?.signal?.aborted ? 'aborted' : 'error';
          message.errorMessage = error instanceof Error ? error.message : String(error);
          stream.push({ type: 'error', reason: message.stopReason, error: message }); stream.end();
        }
      })();
      return stream;
    },
  });
}

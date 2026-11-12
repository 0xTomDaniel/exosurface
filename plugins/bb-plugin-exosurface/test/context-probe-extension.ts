// Test-only extension. Never part of a production launch. Registers a local
// provider whose stream function records which fixture markers reached the
// exact system prompt a model would receive, then replies without any network
// call or model inference. Records booleans/offsets only, never full prompt text.
import { writeFileSync } from 'node:fs';
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type Api, type TranscriptContext } from '@earendil-works/pi-ai';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

const MARKERS = (process.env["EXO_CONTEXT_PROBE_MARKERS"] ?? '').split(',').filter(Boolean);
const where = (prompt: string) => Object.fromEntries(MARKERS.map(m => [m, prompt.indexOf(m)]));

export default function contextProbe(pi: ExtensionAPI) {
  const out = process.env["EXO_CONTEXT_PROBE_OUT"];
  if (!out) throw Error('EXO_CONTEXT_PROBE_OUT required');
  const record: any = {};
  pi.on('session_start', (_e, ctx) => { record.base = { offsets: where(ctx.getSystemPrompt()), cwd: ctx.cwd, projectTrusted: ctx.isProjectTrusted() }; writeFileSync(out, JSON.stringify(record, null, 2)); });
  pi.registerProvider('exo-context-probe', {
    baseUrl: 'http://context-probe.invalid', apiKey: '$EXO_CONTEXT_PROBE_AUTH', api: 'exo-context-probe',
    models: [{ id: 'probe', name: 'Context probe (not an LLM)', reasoning: false, input: ['text'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1_000_000, maxTokens: 1024 }],
    streamSimple: (model: Model<Api>, context: TranscriptContext) => {
      // Normalized transcripts carry the prompt as leading system message(s).
      const text = (c: any) => typeof c === 'string' ? c : (c ?? []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
      const system = context.messages.filter((m: any) => m.role === 'system');
      const prompt = system.map((m: any) => text(m.content)).join('\n');
      record.request = { offsets: where(prompt), bytes: Buffer.byteLength(prompt), systemMessages: system.length };
      writeFileSync(out, JSON.stringify(record, null, 2));
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: 'CONTEXT_PROBE_OK' }], timestamp: Date.now(), stopReason: 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: 'stop', message }); stream.end(); });
      return stream;
    },
  });
}

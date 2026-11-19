// Test-only extension. Never part of a production launch. Registers a local
// provider whose stream function records which fixture markers reached the
// exact system prompt a model would receive, then replies without any network
// call or model inference. Capture only delivered presentation guidance and public
// page-tool instructions, never the rest of a model request's private context.
import { writeFileSync } from 'node:fs';
import { createAssistantMessageEventStream, type AssistantMessage, type Model, type Api, type SystemMessage, type TranscriptContext } from '@earendil-works/pi-ai';
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
      const start = prompt.indexOf('HOW YOU PRESENT (');
      const headerStart = start < 0 ? -1 : prompt.lastIndexOf('Exosurface:', start);
      const reminder = /<tone_preference>[\s\S]*?<\/tone_preference>/.exec(prompt)?.[0];
      const last = start < 0 ? -1 : prompt.indexOf('CHOOSE THE VISUAL BY THE RELATIONSHIP.', start);
      const end = last < 0 ? -1 : prompt.indexOf('\n\n', last);
      const systemMessages = context.messages.filter((m): m is SystemMessage => m.role === 'system');
      record.request = { offsets: where(prompt), bytes: Buffer.byteLength(prompt), systemMessages: system.length,
        header: headerStart < 0 ? null : prompt.slice(headerStart, start).trim(), reminder,
        presentation: start < 0 || last < 0 ? null : prompt.slice(start, end < 0 ? undefined : end),
        sections: systemMessages.flatMap(m => m.sections ? [Object.fromEntries(Object.entries(m.sections).filter(([key]) => key === 'exosurface' || key === 'exosurface_reminder'))] : []),
        tools: systemMessages.flatMap(m => m.toolsAdded ?? []).filter(t => t.name === 'update_exosurface' || t.name === 'read_exosurface') };
      writeFileSync(out, JSON.stringify(record, null, 2));
      const stream = createAssistantMessageEventStream();
      const message: AssistantMessage = { role: 'assistant', api: model.api, provider: model.provider, model: model.id, content: [{ type: 'text', text: 'CONTEXT_PROBE_OK' }], timestamp: Date.now(), stopReason: 'stop', usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } };
      queueMicrotask(() => { stream.push({ type: 'start', partial: message }); stream.push({ type: 'done', reason: 'stop', message }); stream.end(); });
      return stream;
    },
  });
}

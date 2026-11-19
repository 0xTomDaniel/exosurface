// Fixture-only observer of Pi's supported final provider-request hook. No payload
// replacement, provider shim, headers, user messages or private context retained.
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';

export default function presentationCapture(pi: ExtensionAPI) {
  pi.on('session_start', (_event, ctx) => {
    appendFileSync(join(ctx.cwd, 'presentation-capture-loaded.jsonl'), JSON.stringify({
      at: new Date().toISOString(), extension: import.meta.url, sessionId: ctx.sessionManager.getSessionId(),
    }) + '\n', { mode: 0o600 });
  });
  pi.on('before_provider_request', (event, ctx) => {
    const strings: string[] = [], tools: unknown[] = [];
    const visit = (value: unknown): void => {
      if (typeof value === 'string') { strings.push(value); return; }
      if (Array.isArray(value)) { for (const item of value) visit(item); return; }
      if (!value || typeof value !== 'object') return;
      const object = value as Record<string, unknown>;
      if (object['name'] === 'update_exosurface' || object['name'] === 'read_exosurface') {
        tools.push({ name: object['name'], description: object['description'] });
      }
      for (const item of Object.values(object)) visit(item);
    };
    visit(event.payload);
    const presentation = strings.flatMap(text => {
      const start = text.indexOf('HOW YOU PRESENT (');
      if (start < 0) return [];
      const last = text.indexOf('CHOOSE THE VISUAL BY THE RELATIONSHIP.', start);
      if (last < 0) throw Error('Presentation capture could not locate guide end');
      const end = text.indexOf('\n\n', last), header = text.lastIndexOf('Exosurface:', start);
      return [{ header: header < 0 ? null : text.slice(header, start).trim(),
        guide: text.slice(start, end < 0 ? undefined : end) }];
    });
    const reminders = strings.flatMap(text => text.match(/<tone_preference>[\s\S]*?<\/tone_preference>/g) ?? []);
    appendFileSync(join(ctx.cwd, 'presentation-requests.jsonl'), JSON.stringify({
      at: new Date().toISOString(), provider: ctx.model?.provider, model: ctx.model?.id,
      api: ctx.model ? String(ctx.model.api) : undefined, thinking: ctx.thinkingLevel, sessionId: ctx.sessionManager.getSessionId(),
      presentation, reminders, tools,
    }) + '\n', { mode: 0o600 });
  });
}

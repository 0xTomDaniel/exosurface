// Runtime identity only: the owner reads the profile binding from the info file. No fake provider, model output, or tool results.
import { writeFileSync, renameSync } from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
export default function live(pi: ExtensionAPI) {
  const info = (ctx: ExtensionContext) => {
    const prompt = ctx.getSystemPrompt();
    const data = { mode: ctx.mode, cwd: ctx.cwd, profile: process.env['EXO_BB_PROFILE'], projectTrusted: ctx.isProjectTrusted(),
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, api: ctx.model.api } : null,
      thinking: ctx.thinkingLevel, tools: pi.getActiveTools(),
      skills: pi.getCommands().filter(c => c.source === 'skill').map(c => ({ name: c.name, path: c.sourceInfo?.path })),
      hasVaultInstructions: prompt.includes('Exocortex Agent Instructions'),
      hasDisabledObsidianCliPolicy: prompt.includes('disabled native Obsidian CLI'),
      boundProfile: (() => {
        const entry = ctx.sessionManager.getBranch().slice().reverse().find(e => e.type === 'custom' && e.customType === 'optchat.profile');
        if (entry?.type !== 'custom') return undefined;
        // This extension is copied outside the package: keep its data guard dependency-free.
        const data: unknown = entry.data;
        return data !== null && typeof data === 'object' && 'name' in data && typeof data.name === 'string' ? data.name : undefined;
      })(),
      sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile() };
    const file = process.env['EXO_BB_INFO_FILE'];
    if (file) { const temp = `${file}.${String(process.pid)}.tmp`; writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, file); }
    return data;
  };
  pi.on('session_start', (_e, ctx) => { info(ctx); });
  // A model picked in BB reaches the running Pi as set_model (model-selection.ts): Pi emits model_select, not session_start.
  pi.on('model_select', (_e, ctx) => { info(ctx); });
  pi.registerCommand('exo-info', { description: 'Inspect Exo runtime identity/resources without a model call', handler: async (_args, ctx) => {
    const data = info(ctx);
    ctx.ui.setStatus('exo-runtime', `${data.model?.provider ?? 'undefined'}/${data.model?.id ?? 'undefined'} · ${String(data.skills.length)} skills · exo-optchat`);
    ctx.ui.notify('Exo is connected to your existing exo-optchat profile.', 'info');
  } });
}

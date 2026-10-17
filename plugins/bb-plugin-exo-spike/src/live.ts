// Diagnostics/continuation probe only. No fake provider, model output, or tool results.
import { writeFileSync, renameSync } from 'node:fs';
import type { ExtensionAPI, ExtensionContext } from '@earendil-works/pi-coding-agent';
export default function live(pi: ExtensionAPI) {
  let continuation: string | undefined;
  const canonical = process.env.EXO_BB_RUNTIME_KIND === 'canonical';
  const info = (ctx: ExtensionContext) => {
    const prompt = ctx.getSystemPrompt();
    const data = { mode: ctx.mode, cwd: ctx.cwd, runtimeKind: process.env.EXO_BB_RUNTIME_KIND, profile: process.env.EXO_BB_PROFILE, projectTrusted: ctx.isProjectTrusted(),
      model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id, api: ctx.model.api } : null,
      thinking: ctx.thinkingLevel, tools: pi.getActiveTools(),
      skills: pi.getCommands().filter(c => c.source === 'skill').map(c => ({ name: c.name, path: c.sourceInfo?.path })),
      hasVaultInstructions: prompt.includes('Exocortex Agent Instructions'),
      hasDisabledObsidianCliPolicy: prompt.includes('disabled native Obsidian CLI'),
      fixtureLoaded: pi.getCommands().some(c => c.name === 'exo-status'),
      boundProfile: (ctx.sessionManager.getBranch().slice().reverse().find(e => e.type === 'custom' && e.customType === 'optchat.profile') as any)?.data?.name,
      sessionId: ctx.sessionManager.getSessionId(), sessionFile: ctx.sessionManager.getSessionFile() };
    const file = process.env.EXO_BB_INFO_FILE;
    if (file) { const temp = `${file}.${process.pid}.tmp`; writeFileSync(temp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 }); renameSync(temp, file); }
    return data;
  };
  pi.on('session_start', (_e, ctx) => { info(ctx); });
  pi.registerCommand(canonical ? 'exo-info' : 'exo-live-info', { description: 'Inspect Exo runtime identity/resources without a model call', handler: async (_args, ctx) => {
    const data = info(ctx);
    ctx.ui.setStatus('exo-runtime', `${data.model?.provider}/${data.model?.id} · ${data.skills.length} skills · ${canonical ? 'exo-optchat' : 'isolated live profile'}`);
    ctx.ui.notify(canonical ? 'Exo is connected to your existing exo-optchat profile.' : 'EXO_LIVE_RUNTIME_VISIBLE', 'info');
  } });
  pi.on('input', e => { if (canonical) return; const marker = /^LIVE_CONTINUATION_PROBE ([a-zA-Z0-9_-]+)\b/.exec(e.text); if (marker) continuation = marker[1]; });
  // OptChat rebuilds from observed run messages and drops unobserved boundary
  // drafts. Queue an ordinary supported user message, not an assistant prefill.
  // Pi explicitly drains agent_end-handler queues before agent_settled.
  pi.on('agent_end', () => {
    if (!continuation) return;
    const marker = continuation; continuation = undefined;
    pi.sendUserMessage(`One-time integration continuation request. Reply exactly LIVE_CONTINUATION_FINAL_${marker}. Do not call tools.`, { deliverAs: 'followUp', expandPromptTemplates: false });
  });
}

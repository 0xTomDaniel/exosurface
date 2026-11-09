import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { LAYOUT, MODEL, PANEL_ACTION_ID, PLUGIN_ID, PROVIDER_ID, INPUT_RENDERER_ID, pagesFor, pressText } from './src/fixture.ts';

const page = z.object({ id: z.string(), title: z.string(), body: z.array(z.string()), buttons: z.array(z.object({ id: z.string(), label: z.string() })) });
const threadRow = z.object({ key: z.string(), role: z.string(), threadId: z.string(), title: z.string(), parentThreadId: z.string().nullable(), visibility: z.string().nullable(), status: z.string().nullable() });
export const rpcContract = defineRpcContract({
  setup: { input: z.object({ presetTabs: z.boolean() }), output: z.object({ projectId: z.string(), threads: z.array(threadRow), notes: z.array(z.string()) }) },
  layout: { input: z.null(), output: z.object({ threads: z.array(threadRow) }) },
  pages: { input: z.object({ threadId: z.string() }), output: z.object({ key: z.string().nullable(), pages: z.array(page), presses: z.array(z.string()) }) },
  press: { input: z.object({ threadId: z.string(), pageId: z.string(), buttonId: z.string() }), output: z.object({ dispatched: z.string(), sendResult: z.any() }) },
  ask: { input: z.object({ threadId: z.string() }), output: z.object({ started: z.boolean() }) },
  presetTabs: { input: z.object({ threadId: z.string() }), output: z.object({ before: z.any(), after: z.any() }) },
  open: { input: z.object({ threadId: z.string() }), output: z.any() },
});

type Stored = { projectId: string; ids: Record<string, string> };

export default function plugin(bb: BbPluginApi) {
  const sdk = bb.sdk;
  bb.providers.register({
    id: PROVIDER_ID, displayName: 'Layout fixture', icon: 'Bot', family: 'nls',
    strings: { signInHint: 'Deterministic staging fixture; no sign-in.', expiredHint: 'No credentials used.', installUrl: 'https://github.com/get-bb/bb', brandPrefix: 'Fixture ' },
    maintenance: { health: false, usage: false, installation: false },
    capabilities: { supportsServiceTier: false, supportsNativeUserQuestion: false, fork: 'none', supportsManualCompaction: false, supportsThreadArchive: false, supportsThreadRename: false, permissionModes: ['full'], reasoningLevels: ['low'] },
    composerActions: [], models: { fallback: [MODEL], scope: 'host' }, env: { passthrough: [] },
    completedTurnDisplay: 'flat',
  });

  const presses = new Map<string, string[]>();
  const stored = () => bb.storage.kv.get<Stored>('layout');
  const keyOf = async (threadId: string) => { const s = await stored(); return s ? Object.entries(s.ids).find(([, id]) => id === threadId)?.[0] ?? null : null; };
  const rows = async () => {
    const s = await stored(); if (!s) return [];
    return (await Promise.all(LAYOUT.map(async t => {
      const id = s.ids[t.key]; if (!id) return null; const got: any = (await sdk.threads.get({ threadId: id })) as any; const th = got.thread ?? got;
      return { key: t.key, role: t.role, threadId: id, title: th.title ?? t.title, parentThreadId: th.parentThreadId ?? null, visibility: th.visibility ?? null, status: th.status ?? null };
    }))).filter((row): row is NonNullable<typeof row> => row !== null);
  };
  async function presetTabs(threadId: string) {
    const before: any = await sdk.threads.tabs.get({ threadId });
    const tabs = [...before.tabs.filter((t: any) => !(t.kind === 'plugin-panel' && t.pluginId === PLUGIN_ID)),
      { id: `nls-pages-${threadId}`, kind: 'plugin-panel', pluginId: PLUGIN_ID, actionId: PANEL_ACTION_ID, title: 'Pages', paramsJson: null }];
    const after = await sdk.threads.tabs.update({ threadId, expectedRevision: before.revision, tabs: tabs as any });
    return { before, after };
  }

  bb.rpc.register(rpcContract, {
    setup: async ({ presetTabs: preset }) => {
      const notes: string[] = [];
      const existing = await stored(); if (existing && LAYOUT.every(t => existing.ids[t.key])) return { projectId: existing.projectId, threads: await rows(), notes: ['already set up'] };
      const projects: any = await sdk.projects.list();
      const list = projects.projects ?? projects;
      const project = list.find((p: any) => /personal/i.test(p.name ?? '')) ?? list[0];
      if (!project) throw new Error('No project in staging BB');
      const ids: Record<string, string> = existing?.ids ?? {};
      for (const t of LAYOUT) {
        if (ids[t.key]) continue;
        if (t.parentKey) {
          // BB spawn returns before asynchronous environment provisioning. Child creation needs it.
          let ready = false;
          for (let n = 0; n < 100; n++) {
            const result: any = await sdk.threads.get({ threadId: ids[t.parentKey] });
            if ((result.thread ?? result).environmentId) { ready = true; break; }
            await new Promise(resolve => setTimeout(resolve, 100));
          }
          if (!ready) throw new Error('Parent environment did not become ready; retry setup');
        }
        const base = { projectId: project.id, environment: { type: 'project-default' as const }, providerId: PROVIDER_ID, model: MODEL.id, reasoningLevel: 'low' as const, permissionMode: 'full' as const, title: t.title,
          ...(t.parentKey ? { parentThreadId: ids[t.parentKey] } : {}), ...(t.role === 'home' ? { pinned: true } : {}), ...(t.hidden ? { visibility: 'hidden' as const, lifecycleOwnerThreadId: ids[t.parentKey!] } : {}) };
        let th: any;
        if (t.role === 'surface') {
          // Probe: can a surface thread exist with no first prompt?
          try { th = await sdk.threads.spawn({ ...base, input: [] } as any); notes.push(`${t.key}: spawned with empty input`); }
          catch (e) { notes.push(`${t.key}: empty input rejected (${String(e).slice(0, 160)}); retried with prompt`); th = await sdk.threads.spawn({ ...base, prompt: `Open surface ${t.title}` }); }
        } else th = await sdk.threads.spawn({ ...base, prompt: t.role === 'home' ? 'Hello Home' : 'worker start' });
        ids[t.key] = th.id ?? th.thread?.id;
        await bb.storage.kv.set('layout', { projectId: project.id, ids } satisfies Stored);
      }
      await bb.storage.kv.set('layout', { projectId: project.id, ids } satisfies Stored);
      if (preset) for (const t of LAYOUT.filter(t => !t.hidden)) {
        try { await presetTabs(ids[t.key]); notes.push(`${t.key}: tab preset ok`); } catch (e) { notes.push(`${t.key}: tab preset failed ${String(e).slice(0, 200)}`); }
      }
      return { projectId: project.id, threads: await rows(), notes };
    },
    layout: async () => ({ threads: await rows() }),
    pages: async ({ threadId }) => { const key = await keyOf(threadId); return { key, pages: key ? pagesFor(key) : [], presses: presses.get(threadId) ?? [] }; },
    press: async ({ threadId, pageId, buttonId }) => {
      const key = await keyOf(threadId); const btn = key ? pagesFor(key).find(p => p.id === pageId)?.buttons.find(b => b.id === buttonId) : undefined;
      if (!btn) throw new Error('Unknown page button');
      const text = pressText(pageId, buttonId, btn.label);
      presses.set(threadId, [...(presses.get(threadId) ?? []), text]);
      const sendResult = await sdk.threads.send({ threadId, input: [{ type: 'text', text, mentions: [] }], mode: 'auto' } as any);
      return { dispatched: text, sendResult };
    },
    ask: async ({ threadId }) => {
      // Fire and forget: the pending form is what should light BB's "needs input" status.
      void bb.ui.requestInput({ threadId, rendererId: INPUT_RENDERER_ID, title: 'Fixture question', payload: { question: 'Keep this page?' }, timeoutMs: 10 * 60_000 })
        .then(r => sdk.threads.send({ threadId, input: [{ type: 'text', text: `[form answer] ${JSON.stringify(r)}`, mentions: [] }], mode: 'auto' } as any)).catch(() => {});
      return { started: true };
    },
    presetTabs: ({ threadId }) => presetTabs(threadId),
    open: ({ threadId }) => sdk.threads.open({ threadId, file: null }),
  });
}

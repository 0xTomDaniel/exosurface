import { useCallback, useEffect, useRef, useState } from 'react';
import { definePluginApp, ThreadChat, useBbNavigate, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
import { PANEL_ACTION_ID, INPUT_RENDERER_ID } from './src/fixture.ts';

type Pages = { key: string | null; pages: { id: string; title: string; body: string[]; buttons: { id: string; label: string }[] }[]; presses: string[] };
type Row = { key: string; role: string; threadId: string; title: string; parentThreadId: string | null; visibility: string | null; status: string | null };
const btn = 'rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 disabled:opacity-50';

// Reports its own rendered width so the browser proof can read it from the DOM.
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null); const [w, setW] = useState(0);
  useEffect(() => { if (!ref.current) return; const ro = new ResizeObserver(e => setW(Math.round(e[0].contentRect.width))); ro.observe(ref.current); return () => ro.disconnect(); }, []);
  return [ref, w] as const;
}

function PagesView({ threadId, mode }: { threadId: string; mode: 'native-panel' | 'page-first' }) {
  const rpc = useRpc<typeof rpcContract>(); const nav = useBbNavigate();
  const [data, setData] = useState<Pages | null>(null); const [layout, setLayout] = useState<Row[]>([]);
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  const [ref, width] = useWidth<HTMLDivElement>();
  const refresh = useCallback(async () => {
    try { setData(await rpc.call('pages', { threadId })); setLayout((await rpc.call('layout', null)).threads); setError(''); } catch (e) { setError(String(e)); }
  }, [rpc, threadId]);
  useEffect(() => { void refresh(); const t = setInterval(refresh, 3000); return () => clearInterval(t); }, [refresh]);
  const run = async (f: () => Promise<unknown>) => { setPending(true); try { await f(); await refresh(); } catch (e) { setError(String(e)); } finally { setPending(false); } };
  const surfaces = layout.filter(r => r.visibility !== 'hidden');
  return <div ref={ref} data-nls-mode={mode} data-nls-width={width} data-nls-thread={threadId} className="h-full min-h-0 overflow-y-auto p-4" aria-label={`Exosurface pages (${mode})`}>
    <p className="text-xs text-muted-foreground">Spike · {mode} · width {width}px · thread {data?.key ?? '…'}</p>
    <nav aria-label="Surfaces" className="mt-2 flex flex-wrap gap-2">
      {surfaces.map(r => <button key={r.threadId} className={btn} aria-current={r.threadId === threadId ? 'page' : undefined} onClick={() => nav.toThread(r.threadId)}>{r.title}</button>)}
    </nav>
    {data?.pages.map(p => <section key={p.id} className="mt-4 rounded-lg border border-border p-3" aria-label={`Page ${p.title}`}>
      <h2 className="text-base font-semibold">{p.title}</h2>
      <ul className="mt-2 list-disc pl-5 text-sm">{p.body.map(b => <li key={b}>{b}</li>)}</ul>
      <div className="mt-3 flex flex-wrap gap-2">{p.buttons.map(b => <button key={b.id} className={btn} disabled={pending}
        onClick={() => run(() => b.id === 'ask' ? rpc.call('ask', { threadId }) : rpc.call('press', { threadId, pageId: p.id, buttonId: b.id }))}>{b.label}</button>)}</div>
    </section>)}
    {data && !data.pages.length && <p className="mt-4 text-sm">No pages for this thread.</p>}
    {!!data?.presses.length && <p className="mt-4 text-xs text-muted-foreground" aria-label="Press log">Pressed: {data.presses.join(' · ')}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </div>;
}

// Option B (current Exosurface shape): one nav row, pages ~65% + embedded native chat ~35%.
function PageFirst() {
  const rpc = useRpc<typeof rpcContract>(); const [home, setHome] = useState<string | null>(null); const [error, setError] = useState('');
  useEffect(() => { rpc.call('layout', null).then(l => setHome(l.threads.find(t => t.role === 'home')?.threadId ?? null), e => setError(String(e))); }, [rpc]);
  if (!home) return <div className="p-6 text-sm">{error || 'Run setup first (bb plugin rpc call native-layout-spike setup).'}</div>;
  return <div className="flex h-full min-h-0">
    <div className="min-w-0 basis-[65%] border-r border-border"><PagesView threadId={home} mode="page-first" /></div>
    <section className="min-w-0 basis-[35%]" aria-label="Embedded native chat"><ThreadChat threadId={home} variant="compact" /></section>
  </div>;
}

function Confirm({ interaction, submit }: { interaction: { title: string; payload: any }; submit(v: any): Promise<void> }) {
  return <div className="flex items-center gap-2 p-2 text-sm"><span>{interaction.payload?.question ?? interaction.title}</span>
    <button className={btn} onClick={() => submit({ keep: true })}>Keep</button><button className={btn} onClick={() => submit({ keep: false })}>Drop</button></div>;
}

export default definePluginApp(app => {
  // Option A: native BB thread is the main view (chat + composer); pages live in a flush side-panel tab.
  app.slots.threadPanelAction({ id: PANEL_ACTION_ID, title: 'Pages', icon: 'PanelsTopLeft', layout: 'flush', component: ({ threadId }) => <PagesView threadId={threadId} mode="native-panel" /> });
  app.slots.navPanel({ id: 'page-first', path: 'page-first', title: 'Exosurface (page-first)', icon: 'PanelsTopLeft', component: PageFirst });
  app.slots.pendingInteraction({ id: INPUT_RENDERER_ID, component: Confirm as any });
});

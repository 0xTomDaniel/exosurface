// Page-first shell reused from the spike's public navPanel + ThreadChat pattern. Native tabs remain optional.
import { useEffect, useState } from 'react';
import { definePluginApp, ThreadChat, useRpc } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
function Home() {
  const rpc = useRpc<typeof rpcContract>();
  const [data, setData] = useState<{ threadId: string | null; page: { title: string; body: string } | null; problems: string[] } | null>(null);
  const [projectId, setProjectId] = useState(''), [error, setError] = useState('');
  useEffect(() => { let cancelled = false; const refresh = async () => { try { const value = await rpc.call('overview', null); if (!cancelled) setData(value); } catch (e) { if (!cancelled) setError(String(e)); } }; void refresh(); const timer = setInterval(refresh, 2000); return () => { cancelled = true; clearInterval(timer); }; }, [rpc]);
  return <div className="flex h-full min-h-0">
    <main className="min-w-0 flex-1 overflow-auto p-6" aria-label="Exosurface page">
      <h1 className="text-xl font-semibold">{data?.page?.title ?? 'Exo'}</h1>
      <p className="whitespace-pre-wrap">{data?.page?.body ?? 'Your latest response appears here. Full snapshot rendering is a release gate, not implemented in this slice.'}</p>
      {data?.problems.map(p => <p key={p} role="alert">{p}</p>)}
      {data && !data.threadId && !data.problems.length && <form onSubmit={e => { e.preventDefault(); void rpc.call('setup', { projectId }).then(() => rpc.call('overview', null)).then(setData).catch(e => setError(String(e))); }}><label>BB project ID<input value={projectId} onChange={e => setProjectId(e.target.value)} /></label><button type="submit" disabled={!projectId}>Initialize Exo</button></form>}
      {error && <p role="alert">{error}</p>}
    </main>
    {data?.threadId && <aside className="w-[38%] min-w-[300px] border-l border-border" aria-label="Exo activity"><ThreadChat threadId={data.threadId} variant="compact" /></aside>}
  </div>;
}
export default definePluginApp(app => app.slots.navPanel({ id: 'home', path: 'home', title: 'Exosurface', icon: 'Bot', component: Home }));

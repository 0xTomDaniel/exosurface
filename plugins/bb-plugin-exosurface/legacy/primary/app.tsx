import { useCallback, useEffect, useRef, useState } from 'react';
import { definePluginApp, ThreadChat, useRpc, useSdk, UrlLink } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
function CanonicalSetupPanel({ onThread }: { onThread(id: string): void }) {
  const rpc = useRpc<typeof rpcContract>();
  const [status, setStatus] = useState<Awaited<ReturnType<typeof load>> | null>(null);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectId, setProject] = useState(''); const [vault, setVault] = useState('');
  const [piCli, setPi] = useState(''); const [optchat, setOptchat] = useState('');
  const [authorized, setAuthorized] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState('');
  const operation = useRef<string>(crypto.randomUUID());
  async function load() { return rpc.call('canonical_setup_status', null); }
  const refresh = async () => { const value = await load(); setStatus(value); if (value.operationId) operation.current = value.operationId; setVault(value.defaults.vault); setPi(value.defaults.piCli); setOptchat(value.defaults.optchat); return value; };
  useEffect(() => { let alive = true; void Promise.all([load(), rpc.call('canonical_setup_projects', null)]).then(([value, list]) => { if (!alive) return; setStatus(value); setProjects(list); setProject(value.projectId ?? list[0]?.id ?? ''); setVault(value.defaults.vault); setPi(value.defaults.piCli); setOptchat(value.defaults.optchat); if (value.operationId) operation.current = value.operationId; }, e => { if (alive) setError(String(e)); }); return () => { alive = false; }; }, [rpc]);
  const begin = async () => { setBusy(true); setError(''); try { const result = await rpc.call('canonical_setup', { operationId: operation.current, projectId, vault, piCli, optchat, authorizeInitialization: true, recoverDeadLock: Boolean(status?.operationId) }); onThread(result.threadId); await refresh(); } catch (e) { setError(String(e)); await refresh().catch(() => {}); } finally { setBusy(false); } };
  const field = 'mt-1 w-full rounded-md border border-border bg-background p-2';
  return <fieldset disabled={busy} className="mt-5 space-y-3 rounded-md border border-border p-3" aria-label="Canonical first-run setup">
    <legend className="text-sm font-semibold">Initialize a fresh Exo owner</legend>
    <p className="text-xs text-muted-foreground">Creates a generic isolated OptChat profile and a labelled initialization user record, without inference. Existing personal state is never imported. Real native dispatch remains separately gated; releaseReady: false.</p>
    <label className="block text-sm">Project<select className={field} disabled={!!status?.operationId} value={projectId} onChange={e => setProject(e.target.value)}>{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label>
    <label className="block text-sm">Workspace path<input className={field} disabled={!!status?.operationId} value={vault} onChange={e => setVault(e.target.value)} /></label>
    <label className="block text-sm">Installed Pi bundled CLI path<input className={field} disabled={!!status?.operationId} value={piCli} onChange={e => setPi(e.target.value)} /></label>
    <label className="block text-sm">OptChat source path<input className={field} disabled={!!status?.operationId} value={optchat} onChange={e => setOptchat(e.target.value)} /></label>
    <label className="block text-sm"><input type="checkbox" checked={authorized} onChange={e => setAuthorized(e.target.checked)} /> Authorize the labelled user initialization record in this disposable setup.</label>
    <p className="text-xs">Stage: {status?.stage ?? 'loading'}{status && !status.nativeDispatchAllowed ? ' — native dispatch gated; no setup changes made' : ''}</p>
    <button type="button" className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !authorized || !projectId || !vault || !piCli || !optchat || !status?.nativeDispatchAllowed} onClick={() => void begin()}>{busy ? 'Initializing…' : status?.operationId ? 'Resume this setup operation' : 'Initialize Exo'}</button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </fieldset>;
}
// Design: reuse BB's live palette/type; ownership/workers in the center, native chat
// on the right. No marketing chrome, bespoke composer, fonts, or animation.
function ProofPage({ subPath }: { subPath: string }) {
  const rpc = useRpc<typeof rpcContract>(); const sdk = useSdk();
  const [overview, setOverview] = useState<Awaited<ReturnType<typeof getOverview>> | null>(null);
  const [selected, setSelected] = useState(subPath.replace(/^\/+/, '').split('/')[0] || '');
  const [error, setError] = useState(''); const [pending, setPending] = useState(false);
  async function getOverview() { return rpc.call('overview', null); }
  const inFlight = useRef<Promise<void> | null>(null);
  const refresh = useCallback(() => {
    if (inFlight.current) return inFlight.current;
    inFlight.current = rpc.call('overview', null).then(v => { setOverview(v); setError(''); }, e => { setError(String(e)); throw e; }).finally(() => { inFlight.current = null; });
    return inFlight.current;
  }, [rpc]);
  useEffect(() => {
    let cancelled = false; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => { let delay = document.hidden ? 15000 : 2500; try { await refresh(); } catch { delay = 10000; } if (!cancelled) timer = setTimeout(poll, delay); };
    void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [refresh]);
  const thread = overview?.threads.find(t => t.id === selected) ?? overview?.threads.find(t => t.runtimeKind === 'canonical') ?? overview?.threads.find(t => !t.childId);
  const run = async (action: () => Promise<unknown>) => { setPending(true); setError(''); try { await action(); await refresh(); } catch (e) { setError(String(e)); } finally { setPending(false); } };
  const send = (prompt: string) => thread && run(() => sdk.threads.send({ threadId: thread.id, input: [{ type: 'text', text: prompt, mentions: [] }], mode: 'auto' }));
  const button = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 disabled:opacity-50';
  return <div className="flex h-full min-h-0 flex-col md:flex-row">
    <section className="max-h-[45%] w-full shrink-0 overflow-y-auto border-b border-border p-5 md:max-h-none md:w-[40%] md:border-b-0 md:border-r" aria-label="Exo proof controls">
      <h1 className="text-xl font-semibold">{thread?.runtimeKind === 'canonical' ? 'Exo' : thread?.runtimeKind === 'live' ? 'Exo live trial' : 'Exo integration proof'}</h1>
      <p className="mt-2 max-w-prose text-sm text-muted-foreground">{thread?.runtimeKind === 'canonical' ? 'Your existing exo-optchat profile and history, with normal Exocortex instructions and skills. One owner; native workers report to main. Historical Pi/OptChat transcripts are not imported into this BB timeline.' : thread?.runtimeKind === 'live' ? 'Real Opus 5.5, normal Exocortex resources, isolated OptChat history. Not your existing exo-optchat profile. Linked child projections disabled.' : 'Offline test model. Real BB chat, Pi RPC and OptChat ownership. Not your personal history.'}</p>
      {overview && !overview.threads.some(t => t.runtimeKind === 'canonical') && <CanonicalSetupPanel onThread={setSelected} />}
      <label className="mt-5 block text-sm">Conversation
        <select aria-label="Proof conversation" className="mt-2 w-full rounded-md border border-border bg-background p-2" value={thread?.id ?? ''} onChange={e => setSelected(e.target.value)}>
          {overview?.threads.map(t => <option key={t.id} value={t.id}>{t.title || t.id} ({t.status})</option>)}
        </select>
      </label>
      {thread ? <>
        <p className="mt-3 break-all text-xs text-muted-foreground">Owner profile: {thread.profile || 'Starting'}<br />{thread.id}</p>
        <UrlLink className="mt-2 block text-sm underline" href={`/plugins/exosurface/proof/${thread.id}`}>Open this same conversation in another view</UrlLink>
        {!thread.childId ? <div className="mt-5 flex flex-wrap gap-2">
          <button className={button} disabled={pending} onClick={() => send(thread.runtimeKind === 'canonical' ? '/exo-info' : thread.runtimeKind === 'live' ? '/exo-live-info' : '/exo-status')}>{thread.runtimeKind === 'canonical' ? 'Runtime info' : 'Command feedback'}</button>
          {thread.runtimeKind !== 'canonical' && <><button className={button} disabled={pending} onClick={() => send(thread.runtimeKind === 'live' ? `LIVE_CONTINUATION_PROBE ui_${Date.now()} Reply briefly with LIVE_CONTINUATION_FIRST. Do not use tools.` : 'EXO_CONTINUE')}>Continuation</button>
          <button className={button} disabled={pending} onClick={() => send(thread.runtimeKind === 'live' ? 'Spawn exactly one native OptChat child. Its task: use read to inspect .agents/skills/nitride/SKILL.md in this vault and report the skill name with LIVE_CHILD_REPORT. No writes or external actions. Return promptly; do not wait or poll for it. This is an integration test, not a new real-life commitment.' : 'EXO_BACKGROUND')}>Native child</button>
          {thread.runtimeKind === 'offline' && <button className={button} disabled={pending} onClick={() => send('EXO_SLOW')}>Interruptible turn</button>}</>}
        </div> : <p className="mt-5 text-sm">This is a read-only projection of an existing OptChat child. Closing this view does not stop the child. Guidance goes through its main owner; direct child chat is not proven.</p>}
        <aside aria-label="Pi feedback" aria-live="polite" className="mt-5 space-y-2 text-sm">
          {Object.entries(thread.feedback.statuses).map(([key, value]) => <p key={key}>{value}</p>)}
          {thread.feedback.notifications.slice(-3).map(n => <p key={n.id} className={n.type === 'error' ? 'text-destructive' : 'text-muted-foreground'}>{n.text}</p>)}
        </aside>
        <h2 className="mt-6 text-base font-semibold">Native workers</h2>
        {thread.runtimeKind === 'canonical' && <p className="mt-2 text-sm text-muted-foreground">Pi's independent owner keeps working when BB disconnects. Recent workers are shown here; OptChat retains their history.</p>}
        {thread.children.length ? <ul className="mt-3 space-y-4">{thread.children.map(c => <li key={c.id} className="border-l-2 border-border pl-3 text-sm">
          <p>{c.id}: {c.state}</p><p className="mt-1 whitespace-pre-wrap text-muted-foreground">{c.report || 'Work is running under the main OptChat owner.'}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {thread.runtimeKind === 'offline' && <button className={button} disabled={pending} onClick={() => run(async () => { const child = await rpc.call('attach_child', { threadId: thread.id, childId: c.id }); setSelected(child.threadId); })}>View linked child thread</button>}
            {thread.runtimeKind !== 'canonical' && <button className={button} disabled={pending} onClick={() => send(thread.runtimeKind === 'live' ? `Use native tell to resume your child ${c.id}; ask it to reply LIVE_GUIDANCE_REPORT and retain its earlier conversation. No writes or external actions. Return without polling.` : `EXO_TELL ${c.id} CHILD_GUIDANCE_PROOF`)}>Send manager guidance</button>}
            {thread.runtimeKind === 'canonical' && <p className="text-muted-foreground">Ask main to use native tell with this worker ID to guide or resume it. Linked child views are not enabled.</p>}
          </div>
        </li>)}</ul> : <p className="mt-2 text-sm text-muted-foreground">No workers in this conversation.</p>}
        {!thread.childId && <details className="mt-6 text-sm"><summary>Discovered Pi commands</summary><p className="mt-2 break-words">{thread.commands.map(c => `/${c}`).join(', ')}</p><p className="mt-2 text-muted-foreground">Discovery is shown here. Native BB slash autocomplete and TUI-only commands are not implemented.</p></details>}
      </> : <p className="mt-6 text-sm">{overview === null ? 'Loading proof conversations…' : 'Create an Exo Spike (offline) thread to begin.'}</p>}
      {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
    </section>
    <section className="min-h-[300px] min-w-0 flex-1 md:min-h-0" aria-label="Native BB conversation">
      {thread && <ThreadChat key={thread.id} threadId={thread.id} variant={thread.childId ? 'timeline' : 'compact'} />}
    </section>
  </div>;
}
export default definePluginApp(app => { app.slots.navPanel({ id: 'proof', path: 'proof', title: 'Exo', icon: 'Bot', component: ProofPage }); });

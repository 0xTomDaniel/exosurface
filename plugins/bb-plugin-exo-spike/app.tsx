import { useCallback, useEffect, useRef, useState } from 'react';
import { definePluginApp, ThreadChat, useRpc, useSdk, UrlLink } from '@get-bb/plugin-sdk/app';
import type { rpcContract } from './server';
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
      <label className="mt-5 block text-sm">Conversation
        <select aria-label="Proof conversation" className="mt-2 w-full rounded-md border border-border bg-background p-2" value={thread?.id ?? ''} onChange={e => setSelected(e.target.value)}>
          {overview?.threads.map(t => <option key={t.id} value={t.id}>{t.title || t.id} ({t.status})</option>)}
        </select>
      </label>
      {thread ? <>
        <p className="mt-3 break-all text-xs text-muted-foreground">Owner profile: {thread.profile || 'Starting'}<br />{thread.id}</p>
        <UrlLink className="mt-2 block text-sm underline" href={`/plugins/exo-spike/proof/${thread.id}`}>Open this same conversation in another view</UrlLink>
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

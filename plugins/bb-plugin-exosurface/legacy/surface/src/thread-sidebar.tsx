// The sidebar of Exo's surfaces (#68; spec pages-and-activity N1, S7). In the spec a surface is one Exo thread (in this code
// "surface" is a canvas component group, hence "thread" here). Lists surfaces only, never pages: Home (the primary thread)
// always first, then every other surface, flat. New surface is the one button that starts new work.
import {useCallback,useEffect,useState} from 'react';
import {useRpc,useRealtime} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
type Row={threadId:string;title:string;home:boolean};
/** `inView` is the thread in view; null is Home. */
export function ThreadSidebar({inView,onView}:{inView:string|null;onView:(threadId:string|null)=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const[threads,setThreads]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(()=>rpc.call('thread_list',null).then(v=>{setThreads(v.threads);setError('');},e=>setError(String(e))),[rpc]);
 useEffect(()=>{void refresh();},[refresh]);
 // A surface named after its first turn (#82, spec N7): the server signals it; the list is read again.
 useRealtime('surface-names',()=>{void refresh();});
 const create=async()=>{setBusy(true);setError('');try{const made=await rpc.call('thread_new',null);onView(made.threadId);await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}};
 const current=(t:Row)=>t.home?inView===null:inView===t.threadId;
 return <nav aria-label="Surfaces" className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border p-3 text-sm">
  <button type="button" className="rounded-md border border-border px-3 py-2 text-left hover:bg-muted disabled:opacity-50" disabled={busy} onClick={()=>void create()}>New surface</button>
  <ul className="space-y-1">{threads.map(t=><li key={t.threadId}>
   <button type="button" aria-current={current(t)?'page':undefined} onClick={()=>onView(t.home?null:t.threadId)} className={`w-full truncate rounded-md px-3 py-1.5 text-left hover:bg-muted${current(t)?' bg-muted font-medium':''}`}>{t.title}</button>
  </li>)}</ul>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
 </nav>;
}

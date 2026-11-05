// The sidebar of Exo's surfaces (#68; spec pages-and-activity N1, S7). In the spec a surface is one Exo thread (in this code
// "surface" is a canvas component group, hence "thread" here). Lists surfaces only, never pages: Home (the primary thread)
// always first, then every other surface, flat. New surface is the one button that starts new work.
// Rename (#83, spec N5, N7): every surface but Home has a Rename action (or a double-click on its row) that turns the row
// into a text field; Enter saves through thread_rename, Escape or leaving the field cancels.
import {useCallback,useEffect,useRef,useState} from 'react';
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
 const[editing,setEditing]=useState<string|null>(null),[draft,setDraft]=useState(''),saving=useRef(false);
 const edit=(t:Row)=>{if(t.home)return;setEditing(t.threadId);setDraft(t.title);setError('');};
 const save=async(threadId:string)=>{if(saving.current)return;saving.current=true;setError('');try{await rpc.call('thread_rename',{threadId,name:draft});setEditing(null);await refresh();}catch(e){setError(String(e));}finally{saving.current=false;}};
 return <nav aria-label="Surfaces" className="flex w-56 shrink-0 flex-col gap-3 overflow-y-auto border-r border-border p-3 text-sm">
  <button type="button" className="rounded-md border border-border px-3 py-2 text-left hover:bg-muted disabled:opacity-50" disabled={busy} onClick={()=>void create()}>New surface</button>
  <ul className="space-y-1">{threads.map(t=><li key={t.threadId} className="group flex items-center gap-1">
   {editing===t.threadId?<input type="text" aria-label="Surface name" autoFocus value={draft} maxLength={80} onChange={e=>setDraft(e.target.value)}
     onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();void save(t.threadId);}else if(e.key==='Escape'){e.preventDefault();setEditing(null);setError('');}}}
     onBlur={()=>{if(!saving.current)setEditing(null);}} className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-1.5"/>:<>
   <button type="button" aria-current={current(t)?'page':undefined} onClick={()=>onView(t.home?null:t.threadId)} onDoubleClick={()=>edit(t)} className={`w-full min-w-0 truncate rounded-md px-3 py-1.5 text-left hover:bg-muted${current(t)?' bg-muted font-medium':''}`}>{t.title}</button>
   {!t.home&&<button type="button" aria-label={`Rename ${t.title}`} title="Rename" onClick={()=>edit(t)} className="shrink-0 rounded-md p-1.5 text-muted-foreground opacity-0 hover:bg-muted focus:opacity-100 group-hover:opacity-100"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg></button>}</>}
  </li>)}</ul>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
 </nav>;
}

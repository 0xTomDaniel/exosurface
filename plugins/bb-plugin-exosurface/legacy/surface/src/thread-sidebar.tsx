// The sidebar of Exo's surfaces (#68; spec pages-and-activity N1, S7). In the spec a surface is one Exo thread (in this code
// "surface" is a canvas component group, hence "thread" here). Lists surfaces only, never pages: Home (the primary thread)
// always first, then every other surface, flat, most recently active first (N9, #186: the server's thread_list order). New
// surface is the one button that starts new work.
// Pinned (N8, T3, #186): New surface at the top, above Home, and the Settings gear at the bottom stay in view; only the
// list between them scrolls. The layout that holds them there is inline style, not host classes: it is what keeps them in view.
// Rename (#83, spec N5, N7): every surface but Home has a Rename action (or a double-click on its row) that turns the row
// into a text field; Enter saves through thread_rename, Escape or leaving the field cancels (surface-rename.tsx, shared with
// the title at the top).
import {useCallback,useEffect,useState} from 'react';
import {useRpc,useRealtime} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
import {useRename,RenameField,RenameButton} from './surface-rename';
type Row={threadId:string;title:string;home:boolean};
// Settings (#129, spec T3): one button below the tree, not a surface; while settings are open no surface is marked in view.
/** `inView` is the thread in view; null is Home. */
export function ThreadSidebar({inView,onView,settings,onSettings}:{inView:string|null;onView:(threadId:string|null)=>void;settings:boolean;onSettings:()=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const[threads,setThreads]=useState<Row[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const refresh=useCallback(()=>rpc.call('thread_list',null).then(v=>{setThreads(v.threads);setError('');},e=>setError(String(e))),[rpc]);
 useEffect(()=>{void refresh();},[refresh]);
 // A surface named from its first message (#82, spec N7) or renamed: the server signals it; the list is read again.
 useRealtime('surface-names',()=>{void refresh();});
 // A turn Exo finished moves its surface up (N9): the server signals it; the list is read again.
 useRealtime('surface-activity',()=>{void refresh();});
 const create=async()=>{setBusy(true);setError('');try{const made=await rpc.call('thread_new',null);onView(made.threadId);await refresh();}catch(e){setError(String(e));}finally{setBusy(false);}};
 const current=(t:Row)=>!settings&&(t.home?inView===null:inView===t.threadId);
 const rename=useRename(()=>refresh());
 const edit=(t:Row)=>{if(t.home)return;rename.start(t.threadId,t.title);setError('');};
 return <nav aria-label="Surfaces" className="flex w-56 shrink-0 flex-col gap-3 border-r border-border p-3 text-sm" style={{display:'flex',flexDirection:'column',minHeight:0}}>
  <button type="button" className="rounded-md border border-border px-3 py-2 text-left hover:bg-muted disabled:opacity-50" disabled={busy} onClick={()=>void create()}>New surface</button>
  <ul className="space-y-1" style={{flexGrow:1,flexShrink:1,flexBasis:0,minHeight:0,overflowY:'auto'}}>{threads.map(t=><li key={t.threadId} className="exo-renamable flex items-center gap-1">
   {rename.editing===t.threadId?<RenameField rename={rename} className="w-full min-w-0 rounded-md border border-border bg-background px-3 py-1.5"/>:<>
   <button type="button" aria-current={current(t)?'page':undefined} onClick={()=>onView(t.home?null:t.threadId)} onDoubleClick={()=>edit(t)} className={`w-full min-w-0 truncate rounded-md px-3 py-1.5 text-left hover:bg-muted${current(t)?' bg-muted font-medium':''}`}>{t.title}</button>
   {!t.home&&<RenameButton title={t.title} onClick={()=>edit(t)}/>}</>}
  </li>)}</ul>
  <button type="button" aria-label="Settings" title="Settings" aria-current={settings?'page':undefined} onClick={onSettings} className={`self-start rounded-md border border-border px-2 py-1 text-base leading-none hover:bg-muted${settings?' bg-muted':''}`}>{'\u2699'}</button>
  {(rename.error||error)&&<p role="alert" className="text-destructive">{rename.error||error}</p>}
 </nav>;
}

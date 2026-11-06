// The surface's title (#79; spec pages-and-activity S12): the top of the surface in view shows its own stored name (the
// thread's title, as thread_list reads it; Home is "Home"), never the product's name. The one place the title shows.
// A surface named from its first message (#82) or renamed by the person (#83, spec N7): the server's surface-names signal
// carries the new name, so the title follows as the sidebar does.
// Rename from the title (owner walkthrough of PR #91; story "I can rename it any time"): any surface but Home, by a
// double-click on the title or its pencil, through the sidebar's own rename (surface-rename.tsx).
import {useEffect,useState} from 'react';
import {useRpc,useRealtime} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
import {useRename,RenameField,RenameButton} from './surface-rename';
/** `threadId` is the thread in view; undefined is Home. */
export function SurfaceTitle({threadId}:{threadId?:string}){
 const rpc=useRpc<typeof rpcContract>();
 const[name,setName]=useState('');
 useEffect(()=>{let alive=true;rpc.call('thread_list',null).then(v=>{const row=v.threads.find(t=>threadId?t.threadId===threadId:t.home);if(alive&&row)setName(row.title);},()=>{});return()=>{alive=false;};},[threadId,rpc]);
 useRealtime('surface-names',v=>{const named=v as {threadId?:string;title?:string}|null;if(threadId&&named?.threadId===threadId&&typeof named.title==='string')setName(named.title);});
 const rename=useRename((id,title)=>{if(id===threadId)setName(title);});
 if(!threadId)return <h1>{name}</h1>;
 return <div className="exo-renamable flex min-w-0 items-center gap-1">
  {rename.editing===threadId?<RenameField rename={rename} className="min-w-0 rounded-md border border-border bg-background px-2 py-0.5"/>:<>
   <h1 onDoubleClick={()=>rename.start(threadId,name)}>{name}</h1>
   <RenameButton title={name} onClick={()=>rename.start(threadId,name)}/></>}
  {rename.error&&<span role="alert" className="text-sm text-destructive">{rename.error}</span>}
 </div>;
}

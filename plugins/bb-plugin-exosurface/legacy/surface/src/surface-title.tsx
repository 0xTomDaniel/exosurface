// The surface's title (#79; spec pages-and-activity S12): the top of the surface in view shows its own stored name (the
// thread's title, as thread_list reads it; Home is "Home"), never the product's name. The one place the title shows.
// A surface named after its first turn (#82) or renamed by the person (#83, spec N7): the server's surface-names signal
// carries the new name, so the title follows as the sidebar does.
import {useEffect,useState} from 'react';
import {useRpc,useRealtime} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
/** `threadId` is the thread in view; undefined is Home. */
export function SurfaceTitle({threadId}:{threadId?:string}){
 const rpc=useRpc<typeof rpcContract>();
 const[name,setName]=useState('');
 useEffect(()=>{let alive=true;rpc.call('thread_list',null).then(v=>{const row=v.threads.find(t=>threadId?t.threadId===threadId:t.home);if(alive&&row)setName(row.title);},()=>{});return()=>{alive=false;};},[threadId,rpc]);
 useRealtime('surface-names',v=>{const named=v as {threadId?:string;title?:string}|null;if(threadId&&named?.threadId===threadId&&typeof named.title==='string')setName(named.title);});
 return <h1>{name}</h1>;
}

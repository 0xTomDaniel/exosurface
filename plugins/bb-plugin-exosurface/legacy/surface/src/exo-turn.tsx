// The surface view's Exo block and input (#69, #79; spec pages-and-activity S1, S2, E1-E4, E7, E8), for whichever thread is
// in view. The block opens the page: the person's latest message as a bubble, then only Exo's words from that turn as plain
// text, or that Exo is working; the person never writes in it.
// The input sends a turn on the thread and is empty again once BB accepts it. There is no transcript: earlier turns
// stay in the thread.
// It floats over the bottom of the surface in the page's column (#80, S11): the page scrolls beneath it, and the content
// under it fades out from its middle down.
import {useCallback,useEffect,useState,type FormEvent,type KeyboardEvent} from 'react';
import {Markdown,useRpc} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';

type Block={working:boolean;said:string;words:string};
// A send from the input refreshes the block of that thread at once (both are mounted in the same surface view).
const sent=new Set<(threadId:string,text:string)=>void>();
/** Calls `listener` on each send BB accepted from the input (not on a page press, a poll or a turn ending); returns the unsubscribe. */
export function onSend(listener:(threadId:string,text:string)=>void){sent.add(listener);return()=>{sent.delete(listener);};}

export function ExoBlock({threadId}:{threadId:string|null}){
 const rpc=useRpc<typeof rpcContract>();
 const[block,setBlock]=useState<Block|null>(null),[error,setError]=useState('');
 useEffect(()=>{
  setBlock(null);setError('');if(!threadId)return;
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,working=false;
  const read=async()=>{clearTimeout(timer);try{const b=await rpc.call('exo_block',{threadId});if(stopped)return;working=b.working;setBlock(b);setError('');}catch(e){if(!stopped)setError(String(e));}
   finally{if(!stopped)timer=setTimeout(read,working?1000:4000);}};
  const onSent=(id:string,text:string)=>{if(id===threadId){working=true;setBlock({working:true,said:text,words:''});void read();}};
  sent.add(onSent);void read();
  return()=>{stopped=true;clearTimeout(timer);sent.delete(onSent);};
 },[threadId,rpc]);
 return <section aria-label="Exo" data-exo-block="" className="exo-block mb-6 text-sm">
  {block?.said?<p data-exo-said="" className="exo-bubble">{block.said}</p>:null}
  <div data-exo-reply="" className="exo-reply max-w-prose">{block?.working?<p role="status" aria-live="polite" style={{color:'var(--exo-quiet)'}}>Exo is working on this page…</p>
   :block?.words?<Markdown content={block.words}/>:null}</div>
  {error&&<p role="alert" className="text-destructive">{error}</p>}
 </section>;
}

export function SurfaceInput({threadId}:{threadId:string|null}){
 const rpc=useRpc<typeof rpcContract>();
 const[text,setText]=useState(''),[sending,setSending]=useState(false),[error,setError]=useState('');
 const send=useCallback(async()=>{
  if(!threadId||sending||!text.trim())return;setSending(true);setError('');
  try{await rpc.call('exo_send',{threadId,text});setText('');for(const listener of sent)listener(threadId,text);}
  catch(e){setError(String(e));}finally{setSending(false);}
 },[threadId,sending,text,rpc]);
 const submit=(e:FormEvent)=>{e.preventDefault();void send();};
 const keys=(e:KeyboardEvent<HTMLTextAreaElement>)=>{if(e.key==='Enter'&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void send();}};
 return <div className="exo-dock"><div aria-hidden="true" className="exo-fade"/><form aria-label="Message Exo" onSubmit={submit} className="exo-input flex items-end gap-2">
  <textarea aria-label="Message" value={text} onChange={e=>setText(e.target.value)} onKeyDown={keys} rows={2} disabled={!threadId}
   placeholder={threadId?'Message Exo':'Exo is not attached yet.'} className="min-w-0 flex-1 resize-none rounded-md border border-border bg-transparent px-3 py-2 text-sm"/>
  <button type="submit" disabled={!threadId||sending||!text.trim()} className="rounded-md border border-border px-3 py-2 text-sm hover:bg-accent">Send</button>
  {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
 </form></div>;
}

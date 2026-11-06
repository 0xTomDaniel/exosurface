// Settings (#129; spec pages-and-activity T3, T4; GLOSSARY "Settings"): opened from the sidebar's Settings button, shown in
// place of the surface in view. How Exo runs, as Exo's owner reports it: whether Exo is set up (canonical_setup_status), and
// for Home's thread (overview) the model its Pi runs on, whether the owner is running, and the owner profile. Not a
// surface: no input, and no control but Close.
import {useEffect,useState} from 'react';
import {useRpc} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
type Facts={setUp:boolean;model:string|null;running:boolean;profile:string|null};
export function Settings({onClose}:{onClose:()=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const[facts,setFacts]=useState<Facts|null>(null),[error,setError]=useState('');
 // Read on open, then again while open, so a model change or an owner that stops shows without reopening.
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined;
  const read=async()=>{
   try{
    const[status,overview]=await Promise.all([rpc.call('canonical_setup_status',null),rpc.call('overview',null)]);
    const home=overview.threads.find(t=>t.id===status.threadId);
    if(!stopped){setFacts({setUp:status.stage==='bound',model:home?.model??null,running:!!home?.ready,profile:home?.profile??null});setError('');}
   }catch(e){if(!stopped)setError(String(e));}
   finally{if(!stopped)timer=setTimeout(read,document.hidden?15000:5000);}
  };
  void read();return()=>{stopped=true;clearTimeout(timer);};
 },[rpc]);
 const loading='Loading…';
 const rows:[string,string][]=[
  ['Set-up',facts?facts.setUp?'Exo is set up':'Exo is not set up':loading],
  ['Model',facts?facts.model??'Not reported yet':loading],
  ['Running',facts?facts.running?'Exo is running':'Exo is not running':loading],
  ['Owner profile',facts?facts.profile??'None yet':loading],
 ];
 return <main aria-label="Settings" className="min-h-0 min-w-0 flex-1 overflow-auto px-8 pt-6">
  <div className="flex items-center justify-between gap-4">
   <h1 className="text-xl font-semibold">Settings</h1>
   <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted" onClick={onClose}>Close</button>
  </div>
  <dl className="mt-6 grid max-w-xl grid-cols-[max-content_1fr] gap-x-6 gap-y-3 text-sm">
   {rows.map(([term,value])=><div key={term} className="contents"><dt className="text-muted-foreground">{term}</dt><dd>{value}</dd></div>)}
  </dl>
  {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
 </main>;
}

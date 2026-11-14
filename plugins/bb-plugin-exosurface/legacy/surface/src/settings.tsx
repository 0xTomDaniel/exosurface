// Settings (#129; spec pages-and-activity T3, T4; GLOSSARY "Settings"): opened from the sidebar's Settings button, shown in
// place of the surface in view. How Exo runs, as Exo's owner reports it: whether Exo is set up (canonical_setup_status), and
// for Home's thread (overview) the model its Pi runs on, whether the owner is running, and the owner profile. Not a
// surface: no input, and no control but Close.
import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useRpc} from '@get-bb/plugin-sdk/app';
import type {rpcContract} from '../../primary/server';
interface Facts {setUp:boolean;model:string|null;running:boolean;profile:string|null}
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
// First run (#130; spec T5, T2): until Exo is set up, only settings show, offering set-up: what Exo will use (the BB project,
// the workspace, Pi and OptChat), each filled in where Exo finds it (canonical_setup_status defaults: the local config, or the
// stopped set-up's own values) and changeable, and Set up Exo, which runs the canonical set-up (canonical_setup) once. Pressing
// it is the person's authorization. A set-up that stopped part way keeps its operation and values and resumes from here.
// Once Exo is set up, `children` (the sidebar and Home) show instead.
export function SetUpFirst({children}:{children:ReactNode}){
 const rpc=useRpc<typeof rpcContract>();
 const[status,setStatus]=useState<{stage:string;operationId:string|null;initializationAvailable:boolean}|null>(null),[error,setError]=useState('');
 const[projects,setProjects]=useState<{id:string;name:string}[]>([]),[busy,setBusy]=useState(false);
 const[projectId,setProject]=useState(''),[vault,setVault]=useState(''),[piCli,setPi]=useState(''),[optchat,setOptchat]=useState('');
 const operation=useRef<string>(crypto.randomUUID());
 const read=async()=>{
  const value=await rpc.call('canonical_setup_status',null);setStatus(value);if(value.stage==='bound')return value;
  if(value.operationId){operation.current=value.operationId;setProject(value.projectId??'');}
  setVault(value.defaults.vault);setPi(value.defaults.piCli);setOptchat(value.defaults.optchat);return value;
 };
 useEffect(()=>{let alive=true;
  void read().then(async value=>{if(value.stage==='bound'||!alive)return;const list=await rpc.call('canonical_setup_projects',null);if(!alive)return;setProjects(list);if(!value.operationId)setProject(p=>p||list[0]?.id||'');})
   .catch(e=>{if(alive)setError(String(e));});
  return()=>{alive=false;};
 },[rpc]);
 const setUp=async()=>{
  setBusy(true);setError('');
  try{await rpc.call('canonical_setup',{operationId:operation.current,projectId,vault,piCli,optchat,authorizeInitialization:true,recoverDeadLock:Boolean(status?.operationId)});await read();}
  catch(e){setError(String(e));await read().catch(()=>{});}
  finally{setBusy(false);}
 };
 if(status?.stage==='bound')return <>{children}</>;
 const resume=!!status?.operationId,fixed=resume||busy;
 const field='mt-1 block w-full rounded-md border border-border bg-background p-2 text-sm disabled:opacity-70';
 return <main aria-label="Settings" className="min-h-0 min-w-0 flex-1 overflow-auto px-8 pt-6">
  <h1 className="text-xl font-semibold">Settings</h1>
  <p className="mt-2 max-w-prose text-sm text-muted-foreground">{!status?'Loading…':resume?'Set-up stopped part way. Resume it to finish setting Exo up with what it started with.':'Exo is not set up yet. Check what Exo will use, then set it up once.'}</p>
  {status&&<div className="mt-6 max-w-xl space-y-3">
   <label className="block text-sm">Project<select className={field} disabled={fixed} value={projectId} onChange={e=> { setProject(e.target.value); }}>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   <label className="block text-sm">Workspace<input className={field} disabled={fixed} value={vault} onChange={e=> { setVault(e.target.value); }}/></label>
   <label className="block text-sm">Pi<input className={field} disabled={fixed} value={piCli} onChange={e=> { setPi(e.target.value); }}/></label>
   <label className="block text-sm">OptChat<input className={field} disabled={fixed} value={optchat} onChange={e=> { setOptchat(e.target.value); }}/></label>
   {!status.initializationAvailable&&<p className="text-sm text-muted-foreground">Set-up is not available in this BB yet.</p>}
   <button type="button" className="rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50" disabled={busy||!status.initializationAvailable||!projectId||!vault||!piCli||!optchat} onClick={()=>void setUp()}>{busy?'Setting up Exo…':resume?'Resume set-up':'Set up Exo'}</button>
  </div>}
  {error&&<p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
 </main>;
}

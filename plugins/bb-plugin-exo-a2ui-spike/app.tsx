import {useEffect,useRef,useState} from 'react';
import {definePluginApp,ThreadChat,useRpc,useRealtime,useBbNavigate,useComposer} from '@get-bb/plugin-sdk/app';
import type {ComposerMention} from '@get-bb/plugin-sdk/app';
import type {PluginMessageDirectiveProps} from '@get-bb/plugin-sdk/app';
import {useRewind,setRewind,when,type VersionRef} from './src/rewind-store';
import {A2uiSurface,MarkdownContext} from '@a2ui/react/v0_9';
import {renderMarkdown} from '@a2ui/markdown-it';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import type {rpcContract} from './server';
import {WorkspaceView} from './src/workspace-view';
import {deliverySchema} from './src/delivery';
import {moduleNodes,moduleIds} from './src/workspace';
import {stagePlan,surfaceTitle} from './src/stage';
import {exoReactCatalog} from './src/exo-components';
import {documentStyle} from './lib/document-style';
import {exoTheme} from './lib/exo-theme';
type Local={id:string;nativeFocus:string|undefined}|null;
// The canvas is a stage that follows the conversation. Every surface stays
// mounted (drafts intact); receded ones are one click away on the shelf.
function Canvas({view,local,setLocal}:{view:WorkspaceView;local:Local;setLocal:(l:Local)=>void}){
 const[allEarlier,setAllEarlier]=useState(false);
 const snapshot=view.displayed,ids=snapshot?moduleIds(snapshot):[],plan=stagePlan(ids,snapshot?.layout,local);
 const surfaces=view.processor.getSurfaces(),edits=[...view.drafts.edits.values()],dirty=new Set(edits.map(e=>e.surfaceId));
 const render=(id:string)=>{const s=surfaces.get(id);if(!s)return null;return <section key={id} aria-label={snapshot?surfaceTitle(moduleNodes(snapshot,id),id):id} data-surface={id} className={`exo-generated min-w-0${snapshot&&moduleNodes(snapshot,id).some(n=>n.id.startsWith('doc_'))?' exo-document':''}`}><MarkdownContext.Provider value={renderMarkdown}><A2uiSurface surface={s}/></MarkdownContext.Provider></section>;};
 const title=(id:string)=>snapshot?surfaceTitle(moduleNodes(snapshot,id),id):id;
 return <>
  {view.error&&<p role="alert" className="mb-4 text-sm text-destructive">{view.error}</p>}
  {view.orphan.length>0&&<details className="mb-4 text-sm"><summary>Unsent edits no longer fit the new controls; copy them before leaving.</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(view.orphan.map(({surfaceId,path,value})=>({surfaceId,path,value})),null,2)}</pre></details>}
  {plan.mode==='stage'?<>
   {(plan.receded.length>0||local)&&<nav className="exo-shelf" aria-label="Earlier in this conversation">
    <span>Earlier</span>
    {(()=>{const recent=[...plan.receded].reverse(),shown=allEarlier?recent:recent.filter((id,i)=>i<3||dirty.has(id));return <>{shown.map(id=><button key={id} type="button" className="exo-pill" aria-pressed={false} title={dirty.has(id)?'Has unsent edits':undefined} onClick={()=>setLocal({id,nativeFocus:snapshot?.layout?.focus})}><span>{title(id)}</span>{dirty.has(id)&&<span className="exo-dot" aria-label="unsent edits"/>}</button>)}{recent.length>shown.length&&<button type="button" className="exo-more" onClick={()=>setAllEarlier(true)}>{recent.length-shown.length} more</button>}{allEarlier&&recent.length>3&&<button type="button" className="exo-more" onClick={()=>setAllEarlier(false)}>Fewer</button>}</>;})()}
    {local&&<button type="button" className="exo-follow" onClick={()=>setLocal(null)}>Back to the current topic</button>}
   </nav>}
   <div className={`exo-stage-grid${plan.beside.length?' has-beside':''}`}>
    <div key={plan.focus} className="exo-stage exo-enter">{render(plan.focus)}</div>
    {plan.beside.length>0&&<aside className="exo-beside" aria-label="Context">{plan.beside.map(render)}</aside>}
   </div>
   <div className="exo-hidden" aria-hidden="true">{plan.receded.map(render)}</div>
  </>:<div className="exo-legacy-grid">{plan.all.map(render)}</div>}
  {edits.length>0&&<p role="status" className="mt-5 text-sm" style={{color:'var(--exo-quiet)'}}>Saving your changes…</p>}
 </>;
}
// A surface card in the chat, where Exo drew or edited it. Clicking shows that version on the canvas.
function ExoSurfaceCard({attributes,message}:PluginMessageDirectiveProps){
 const rpc=useRpc<typeof rpcContract>(),nav=useBbNavigate(),surface=attributes.surface??'',revision=Number(attributes.revision),valid=/^[a-zA-Z0-9_-]{1,80}$/.test(surface)&&Number.isInteger(revision);
 const[meta,setMeta]=useState<{title:string;at:string;current:boolean;revision:number}|null>(null),active=useRewind();
 useEffect(()=>{if(valid)rpc.call('surfaceAt',{threadId:message.threadId,surface,revision}).then(m=>setMeta({title:m.title,at:m.at,current:m.current,revision:m.revision})).catch(()=>{});},[surface,revision,message.threadId]);
 if(!valid)return null;const on=active?.surface===surface&&active.revision===revision;
 return <button type="button" aria-pressed={on} aria-label={`Show ${meta?.title??surface} on the canvas`} onClick={async()=>{setRewind({surface,revision});nav.toPluginPanel('workspace');
  // An earlier version opens as a bring-back in progress: a pill appears in the input; ✕ or removing the pill cancels.
  const m=meta??await rpc.call('surfaceAt',{threadId:message.threadId,surface,revision}).catch(()=>null);if(m&&!m.current)await rpc.call('pending',{threadId:message.threadId,op:'set',version:{surface,revision:m.revision}}).catch(()=>{});}}
  className={`my-1 flex w-full max-w-md items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent ${on?'border-primary':'border-border'}`}>
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 opacity-70"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>
  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{meta?.title??surface}</span><span className="block text-xs text-muted-foreground">{attributes.action==='edited'?'Edited on the canvas':'On the canvas'}{meta?` · ${when(meta.at)}`:''}</span></span>
 </button>;
}
// An earlier version of a surface, shown in place of the live canvas. Editing it prepares a bring-back
// (carried with the next message); pressing one of its buttons brings it back right away. ✕ returns to now.
function RewindView({threadId,at:ref,revision,onCurrent}:{threadId:string;at:VersionRef;revision:number;onCurrent:(surface:string)=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const[meta,setMeta]=useState<any>(null),[error,setError]=useState(''),[ticks,tick]=useState(0),[pending,setPending]=useState(false);
 const view=useRef<WorkspaceView|null>(null),press=useRef<(a:any)=>void>(()=>{});
 useEffect(()=>{let alive=true;setMeta(null);setError('');
  rpc.call('surfaceAt',{threadId,...ref}).then(async m=>{if(!alive)return;if(m.current){onCurrent(m.surface);return;}
   const v=new WorkspaceView(a=>press.current(a),()=>tick(n=>n+1),[basicCatalog,exoReactCatalog]);v.accept(deliverySchema.parse({epoch:`rewind-${m.surface}-${m.revision}`,checkpoint:m.snapshot,updates:[],preview:null}));
   const p=await rpc.call('pending',{threadId,op:'get'}).catch(()=>null);if(p&&p.surface===m.surface&&p.revision===m.revision)for(const u of p.updates)v.processor.getSurfaces().get(m.surface)?.dataModel.set(u.path,u.value);
   view.current?.dispose();view.current=v;setMeta(m);}).catch(e=>alive&&setError(String(e)));
  return()=>{alive=false;view.current?.dispose();view.current=null;};},[ref.surface,ref.revision,threadId]);
 // Edits to the earlier version become the pending bring-back (the composer shows it).
 useEffect(()=>{const v=view.current;if(!v||!meta)return;const edits=[...v.drafts.edits.values()].filter(e=>e.surfaceId===meta.surface);if(!edits.length)return;
  const t=setTimeout(()=>{rpc.call('pending',{threadId,op:'set',version:{surface:meta.surface,revision:meta.revision},updates:edits.slice(0,16).map(({path,value})=>({path,value}))}).catch(e=>setError(String(e)));},500);return()=>clearTimeout(t);},[ticks,meta]);
 press.current=async(a:any)=>{if(pending||!meta)return;setPending(true);setError('');try{await rpc.call('action',{threadId,revision,rewind:{surface:meta.surface,revision:meta.revision},event:{version:'v0.9.1',action:a},actionId:crypto.randomUUID(),metadata:{a2uiClientCapabilities:{'v0.9.1':{supportedCatalogIds:[basicCatalog.id,exoReactCatalog.id]}}}});setRewind(null);}catch(e){setError(String(e));}finally{setPending(false);}};
 const cancel=async()=>{setRewind(null);await rpc.call('pending',{threadId,op:'clear'}).catch(()=>{});};
 const surface=meta?view.current?.processor.getSurfaces().get(meta.surface):null;
 return <div>
  <div className="mb-4 flex items-center gap-3 rounded-lg border border-border px-3 py-2 text-sm" role="status">
   <span className="min-w-0 flex-1"><strong>Earlier version</strong>{meta?<> · {meta.action==='edited'?'edited':'drawn'} {when(meta.at)} · it comes back with your next message (✕ to keep the latest)</>:' · loading…'}</span>
   <button type="button" aria-label="Back to the latest canvas" onClick={cancel} className="rounded px-2 py-1 hover:bg-accent">✕</button>
  </div>
  {error&&<p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
  <div inert={pending}>{surface&&<section data-surface={meta.surface} aria-label={meta.title} className="exo-generated min-w-0"><MarkdownContext.Provider value={renderMarkdown}><A2uiSurface surface={surface}/></MarkdownContext.Provider></section>}</div>
 </div>;
}
// The bring-back lives in the input box as a pill (like an attachment). Inserted when a pending bring-back appears;
// removing the pill cancels it; sending resolves it (the server brings the surface back first). Falls back to a
// small card above the input if the pill can't be inserted.
const pillKey=(p:any)=>`${p.surface}@${p.revision}`;
const isPill=(m:ComposerMention,key:string)=>m.kind==='plugin'&&m.provider==='surface'&&m.id===key;
function BringBackPill(){
 const composer=useComposer(),rpc=useRpc<typeof rpcContract>(),nav=useBbNavigate(),threadId=composer.scope.kind==='thread'?composer.scope.threadId:null;
 const[p,setP]=useState<any>(null),[fallback,setFallback]=useState(false),inserted=useRef<string|null>(null),sent=useRef<string|null>(null);
 useEffect(()=>{if(threadId)rpc.call('pending',{threadId,op:'get'}).then(setP).catch(()=>setP(null));},[threadId]);
 useRealtime('pending-restore',v=>setP(v as any));
 useEffect(()=>composer.onSubmitted(()=>{sent.current=inserted.current;}),[composer]);
 const mentions=composer.draft.mentions;
 useEffect(()=>{
  if(!threadId)return;const key=p&&p.threadId===threadId?pillKey(p):null;
  const ours=composer.draft.mentions.filter(m=>m.kind==='plugin'&&m.provider==='surface');
  // One bring-back at a time: keep only the pending surface's pill (or, with nothing pending, the latest one typed).
  // A pill we inserted for a bring-back that has since been cancelled goes too.
  const keep=key?ours.find(m=>isPill(m,key)):ours.filter(m=>m.kind==='plugin'&&m.id!==inserted.current).at(-1);
  const remove=ours.filter(m=>m!==keep);
  if(remove.length){composer.replace(cur=>{let text=cur.text,ms=[...cur.mentions];
   for(const m of [...remove].sort((x,y)=>y.from-x.from)){const cut=m.to-m.from+(text[m.to]===' '?1:0);text=text.slice(0,m.from)+text.slice(m.from+cut);ms=ms.filter(x=>!(x.from===m.from&&x.to===m.to)).map(x=>x.from>m.from?{...x,from:x.from-cut,to:x.to-cut}:x);}
   return {...cur,text,mentions:ms};});return;}
  if(key&&!keep){
   if(inserted.current!==key){try{composer.insert([{provider:'surface',id:key,label:`↺ ${p.title} (${when(p.at)})`},' '],{at:'end'});inserted.current=key;setFallback(false);}catch{setFallback(true);}}
   else if(sent.current!==key){inserted.current=null;setRewind(null);rpc.call('pending',{threadId,op:'clear'}).catch(()=>{});}
  }
  if(!key){inserted.current=null;sent.current=null;}
 },[p,mentions,threadId]);
 if(!fallback||!p||!threadId||p.threadId!==threadId)return null;
 return <div className="flex items-center gap-2 text-sm">
  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={()=>{setRewind({surface:p.surface,revision:p.revision});nav.toPluginPanel('workspace');}}>↺ Bringing back <strong>{p.title}</strong> ({when(p.at)} version)</button>
  <button type="button" aria-label="Stop bringing it back" className="rounded px-2 py-0.5 hover:bg-accent" onClick={async()=>{setRewind(null);setP(null);await rpc.call('pending',{threadId,op:'clear'}).catch(()=>{});}}>✕</button>
 </div>;
}
// A ✕ inside the input box (next to send) that cancels the bring-back; shown only while one is pending.
function BringBackCancel(){
 const composer=useComposer(),rpc=useRpc<typeof rpcContract>(),threadId=composer.scope.kind==='thread'?composer.scope.threadId:null;
 const[p,setP]=useState<any>(null);
 useEffect(()=>{if(threadId)rpc.call('pending',{threadId,op:'get'}).then(setP).catch(()=>setP(null));},[threadId]);
 useRealtime('pending-restore',v=>setP(v as any));
 if(!p||!threadId||p.threadId!==threadId)return null;
 return <button type="button" aria-label={`Stop bringing back ${p.title}`} title={`Stop bringing back “${p.title}”`} onClick={async()=>{setRewind(null);setP(null);await rpc.call('pending',{threadId,op:'clear'}).catch(()=>{});}}
  className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground">↺ <span aria-hidden="true">✕</span></button>;
}
function WorkspacePage(){
 const rpc=useRpc<typeof rpcContract>();type Status=Awaited<ReturnType<typeof getState>>;
 const[state,setState]=useState<Status|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[ticks,tick]=useState(0),[local,setLocal]=useState<Local>(null);
 const saving=useRef(false),rewind=useRewind();
 useRealtime('pending-restore',v=>{if(!v)setRewind(null);});
 const view=useRef<WorkspaceView|null>(null),send=useRef<(a:any)=>void>(()=>{}),stateRef=useRef(state);stateRef.current=state;
 const serial=useRef(0),recover=useRef<()=>void>(()=>{});
 async function getState(){return rpc.call('workspace',view.current?.epoch?view.current.cursor():null);}
 useEffect(()=>{const v=new WorkspaceView(a=>send.current(a),()=>tick(n=>n+1),[basicCatalog,exoReactCatalog]);view.current=v;tick(n=>n+1);return()=>{view.current=null;v.dispose();};},[]);
 const accept=(raw:Status)=>{const v=view.current;if(!v)return;v.accept(deliverySchema.parse(raw.delivery));setState(raw);setError('');};
 useRealtime('workspace',payload=>{serial.current++;try{accept(payload as Status);}catch(e){setError(String(e));recover.current();}});
 useRealtime('workspace-error',payload=>setError(String((payload as any)?.message??'Workspace stream failed')));
 useEffect(()=>{
  let stopped=false,timer:ReturnType<typeof setTimeout>|undefined,inFlight=false;
  const poll=async()=>{if(stopped||inFlight)return;inFlight=true;const before=serial.current;try{const value=await getState();if(!stopped&&before===serial.current)accept(value);}catch(e){if(!stopped)setError(String(e));}finally{inFlight=false;if(!stopped)timer=setTimeout(poll,document.hidden?10000:5000);}};
  recover.current=()=>{clearTimeout(timer);void poll();};void poll();return()=>{stopped=true;clearTimeout(timer);recover.current=()=>{};};
 },[rpc]);
 send.current=async(a:any)=>{const v=view.current,s=stateRef.current;if(!v||!s?.threadId||pending||s.streaming||v.preview||v.committed?.incomplete)return;setPending(true);setError('');try{await rpc.call('action',{threadId:s.threadId,revision:v.committed?.revision??0,event:{version:'v0.9.1',action:a},actionId:crypto.randomUUID(),metadata:{a2uiClientCapabilities:{'v0.9.1':{supportedCatalogIds:[basicCatalog.id,exoReactCatalog.id]}}}});}catch(e){setError(String(e));}finally{setPending(false);}};
 const v=view.current,busy=pending||state?.streaming||!!v?.preview||v?.committed?.incomplete;
 // Shared state: edited inputs are saved to the committed canvas (revision-checked) while Exo is idle; no chat message, no turn.
 useEffect(()=>{
  const cur=view.current;if(!cur||busy||!state?.threadId||!cur.committed||saving.current)return;const edits=[...cur.drafts.edits.values()];if(!edits.length)return;
  const timer=setTimeout(async()=>{const now=view.current;if(!now?.committed||saving.current)return;const batch=[...now.drafts.edits.values()];if(!batch.length)return;const surfaceId=batch[0].surfaceId;
   saving.current=true;try{await rpc.call('edit',{threadId:state.threadId!,revision:now.committed.revision,surfaceId,updates:batch.filter(d=>d.surfaceId===surfaceId).slice(0,16).map(({path,value})=>({path,value})),mutationId:crypto.randomUUID()});}
   catch{/* stale or busy: the next committed revision arrives and this retries */}finally{saving.current=false;recover.current();}},900);
  return()=>clearTimeout(timer);
 },[ticks,busy,state?.threadId,rpc]);
 return <div className="flex h-full min-h-0 flex-col md:flex-row">
  <style>{documentStyle+exoTheme}</style>
  <main aria-label="Exosurface canvas" className="exo-canvas min-h-[45%] min-w-0 flex-1 overflow-auto px-8 py-6" style={{containerType:'inline-size',containerName:'exo-canvas'}}><div className="exo-frame">
   <div className="exo-topline"><h1>Exosurface clone</h1><p aria-label="Workspace revision">Isolated clone, revision {v?.committed?.revision??0}</p></div>
   <p role="status" aria-live="polite" className="exo-status" data-busy={busy?'true':'false'}>{v?.preview?'Exo is drawing — controls wake up when it finishes.':busy?'Exo is updating the canvas…':state?.ready?null:'Clone owner is detached or starting.'}</p>
   <div inert={!!busy}>{rewind&&state?.threadId?<RewindView threadId={state.threadId} at={rewind} revision={v?.committed?.revision??0} onCurrent={id=>{setRewind(null);setLocal({id,nativeFocus:v?.displayed?.layout?.focus});}}/>:v&&v.processor.getSurfaces().size>0?<Canvas view={v} local={local} setLocal={setLocal}/>:<p className="max-w-prose text-sm" style={{color:'var(--exo-quiet)'}}>Talk with Exo in the conversation. When a picture helps, it appears here.</p>}</div>
   {error&&<p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
  </div></main>
  <section aria-label="Clone conversation" className="min-h-[300px] min-w-0 border-t border-border md:w-[35%] md:min-h-0 md:border-l md:border-t-0">{state?.threadId?<ThreadChat threadId={state.threadId} variant="compact"/>:<p className="p-5 text-sm">Clone conversation not provisioned yet.</p>}</section>
 </div>;
}
export default definePluginApp(app=>{
 app.slots.navPanel({id:'workspace',path:'workspace',title:'Exosurface clone',icon:'PanelsTopLeft',component:WorkspacePage});
 app.slots.messageDirective({id:'exo-surface',component:ExoSurfaceCard});
 app.composer.customize({id:'exo-bring-back',scopes:['thread'],banners:[{id:'bring-back',chrome:'bare',component:BringBackPill}],actions:[{id:'bring-back-cancel',component:BringBackCancel}]});
});

import {useEffect,useRef,useState} from 'react';
import {definePluginApp,useRpc,useRealtime,useBbNavigate,useComposer} from '@get-bb/plugin-sdk/app';
import type {ComposerMention} from '@get-bb/plugin-sdk/app';
import type {PluginMessageDirectiveProps} from '@get-bb/plugin-sdk/app';
import {useRewind,setRewind,when,panelOf,type VersionRef} from './src/rewind-store';
import {A2uiSurface,MarkdownContext} from '@a2ui/react/v0_9';
import {renderMarkdown} from '@a2ui/markdown-it';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import type {rpcContract} from './server';
import {WorkspaceView} from './src/workspace-view';
import {deliverySchema} from './src/delivery';
import {moduleNodes,moduleIds} from './src/workspace';
import {stagePlan,nativeFocus,surfaceTitle} from './src/stage';
import {exoReactCatalog} from './src/exo-components';
import {bundleCatalogs} from './src/bundle-tags';
import {documentStyle} from './lib/document-style';
import {exoTheme} from './lib/exo-theme';
import {ExoBlock,SurfaceInput,onSend} from './src/exo-turn';
import {ThreadSidebar} from './src/thread-sidebar';
import {SurfaceTitle} from './src/surface-title';
type Local={id:string;nativeFocus:string|undefined}|null;
// The catalogs pages render with: their elements under this bundle's own tag names (src/bundle-tags.ts).
const CATALOGS=bundleCatalogs([basicCatalog,exoReactCatalog]);
// The canvas is a stage that follows the conversation: one page in view (S13). Every surface stays
// mounted (drafts intact); receded ones are one click away on the shelf.
function Canvas({view,local}:{view:WorkspaceView;local:Local}){
 const snapshot=view.displayed,ids=snapshot?moduleIds(snapshot):[],plan=stagePlan(ids,snapshot?.layout,local);
 const surfaces=view.processor.getSurfaces(),edits=[...view.drafts.edits.values()];
 const render=(id:string)=>{const s=surfaces.get(id);if(!s)return null;return <section key={id} aria-label={snapshot?surfaceTitle(moduleNodes(snapshot,id),id):id} data-surface={id} className={`exo-generated min-w-0${snapshot&&moduleNodes(snapshot,id).some(n=>n.id.startsWith('doc_'))?' exo-document':''}`}><MarkdownContext.Provider value={renderMarkdown}><A2uiSurface surface={s}/></MarkdownContext.Provider></section>;};
 return <>
  {view.error&&<p role="alert" className="mb-4 text-sm text-destructive">{view.error}</p>}
  {view.orphan.length>0&&<details className="mb-4 text-sm"><summary>Unsent edits no longer fit the new controls; copy them before leaving.</summary><pre className="overflow-auto whitespace-pre-wrap">{JSON.stringify(view.orphan.map(({surfaceId,path,value})=>({surfaceId,path,value})),null,2)}</pre></details>}
  {plan&&<>
   <div className="exo-stage-grid">
    <div key={plan.focus} className="exo-stage exo-enter">{render(plan.focus)}</div>
   </div>
   <div className="exo-hidden" aria-hidden="true">{plan.receded.map(render)}</div>
  </>}
  {edits.length>0&&<p role="status" className="mt-5 text-sm" style={{color:'var(--exo-quiet)'}}>Saving your changes…</p>}
 </>;
}
// The page strip: the surface's other pages as pills, under the title (owner walkthrough on PR #89). Same plan as the
// Canvas, so the page in view and the pills never disagree.
function PageStrip({view,local,setLocal}:{view:WorkspaceView;local:Local;setLocal:(l:Local)=>void}){
 const[allEarlier,setAllEarlier]=useState(false);
 const snapshot=view.displayed,ids=snapshot?moduleIds(snapshot):[],plan=stagePlan(ids,snapshot?.layout,local);
 const dirty=new Set([...view.drafts.edits.values()].map(e=>e.surfaceId));
 const title=(id:string)=>snapshot?surfaceTitle(moduleNodes(snapshot,id),id):id;
 if(!plan||!(plan.receded.length>0||local))return null;
 return <nav className="exo-shelf" aria-label="Earlier in this conversation">
    <span>Earlier</span>
    {(()=>{const recent=[...plan.receded].reverse(),shown=allEarlier?recent:recent.filter((id,i)=>i<3||dirty.has(id));return <>{shown.map(id=><button key={id} type="button" className="exo-pill" aria-pressed={false} title={dirty.has(id)?'Has unsent edits':undefined} onClick={()=>setLocal({id,nativeFocus:plan.native})}><span>{title(id)}</span>{dirty.has(id)&&<span className="exo-dot" aria-label="unsent edits"/>}</button>)}{recent.length>shown.length&&<button type="button" className="exo-more" onClick={()=>setAllEarlier(true)}>{recent.length-shown.length} more</button>}{allEarlier&&recent.length>3&&<button type="button" className="exo-more" onClick={()=>setAllEarlier(false)}>Fewer</button>}</>;})()}
    {local&&<button type="button" className="exo-follow" onClick={()=>setLocal(null)}>Back to the current topic</button>}
   </nav>;
}
// A surface card in the chat, where Exo drew or edited it. Clicking shows that version on the canvas.
function ExoSurfaceCard({attributes,message}:PluginMessageDirectiveProps){
 const rpc=useRpc<typeof rpcContract>(),nav=useBbNavigate(),surface=attributes.surface??'',revision=Number(attributes.revision),valid=/^[a-zA-Z0-9_-]{1,80}$/.test(surface)&&Number.isInteger(revision);
 const[meta,setMeta]=useState<{title:string;at:string}|null>(null),active=useRewind();
 useEffect(()=>{if(valid)rpc.call('surfaceAt',{threadId:message.threadId,surface,revision}).then(m=>setMeta({title:m.title,at:m.at})).catch(()=>{});},[surface,revision,message.threadId]);
 if(!valid)return null;const on=active?.surface===surface&&active.revision===revision;
 return <button type="button" aria-pressed={on} aria-label={`Open page ${meta?.title??surface}`} onClick={async()=>{
  // Only the latest card of the surface on stage just loads it. Any other card opens a historical surface being worked on:
  // a pill appears in the input and the next message brings it to the stage; ✕ or removing the pill cancels.
  // Always ask fresh: what is current or on stage changes as the conversation moves.
  const m=await rpc.call('surfaceAt',{threadId:message.threadId,surface,revision}).catch(()=>null);if(!m)return;
  const deployment=m.panel==='surface'?'main' as const:'clone' as const;setRewind({surface,revision,deployment});nav.toPluginPanel(m.panel);
  // Going back to the current stage ends any bring-back in progress (its pill and edits go with it).
  if(m.onStage){setRewind(null);await rpc.call('pending',{threadId:message.threadId,op:'clear'}).catch(()=>{});return;}
  if(m&&!m.onStage)await rpc.call('pending',{threadId:message.threadId,op:'set',version:{surface,revision:m.revision}}).catch(()=>{});}}
  className={`my-1 flex w-full max-w-md items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors hover:bg-accent ${on?'border-primary':'border-border'}`}>
  <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="shrink-0 opacity-70"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M9 9v11"/></svg>
  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{meta?.title??surface}</span><span className="block text-xs text-muted-foreground">{attributes.action==='edited'?'Page edited':'Page'}{meta?` · ${when(meta.at)}`:''}</span></span>
 </button>;
}
// An earlier version of a surface, shown in place of the live canvas. Editing it prepares a bring-back
// (carried with the next message); pressing one of its buttons brings it back right away. ✕ returns to now.
function RewindView({threadId,at:ref,revision,onCurrent}:{threadId:string;at:VersionRef;revision:number;onCurrent:(surface:string)=>void}){
 const rpc=useRpc<typeof rpcContract>();
 const[meta,setMeta]=useState<any>(null),[error,setError]=useState(''),[ticks,tick]=useState(0),[pending,setPending]=useState(false);
 const view=useRef<WorkspaceView|null>(null),press=useRef<(a:any)=>void>(()=>{});
 useEffect(()=>{let alive=true;setMeta(null);setError('');
  rpc.call('surfaceAt',{threadId,surface:ref.surface,revision:ref.revision}).then(async m=>{if(!alive)return;if(m.onStage){onCurrent(m.surface);return;}
   const v=new WorkspaceView(a=>press.current(a),()=>tick(n=>n+1),CATALOGS);v.accept(deliverySchema.parse({epoch:`rewind-${m.surface}-${m.revision}`,checkpoint:m.snapshot,updates:[],preview:null}));
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
   <span className="min-w-0 flex-1"><strong>{meta?.current?'Not on stage':'Earlier version'}</strong>{meta?<> · {meta.action==='edited'?'edited':'drawn'} {when(meta.at)} · it comes to the stage with your next message (✕ to keep the current stage)</>:' · loading…'}</span>
   <button type="button" aria-label="Back to the current stage" onClick={cancel} className="rounded px-2 py-1 hover:bg-accent">✕</button>
  </div>
  {error&&<p role="alert" className="mb-4 text-sm text-destructive">{error}</p>}
  <div inert={pending}>{surface&&<section data-surface={meta.surface} aria-label={meta.title} className="exo-generated min-w-0"><MarkdownContext.Provider value={renderMarkdown}><A2uiSurface surface={surface}/></MarkdownContext.Provider></section>}</div>
 </div>;
}
// The bring-back lives in the input box as a pill (like an attachment). Inserted when a pending bring-back appears;
// removing the pill cancels it; sending resolves it (the server brings the surface back first). Falls back to a
// small card above the input if the pill can't be inserted.
const pillKey=(p:any)=>`${p.deployment??'clone'}|${p.surface}@${p.revision}`;
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
  <button type="button" className="min-w-0 flex-1 truncate text-left hover:underline" onClick={()=>{setRewind({surface:p.surface,revision:p.revision,deployment:p.deployment});nav.toPluginPanel(panelOf(p.deployment));}}>↺ Bringing back <strong>{p.title}</strong> ({when(p.at)} version)</button>
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
// threadId: a bound thread in view (a surface other than Home, #68); its own page state, envelopes naming it only.
function SurfacePage({deployment,threadId}:{deployment:'clone'|'main';threadId?:string}){
 const channel=threadId?'surface-thread':deployment==='clone'?'workspace':'surface-main',clone=deployment==='clone',other=(payload:unknown)=>!!threadId&&(payload as any)?.threadId!==threadId;
 const rpc=useRpc<typeof rpcContract>();type Status=Awaited<ReturnType<typeof getState>>;
 const[state,setState]=useState<Status|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[ticks,tick]=useState(0),[local,setLocal]=useState<Local>(null);
 const saving=useRef(false),anyRewind=useRewind(),rewind=anyRewind&&(anyRewind.deployment??'clone')===deployment?anyRewind:null;
 useRealtime('pending-restore',v=>{if(!v)setRewind(null);});
 const view=useRef<WorkspaceView|null>(null),send=useRef<(a:any)=>void>(()=>{}),stateRef=useRef(state);stateRef.current=state;
 const serial=useRef(0),recover=useRef<()=>void>(()=>{});
 // A send brings the top of the surface into view (title, page strip, the new bubble), wherever the person had scrolled
 // (owner walkthrough on PR #89; spec E8, F1/F4: each send starts following). The browser's eased scroll, or an instant
 // jump for a person who asked for reduced motion.
 const scroller=useRef<HTMLElement>(null);
 useEffect(()=>onSend(id=>{if(id===stateRef.current?.threadId&&scroller.current)scroller.current.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});}),[]);
 async function getState(){return rpc.call('workspace',{deployment,...(threadId?{threadId}:{}),cursor:view.current?.epoch?view.current.cursor():null});}
 useEffect(()=>{const v=new WorkspaceView(a=>send.current(a),()=>tick(n=>n+1),CATALOGS);view.current=v;tick(n=>n+1);return()=>{view.current=null;v.dispose();};},[]);
 const accept=(raw:Status)=>{const v=view.current;if(!v)return;v.accept(deliverySchema.parse(raw.delivery));setState(raw);setError('');};
 useRealtime(channel,payload=>{if(other(payload))return;serial.current++;try{accept(payload as Status);}catch(e){setError(String(e));recover.current();}});
 useRealtime(`${channel}-error`,payload=>!other(payload)&&setError(String((payload as any)?.message??'Workspace stream failed')));
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
 return <div className="flex h-full min-h-0 flex-col">
  <style>{documentStyle+exoTheme}</style>
  <main ref={scroller} aria-label="Exosurface" className="exo-canvas min-h-[45%] min-w-0 flex-1 overflow-auto px-8 pt-6" style={{containerType:'inline-size',containerName:'exo-canvas'}}><div className="exo-frame">
   <div className="exo-top">
    <div className="exo-topline"><SurfaceTitle threadId={threadId}/><p aria-label="Surface revision">{clone?'Isolated clone, revision ':'Revision '}{v?.committed?.revision??0}</p></div>
    {/* Inert while Exo is busy, as the page is (unchanged from when the strip sat above the page). */}
    {!(rewind&&state?.threadId)&&v&&v.processor.getSurfaces().size>0&&<div inert={!!busy}><PageStrip view={v} local={local} setLocal={setLocal}/></div>}
   </div>
   <ExoBlock threadId={state?.threadId??null}/>
   <p role="status" aria-live="polite" className="exo-status" data-busy={busy?'true':'false'}>{v?.preview?'Exo is drawing a page — controls wake up when it finishes.':busy?'Exo is updating a page…':state?.ready?null:(clone?'Clone owner is detached or starting.':'Exo is detached or starting.')}</p>
   <div inert={!!busy}>{rewind&&state?.threadId?<RewindView threadId={state.threadId} at={rewind} revision={v?.committed?.revision??0} onCurrent={id=>{setRewind(null);setLocal({id,nativeFocus:v?.displayed?nativeFocus(moduleIds(v.displayed),v.displayed.layout):undefined});}}/>:v&&v.processor.getSurfaces().size>0?<Canvas view={v} local={local}/>:<p className="max-w-prose text-sm" style={{color:'var(--exo-quiet)'}}>Talk with Exo below. When a picture helps, a page appears here.</p>}</div>
   {error&&<p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
   <SurfaceInput threadId={state?.threadId??null}/>
  </div></main>
 </div>;
}
// The surfaces view (#68): the sidebar and the surface in view. Home (null) is the primary thread's page state as before.
function SurfacesPanel(){
 const[inView,setInView]=useState<string|null>(null);
 return <div className="flex h-full min-h-0"><ThreadSidebar inView={inView} onView={setInView}/><div className="min-h-0 min-w-0 flex-1"><SurfacePage key={inView??'home'} deployment="main" threadId={inView??undefined}/></div></div>;
}
export default definePluginApp(app=>{
 app.slots.navPanel({id:'surface',path:'surface',title:'Exosurface',icon:'PanelsTopLeft',component:SurfacesPanel});
 app.slots.messageDirective({id:'exo-surface',component:ExoSurfaceCard});
 app.composer.customize({id:'exo-bring-back',scopes:['thread'],banners:[{id:'bring-back',chrome:'bare',component:BringBackPill}],actions:[{id:'bring-back-cancel',component:BringBackCancel}]});
});

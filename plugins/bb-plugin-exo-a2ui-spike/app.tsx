import {useEffect,useRef,useState} from 'react';
import {definePluginApp,ThreadChat,useRpc,useRealtime} from '@get-bb/plugin-sdk/app';
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
function WorkspacePage(){
 const rpc=useRpc<typeof rpcContract>();type Status=Awaited<ReturnType<typeof getState>>;
 const[state,setState]=useState<Status|null>(null),[error,setError]=useState(''),[pending,setPending]=useState(false),[ticks,tick]=useState(0),[local,setLocal]=useState<Local>(null);
 const saving=useRef(false);
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
   <div inert={!!busy}>{v&&v.processor.getSurfaces().size>0?<Canvas view={v} local={local} setLocal={setLocal}/>:<p className="max-w-prose text-sm" style={{color:'var(--exo-quiet)'}}>Talk with Exo in the conversation. When a picture helps, it appears here.</p>}</div>
   {error&&<p role="alert" className="mt-6 text-sm text-destructive">{error}</p>}
  </div></main>
  <section aria-label="Clone conversation" className="min-h-[300px] min-w-0 border-t border-border md:w-[35%] md:min-h-0 md:border-l md:border-t-0">{state?.threadId?<ThreadChat threadId={state.threadId} variant="compact"/>:<p className="p-5 text-sm">Clone conversation not provisioned yet.</p>}</section>
 </div>;
}
export default definePluginApp(app=>{app.slots.navPanel({id:'workspace',path:'workspace',title:'Exosurface clone',icon:'PanelsTopLeft',component:WorkspacePage});});

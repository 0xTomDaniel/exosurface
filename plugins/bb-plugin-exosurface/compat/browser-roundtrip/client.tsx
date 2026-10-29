// Test-only BB-transport stand-in. All rendering/model/drafts/catalog/styles below are reused.
import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {A2uiSurface,MarkdownContext} from '@a2ui/react/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import {renderMarkdown} from '@a2ui/markdown-it';
import {WorkspaceView} from './legacy/src/workspace-view.ts';
import {exoReactCatalog} from './legacy/src/exo-components.tsx';
import {documentStyle} from './legacy/lib/document-style.ts';
import {exoTheme} from './legacy/lib/exo-theme.ts';
import {PageRendererAdapter} from './page-renderer-adapter.ts';
const markdown=renderMarkdown;
let changed=()=>{},send=(action:any)=>Promise.resolve();
const view=new WorkspaceView(action=>{void send(action);},()=>changed(),[basicCatalog,exoReactCatalog]);
const rpc=async(method:string,input:any)=>{
 const response=await fetch('/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({method,input})});
 const body=await response.json();if(!response.ok)throw Error(body.error);return body;
};
const adapter=new PageRendererAdapter(view,rpc,'primary');
const fixture={view,adapter,ready:false,error:'',pressComplete:false};
(window as any).__fixture=fixture;
function Page(){
 const[tick,setTick]=useState(0),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 changed=()=>setTick(n=>n+1);
 send=async action=>{setBusy(true);try{await adapter.press(action);fixture.pressComplete=true;}catch(e){fixture.error=String(e);setError(String(e));}finally{setBusy(false);}};
 useEffect(()=>{let stopped=false;const refresh=async()=>{try{await adapter.refresh();fixture.ready=true;}catch(e){fixture.error=String(e);if(!stopped)setError(String(e));}};void refresh();const timer=setInterval(()=>void refresh(),150);return()=>{stopped=true;clearInterval(timer);};},[]);
 // Same independent edit/press distinction as the existing UI; no hidden retry on failure.
 useEffect(()=>{if(busy||!view.drafts.edits.size)return;const timer=setTimeout(()=>void adapter.flush().catch(e=>{fixture.error=String(e);setError(String(e));}),100);return()=>clearTimeout(timer);},[tick,busy]);
 return <MarkdownContext.Provider value={markdown}><style>{documentStyle+exoTheme}</style>
  <main aria-label="Exosurface" className="exo-canvas"><div className="exo-frame">
   <div className="exo-topline"><h1>Exosurface</h1><p aria-label="Surface revision">Revision {view.committed?.revision??0}</p></div>
   <div inert={busy}>{[...view.processor.getSurfaces().keys()].map(id=><section className="exo-generated min-w-0" key={id}><A2uiSurface surface={view.processor.getSurfaces().get(id)!}/></section>)}</div>
   {error&&<p role="alert">{error}</p>}
  </div></main>
 </MarkdownContext.Provider>;
}
createRoot(document.getElementById('root')!).render(<Page/>);

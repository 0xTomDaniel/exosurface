import{Provider}from'../composition/provider.ts';import{acceptAtom,plan,previewDelta,type Atom}from'./planner.ts';import type{Snapshot,Delta}from'../src/workspace.ts';
export const OBS_RUN='exosurface-observer-run',MARKER='OBSERVER_SPIKE_SYNTHETIC:';
export type Route='sidecar'|'direct';
export type ObserverStatus={id:string;route:Route;surfaceId:string;phase:string;sourceChars:number;firstTextMs:number|null;sourceEndMs:number|null;firstPreviewMs:number|null;firstPreviewSourceChars:number|null;elapsedMs:number;error?:string;};
export class ObserverTurn{
 readonly start=performance.now();readonly controller=new AbortController();readonly provider:Provider;readonly history:any[]=[];readonly atoms=new Map<string,Atom>();readonly events:any[]=[];readonly status:ObserverStatus;
 private source='';private firstSource='';private early:Promise<void>|null=null;private chain=Promise.resolve();private failure:Error|null=null;private frameDiagnostic:unknown=null;private final=false;private draws=0;private bound=false;private lastUpdate=0;
 constructor(readonly input:{id:string;route:Route;surfaceId:string;base:Snapshot|null;signal:AbortSignal;fresh:()=>boolean;preview:(messages:any[])=>void;update:(s:ObserverStatus)=>void;provider?:Provider}){
  this.provider=input.provider??new Provider(this.start,undefined,undefined,8);this.status={id:input.id,route:input.route,surfaceId:input.surfaceId,phase:'Waiting for response',sourceChars:0,firstTextMs:null,sourceEndMs:null,firstPreviewMs:null,firstPreviewSourceChars:null,elapsedMs:0};this.update();
 }
 get signal(){return AbortSignal.any([this.input.signal,this.controller.signal]);}
 private check(){this.signal.throwIfAborted();if(!this.input.fresh())throw Error('Stale observer generation');}
 private update(){this.lastUpdate=performance.now();this.status.elapsedMs=Math.round(performance.now()-this.start);this.input.update({...this.status});}
 private fail(e:unknown){this.frameDiagnostic??=(e as any)?.observerFrame??null;this.failure??=e instanceof Error?e:Error('Observer failed');this.controller.abort();this.status.phase=this.input.route==='direct'?'Failed — inspect direct committed UI':'Failed — prior UI retained';this.status.error=this.failure.message;this.update();}
 cancel(){this.fail(Error('Observer cancelled; no automatic restart'));}
 append(delta:string){if(this.final||this.failure||this.bound)return;if(this.source.length+delta.length>18000){this.bound=true;this.fail(Error('Response exceeds observer 18000-character bound'));return;}this.source+=delta;this.status.sourceChars=this.source.length;this.status.firstTextMs??=Math.round(performance.now()-this.start);
  if(this.input.route==='sidecar'&&!this.early){const cuts=[...this.source.matchAll(/\n\s*\n/g)].map(m=>m.index!+m[0].length),cut=cuts.find(c=>c>=240);if(cut){this.firstSource=this.source.slice(0,cut);this.early=this.extract(this.firstSource,false).catch(e=>this.fail(e));}}
  if(performance.now()-this.lastUpdate>=250)this.update();
 }
 sourceComplete(){this.status.sourceEndMs=Math.round(performance.now()-this.start);this.update();}
 notePreview(){if(this.status.firstPreviewMs===null){this.status.firstPreviewMs=Math.round(performance.now()-this.start);this.status.firstPreviewSourceChars=this.source.length;this.events.push({event:'first-valid-preview',ms:this.status.firstPreviewMs,sourceChars:this.source.length,sourceEnded:this.status.sourceEndMs!==null});}this.update();}
 private draw(atoms:Atom[]){
  const task=this.chain.then(async()=>{this.check();if(++this.draws>3)throw Error('Observer composition budget exceeded');this.status.phase='Jev composing generic components';this.update();const p=await plan(atoms,this.provider,this.signal);this.check();const delta=previewDelta(this.input.base,this.history,atoms,p,this.input.surfaceId);this.input.preview(structuredClone(delta.messages));this.notePreview();this.events.push({event:'preview',ms:Math.round(performance.now()-this.start),atoms:atoms.length,types:p.types,parents:p.parents,positions:p.positions,sourceEnded:this.status.sourceEndMs!==null});this.status.phase='Live provisional UI';this.update();});this.chain=task;void task.catch(e=>this.fail(e));return task;
 }
 private async extract(source:string,final:boolean){
  this.check();this.status.phase=final?'Haiku reading completed response':'Haiku observing early response';this.update();this.events.push({event:'extract',ms:Math.round(performance.now()-this.start),chars:source.length,final});
  const batch=new Map<string,Atom>();let earlyDraw:Promise<void>|null=null;let earlySignature='';
  await this.provider.observe({response:source,final,previous:[...this.atoms.values()],capabilities:['observer_discuss: send current answers to the normal conversation; never execute domain operations']},this.signal,raw=>{
   this.check();const a=acceptAtom(raw,source);if(batch.has(a.id)||batch.size>=10)throw Error('Duplicate/excess semantic atom');batch.set(a.id,a);
   if(!final&&batch.size===3&&[...batch.values()].some(a=>a.kind==='content')&&![...batch.values()].some(a=>a.kind==='action')){earlySignature=JSON.stringify([...batch.values()]);earlyDraw=this.draw([...batch.values()]);}
  });
  this.check();if(!batch.size)throw Error('Observer returned no semantic atoms');for(const[id,a]of batch)this.atoms.set(id,a);if(this.atoms.size>12)throw Error('Accumulated atom budget exceeded');if(earlyDraw)await earlyDraw;
  const complete=[...this.atoms.values()];if(JSON.stringify(complete)!==earlySignature)await this.draw(complete);
 }
 async finish(outcome:'completed'|'aborted'|'error'){
  this.final=true;this.status.sourceEndMs??=Math.round(performance.now()-this.start);this.events.push({event:'source-end',ms:this.status.sourceEndMs,chars:this.source.length,outcome});
  let delta:Delta|undefined;
  try{if(outcome!=='completed')throw Error('Opus did not complete; discard observer preview');if(this.input.route==='sidecar'){if(this.early)await this.early;this.check();if(this.source!==this.firstSource)await this.extract(this.source,true);await this.chain;this.check();if(!this.history.length)throw Error('Observer produced no valid UI');delta={baseRevision:this.input.base?.revision??0,revision:(this.input.base?.revision??0)+1,messages:this.history};}else if(this.status.firstPreviewMs===null)throw Error('Direct route produced no validated A2UI preview');this.status.phase='Complete';}
  catch(e){this.fail(e);await Promise.allSettled([this.chain,...(this.early?[this.early]:[])]);}
  this.update();return{delta:this.failure?undefined:delta,status:{...this.status},events:this.events,atoms:[...this.atoms.values()],calls:this.provider.calls,frameDiagnostic:this.frameDiagnostic,sourceSha256:await import('node:crypto').then(c=>c.createHash('sha256').update(this.source).digest('hex')),sourceChars:this.source.length};
 }
}

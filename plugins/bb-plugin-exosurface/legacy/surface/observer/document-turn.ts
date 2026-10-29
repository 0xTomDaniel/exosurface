import{Provider}from'../composition/provider.ts';import{applyDelta,type Snapshot,type Delta}from'../src/workspace.ts';import{OBS_RUN,type Route,type ObserverStatus}from'./stream.ts';import{parseDocument,acceptHint,documentState,nodes,digest,type Document,type Hints}from'./document.ts';import{planDocument,compileDocument}from'./document-planner.ts';
export{OBS_RUN};
export class DocumentObserverTurn{
 readonly start=performance.now();readonly controller=new AbortController();readonly provider:Provider;readonly history:any[]=[];readonly events:any[]=[];readonly status:ObserverStatus;
 private source='';private firstSource='';private early:Promise<void>|null=null;private failure:Error|null=null;private frameDiagnostic:unknown=null;private final=false;private lastUpdate=0;private document:Document|null=null;private hints:Hints|null=null;
 constructor(readonly input:{id:string;route:Route;surfaceId:string;base:Snapshot|null;signal:AbortSignal;fresh:()=>boolean;preview:(messages:any[])=>void;update:(s:ObserverStatus)=>void;provider?:Provider}){this.provider=input.provider??new Provider(this.start,undefined,undefined,4);this.status={id:input.id,route:input.route,surfaceId:input.surfaceId,phase:'Waiting for response',sourceChars:0,firstTextMs:null,sourceEndMs:null,firstPreviewMs:null,firstPreviewSourceChars:null,elapsedMs:0};this.update();}
 get signal(){return AbortSignal.any([this.input.signal,this.controller.signal]);}
 private check(){this.signal.throwIfAborted();if(!this.input.fresh())throw Error('Stale observer generation');}
 private update(){this.lastUpdate=performance.now();this.status.elapsedMs=Math.round(performance.now()-this.start);this.input.update({...this.status});}
 private fail(e:unknown){this.frameDiagnostic??=(e as any)?.observerFrame??null;this.failure??=e instanceof Error?e:Error('Document observer failed');this.controller.abort();this.status.phase=this.input.route==='direct'?'Failed — inspect direct committed UI':'Failed — prior UI retained';this.status.error=this.failure.message;this.update();}
 cancel(){this.fail(Error('Observer cancelled; no automatic restart'));}
 append(delta:string,completedSnapshot=false){if(this.final)return;if(this.source.length+delta.length>18000){this.fail(Error('Response exceeds observer 18000-character bound'));return;}this.source+=delta;this.status.sourceChars=this.source.length;this.status.firstTextMs??=Math.round(performance.now()-this.start);
  if(this.failure){if(performance.now()-this.lastUpdate>=250)this.update();return;}
  if(!completedSnapshot&&this.input.route==='sidecar'&&!this.early){const cut=[...this.source.matchAll(/\n\s*\n/g)].map(m=>m.index!+m[0].length).find(c=>c>=600);if(cut){this.firstSource=this.source.slice(0,cut);this.early=this.compose(this.firstSource,false).catch(e=>this.fail(e));}}
  if(performance.now()-this.lastUpdate>=250)this.update();
 }
 sourceComplete(){this.status.sourceEndMs=Math.round(performance.now()-this.start);this.update();}
 notePreview(){if(this.status.firstPreviewMs===null){this.status.firstPreviewMs=Math.round(performance.now()-this.start);this.status.firstPreviewSourceChars=this.source.length;}this.update();}
 private async compose(source:string,final:boolean){
  this.check();const doc=parseDocument(source),hints:Hints={roles:{},inputs:[]};this.status.phase='Haiku interpreting source hierarchy — no summaries';this.update();
  await this.provider.observeDocument({...documentState(doc),final},this.signal,raw=>{this.check();acceptHint(raw,doc,hints);});this.check();
  if(nodes(doc).some(n=>n.kind==='section'&&!hints.roles[n.id]))throw Error('Document semantics omitted a section');
  this.status.phase='Jev composing source-preserving sections';this.update();const plan=await planDocument(doc,hints,this.provider,this.signal);this.check();
  const displayed=this.history.length?applyDelta(this.input.base,{baseRevision:this.input.base?.revision??0,revision:(this.input.base?.revision??0)+1,messages:this.history}):this.input.base;
  const delta=compileDocument(doc,hints,plan,this.input.base,displayed,this.input.surfaceId),messages=[...this.history,...delta.messages],next=applyDelta(this.input.base,{...delta,messages});if(next.incomplete)throw Error('Incomplete document composition');
  this.history.push(...delta.messages);this.document=doc;this.hints=hints;this.input.preview(structuredClone(messages));this.notePreview();this.events.push({event:'document-preview',ms:Math.round(performance.now()-this.start),final,sourceChars:source.length,sourceEnded:this.status.sourceEndMs!==null,plan});this.status.phase='Live provisional UI — original content retained';this.update();
 }
 async finish(outcome:'completed'|'aborted'|'error'){
  this.final=true;this.status.sourceEndMs??=Math.round(performance.now()-this.start);let delta:Delta|undefined;
  try{if(outcome!=='completed')throw Error('Opus did not complete; discard observer preview');if(this.input.route==='sidecar'){if(this.early)await this.early;this.check();if(this.source!==this.firstSource)await this.compose(this.source,true);this.check();if(!this.history.length)throw Error('Observer produced no valid UI');delta={baseRevision:this.input.base?.revision??0,revision:(this.input.base?.revision??0)+1,messages:this.history};}else if(this.status.firstPreviewMs===null)throw Error('Direct route produced no validated A2UI preview');this.status.phase='Complete';}
  catch(e){this.fail(e);if(this.early)await Promise.allSettled([this.early]);}
  this.update();const ns=this.document?nodes(this.document):[];return{delta:this.failure?undefined:delta,status:{...this.status},events:this.events,document:this.document,hints:this.hints,fidelity:this.document?{sourceSha256:this.document.sha256,sourceChars:this.document.chars,sections:ns.filter(n=>n.kind==='section'&&n.level>0).length,listItems:ns.reduce((n,b)=>n+(b.kind==='block'?b.listItems:0),0),losslessSourceCoverage:true}:null,calls:this.provider.calls,frameDiagnostic:this.frameDiagnostic,sourceSha256:digest(this.source),sourceChars:this.source.length};
 }
}

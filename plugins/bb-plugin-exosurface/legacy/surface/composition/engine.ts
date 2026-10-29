import {experimental_composeSpec,type Spec} from '@json-render/core';
import {catalog,fallbacks,mapSpec,validateOffer,type Offer} from './contract.ts';
import {Provider,type Mode,type Call} from './provider.ts';
import {applyDelta,moduleData,type Snapshot,type Delta} from '../src/workspace.ts';
export type CompositionRequest={runId:string;baseRevision:number;mode:Mode;prompt:string;resumeRunId?:string};
export type CompositionResult={delta:Delta;spec:Spec;copy:Record<string,string>;calls:Call[];elapsedMs:number;firstPreviewMs:number|null;firstCopyMs:number|null;stopReason:string};
// Exact complete candidates only; a new native offer invalidates an older generation.
export async function compose(input:{offer:Offer;current:Snapshot|null;context:unknown;request:CompositionRequest;signal:AbortSignal;fresh:()=>boolean;preview:(messages:any[])=>void;provider?:Provider;resume?:{spec:Spec;copy:Record<string,string>;received:string[]}}):Promise<CompositionResult>{
 const {current,context,request}=input,local=new AbortController(),signal=AbortSignal.any([input.signal,local.signal]),offer=validateOffer(input.offer),start=performance.now(),provider=input.provider??new Provider(start);
 if(request.baseRevision!==(current?.revision??0))throw Error('Stale composition base revision');
 let spec:Spec|null=input.resume?structuredClone(input.resume.spec):null,firstPreviewMs:number|null=null,firstCopyMs:number|null=null,stopReason=input.resume?'finish':'unavailable';
 const copy={...fallbacks(offer),...(current?moduleData(current,offer.surfaceId)?.copy??{}:{}),...(input.resume?.copy??{})},received=new Set<string>(input.resume?.received??[]),messages:any[]=[];
 const copyContext={conversation:context,presentationRequest:request.prompt};
 const check=()=>{signal.throwIfAborted();if(!input.fresh())throw Error('Stale composition generation');};
 const preview=()=>{
  check();if(!spec)return;
  // Renderer protocol is append-only within a preview, including copy data updates.
  const interim=messages.length?applyDelta(current,{baseRevision:request.baseRevision,revision:request.baseRevision+1,messages}):current;
  const d=mapSpec(offer,spec,copy,interim);messages.push(...d.messages);
  if(messages.length>32||Buffer.byteLength(JSON.stringify(messages))>24000)throw Error('Composition preview exceeds delta bound');
  applyDelta(current,{baseRevision:request.baseRevision,revision:request.baseRevision+1,messages});
  firstPreviewMs??=Math.round(performance.now()-start);input.preview(structuredClone(messages));
 };
 const put=(slot:string,text:string)=>{check();if(received.has(slot))throw Error('Duplicate copy slot');received.add(slot);copy[slot]=text;firstCopyMs??=Math.round(performance.now()-start);preview();};
 const missingOffer={...offer,slots:Object.fromEntries(Object.entries(offer.slots).filter(([k])=>!received.has(k)))};
 const copyTask=request.mode==='haiku-both'&&!input.resume?Promise.resolve():provider.copy(missingOffer,copyContext,signal,put);void copyTask.catch(()=>{});
 try{
  if(input.resume){mapSpec(offer,input.resume.spec,copy,current,true);preview();}
  else for await(const event of experimental_composeSpec({catalog,candidates:offer.candidates,prompt:request.prompt,context:{conversation:context,purpose:offer.purpose,required:offer.required},initialState:{...offer.data,copy},evaluate:provider.evaluator(request.mode,offer,copyContext,signal,put),signal,maxElements:16,maxSteps:2,maxDepth:6,instructions:{next:`Required semantic keys: ${offer.required.join(', ')}. Include each corresponding candidate. This is a synthetic presentation, never real execution authority.`}})){
   check();if(event.type==='step'){spec=event.spec;preview();}else{spec=event.spec;stopReason=event.stopReason;}
  }
  await copyTask;await provider.drain();check();
  if(!spec||stopReason!=='finish'||received.size!==Object.keys(offer.slots).length)throw Error('Incomplete composition or copy');
  mapSpec(offer,spec,copy,current,true); // Strict requirements before native admission.
  const interim=messages.length?applyDelta(current,{baseRevision:request.baseRevision,revision:request.baseRevision+1,messages}):current;
  const final=mapSpec(offer,spec,copy,interim,true);messages.push(...final.messages);
  const delta={baseRevision:request.baseRevision,revision:request.baseRevision+1,messages};applyDelta(current,delta);
  return {delta,spec,copy,calls:provider.calls,elapsedMs:Math.round(performance.now()-start),firstPreviewMs,firstCopyMs,stopReason};
 }catch(e){
  // Failed outputs remain diagnostic, never UI authority. No hidden retry/paid regeneration.
  local.abort();await Promise.allSettled([copyTask,...provider.tasks]);
  throw Object.assign(new Error(e instanceof Error?e.message:'Composition failed'),{partial:{spec,copy,stopReason,received:[...received],calls:provider.calls,elapsedMs:Math.round(performance.now()-start)}});
 }
}
export function syntheticConversation(branch:readonly any[]):{role:string;text:string}[]{
 const turns=branch.filter(e=>e.message&&['user','assistant'].includes(e.message.role)).map(e=>({role:e.message.role,text:(Array.isArray(e.message.content)?e.message.content:[]).filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('\n')}));
 let start=-1;for(let i=0;i<turns.length;i++)if(turns[i].role==='user'&&turns[i].text.startsWith('JEV_SPIKE_SYNTHETIC:'))start=i;
 if(start<0)throw Error('Explicit synthetic conversation marker required; earlier owner history is not benchmark input');
 // Intent, not the assistant's test-administration/debugging prose. Candidate
 // purpose/briefs carry the grounded content; the current request stays separate.
 return turns.slice(start).filter(t=>t.role==='user'&&t.text).slice(-3).map(t=>({...t,text:t.text.slice(0,600)}));
}

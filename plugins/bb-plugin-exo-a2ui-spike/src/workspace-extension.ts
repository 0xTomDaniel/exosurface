import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import {HOME,CANONICAL_HOME,save} from './state.ts';
import {DIRECT_TOOLS,cloneTools,requirePresentationExperiment,restoredObserverMode} from './generation-policy.ts';
import {CATALOG,PUBLICATION,UPDATE,RESET,COMPONENTS,moduleIds,latestSnapshot,validateSnapshot,applyDelta,type Snapshot,type Delta} from './workspace.ts';
import {StreamFrames} from './stream-frames.ts';
import {PRESENTATION_GUIDE} from './presentation-guide.ts';
import {describeDelta} from './canvas-memory.ts';
import {reduceCanvas,foldCanvas} from './canvas-doc.ts';
import {inputBindings,validateInput} from './workspace.ts';
import {PROMPT_SECTION,REMINDER_SECTION,REMINDER,PRESENTATION_HEADER,UPDATE_DESCRIPTION,UPDATE_SNIPPET,UPDATE_GUIDELINES,READ_DESCRIPTION} from './tool-contract.ts';
import {EXO_CATALOG} from './exo-catalog.ts';
import {OFFER,OFFER_ENTRY,COMMIT,RUN,validateOffer,recoverOffer,type Offer} from '../composition/contract.ts';
import {offerParameters} from '../composition/tool-schema.ts';
import {compose,syntheticConversation,type CompositionRequest} from '../composition/engine.ts';
import {OBS_MODE,nextObserver,observerSurface} from '../observer/mode.ts';
import {OBS_RUN,type Route,type ObserverStatus} from '../observer/stream.ts';
import {DocumentObserverTurn as ObserverTurn} from '../observer/document-turn.ts';
export const OMITTED='Canvas JSON kept out of conversation history; this call was applied. Always send complete A2UI messages in new calls.';
export default function workspace(pi:ExtensionAPI){
 if(process.env.EXO_A2UI_SPIKE!=='1'||process.env.OPTCHAT_HOME!==CANONICAL_HOME||!existsSync(join(HOME,'clone.json')))throw Error('Workspace extension requires explicitly cloned home; never main');
 let current:Snapshot|null=null,epoch=randomUUID(),updates:Delta[]=[];
 let offer:Offer|null=null,controller:AbortController|null=null,lastRun:any=null;
 let observerArm:{id:string;route:Route;surfaceId:string}|null=null,observerTurn:ObserverTurn|null=null,observerStatus:ObserverStatus|null=null,observerId:string|null=null;
 const cancelObserver=()=>{observerId=null;observerArm=null;observerTurn?.cancel();observerTurn=null;};
 const cancelComposition=()=>{controller?.abort();};
 const previewFile=join(HOME,'workspace','preview.json'),streams=new Map<string,StreamFrames>();
 const requireReadPreview=()=>readFileSync(previewFile,'utf8');
 const clearPreview=()=>{rmSync(previewFile,{force:true});streams.clear();};
 const materialize=(ctx:ExtensionContext)=>save(join(HOME,'workspace','latest.json'),{sessionId:ctx.sessionManager.getSessionId(),epoch,workspace:current,updates,presentation:{mode:'direct',activeTools:pi.getActiveTools()},observer:observerStatus?{...observerStatus,armed:!!observerArm,running:!!observerTurn}:null,composition:{configured:!!offer,surfaceId:offer?.surfaceId??null,candidateCount:offer?.candidates.length??0,running:!!controller,lastRun}});
 const restore=(ctx:ExtensionContext)=>{cancelObserver();observerStatus=null;cancelComposition();current=foldCanvas(ctx.sessionManager.getBranch());offer=null;lastRun=null;for(const e of ctx.sessionManager.getBranch()){const m=(e as any).message;if(m?.role==='toolResult'&&m.toolName===OFFER&&!m.isError)offer=validateOffer(m.details.offer);if(e.type==='custom'&&e.customType===OFFER_ENTRY)offer=validateOffer((e.data as any).offer);if(e.type==='custom'&&e.customType===RUN)lastRun=(e.data as any).summary;if(e.type==='custom'&&e.customType===OBS_MODE)observerArm=restoredObserverMode((e.data as any).mode);if(e.type==='custom'&&e.customType===OBS_RUN){observerStatus=(e.data as any).status??null;if(observerStatus&&!['Complete','Disarmed','Live UI enabled — chat normally'].includes(observerStatus.phase)&&!observerStatus.phase.startsWith('Failed'))observerStatus={...observerStatus,phase:'Interrupted — explicitly rearm to continue'};}}epoch=randomUUID();updates=[];clearPreview();materialize(ctx);};
 const allowed=()=>cloneTools(pi.getAllTools().map(t=>t.name));
 const tools=()=>pi.setActiveTools(allowed());
 pi.on('session_start',(_e,ctx)=>{restore(ctx);tools();materialize(ctx);});
 pi.on('session_tree',(_e,ctx)=>restore(ctx));
 pi.on('session_shutdown',()=>{cancelObserver();cancelComposition();clearPreview();});
 pi.registerCommand('workspace-observer-replay',{description:'Archived experiment: recompose exact paid native assistant source',handler:async(args,ctx)=>{requirePresentationExperiment();
  if(!ctx.isIdle()||controller||observerTurn)throw Error('Idle clone required');const r=JSON.parse(args),branch=ctx.sessionManager.getBranch();
  if(!/^[0-9a-f-]{36}$/.test(r.runId)||!Number.isInteger(r.baseRevision)||r.baseRevision!==(current?.revision??0)||!/^\w{1,80}$/.test(r.sourceEntryId)||!/^[0-9a-f]{64}$/.test(r.sourceSha256)||branch.some(e=>e.type==='custom'&&e.customType===OBS_RUN&&(e.data as any)?.status?.id===r.runId))throw Error('Invalid/stale/already attempted exact-source replay');
  const message=(branch.find(e=>e.id===r.sourceEntryId) as any)?.message;if(message?.role!=='assistant'||message.stopReason!=='stop')throw Error('Completed paid native assistant source required');
  const source=message.content.filter((c:any)=>c.type==='text').map((c:any)=>c.text).join('');if(createHash('sha256').update(source).digest('hex')!==r.sourceSha256)throw Error('Exact native source hash mismatch');
  const base=current,generation=epoch,surfaceId=observerSurface(current,observerArm?.surfaceId??offer?.surfaceId??'sightline_lab');observerId=r.runId;
  const turn=new ObserverTurn({id:r.runId,route:'sidecar',surfaceId,base,signal:AbortSignal.timeout(45000),fresh:()=>observerId===r.runId&&epoch===generation&&current===base,preview:messages=>save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:r.runId,baseRevision:r.baseRevision,messages}),update:s=>{observerStatus=s;materialize(ctx);}});observerTurn=turn;pi.appendEntry(OBS_RUN,{status:turn.status,sourceEntryId:r.sourceEntryId,sourceReplay:true});materialize(ctx);
  try{turn.append(source,true);turn.sourceComplete();const result=await turn.finish('completed');if(result.delta){if(!turn.input.fresh())throw Error('Stale replay admission');const next=applyDelta(current,result.delta);pi.appendEntry(COMMIT,{runId:r.runId,source:'lossless-document-replay',sourceEntryId:r.sourceEntryId,sourceSha256:r.sourceSha256,delta:result.delta});current=next;updates.push(result.delta);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();}observerStatus=result.status;pi.appendEntry(OBS_RUN,{...result,sourceEntryId:r.sourceEntryId,sourceReplay:true});}
  finally{observerTurn=null;observerId=null;clearPreview();materialize(ctx);}
 }});
 pi.registerCommand('workspace-observer-cancel',{description:'Cancel only the exact observer run; no queue clearing',handler:async(args)=>{const id=JSON.parse(args),turn=observerTurn;if(!turn||turn.status.id!==id)throw Error('Observer run changed');turn.cancel();}});
 pi.registerCommand('workspace-observer',{description:'Select continuous clone-local live UI route for ordinary chat, or turn it off',handler:async(args,ctx)=>{
  if(!ctx.isIdle()||controller||observerTurn)throw Error('Idle clone required');const r=JSON.parse(args);
  if(!/^[0-9a-f-]{36}$/.test(r.runId)||!['sidecar','direct','off'].includes(r.route)||r.baseRevision!==(current?.revision??0))throw Error('Invalid/stale observer arm');
  if(r.route!=='off')requirePresentationExperiment();
  const surfaceId=observerSurface(current,offer?.surfaceId??'sightline_lab');observerArm=r.route==='off'?null:{id:r.runId,route:r.route,surfaceId};
  observerStatus={id:r.runId,route:r.route==='off'?'sidecar':r.route,surfaceId,phase:r.route==='off'?'Disarmed':'Live UI enabled — chat normally',sourceChars:0,firstTextMs:null,sourceEndMs:null,firstPreviewMs:null,firstPreviewSourceChars:null,elapsedMs:0};
  pi.appendEntry(OBS_MODE,{mode:observerArm});pi.appendEntry(OBS_RUN,{status:observerStatus});materialize(ctx);ctx.ui.notify(r.route==='off'?'Live UI off.':`Live UI ${r.route} enabled for ordinary chat. No prefix or rearming needed.`,'info');
 }});
 pi.on('agent_before_settle',async(e)=>{
  if(!observerTurn||e.continue)return;const turn=observerTurn,result=await turn.finish(e.outcome);if(observerTurn!==turn)return;if(result.delta&&!turn.input.fresh()){result.delta=undefined;result.status.phase='Failed — prior UI retained';result.status.error='Stale final observer admission';}const entries:any[]=[...e.entries];
  if(result.delta){applyDelta(current,result.delta);entries.push({type:'custom',customType:COMMIT,data:{runId:turn.status.id,source:'generic-observer',delta:result.delta}});}
  entries.push({type:'custom',customType:OBS_RUN,data:result});return{entries};
 });
 pi.on('agent_settled',(_e,ctx)=>{
  if(!observerTurn)return;current=foldCanvas(ctx.sessionManager.getBranch());const last=ctx.sessionManager.getBranch().filter(e=>e.type==='custom'&&e.customType===OBS_RUN).at(-1) as any;observerStatus=last?.data?.status??observerStatus;if(observerStatus&&observerStatus.phase!=='Complete'&&!observerStatus.phase.startsWith('Failed'))observerStatus={...observerStatus,phase:'Failed — interrupted before final admission',error:'Opus stopped before the final observer boundary; no observer commit.'};observerTurn=null;observerId=null;updates=[];clearPreview();materialize(ctx);
 });
 pi.registerCommand('workspace-recover-offer',{description:'Archived experiment: recover exact paid candidate serialization',handler:async(args,ctx)=>{requirePresentationExperiment();
  if(!ctx.isIdle()||controller)throw Error('Idle clone required');const toolCallId=JSON.parse(args),recovered=recoverOffer(ctx.sessionManager.getBranch(),toolCallId);
  pi.appendEntry(OFFER_ENTRY,{offer:recovered,source:{toolCallId,recovery:'Parse only slots/data JSON-string fields from the failed native call; original paid records unchanged'}});offer=recovered;materialize(ctx);ctx.ui.notify('Recovered paid candidate contract; original failed tool evidence retained.','info');
 }});
 pi.registerCommand('workspace-compose',{description:'Archived experiment: native candidate composition',handler:async(args,ctx)=>{requirePresentationExperiment();
  if(!ctx.isIdle()||controller||!offer)throw Error('Idle configured clone required');
  const request:CompositionRequest=JSON.parse(args);
  if(!/^[0-9a-f-]{36}$/.test(request.runId)||!['jev','haiku','haiku-both'].includes(request.mode)||typeof request.prompt!=='string'||request.prompt.length>1600||request.baseRevision!==(current?.revision??0))throw Error('Invalid/stale composition request');
  if(ctx.sessionManager.getBranch().some(e=>e.type==='custom'&&e.customType===RUN&&(e.data as any)?.runId===request.runId))throw Error('Run already attempted; inspect retained native evidence before explicitly retrying');
  const context=syntheticConversation(ctx.sessionManager.getBranch()),base=current,generation=epoch,contract=offer,token=new AbortController();controller=token;
  let resume:any;
  if(request.resumeRunId){
   const entries=ctx.sessionManager.getBranch().filter(e=>e.type==='custom'&&e.customType===RUN).map(e=>(e as any).data),start=entries.find(e=>e.runId===request.resumeRunId&&e.summary?.status==='started'),failed=entries.find(e=>e.runId===request.resumeRunId&&e.summary?.status==='failed');
   if(!start||!failed?.partial?.spec||start.request.mode!==request.mode||start.request.prompt!==request.prompt||start.request.baseRevision!==request.baseRevision||JSON.stringify(start.context)!==JSON.stringify(context)||start.contractSha256!==createHash('sha256').update(JSON.stringify(contract)).digest('hex')||(failed.partial.stopReason!=='finish'&&!(request.mode==='jev'&&failed.error.startsWith('Provider did not complete bounded output')))){controller=null;throw Error('Exact completed composition with failed copy and unchanged native base/context/contract required');}
   resume={spec:failed.partial.spec,copy:failed.partial.copy,received:failed.partial.received};
  }
  pi.appendEntry(RUN,{runId:request.runId,summary:{id:request.runId,mode:request.mode,status:'started'},request,context,contractSha256:createHash('sha256').update(JSON.stringify(contract)).digest('hex')});materialize(ctx);
  try{
   const result=await compose({offer:contract,current:base,context,request,signal:token.signal,resume,fresh:()=>controller===token&&epoch===generation&&current===base&&offer===contract,preview:messages=>save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:request.runId,baseRevision:request.baseRevision,messages})});
   if(controller!==token||token.signal.aborted||epoch!==generation||current!==base||offer!==contract)throw Error('Obsolete composition result');
   const next=applyDelta(current,result.delta);
   pi.appendEntry(COMMIT,{runId:request.runId,delta:result.delta});current=next;updates.push(result.delta);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();
   lastRun={id:request.runId,mode:request.mode,status:'complete',elapsedMs:result.elapsedMs,calls:result.calls.length,costUsd:result.calls.every(c=>c.costUsd!==null)?result.calls.reduce((n,c)=>n+c.costUsd!,0):null};
   pi.appendEntry(RUN,{runId:request.runId,summary:lastRun,...result});ctx.ui.notify('Synthetic composition committed; no extra Exo model call.','info');
  }catch(e){token.abort();lastRun={id:request.runId,mode:request.mode,status:'failed'};pi.appendEntry(RUN,{runId:request.runId,summary:lastRun,error:e instanceof Error?e.message:'Composition failed',partial:(e as any)?.partial});ctx.ui.notify('Composition failed; previous committed UI retained. Native diagnostic preserved; no automatic retry.','error');}
  finally{if(controller===token)controller=null;if(existsSync(previewFile)&&JSON.parse(requireReadPreview()).toolCallId===request.runId)rmSync(previewFile,{force:true});materialize(ctx);}
 }});
 pi.registerTool({name:OFFER,label:'Offer atomic composition vocabulary',executionMode:'sequential',description:'Configure a synthetic, conversation-specific candidate vocabulary for the optional native Jev/Haiku composition lane. This is NOT a menu of prebuilt modules. Params: surfaceId,purpose,candidates:[{id,description,root:boolean,resource?:string,element:{type,props}}],slots:{slot:{brief,fallback}},data:{stringLeaf:string},required:[semantic keys]. Every props object has a unique stable key. Column/Row props:{key}; Text:{key,slot,variant:h1/h2/h3/body/caption}; TextField:{key,label,path:/knownStringLeaf}; Button:{key,label,event,context:{key:literal or {path:/knownStringLeaf}}}; Divider:{key}. Only Row/Column may root; competing roots share a resource. Atomic candidates only, no children/executable JS. Copy changes only declared Text slots. Required semantic keys enforce necessary information and controls. 3–16 candidates,12 slots,16KB. Do not alter existing agenda modules; choose a new synthetic surface if capacity permits.',parameters:offerParameters,execute:async(_id,args)=>{
  const next=validateOffer(args);return {content:[{type:'text',text:`Configured ${next.candidates.length} atomic candidates for ${next.surfaceId}; no layout/commit yet. Native composition can reuse the relevant synthetic conversation directly.`}],details:{offer:next}};
 }});
 pi.on('agent_settled',()=>clearPreview());
 pi.registerCommand('workspace-clear',{description:'Retire current synthetic workspace; preserve all native history',handler:async(_args,ctx)=>{
  if(!ctx.isIdle())throw Error('Idle cloned session required');
  current=reduceCanvas(current,{source:'reset',value:validateSnapshot({revision:(current?.revision??0)+1,messages:[]})});pi.appendEntry(RESET,{workspace:current});epoch=randomUUID();updates=[];clearPreview();materialize(ctx);ctx.ui.notify('Canvas cleared; native history preserved.','info');
 }});
 pi.on('before_agent_start',(e,ctx)=>{cancelComposition();
  const arm=nextObserver(restoredObserverMode(observerArm?{...observerArm,surfaceId:observerSurface(current,observerArm.surfaceId)}:null));
  if(arm){
   const generation=epoch,base=current;observerId=arm.id;
   observerTurn=new ObserverTurn({id:arm.id,route:arm.route,surfaceId:arm.surfaceId,base,signal:ctx.signal??new AbortController().signal,fresh:()=>observerId===arm.id&&epoch===generation&&current===base,preview:messages=>save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:arm.id,baseRevision:base?.revision??0,messages}),update:s=>{if(observerId===arm.id&&epoch===generation){observerStatus=s;materialize(ctx);}}});
   pi.appendEntry(OBS_RUN,{status:observerTurn.status,baseRevision:base?.revision??0});materialize(ctx);
   pi.setActiveTools(arm.route==='sidecar'?[]:[UPDATE]);
   if(arm.route==='sidecar')return{message:{customType:'observer-guide',display:false,content:'This is an explicitly fictional generative-UI experiment. Answer the user normally in readable prose, with useful explanations, alternatives and any questions you would naturally ask. A separate read-only observer derives presentation from your response. Do not describe or prepare UI components, intent packets, candidates, markup, tools or JSON. No real-world operations, tax/account changes or external actions. All input questions are hypothetical.'}};
   // Direct baseline retains the existing catalog/progressive framing below.
  }
  // Stable system-prompt section (recorded once, changed only if the guide changes);
  // never a per-turn transcript message. Tool contract travels with the tool.
  if(!observerTurn)tools();e.systemPromptOptions.sections[PROMPT_SECTION]=`${PRESENTATION_HEADER}\n${PRESENTATION_GUIDE}`;
  // Re-inserted last so the reminder sits at the end of the prompt (identical text: no new delta).
  delete e.systemPromptOptions.sections[REMINDER_SECTION];e.systemPromptOptions.sections[REMINDER_SECTION]=REMINDER;
 });
 pi.on('tool_call',e=>!(observerTurn?(observerTurn.status.route==='sidecar'?[]:[UPDATE]):allowed()).includes(e.toolName)?{block:true,reason:'Unrelated/legacy tool outside incremental clone trial'}:undefined);
 // Provider token stream is not tool execution. Preview only delimiter-complete,
 // validated message prefixes. No native write/action authority until tool result.
 pi.on('message_update',(e,ctx)=>{
  const event=e.assistantMessageEvent;if(event.type==='text_delta')observerTurn?.append(event.delta);if(event.type!=='toolcall_delta')return;
  const call=(event.partial.content as any[])[event.contentIndex];if(call?.type!=='toolCall'||call.name!==UPDATE)return;
  let parser=streams.get(call.id);if(!parser){if(streams.size>=4)return;parser=new StreamFrames();streams.set(call.id,parser);}
  try{const prefix=parser.append(event.delta);if(!prefix||prefix.baseRevision!==(current?.revision??0))return;
   applyDelta(current,{...prefix,revision:prefix.baseRevision+1});
   observerTurn?.notePreview();
   save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:call.id,...prefix});
  }catch{/* keep the last valid preview; an invalid/incomplete stream is never committed and the final tool validates */}
 });
 // Canvas layout never enters conversation history or OptChat memory. This extension loads before
 // OptChat, so OptChat logs (and later turns see) the replaced call: what was shown, not the JSON.
 // The full arguments run the tool from this stash and persist only in the tool result's details.
 const stash=new Map<string,any>();
 pi.on('message_end',e=>{
  const m:any=e.message;if(m.role!=='assistant'||!m.content?.some((c:any)=>c.type==='toolCall'&&c.name===UPDATE))return;
  const content=m.content.map((c:any)=>{if(c.type!=='toolCall'||c.name!==UPDATE||!Array.isArray(c.arguments?.messages)||c.arguments.messages[0]?.omitted)return c;stash.set(c.id,c.arguments);while(stash.size>16)stash.delete(stash.keys().next().value!);
   let after:Snapshot|null=null;try{after=applyDelta(current,{baseRevision:c.arguments.baseRevision,revision:c.arguments.baseRevision+1,messages:c.arguments.messages,...(c.arguments.layout?{layout:c.arguments.layout}:{})});}catch{}
   return {...c,arguments:{baseRevision:c.arguments.baseRevision,messages:[{omitted:OMITTED,shown:describeDelta(after,c.arguments.messages,c.arguments.layout)}]}};});
  return {message:{...m,content}};
 });
 pi.registerTool({name:UPDATE,label:'Apply incremental A2UI messages',executionMode:'sequential',description:UPDATE_DESCRIPTION,promptSnippet:UPDATE_SNIPPET,promptGuidelines:UPDATE_GUIDELINES,parameters:Type.Object({baseRevision:Type.Integer({minimum:0}),messages:Type.Array(Type.Any(),{minItems:1,maxItems:32}),layout:Type.Optional(Type.Object({focus:Type.Optional(Type.String()),beside:Type.Optional(Type.Array(Type.String(),{maxItems:2})),columns:Type.Optional(Type.Integer({minimum:1,maximum:3})),wide:Type.Optional(Type.Array(Type.String(),{maxItems:8}))}))}),execute:async(id,compact)=>{
  const args=stash.get(id)??compact;stash.delete(id);
  if(args.messages?.[0]?.omitted)throw Error('This call only repeats a history summary. Send the complete A2UI messages (createSurface/updateComponents/updateDataModel/deleteSurface).');
  if(observerTurn?.status.route==='direct'&&(args.layout||args.messages.some((m:any)=>(m.createSurface??m.updateComponents??m.updateDataModel??m.deleteSurface)?.surfaceId!==observerTurn!.status.surfaceId)))throw Error('Direct observer baseline may alter only its reserved synthetic surface; preserve outer layout');
  const delta:Delta={baseRevision:args.baseRevision,revision:args.baseRevision+1,messages:args.messages,...(args.layout?{layout:args.layout}:{})};
  let next:Snapshot;try{next=applyDelta(current,delta);}catch(error){pi.appendEntry('exosurface-failed-call',{toolCallId:id,args,error:String(error)});throw error;}
  return {content:[{type:'text',text:`Canvas updated: revision ${next.revision}${next.incomplete?', awaiting further definitions/data':''}.`}],details:{delta}};
 }});
 // Registered for branch history/reversal compatibility, never active in this trial.
 pi.registerTool({name:PUBLICATION,label:'Legacy workspace checkpoint',description:'Legacy full snapshot; not active in incremental trial.',parameters:Type.Object({baseRevision:Type.Integer(),messages:Type.Array(Type.Any())}),execute:async(_id,args)=>{current=validateSnapshot({revision:args.baseRevision+1,messages:args.messages});return {content:[{type:'text',text:'Legacy checkpoint'}],details:{workspace:current}};}});
 pi.registerTool({name:'read_workspace',label:'Read committed A2UI workspace',description:READ_DESCRIPTION,promptSnippet:'Read the exact committed Exosurface canvas.',parameters:Type.Object({surfaceId:Type.Optional(Type.String())}),execute:async(_id,args)=>{
  if(!current)return {content:[{type:'text',text:'No canvas yet (revision 0).'}],details:{revision:0}};
  const pick=args.surfaceId?{revision:current.revision,layout:current.layout,messages:current.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId===args.surfaceId)}:current;
  if(args.surfaceId&&!pick.messages.length)throw Error(`No surface ${args.surfaceId}`);
  return {content:[{type:'text',text:JSON.stringify(pick)}],details:{revision:current.revision}};
 }});
 // Owner-initiated edits (shared state): bound input values committed by code, no model turn.
 pi.registerCommand('workspace-data',{description:'Commit edited canvas input values (shared state); no model call',handler:async(args,ctx)=>{
  if(!ctx.isIdle()||!current)throw Error('Idle clone with a canvas required');const r=JSON.parse(args);
  if(r.revision!==current.revision)throw Error(`stale_revision ${current.revision}`);if(!/^[0-9a-f-]{36}$/.test(r.mutationId)||!Array.isArray(r.updates)||!r.updates.length||r.updates.length>16)throw Error('Invalid canvas edit');
  const bindings=inputBindings(current,r.surfaceId),messages=r.updates.map((u:any)=>{const n=bindings.get(u.path);if(!n)throw Error('Only offered inputs can be edited');return {version:'v0.9.1',updateDataModel:{surfaceId:r.surfaceId,path:u.path,value:validateInput(n,u.value)}};});
  const delta:Delta={baseRevision:current.revision,revision:current.revision+1,messages};const next=reduceCanvas(current,{source:r.source==='press'?'press':'edit',delta,mutationId:r.mutationId});
  pi.appendEntry(COMMIT,{source:r.source==='press'?'canvas-press':'canvas-edit',mutationId:r.mutationId,delta});current=next;updates.push(delta);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();materialize(ctx);
 }});
 pi.on('message_end',(e,ctx)=>{
  const m=e.message;if(m.role==='assistant'&&m.stopReason==='stop')observerTurn?.sourceComplete();if(m.role!=='toolResult')return;
  if(m.toolName===OFFER&&!m.isError){cancelComposition();offer=validateOffer((m.details as any).offer);materialize(ctx);}
  else if(m.toolName===UPDATE&&!m.isError){cancelComposition();const d=(m.details as {delta:Delta}).delta;current=reduceCanvas(current,{source:'agent',delta:d,toolCallId:m.toolCallId});updates.push(d);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();materialize(ctx);clearPreview();}
  else if(m.toolName===PUBLICATION&&!m.isError){current=validateSnapshot((m.details as {workspace:Snapshot}).workspace);epoch=randomUUID();updates=[];clearPreview();materialize(ctx);}
  else if(m.toolName===UPDATE)clearPreview();
 });
 // Per-request canvas outline and its receipt live in workspace-frame.ts, loaded AFTER OptChat,
 // because OptChat builds the final request in context_with_system.

}

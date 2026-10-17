import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,rmSync,readFileSync} from 'node:fs';
import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {Type} from 'typebox';
import {HOME,CANONICAL_HOME,save} from './state.ts';
import {DIRECT_TOOLS,cloneTools,requirePresentationExperiment,restoredObserverMode} from './generation-policy.ts';
import {CATALOG,PUBLICATION,UPDATE,RESET,COMPONENTS,moduleIds,latestSnapshot,validateSnapshot,applyDelta,type Snapshot,type Delta} from './workspace.ts';
import {StreamFrames,SnapshotStream} from './stream-frames.ts';
import {changeMessages,surfaceSnapshot,type Edit} from './snapshot-format.ts';
import {describeEdits} from './canvas-memory.ts';
import {versionsOf,replayHistory,archived,versionAt,versionSnapshot,retirement,type Version,type Action} from './canvas-history.ts';
import {writeFileSync,renameSync} from 'node:fs';
import {PRESENTATION_GUIDE_SNAPSHOT} from './presentation-guide.ts';
import {describeDelta} from './canvas-memory.ts';
import {reduceCanvas,foldCanvas} from './canvas-doc.ts';
import {inputBindings,validateInput} from './workspace.ts';
import {PROMPT_SECTION,REMINDER_SECTION,REMINDER,PRESENTATION_HEADER,UPDATE_DESCRIPTION,UPDATE_SNIPPET,UPDATE_GUIDELINES,READ_DESCRIPTION,SURFACE_UPDATE,SURFACE_READ,SURFACE_SNIPPET,SURFACE_DESCRIPTION,SURFACE_GUIDELINES,SURFACE_READ_DESCRIPTION} from './tool-contract.ts';
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
 let current:Snapshot|null=null,epoch=randomUUID(),updates:Delta[]=[],versions:Version[]=[];
 // Every surface version, derived from the native session; read by the BB server for chat cards and rewinds.
 const historyFile=join(HOME,'workspace','history.jsonl');
 const writeHistory=()=>{mkdirSync(join(HOME,'workspace'),{recursive:true,mode:0o700});writeFileSync(historyFile+'.tmp',versions.map(v=>JSON.stringify(v)).join('\n')+(versions.length?'\n':''),{mode:0o600});renameSync(historyFile+'.tmp',historyFile);};
 const remember=(vs:Version[])=>{if(!vs.length)return;versions.push(...vs);appendFileSync(historyFile,vs.map(v=>JSON.stringify(v)).join('\n')+'\n',{mode:0o600});};
 const live=()=>current?moduleIds(current):[];
 const fromHistory=(sid:string)=>{const v=archived(versions,live()).find(x=>x.surface===sid);return v?versionSnapshot(v):null;};
 let offer:Offer|null=null,controller:AbortController|null=null,lastRun:any=null;
 let observerArm:{id:string;route:Route;surfaceId:string}|null=null,observerTurn:ObserverTurn|null=null,observerStatus:ObserverStatus|null=null,observerId:string|null=null;
 const cancelObserver=()=>{observerId=null;observerArm=null;observerTurn?.cancel();observerTurn=null;};
 const cancelComposition=()=>{controller?.abort();};
 const previewFile=join(HOME,'workspace','preview.json'),streams=new Map<string,StreamFrames|SnapshotStream>();
 const requireReadPreview=()=>readFileSync(previewFile,'utf8');
 const clearPreview=()=>{rmSync(previewFile,{force:true});streams.clear();};
 const materialize=(ctx:ExtensionContext)=>save(join(HOME,'workspace','latest.json'),{sessionId:ctx.sessionManager.getSessionId(),epoch,workspace:current,earlier:(()=>{const a=archived(versions,live());return {count:a.length,recent:a.slice(0,8).map(v=>({surface:v.surface,title:v.title}))};})(),updates,presentation:{mode:'direct',activeTools:pi.getActiveTools()},observer:observerStatus?{...observerStatus,armed:!!observerArm,running:!!observerTurn}:null,composition:{configured:!!offer,surfaceId:offer?.surfaceId??null,candidateCount:offer?.candidates.length??0,running:!!controller,lastRun}});
 const restore=(ctx:ExtensionContext)=>{cancelObserver();observerStatus=null;cancelComposition();{const h=replayHistory(ctx.sessionManager.getBranch());current=h.current;versions=h.versions;writeHistory();}offer=null;lastRun=null;for(const e of ctx.sessionManager.getBranch()){const m=(e as any).message;if(m?.role==='toolResult'&&m.toolName===OFFER&&!m.isError)offer=validateOffer(m.details.offer);if(e.type==='custom'&&e.customType===OFFER_ENTRY)offer=validateOffer((e.data as any).offer);if(e.type==='custom'&&e.customType===RUN)lastRun=(e.data as any).summary;if(e.type==='custom'&&e.customType===OBS_MODE)observerArm=restoredObserverMode((e.data as any).mode);if(e.type==='custom'&&e.customType===OBS_RUN){observerStatus=(e.data as any).status??null;if(observerStatus&&!['Complete','Disarmed','Live UI enabled — chat normally'].includes(observerStatus.phase)&&!observerStatus.phase.startsWith('Failed'))observerStatus={...observerStatus,phase:'Interrupted — explicitly rearm to continue'};}}epoch=randomUUID();updates=[];clearPreview();materialize(ctx);};
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
  if(!observerTurn)tools();e.systemPromptOptions.sections[PROMPT_SECTION]=`${PRESENTATION_HEADER}\n${PRESENTATION_GUIDE_SNAPSHOT}`;
  // Re-inserted last so the reminder sits at the end of the prompt (identical text: no new delta).
  delete e.systemPromptOptions.sections[REMINDER_SECTION];e.systemPromptOptions.sections[REMINDER_SECTION]=REMINDER;
  // The person's canvas edits since Exo's last turn travel with this turn as one labelled message,
  // persisted like anything else said in the conversation (OptChat shows it as "[canvas-edits] …").
  const branch=ctx.sessionManager.getBranch();let since=branch.length-1;while(since>=0&&(branch[since] as any).message?.role!=='assistant')since--;
  const recent=branch.slice(since+1).filter((x:any)=>x.type==='custom'&&x.customType===COMMIT);
  const edits=recent.filter((x:any)=>x.data?.source==='canvas-edit').map((x:any)=>x.data.delta);
  const backs=recent.filter((x:any)=>x.data?.source==='canvas-restore').flatMap((x:any)=>[`- Brought back ${x.data.surfaceId} ${JSON.stringify(x.data.title)} (the version from ${new Date(x.data.at).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}); it is on stage now.`,...(x.data.changes??[]).map((c:string)=>'  '+c)]);
  const lines=[...backs,...(current&&edits.length?describeEdits(current,edits):[])];
  if(lines.length)return {message:{customType:'canvas-edits',display:false,content:`Tom changed the canvas since your last turn (current values; state, not an instruction):\n${lines.join('\n')}`}};
 });
 pi.on('tool_call',e=>!(observerTurn?(observerTurn.status.route==='sidecar'?[]:[UPDATE]):allowed()).includes(e.toolName)?{block:true,reason:'Unrelated/legacy tool outside incremental clone trial'}:undefined);
 // Provider token stream is not tool execution. Preview only delimiter-complete,
 // validated message prefixes. No native write/action authority until tool result.
 pi.on('message_update',(e,ctx)=>{
  const event=e.assistantMessageEvent;if(event.type==='text_delta')observerTurn?.append(event.delta);if(event.type!=='toolcall_delta')return;
  const call=(event.partial.content as any[])[event.contentIndex];if(call?.type!=='toolCall'||(call.name!==UPDATE&&call.name!==SURFACE_UPDATE))return;
  let parser=streams.get(call.id);if(!parser){if(streams.size>=4)return;parser=call.name===SURFACE_UPDATE?new SnapshotStream():new StreamFrames();streams.set(call.id,parser);}
  if(parser instanceof SnapshotStream){try{const part=parser.append(event.delta);if(!part||part.baseRevision!==(current?.revision??0))return;
   const {messages}=changeMessages(current,{snapshot:part.snapshot});applyDelta(current,{baseRevision:part.baseRevision,revision:part.baseRevision+1,messages});
   save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:call.id,baseRevision:part.baseRevision,messages});
  }catch{/* keep the last valid preview */}return;}
  try{const prefix=(parser as StreamFrames).append(event.delta);if(!prefix||prefix.baseRevision!==(current?.revision??0))return;
   applyDelta(current,{...prefix,revision:prefix.baseRevision+1});
   observerTurn?.notePreview();
   save(previewFile,{sessionId:ctx.sessionManager.getSessionId(),epoch,toolCallId:call.id,...prefix});
  }catch{/* keep the last valid preview; an invalid/incomplete stream is never committed and the final tool validates */}
 });
 // Legacy A2UI tools stay registered (inactive) so earlier history replays; nothing in history is rewritten.
 pi.registerTool({name:UPDATE,label:'Apply incremental A2UI messages',executionMode:'sequential',description:UPDATE_DESCRIPTION,promptSnippet:UPDATE_SNIPPET,promptGuidelines:UPDATE_GUIDELINES,parameters:Type.Object({baseRevision:Type.Integer({minimum:0}),messages:Type.Array(Type.Any(),{minItems:1,maxItems:32}),layout:Type.Optional(Type.Object({focus:Type.Optional(Type.String()),beside:Type.Optional(Type.Array(Type.String(),{maxItems:2})),columns:Type.Optional(Type.Integer({minimum:1,maximum:3})),wide:Type.Optional(Type.Array(Type.String(),{maxItems:8}))}))}),execute:async(id,args)=>{
  if(args.messages?.[0]?.omitted)throw Error('This call only repeats a history summary. Send the complete A2UI messages (createSurface/updateComponents/updateDataModel/deleteSurface).');
  if(observerTurn?.status.route==='direct'&&(args.layout||args.messages.some((m:any)=>(m.createSurface??m.updateComponents??m.updateDataModel??m.deleteSurface)?.surfaceId!==observerTurn!.status.surfaceId)))throw Error('Direct observer baseline may alter only its reserved synthetic surface; preserve outer layout');
  const delta:Delta={baseRevision:args.baseRevision,revision:args.baseRevision+1,messages:args.messages,...(args.layout?{layout:args.layout}:{})};
  let next:Snapshot;try{next=applyDelta(current,delta);}catch(error){pi.appendEntry('exosurface-failed-call',{toolCallId:id,args,error:String(error)});throw error;}
  return {content:[{type:'text',text:`Canvas updated: revision ${next.revision}${next.incomplete?', awaiting further definitions/data':''}.`}],details:{delta}};
 }});
 // Registered for branch history/reversal compatibility, never active in this trial.
 pi.registerTool({name:PUBLICATION,label:'Legacy workspace checkpoint',description:'Legacy full snapshot; not active in incremental trial.',parameters:Type.Object({baseRevision:Type.Integer(),messages:Type.Array(Type.Any())}),execute:async(_id,args)=>{current=validateSnapshot({revision:args.baseRevision+1,messages:args.messages});return {content:[{type:'text',text:'Legacy checkpoint'}],details:{workspace:current}};}});
 pi.registerTool({name:SURFACE_UPDATE,label:'Update the Exosurface canvas',executionMode:'sequential',description:SURFACE_DESCRIPTION,promptSnippet:SURFACE_SNIPPET,promptGuidelines:SURFACE_GUIDELINES,
  parameters:Type.Object({baseRevision:Type.Integer({minimum:0}),snapshot:Type.Optional(Type.String({maxLength:40000})),
   edits:Type.Optional(Type.Array(Type.Object({surface:Type.String(),ref:Type.String(),op:Type.Union([Type.Literal('replace'),Type.Literal('insertAfter'),Type.Literal('insertInto'),Type.Literal('remove')]),lines:Type.Optional(Type.String({maxLength:20000}))}),{maxItems:24})),
   delete:Type.Optional(Type.Array(Type.String(),{maxItems:8})),focus:Type.Optional(Type.String()),beside:Type.Optional(Type.Array(Type.String(),{maxItems:2}))}),
  execute:async(id,args)=>{
   try{
    if(args.baseRevision!==(current?.revision??0))throw Error(`stale baseRevision ${args.baseRevision}; the canvas is at revision ${current?.revision??0} (see the outline)`);
    const change=changeMessages(current,{snapshot:args.snapshot,edits:args.edits as Edit[]|undefined,delete:args.delete},fromHistory);
    const keep=(xs:string[]|undefined)=>xs?.filter(x=>!change.deleted.includes(x));
    // Drawing moves the stage by default; edits and deletes leave it where it is.
    const layout=args.focus||args.beside?{...(args.focus?{focus:args.focus}:{}),...(args.beside?{beside:args.beside}:{})}:!change.drawn.length&&current?.layout?{...(keep(current.layout.focus?[current.layout.focus]:undefined)?.length?{focus:current.layout.focus}:{}),...(current.layout.beside?{beside:keep(current.layout.beside)}:{})}:undefined;
    // The system keeps the live canvas small: older surfaces retire into history (never deleted, never the agent's job).
    const {messages,retired}=retirement(current,change.messages,layout,[...change.drawn,...change.edited,...(args.focus?[args.focus]:[]),...(args.beside??[])]);
    const delta:Delta={baseRevision:args.baseRevision,revision:args.baseRevision+1,messages,...(layout?{layout}:{})};
    const next=applyDelta(current,delta),focus=next.layout?.focus??moduleIds(next).at(-1);
    const cards=[...change.drawn.map(surface=>({surface,action:'drew' as Action,revision:next.revision})),...change.edited.map(surface=>({surface,action:'edited' as Action,revision:next.revision}))];
    const said=[change.drawn.length&&`drew ${change.drawn.join(', ')}`,change.edited.length&&`edited ${change.edited.join(', ')}`,change.deleted.length&&`deleted ${change.deleted.join(', ')}`].filter(Boolean).join('; ');
    return {content:[{type:'text',text:`Canvas revision ${next.revision}: ${said}.${focus?` On stage: ${focus}.`:''}`}],details:{delta,revision:next.revision,cards,retired}};
   }catch(error){
    // Validator errors come back as plain words, never raw schema JSON (which misled the model into cutting content).
    const issues=(error as any)?.issues as {path:(string|number)[];message:string}[]|undefined;
    const said=issues?`Canvas rejected: ${issues.slice(0,3).map(i=>`${i.path.join('.')||'canvas'}: ${i.message}`).join('; ')}`:String((error as Error)?.message??error);
    pi.appendEntry('exosurface-failed-call',{toolCallId:id,tool:SURFACE_UPDATE,error:said});throw Error(said);
   }
 }});
 pi.registerTool({name:SURFACE_READ,label:'Read the Exosurface canvas',description:SURFACE_READ_DESCRIPTION,promptSnippet:'Read a canvas surface in full (snapshot format).',parameters:Type.Object({surface:Type.Optional(Type.String())}),execute:async(_id,args)=>{
  if(!current||!moduleIds(current).length)return {content:[{type:'text',text:`Empty canvas (revision ${current?.revision??0}).`}],details:{revision:current?.revision??0}};
  if(args.surface&&!moduleIds(current).includes(args.surface)){const old=fromHistory(args.surface);if(!old)throw Error(`No surface ${args.surface} on the canvas or in its history`);
   return {content:[{type:'text',text:`From history (not on the canvas now; editing or redrawing it brings it back):\n`+surfaceSnapshot(old,args.surface)}],details:{revision:current.revision}};}
  const ids=args.surface?[args.surface]:moduleIds(current);
  return {content:[{type:'text',text:`Revision ${current.revision}.\n`+ids.map(i=>surfaceSnapshot(current!,i)).join('\n')}],details:{revision:current.revision}};
 }});
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
  pi.appendEntry(COMMIT,{source:r.source==='press'?'canvas-press':'canvas-edit',mutationId:r.mutationId,delta});remember(versionsOf(current,next,delta,r.source==='press'?'press':'edit',new Date().toISOString()));current=next;updates.push(delta);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();materialize(ctx);
 }});
 // Bring back an earlier surface version (the person edited it or pressed one of its buttons): code commits
 // it as the current version on stage, with their edits; Exo hears about it with the next turn.
 pi.registerCommand('workspace-restore',{description:'Bring back an earlier surface version as current (shared state); no model call',handler:async(args,ctx)=>{
  if(!ctx.isIdle())throw Error('Idle clone required');const r=JSON.parse(args);
  if(!/^[0-9a-f-]{36}$/.test(r.mutationId)||typeof r.surfaceId!=='string'||!Number.isInteger(r.revision)||!Array.isArray(r.updates)||r.updates.length>16)throw Error('Invalid bring-back');
  const v=versionAt(versions,r.surfaceId,r.revision);if(!v)throw Error(`No version of ${r.surfaceId} at revision ${r.revision}`);
  const old=versionSnapshot(v),bindings=inputBindings(old,r.surfaceId);
  const data=structuredClone(old.messages.find(m=>m.updateDataModel)?.updateDataModel.value??{});
  for(const u of r.updates){const n=bindings.get(u.path);if(!n)throw Error('Only offered inputs can be edited');const keys=String(u.path).split('/').slice(1);let o:any=data;keys.slice(0,-1).forEach(k=>{o[k]??={};o=o[k];});o[keys.at(-1)!]=validateInput(n,u.value);}
  const body=old.messages.filter(m=>m.createSurface||m.updateComponents);
  const msgs=[...(live().includes(r.surfaceId)?[{version:'v0.9.1',deleteSurface:{surfaceId:r.surfaceId}}]:[]),...body,{version:'v0.9.1',updateDataModel:{surfaceId:r.surfaceId,path:'/',value:data}}];
  const layout={focus:r.surfaceId,...(current?.layout?.beside?{beside:current.layout.beside.filter(b=>b!==r.surfaceId)}:{})};
  const {messages,retired}=retirement(current,msgs,layout,[r.surfaceId]);
  const delta:Delta={baseRevision:current?.revision??0,revision:(current?.revision??0)+1,messages,layout};const next=applyDelta(current,delta);
  const changes=describeEdits(next,r.updates.length?[{messages:r.updates.map((u:any)=>({updateDataModel:{surfaceId:r.surfaceId,path:u.path,value:u.value}}))}]:[]);
  pi.appendEntry(COMMIT,{source:'canvas-restore',mutationId:r.mutationId,surfaceId:r.surfaceId,fromRevision:v.revision,at:v.at,title:v.title,changes,retired,delta});
  remember(versionsOf(current,next,delta,'restore',new Date().toISOString(),undefined,retired));current=next;updates.push(delta);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();materialize(ctx);
 }});
 pi.on('message_end',(e,ctx)=>{
  const m=e.message;if(m.role==='assistant'&&m.stopReason==='stop')observerTurn?.sourceComplete();if(m.role!=='toolResult')return;
  if(m.toolName===OFFER&&!m.isError){cancelComposition();offer=validateOffer((m.details as any).offer);materialize(ctx);}
  else if((m.toolName===UPDATE||m.toolName===SURFACE_UPDATE)&&!m.isError){cancelComposition();const d=(m.details as {delta:Delta}).delta,prev=current;current=reduceCanvas(current,{source:'agent',delta:d,toolCallId:m.toolCallId});remember(versionsOf(prev,current,d,'agent',new Date().toISOString(),(m.details as any).cards,(m.details as any).retired??[]));updates.push(d);while(updates.length>128||JSON.stringify(updates).length>512*1024)updates.shift();materialize(ctx);clearPreview();}
  else if(m.toolName===PUBLICATION&&!m.isError){current=validateSnapshot((m.details as {workspace:Snapshot}).workspace);epoch=randomUUID();updates=[];clearPreview();materialize(ctx);}
  else if(m.toolName===UPDATE||m.toolName===SURFACE_UPDATE)clearPreview();
 });
 // Per-request canvas outline and its receipt live in workspace-frame.ts, loaded AFTER OptChat,
 // because OptChat builds the final request in context_with_system.

}

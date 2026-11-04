import {planData,planRestore} from './src/canvas-input.ts';
import {validatePrompt} from '../../src/input.ts';
import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { existsSync, watch, readFileSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { mkdirSync } from 'node:fs';
import { load, CANONICAL_MODEL, CLONE_HOME } from './src/state.ts';
import { CATALOG, actionSchema, validateAction, validateSnapshot, deltaSchema } from './src/workspace.ts';
import { describePress, boundUpdates } from './src/canvas-memory.ts';
import { canvasDataViaOwner, restoreViaOwner } from './src/canvas-client.ts';
import { versionAt, versionSnapshot, type Version } from './src/canvas-history.ts';
import {local} from './src/local-config.ts';
import { randomUUID } from 'node:crypto';
import {cursorSchema,previewSchema,deliverySchema,delivery,type Delivery} from './src/delivery.ts';
import {composeViaOwner} from './composition/client.ts';
import {armViaOwner} from './observer/client.ts';
import {isBoundThread,threadPagesHome} from '../primary/src/state.ts';
const observerSchema=z.object({id:z.string(),route:z.enum(['sidecar','direct']),surfaceId:z.string(),phase:z.string(),sourceChars:z.number(),firstTextMs:z.number().nullable(),sourceEndMs:z.number().nullable(),firstPreviewMs:z.number().nullable(),firstPreviewSourceChars:z.number().nullable(),elapsedMs:z.number(),error:z.string().optional(),armed:z.boolean(),running:z.boolean()});
const compositionSchema=z.object({configured:z.boolean(),surfaceId:z.string().nullable(),candidateCount:z.number(),running:z.boolean(),lastRun:z.object({id:z.string(),mode:z.string(),status:z.string(),elapsedMs:z.number().optional(),calls:z.number().optional(),costUsd:z.number().nullable().optional()}).nullable()});
const statusSchema=z.object({threadId:z.string().nullable(),ready:z.boolean(),streaming:z.boolean(),revision:z.number(),delivery:deliverySchema,composition:compositionSchema,observer:observerSchema.nullable()});
const eventSchema=z.object({version:z.literal('v0.9.1'),action:actionSchema}).strict();
const versionRef=z.object({surface:z.string().max(80),revision:z.number().int().nonnegative()}).strict();
const pendingSchema=z.object({deployment:z.enum(['clone','main']).default('clone'),threadId:z.string(),surface:z.string(),revision:z.number().int(),title:z.string(),at:z.string(),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).max(16)}).strict();
// Two deployments of the same surface: the isolated clone and the primary Exo session. Each has its own state folder
// (written by the Exosurface Pi extensions running in that session), owner, BB thread and provider. Requests are routed
// by thread; nothing is shared between them.
type Deployment={name:'clone'|'main';home:string;providerId:string;panel:string;channel:string;threadId?:string};
const DEPLOYMENTS:Deployment[]=[
  {name:'clone',home:CLONE_HOME,providerId:'exo-a2ui-spike',panel:'workspace',channel:'workspace'},
  {name:'main',home:local('primaryStateDir')||join(homedir(),'.exo-bb-spike'),providerId:'exo-spike',panel:'surface',channel:'surface-main'},
];
const byName=(name:string)=>DEPLOYMENTS.find(d=>d.name===name)!;
// A bound thread (a surface other than Home, #68): the main deployment on that thread's own pages folder; its owner and
// bindings stay in the main home.
const boundDeployment=(threadId:string):Deployment|null=>{try{return isBoundThread(threadId)?{name:'main',home:threadPagesHome(threadId),providerId:'exo-spike',panel:'surface',channel:'surface-thread',threadId}:null;}catch{return null;}};
const ownerHome=(d:Deployment)=>d.threadId?byName('main').home:d.home;
const threadOf=(d:Deployment):string|null=>{if(d.threadId)return d.threadId;const f=join(d.home,'canonical-thread.json');return existsSync(f)?load(f).threadId:null;};
const deploymentFor=(threadId:string)=>{const d=DEPLOYMENTS.find(x=>threadOf(x)===threadId)??boundDeployment(threadId);if(!d)throw Error('Not an Exosurface thread');return d;};
// Page versions, written by the extension from the native session (derived, rebuildable).
const history=(d:Deployment):Version[]=>{const f=join(d.home,'workspace/history.jsonl');return existsSync(f)?readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];};
// A pending bring-back: the person opened an earlier version (and maybe edited it); committed with their next message or press.
const pendingFile=(d:Deployment)=>join(d.home,'workspace/pending-restore.json');
const readPending=(d:Deployment):z.infer<typeof pendingSchema>|null=>{try{return existsSync(pendingFile(d))?pendingSchema.parse(JSON.parse(readFileSync(pendingFile(d),'utf8'))):null;}catch{return null;}};
export const rpcContract=defineRpcContract({
  workspace:{input:z.object({deployment:z.enum(['clone','main']),threadId:z.string().optional(),cursor:cursorSchema.nullable()}).strict(),output:statusSchema},
  compose:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),mode:z.enum(['jev','haiku','haiku-both']),prompt:z.string().min(1).max(1600),resumeRunId:z.string().uuid().optional()}).strict(),output:z.object({completed:z.boolean()})},
  observerArm:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),route:z.enum(['sidecar','direct','off'])}).strict(),output:z.object({armed:z.boolean()})},
  edit:{input:z.object({threadId:z.string(),revision:z.number().int().nonnegative(),surfaceId:z.string().max(80),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).min(1).max(16),mutationId:z.string().uuid()}).strict(),output:z.object({revision:z.number()})},
  surfaceAt:{input:z.object({threadId:z.string()}).merge(versionRef).strict(),output:z.object({surface:z.string(),revision:z.number(),title:z.string(),at:z.string(),action:z.string(),current:z.boolean(),onStage:z.boolean(),panel:z.string(),snapshot:z.any()})},
  pending:{input:z.object({threadId:z.string(),op:z.enum(['get','set','clear']),version:versionRef.optional(),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).max(16).optional()}).strict(),output:pendingSchema.nullable()},
  action:{input:z.object({threadId:z.string(),revision:z.number().int(),rewind:versionRef.optional(),event:eventSchema,actionId:z.string().uuid(),metadata:z.object({a2uiClientCapabilities:z.object({'v0.9.1':z.object({supportedCatalogIds:z.array(z.string())})})})}),output:z.object({accepted:z.boolean()})},
});
export default function plugin(bb:BbPluginApi, registerRpc = bb.rpc.register.bind(bb.rpc)){
  const status=(d:Deployment)=>{
    const ownerFile=join(d.home,'owner/state.json'),wsFile=join(d.home,'workspace/latest.json');
    const id=threadOf(d),owner=existsSync(ownerFile)?load(ownerFile):null;
    const projection=existsSync(wsFile)?load(wsFile):null;
    // The projection must belong to the session this deployment's owner runs.
    const ofSession=(sessionId:unknown)=>typeof sessionId==='string'&&!!owner?.sessionFile&&String(owner.sessionFile).includes(sessionId);
    if(projection && !ofSession(projection.sessionId))throw new Error('Surface projection belongs to another session');
    const workspace=projection?.workspace?validateSnapshot(projection.workspace):null;
    const epoch=projection?.epoch??'legacy',updates=(projection?.updates??[]).map((x:unknown)=>deltaSchema.parse(x));
    const previewFile=join(d.home,'workspace','preview.json'),rawPreview=existsSync(previewFile)?load(previewFile):null;
    const preview=ofSession(rawPreview?.sessionId)&&rawPreview.epoch===epoch&&rawPreview.baseRevision===(workspace?.revision??0)?previewSchema.parse({toolCallId:rawPreview.toolCallId,baseRevision:rawPreview.baseRevision,messages:rawPreview.messages}):null;
    const observer=observerSchema.nullable().parse(projection?.observer??null);
    const composition=compositionSchema.parse(projection?.composition??{configured:false,surfaceId:null,candidateCount:0,running:false,lastRun:null});
    return {threadId:id,ready:owner?.ready??false,streaming:(owner?.streaming??false)||composition.running||!!owner?.composing||!!observer?.running,revision:workspace?.revision??0,workspace,projection:{epoch,workspace,updates},preview,composition,observer};
  };
  const envelope=(s:ReturnType<typeof status>,cursor:z.infer<typeof cursorSchema>|null)=>({threadId:s.threadId,ready:s.ready,streaming:s.streaming,revision:s.revision,composition:s.composition,observer:s.observer,delivery:delivery(s.projection,cursor,s.preview)});
  // Public ephemeral WS signals; RPC cursor catch-up repairs missed delivery.
  for(const d of DEPLOYMENTS)bb.background.service(d.name==='clone'?'workspace-stream':`surface-stream-${d.name}`,{start:async signal=>{
    mkdirSync(join(d.home,'workspace'),{recursive:true,mode:0o700});mkdirSync(join(d.home,'owner'),{recursive:true,mode:0o700});
    let cursor:z.infer<typeof cursorSchema>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
    const emit=()=>{if(signal.aborted)return;const s=status(d);bb.realtime.publish(d.channel,envelope(s,cursor));cursor={epoch:s.projection.epoch,revision:s.revision};};
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{emit();}catch(e){bb.realtime.publish(`${d.channel}-error`,{message:String(e)});}},5);};
    const w=watch(join(d.home,'workspace'),schedule),o=watch(join(d.home,'owner'),(_event,name)=>{if(name==='state.json')schedule();});
    let abort:()=>void=()=>{};
    try{await new Promise<void>((resolve,reject)=>{abort=resolve;w.on('error',reject);o.on('error',reject);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);w.close();o.close();}
  }});
  // Bound threads' pages (#68): every bound thread's pages folder is watched; each envelope names its own thread.
  bb.background.service('surface-stream-threads',{start:async signal=>{
    const root=join(byName('main').home,'threads');mkdirSync(root,{recursive:true,mode:0o700});
    const cursors=new Map<string,z.infer<typeof cursorSchema>>(),timers=new Map<string,ReturnType<typeof setTimeout>>();
    const emit=(threadId:string)=>{const d=boundDeployment(threadId);if(signal.aborted||!d)return;const s=status(d);bb.realtime.publish(d.channel,envelope(s,cursors.get(threadId)??null));cursors.set(threadId,{epoch:s.projection.epoch,revision:s.revision});};
    const schedule=(threadId:string)=>{clearTimeout(timers.get(threadId));
      timers.set(threadId,setTimeout(()=>{try{emit(threadId);}catch(e){bb.realtime.publish('surface-thread-error',{threadId,message:String(e)});}},5));};
    // Each bound thread's workspace and owner folders are watched as the main deployment's are (#70): a recursive watch on
    // Linux follows each file's inode, and misses every atomic replace of owner/state.json after the first.
    const followed=new Map<string,ReturnType<typeof watch>[]>();let fail:(e:unknown)=>void=()=>{};
    const follow=(threadId:string)=>{const d=followed.has(threadId)?null:boundDeployment(threadId);if(!d||signal.aborted)return;
      mkdirSync(join(d.home,'workspace'),{recursive:true,mode:0o700});mkdirSync(join(d.home,'owner'),{recursive:true,mode:0o700});
      followed.set(threadId,[watch(join(d.home,'workspace'),()=>schedule(threadId)),watch(join(d.home,'owner'),(_event,name)=>{if(name==='state.json')schedule(threadId);})]);
      for(const x of followed.get(threadId)!)x.on('error',e=>fail(e));};
    const w=watch(root,(_event,name)=>{const threadId=String(name??'');if(!threadId)return;follow(threadId);schedule(threadId);});
    for(const threadId of readdirSync(root))follow(threadId);
    let abort:()=>void=()=>{};
    try{await new Promise<void>((resolve,reject)=>{abort=resolve;fail=reject;w.on('error',reject);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
    finally{for(const t of timers.values())clearTimeout(t);signal.removeEventListener('abort',abort);w.close();for(const ws of followed.values())for(const x of ws)x.close();}
  }});
  // A surface pill in the composer (inserted when the person opens an earlier version, or typed with @). At send time
  // an earlier version is brought back as the current one, with the person's edits, before Exo's turn; Exo gets one
  // agent-only line. A current surface is just referenced.
  const SURFACE_ITEM=/^(?:(clone|main)\|)?([a-zA-Z0-9_-]{1,80})@(\d{1,9})$/;
  bb.ui.registerMentionProvider({id:'surface',label:'Pages',triggers:['@'],
    // Bring-back by mention names its deployment only; a bound thread's pages are not offered until it names the thread.
    search:({query,threadId})=>{let d:Deployment;try{d=deploymentFor(threadId??'');}catch{return [];}if(d.threadId)return [];const all=history(d),latest=new Map<string,Version>();for(const v of all)if(v.action!=='withdrawn')latest.set(v.surface,v);
      const q=query.toLowerCase();return [...latest.values()].filter(v=>!q||v.title.toLowerCase().includes(q)||v.surface.includes(q)).sort((a,b)=>b.revision-a.revision).slice(0,12)
        .map(v=>{const last=[...all].reverse().find(x=>x.surface===v.surface&&x.action!=='retired'&&x.action!=='withdrawn')!;return {id:`${d.name}|${v.surface}@${last.revision}`,title:last.title,subtitle:new Date(last.at).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),icon:'PanelsTopLeft'};});},
    resolve:async itemId=>{
      const m=SURFACE_ITEM.exec(itemId);if(!m)return {context:''};const d=byName(m[1]??'clone'),surface=m[2],revision=Number(m[3]),st=status(d),all=history(d),v=versionAt(all,surface,revision);if(!v||!st.threadId)return {context:''};
      const later=all.some(x=>x.surface===surface&&x.revision>v.revision&&x.action!=='retired'&&x.action!=='withdrawn'),live=!!st.workspace?.messages.some((x:any)=>x.createSurface?.surfaceId===surface),p=readPending(d),same=!!p&&p.surface===surface&&p.revision===v.revision;
      const stamp=new Date(v.at).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      const ids=(st.workspace?.messages??[]).flatMap((x:any)=>x.createSurface?[x.createSurface.surfaceId]:[]),stage=st.workspace?.layout?.focus&&ids.includes(st.workspace.layout.focus)?st.workspace.layout.focus:ids.at(-1);
      if(live&&!later&&stage===surface&&!same)return {context:`[surface] Tom is pointing at the page ${surface} ${JSON.stringify(v.title)} (on stage, current version).`};
      try{await restoreViaOwner(st.threadId,{surfaceId:surface,revision:v.revision,updates:same?p!.updates:[],mutationId:randomUUID(),announced:true},ownerHome(d));rmSync(pendingFile(d),{force:true});bb.realtime.publish('pending-restore',null);}
      catch(e){bb.log?.warn?.(`bring-back at send failed, retrying at turn start: ${String(e)}`);if(!same){writeFileSync(pendingFile(d),JSON.stringify({deployment:d.name,threadId:st.threadId,surface,revision:v.revision,title:v.title,at:v.at,updates:[]}),{mode:0o600});}
        return {context:`[surface] Tom is bringing back the page ${surface} ${JSON.stringify(v.title)} (the version from ${stamp}); it will be on stage as the current version when your turn starts.`};}
      const changes=same&&p!.updates.length?` He changed: ${p!.updates.map(u=>`${u.path.slice(1)} → ${JSON.stringify(u.value)}`).join('; ')}.`:'';
      return {context:`[surface] Tom brought back the page ${surface} ${JSON.stringify(v.title)} (the version from ${stamp}). It is now the current version, on stage; your edits apply to it.${changes}`};
    },
  });
  // Fallback: a pending bring-back without a pill (or one that couldn't commit at send time) is committed as the turn starts.
  bb.experimental_hooks.on('message.dispatch',async ctx=>{
    const d=DEPLOYMENTS.find(x=>threadOf(x)===ctx.thread.id)??boundDeployment(ctx.thread.id);if(!d)return {action:'proceed'};
    const p=readPending(d);if(!p||ctx.thread.id!==p.threadId||ctx.attempt!=='start-turn')return {action:'proceed'};
    try{await restoreViaOwner(p.threadId,{surfaceId:p.surface,revision:p.revision,updates:p.updates,mutationId:randomUUID()},ownerHome(d));rmSync(pendingFile(d),{force:true});bb.realtime.publish('pending-restore',null);}
    catch(e){bb.log?.warn?.(`bring-back before dispatch failed: ${String(e)}`);}
    return {action:'proceed'};
  });
  // Process-local admission/deduplication only, not durable exactly-once effects.
  const admitted=new Map<string,Promise<{accepted:boolean}>>();
  const claimed=new Map<string,number|null>();
  registerRpc(rpcContract,{
    workspace:async({deployment,threadId,cursor})=>envelope(status(threadId?deploymentFor(threadId):byName(deployment)),cursor),
    surfaceAt:async({threadId,surface,revision})=>{
      const d=deploymentFor(threadId),st=status(d);const all=history(d),v=versionAt(all,surface,revision);if(!v)throw Error(`No version of ${surface} at revision ${revision}`);
      // Current = this is the surface's latest version and it is on the live canvas (no rewind needed, just focus it).
      const later=all.some(x=>x.surface===surface&&x.revision>v.revision&&x.action!=='retired'&&x.action!=='withdrawn'),live=!!st.workspace?.messages.some((m:any)=>m.createSurface?.surfaceId===surface);
      // On stage = the surface the conversation is on now (layout focus, else the last drawn): only its latest card just loads it.
      const ids=(st.workspace?.messages??[]).flatMap((m:any)=>m.createSurface?[m.createSurface.surfaceId]:[]),stage=st.workspace?.layout?.focus&&ids.includes(st.workspace.layout.focus)?st.workspace.layout.focus:ids.at(-1);
      return {surface,revision:v.revision,title:v.title,at:v.at,action:v.action,current:live&&!later,onStage:live&&!later&&stage===surface,panel:d.panel,snapshot:versionSnapshot(v)};
    },
    pending:async({threadId,op,version,updates})=>{
      // The composer add-on asks in every thread; threads without a surface simply have nothing pending.
      if(op==='get'&&!DEPLOYMENTS.some(x=>threadOf(x)===threadId)&&!boundDeployment(threadId))return null;
      const d=deploymentFor(threadId);
      if(op==='clear'){rmSync(pendingFile(d),{force:true});bb.realtime.publish('pending-restore',null);return null;}
      if(op==='set'){if(!version)throw Error('version required');const v=versionAt(history(d),version.surface,version.revision);if(!v)throw Error('Unknown version');
        const next={deployment:d.name,threadId,surface:version.surface,revision:v.revision,title:v.title,at:v.at,updates:updates??[]};writeFileSync(pendingFile(d),JSON.stringify(next),{mode:0o600});bb.realtime.publish('pending-restore',next);return next;}
      return readPending(d);
    },
    observerArm:async({threadId,...request})=>{const s=status(byName('clone'));if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||request.baseRevision!==s.revision)throw Error('Idle clone and current revision required');await armViaOwner(threadId,request);return{armed:status(byName('clone')).observer?.armed??false};},
    compose:async({threadId,...request})=>{
      const clone=byName('clone'),s=status(clone);if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||!s.composition.configured||request.baseRevision!==s.revision)throw Error('Idle configured clone and current revision required');
      await composeViaOwner(threadId,request);const after=status(clone);return {completed:after.revision===request.baseRevision+1&&after.composition.lastRun?.id===request.runId&&after.composition.lastRun?.status==='complete'};
    },
    edit:async({threadId,...request})=>{
      const d=deploymentFor(threadId),s=status(d);if(!s.ready||s.streaming||s.preview||!s.workspace)throw Error('busy');
      planData(s.workspace,{...request,source:'edit'});
      await canvasDataViaOwner(threadId,{...request,source:'edit'},ownerHome(d));return {revision:status(d).revision};
    },
    action:async({threadId,revision:asked,rewind,event,actionId,metadata})=>{let revision=asked;
      const pending=admitted.get(actionId);if(pending)return pending;
      const work=(async()=>{
        const d=deploymentFor(threadId);let s=status(d);if(!s.ready || s.streaming || !s.workspace)throw new Error('Idle Exo with pages required');
        const bindingFile=join(ownerHome(d),'bindings',`${threadId}.json`),thread=await bb.sdk.threads.get({threadId});
        if(thread.providerId!==d.providerId||!existsSync(bindingFile)||load(bindingFile).runtimeKind!=='canonical')throw new Error('Wrong Exosurface thread');
        if(s.preview)throw Error('Provisional UI cannot submit actions');
        // Preflight the ENTIRE restore + input commit + verbatim submission before the first mutation.
        let prospective=s.workspace,restoreRequest:{surfaceId:string;revision:number;updates:any[];mutationId:string}|undefined;
        if(rewind){const p=readPending(d),same=p&&p.surface===rewind.surface&&p.revision===rewind.revision;
          const v=versionAt(history(d),rewind.surface,rewind.revision);if(!v)throw Error('Unknown bring-back version');
          restoreRequest={surfaceId:rewind.surface,revision:rewind.revision,updates:same?p!.updates:[],mutationId:randomUUID()};
          prospective=planRestore(s.workspace,v,restoreRequest).next;
        }
        if(!metadata.a2uiClientCapabilities['v0.9.1'].supportedCatalogIds.includes(CATALOG))throw Error('Catalog capability mismatch');
        const a=validateAction(prospective,rewind?prospective.revision:revision,event.action);
        const text=describePress(prospective,a);validatePrompt(text);
        const updates=boundUpdates(prospective,a),mutationId=randomUUID();
        if(updates.length)planData(prospective,{revision:prospective.revision,surfaceId:a.surfaceId,updates,mutationId,source:'press'});
        if(restoreRequest){await restoreViaOwner(threadId,restoreRequest,ownerHome(d));rmSync(pendingFile(d),{force:true});bb.realtime.publish('pending-restore',null);s=status(d);revision=s.revision;if(revision!==prospective.revision)throw Error('Bring-back revision changed');}
        const fresh=status(d);if(fresh.revision!==revision||fresh.streaming||claimed.get(d.threadId??d.name)===revision)throw new Error('Page action already pending or stale');
        claimed.set(d.threadId??d.name,revision);
        try{
          // Code first: the submitted values become committed canvas state; then the person's press, in words, starts Exo's turn.
          if(updates.length)await canvasDataViaOwner(threadId,{revision,surfaceId:a.surfaceId,updates,mutationId,source:'press'},ownerHome(d));
          await bb.sdk.threads.send({threadId,input:[{type:'text',text,mentions:[]}],mode:'auto'});
        }catch(e){claimed.set(d.threadId??d.name,null);throw e;}
        return {accepted:true};
      })();
      admitted.set(actionId,work);try{return await work;}catch(e){admitted.delete(actionId);throw e;}finally{while(admitted.size>100)admitted.delete(admitted.keys().next().value!);}
    },
  });
}

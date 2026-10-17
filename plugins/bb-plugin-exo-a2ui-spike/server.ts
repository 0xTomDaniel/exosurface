import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { existsSync, watch, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, load, CANONICAL_MODEL, binding } from './src/state.ts';
import { CATALOG, actionSchema, validateAction, validateSnapshot, deltaSchema } from './src/workspace.ts';
import { describePress, boundUpdates } from './src/canvas-memory.ts';
import { canvasDataViaOwner, restoreViaOwner } from './src/canvas-client.ts';
import { versionAt, versionSnapshot, type Version } from './src/canvas-history.ts';
import { randomUUID } from 'node:crypto';
import {cursorSchema,previewSchema,deliverySchema,delivery,type Delivery} from './src/delivery.ts';
import {composeViaOwner} from './composition/client.ts';
import {armViaOwner} from './observer/client.ts';
const observerSchema=z.object({id:z.string(),route:z.enum(['sidecar','direct']),surfaceId:z.string(),phase:z.string(),sourceChars:z.number(),firstTextMs:z.number().nullable(),sourceEndMs:z.number().nullable(),firstPreviewMs:z.number().nullable(),firstPreviewSourceChars:z.number().nullable(),elapsedMs:z.number(),error:z.string().optional(),armed:z.boolean(),running:z.boolean()});
const compositionSchema=z.object({configured:z.boolean(),surfaceId:z.string().nullable(),candidateCount:z.number(),running:z.boolean(),lastRun:z.object({id:z.string(),mode:z.string(),status:z.string(),elapsedMs:z.number().optional(),calls:z.number().optional(),costUsd:z.number().nullable().optional()}).nullable()});
const statusSchema=z.object({threadId:z.string().nullable(),ready:z.boolean(),streaming:z.boolean(),revision:z.number(),delivery:deliverySchema,composition:compositionSchema,observer:observerSchema.nullable()});
const eventSchema=z.object({version:z.literal('v0.9.1'),action:actionSchema}).strict();
const versionRef=z.object({surface:z.string().max(80),revision:z.number().int().nonnegative()}).strict();
const pendingSchema=z.object({threadId:z.string(),surface:z.string(),revision:z.number().int(),title:z.string(),at:z.string(),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).max(16)}).strict();
// Surface versions, written by the clone extension from the native session (derived, rebuildable).
const history=():Version[]=>{const f=join(HOME,'workspace/history.jsonl');return existsSync(f)?readFileSync(f,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)):[];};
// A pending bring-back: the person edited an earlier surface version; committed with their next message or press.
const pendingFile=join(HOME,'workspace/pending-restore.json');
const readPending=():z.infer<typeof pendingSchema>|null=>{try{return existsSync(pendingFile)?pendingSchema.parse(JSON.parse(readFileSync(pendingFile,'utf8'))):null;}catch{return null;}};
export const rpcContract=defineRpcContract({
  workspace:{input:cursorSchema.nullable(),output:statusSchema},
  compose:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),mode:z.enum(['jev','haiku','haiku-both']),prompt:z.string().min(1).max(1600),resumeRunId:z.string().uuid().optional()}).strict(),output:z.object({completed:z.boolean()})},
  observerArm:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),route:z.enum(['sidecar','direct','off'])}).strict(),output:z.object({armed:z.boolean()})},
  edit:{input:z.object({threadId:z.string(),revision:z.number().int().nonnegative(),surfaceId:z.string().max(80),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).min(1).max(16),mutationId:z.string().uuid()}).strict(),output:z.object({revision:z.number()})},
  surfaceAt:{input:z.object({threadId:z.string()}).merge(versionRef).strict(),output:z.object({surface:z.string(),revision:z.number(),title:z.string(),at:z.string(),action:z.string(),current:z.boolean(),snapshot:z.any()})},
  pending:{input:z.object({threadId:z.string(),op:z.enum(['get','set','clear']),version:versionRef.optional(),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).max(16).optional()}).strict(),output:pendingSchema.nullable()},
  action:{input:z.object({threadId:z.string(),revision:z.number().int(),rewind:versionRef.optional(),event:eventSchema,actionId:z.string().uuid(),metadata:z.object({a2uiClientCapabilities:z.object({'v0.9.1':z.object({supportedCatalogIds:z.array(z.string())})})})}),output:z.object({accepted:z.boolean()})},
});
export default function plugin(bb:BbPluginApi){
  bb.providers.register({id:'exo-a2ui-spike',displayName:'Exosurface — cloned Exo',icon:'PanelsTopLeft',family:'exo-a2ui',
    strings:{signInHint:'Uses existing Pi auth; separate cloned OptChat home.',expiredHint:'Check provisioned Pi auth; no credential copying.',installUrl:'https://getbb.app',brandPrefix:'Clone '},
    maintenance:{health:false,usage:false,installation:false},capabilities:{supportsServiceTier:false,supportsNativeUserQuestion:false,fork:'none',supportsManualCompaction:false,supportsThreadArchive:false,supportsThreadRename:false,permissionModes:['full'],reasoningLevels:['high']},
    composerActions:[],models:{fallback:[CANONICAL_MODEL],scope:'host'},env:{passthrough:[]},completedTurnDisplay:'flat',
    deriveProviderOptions(){return {runtimeKind:'canonical'};},extensionKinds:{},
  });
  const status=()=>{
    const file=join(HOME,'canonical-thread.json'),ownerFile=join(HOME,'owner/state.json'),wsFile=join(HOME,'workspace/latest.json');
    const id=existsSync(file)?load(file).threadId:null,owner=existsSync(ownerFile)?load(ownerFile):null;
    const projection=existsSync(wsFile)?load(wsFile):null;
    const clone=load(join(HOME,'clone.json'));
    if(projection && projection.sessionId!==clone.cloneSessionId)throw new Error('Wrong workspace session projection');
    const workspace=projection?.workspace?validateSnapshot(projection.workspace):null;
    const epoch=projection?.epoch??'legacy',updates=(projection?.updates??[]).map((d:unknown)=>deltaSchema.parse(d));
    const previewFile=join(HOME,'workspace','preview.json'),rawPreview=existsSync(previewFile)?load(previewFile):null;
    const preview=rawPreview?.sessionId===clone.cloneSessionId&&rawPreview.epoch===epoch&&rawPreview.baseRevision===(workspace?.revision??0)?previewSchema.parse({toolCallId:rawPreview.toolCallId,baseRevision:rawPreview.baseRevision,messages:rawPreview.messages}):null;
    const observer=observerSchema.nullable().parse(projection?.observer??null);
    const composition=compositionSchema.parse(projection?.composition??{configured:false,surfaceId:null,candidateCount:0,running:false,lastRun:null});
    return {threadId:id,ready:owner?.ready??false,streaming:(owner?.streaming??false)||composition.running||!!owner?.composing||!!observer?.running,revision:workspace?.revision??0,workspace,projection:{epoch,workspace,updates},preview,composition,observer};
  };
  const envelope=(s:ReturnType<typeof status>,cursor:z.infer<typeof cursorSchema>|null)=>({threadId:s.threadId,ready:s.ready,streaming:s.streaming,revision:s.revision,composition:s.composition,observer:s.observer,delivery:delivery(s.projection,cursor,s.preview)});
  // Public ephemeral WS signals; RPC cursor catch-up repairs missed delivery.
  bb.background.service('workspace-stream',{start:async signal=>{
    let cursor:z.infer<typeof cursorSchema>|null=null,timer:ReturnType<typeof setTimeout>|undefined;
    const emit=()=>{if(signal.aborted)return;const s=status();bb.realtime.publish('workspace',envelope(s,cursor));cursor={epoch:s.projection.epoch,revision:s.revision};};
    const schedule=()=>{clearTimeout(timer);timer=setTimeout(()=>{try{emit();}catch(e){bb.realtime.publish('workspace-error',{message:String(e)});}},5);};
    const w=watch(join(HOME,'workspace'),schedule),o=watch(join(HOME,'owner'),(_event,name)=>{if(name==='state.json')schedule();});
    let abort:()=>void=()=>{};
    try{await new Promise<void>((resolve,reject)=>{abort=resolve;w.on('error',reject);o.on('error',reject);signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort();});}
    finally{clearTimeout(timer);signal.removeEventListener('abort',abort);w.close();o.close();}
  }});
  // A surface pill in the composer (inserted when the person opens an earlier version, or typed with @). At send time
  // an earlier version is brought back as the current one, with the person's edits, before Exo's turn; Exo gets one
  // agent-only line. A current surface is just referenced.
  const SURFACE_ITEM=/^([a-zA-Z0-9_-]{1,80})@(\d{1,9})$/;
  bb.ui.registerMentionProvider({id:'surface',label:'Canvas surfaces',triggers:['@'],
    search:({query})=>{const all=history(),latest=new Map<string,Version>();for(const v of all)if(v.action!=='withdrawn')latest.set(v.surface,v);
      const q=query.toLowerCase();return [...latest.values()].filter(v=>!q||v.title.toLowerCase().includes(q)||v.surface.includes(q)).sort((a,b)=>b.revision-a.revision).slice(0,12)
        .map(v=>{const last=[...all].reverse().find(x=>x.surface===v.surface&&x.action!=='retired'&&x.action!=='withdrawn')!;return {id:`${v.surface}@${last.revision}`,title:last.title,subtitle:new Date(last.at).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'}),icon:'PanelsTopLeft'};});},
    resolve:async itemId=>{
      const m=SURFACE_ITEM.exec(itemId);if(!m)return {context:''};const surface=m[1],revision=Number(m[2]),st=status(),all=history(),v=versionAt(all,surface,revision);if(!v||!st.threadId)return {context:''};
      const later=all.some(x=>x.surface===surface&&x.revision>v.revision&&x.action!=='retired'&&x.action!=='withdrawn'),live=!!st.workspace?.messages.some((x:any)=>x.createSurface?.surfaceId===surface),p=readPending(),same=!!p&&p.surface===surface&&p.revision===v.revision;
      const stamp=new Date(v.at).toLocaleString('en-US',{timeZone:'America/Denver',month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});
      if(live&&!later&&!same)return {context:`[canvas] Tom is pointing at the surface ${surface} ${JSON.stringify(v.title)} (current version, revision ${v.revision}).`};
      try{await restoreViaOwner(st.threadId,{surfaceId:surface,revision:v.revision,updates:same?p!.updates:[],mutationId:randomUUID(),announced:true});rmSync(pendingFile,{force:true});bb.realtime.publish('pending-restore',null);}
      catch(e){bb.log?.warn?.(`bring-back at send failed, retrying at turn start: ${String(e)}`);if(!same){writeFileSync(pendingFile,JSON.stringify({threadId:st.threadId,surface,revision:v.revision,title:v.title,at:v.at,updates:[]}),{mode:0o600});}
        return {context:`[canvas] Tom is bringing back the surface ${surface} ${JSON.stringify(v.title)} (the version from ${stamp}); it will be on stage as the current version when your turn starts.`};}
      const changes=same&&p!.updates.length?` He changed: ${p!.updates.map(u=>`${u.path.slice(1)} → ${JSON.stringify(u.value)}`).join('; ')}.`:'';
      return {context:`[canvas] Tom brought back the surface ${surface} ${JSON.stringify(v.title)} (the version from ${stamp}). It is now the current version, on stage; your edits apply to it.${changes}`};
    },
  });
  // Fallback: a pending bring-back without a pill (or one that couldn't commit at send time) is committed as the turn starts.
  bb.experimental_hooks.on('message.dispatch',async ctx=>{
    const p=readPending();if(!p||ctx.thread.id!==p.threadId||ctx.attempt!=='start-turn')return {action:'proceed'};
    try{await restoreViaOwner(p.threadId,{surfaceId:p.surface,revision:p.revision,updates:p.updates,mutationId:randomUUID()});rmSync(pendingFile,{force:true});bb.realtime.publish('pending-restore',null);}
    catch(e){bb.log?.warn?.(`bring-back before dispatch failed: ${String(e)}`);}
    return {action:'proceed'};
  });
  // Process-local admission/deduplication only, not durable exactly-once effects.
  const admitted=new Map<string,Promise<{accepted:boolean}>>();
  let claimedRevision:number|null=null;
  bb.rpc.register(rpcContract,{
    workspace:async cursor=>envelope(status(),cursor),
    surfaceAt:async({threadId,surface,revision})=>{
      const st=status();if(threadId!==st.threadId)throw Error('Wrong clone thread');const all=history(),v=versionAt(all,surface,revision);if(!v)throw Error(`No version of ${surface} at revision ${revision}`);
      // Current = this is the surface's latest version and it is on the live canvas (no rewind needed, just focus it).
      const later=all.some(x=>x.surface===surface&&x.revision>v.revision&&x.action!=='retired'&&x.action!=='withdrawn'),live=!!st.workspace?.messages.some((m:any)=>m.createSurface?.surfaceId===surface);
      return {surface,revision:v.revision,title:v.title,at:v.at,action:v.action,current:live&&!later,snapshot:versionSnapshot(v)};
    },
    pending:async({threadId,op,version,updates})=>{
      if(threadId!==status().threadId)throw Error('Wrong clone thread');
      if(op==='clear'){rmSync(pendingFile,{force:true});bb.realtime.publish('pending-restore',null);return null;}
      if(op==='set'){if(!version)throw Error('version required');const v=versionAt(history(),version.surface,version.revision);if(!v)throw Error('Unknown version');
        const next={threadId,surface:version.surface,revision:v.revision,title:v.title,at:v.at,updates:updates??[]};writeFileSync(pendingFile,JSON.stringify(next),{mode:0o600});bb.realtime.publish('pending-restore',next);return next;}
      return readPending();
    },
    observerArm:async({threadId,...request})=>{const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||request.baseRevision!==s.revision)throw Error('Idle clone and current revision required');await armViaOwner(threadId,request);return{armed:status().observer?.armed??false};},
    compose:async({threadId,...request})=>{
      const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||!s.composition.configured||request.baseRevision!==s.revision)throw Error('Idle configured clone and current revision required');
      await composeViaOwner(threadId,request);const after=status();return {completed:after.revision===request.baseRevision+1&&after.composition.lastRun?.id===request.runId&&after.composition.lastRun?.status==='complete'};
    },
    edit:async({threadId,...request})=>{
      const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||!s.workspace)throw Error('busy');
      await canvasDataViaOwner(threadId,{...request,source:'edit'});return {revision:status().revision};
    },
    action:async({threadId,revision:asked,rewind,event,actionId,metadata})=>{let revision=asked;
      const pending=admitted.get(actionId);if(pending)return pending;
      const work=(async()=>{
        let s=status();if(threadId!==s.threadId || !s.ready || s.streaming || !s.workspace)throw new Error('Clone idle workspace required');
        const thread=await bb.sdk.threads.get({threadId});if(thread.providerId!=='exo-a2ui-spike'||binding(threadId)?.runtimeKind!=='canonical')throw new Error('Wrong clone thread');
        if(s.preview)throw Error('Provisional UI cannot submit actions');
        // A press on an earlier surface version brings it back first (with any pending edits), then counts as a normal press.
        if(rewind){const p=readPending(),same=p&&p.surface===rewind.surface&&p.revision===rewind.revision;
          await restoreViaOwner(threadId,{surfaceId:rewind.surface,revision:rewind.revision,updates:same?p!.updates:[],mutationId:randomUUID()});
          rmSync(pendingFile,{force:true});bb.realtime.publish('pending-restore',null);s=status();revision=s.revision;if(!s.workspace)throw Error('Bring-back failed');}
        if(!metadata.a2uiClientCapabilities['v0.9.1'].supportedCatalogIds.includes(CATALOG))throw Error('Catalog capability mismatch');
        const a=validateAction(s.workspace,revision,event.action);
        const fresh=status();if(fresh.revision!==revision||fresh.streaming||claimedRevision===revision)throw new Error('Workspace action already pending or stale');
        claimedRevision=revision;
        try{
          // Code first: the submitted values become committed canvas state; then the person's press, in words, starts Exo's turn.
          const updates=boundUpdates(s.workspace,a);
          if(updates.length)await canvasDataViaOwner(threadId,{revision,surfaceId:a.surfaceId,updates,mutationId:randomUUID(),source:'press'});
          await bb.sdk.threads.send({threadId,input:[{type:'text',text:describePress(s.workspace,a),mentions:[]}],mode:'auto'});
        }catch(e){claimedRevision=null;throw e;}
        return {accepted:true};
      })();
      admitted.set(actionId,work);try{return await work;}catch(e){admitted.delete(actionId);throw e;}finally{while(admitted.size>100)admitted.delete(admitted.keys().next().value!);}
    },
  });
}

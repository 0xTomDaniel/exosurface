import { defineRpcContract, type BbPluginApi } from '@get-bb/plugin-sdk';
import { z } from 'zod';
import { existsSync, watch } from 'node:fs';
import { join } from 'node:path';
import { HOME, load, CANONICAL_MODEL, binding } from './src/state.ts';
import { CATALOG, actionSchema, validateAction, validateSnapshot, deltaSchema } from './src/workspace.ts';
import { describePress, boundUpdates } from './src/canvas-memory.ts';
import { canvasDataViaOwner } from './src/canvas-client.ts';
import { randomUUID } from 'node:crypto';
import {cursorSchema,previewSchema,deliverySchema,delivery,type Delivery} from './src/delivery.ts';
import {composeViaOwner} from './composition/client.ts';
import {armViaOwner} from './observer/client.ts';
const observerSchema=z.object({id:z.string(),route:z.enum(['sidecar','direct']),surfaceId:z.string(),phase:z.string(),sourceChars:z.number(),firstTextMs:z.number().nullable(),sourceEndMs:z.number().nullable(),firstPreviewMs:z.number().nullable(),firstPreviewSourceChars:z.number().nullable(),elapsedMs:z.number(),error:z.string().optional(),armed:z.boolean(),running:z.boolean()});
const compositionSchema=z.object({configured:z.boolean(),surfaceId:z.string().nullable(),candidateCount:z.number(),running:z.boolean(),lastRun:z.object({id:z.string(),mode:z.string(),status:z.string(),elapsedMs:z.number().optional(),calls:z.number().optional(),costUsd:z.number().nullable().optional()}).nullable()});
const statusSchema=z.object({threadId:z.string().nullable(),ready:z.boolean(),streaming:z.boolean(),revision:z.number(),delivery:deliverySchema,composition:compositionSchema,observer:observerSchema.nullable()});
const eventSchema=z.object({version:z.literal('v0.9.1'),action:actionSchema}).strict();
export const rpcContract=defineRpcContract({
  workspace:{input:cursorSchema.nullable(),output:statusSchema},
  compose:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),mode:z.enum(['jev','haiku','haiku-both']),prompt:z.string().min(1).max(1600),resumeRunId:z.string().uuid().optional()}).strict(),output:z.object({completed:z.boolean()})},
  observerArm:{input:z.object({threadId:z.string(),runId:z.string().uuid(),baseRevision:z.number().int().nonnegative(),route:z.enum(['sidecar','direct','off'])}).strict(),output:z.object({armed:z.boolean()})},
  edit:{input:z.object({threadId:z.string(),revision:z.number().int().nonnegative(),surfaceId:z.string().max(80),updates:z.array(z.object({path:z.string().max(160),value:z.any()}).strict()).min(1).max(16),mutationId:z.string().uuid()}).strict(),output:z.object({revision:z.number()})},
  action:{input:z.object({threadId:z.string(),revision:z.number().int(),event:eventSchema,actionId:z.string().uuid(),metadata:z.object({a2uiClientCapabilities:z.object({'v0.9.1':z.object({supportedCatalogIds:z.array(z.string())})})})}),output:z.object({accepted:z.boolean()})},
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
  // Process-local admission/deduplication only, not durable exactly-once effects.
  const admitted=new Map<string,Promise<{accepted:boolean}>>();
  let claimedRevision:number|null=null;
  bb.rpc.register(rpcContract,{
    workspace:async cursor=>envelope(status(),cursor),
    observerArm:async({threadId,...request})=>{const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||request.baseRevision!==s.revision)throw Error('Idle clone and current revision required');await armViaOwner(threadId,request);return{armed:status().observer?.armed??false};},
    compose:async({threadId,...request})=>{
      const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||!s.composition.configured||request.baseRevision!==s.revision)throw Error('Idle configured clone and current revision required');
      await composeViaOwner(threadId,request);const after=status();return {completed:after.revision===request.baseRevision+1&&after.composition.lastRun?.id===request.runId&&after.composition.lastRun?.status==='complete'};
    },
    edit:async({threadId,...request})=>{
      const s=status();if(threadId!==s.threadId||!s.ready||s.streaming||s.preview||!s.workspace)throw Error('busy');
      await canvasDataViaOwner(threadId,{...request,source:'edit'});return {revision:status().revision};
    },
    action:async({threadId,revision,event,actionId,metadata})=>{
      const pending=admitted.get(actionId);if(pending)return pending;
      const work=(async()=>{
        const s=status();if(threadId!==s.threadId || !s.ready || s.streaming || !s.workspace)throw new Error('Clone idle workspace required');
        const thread=await bb.sdk.threads.get({threadId});if(thread.providerId!=='exo-a2ui-spike'||binding(threadId)?.runtimeKind!=='canonical')throw new Error('Wrong clone thread');
        if(s.preview)throw Error('Provisional UI cannot submit actions');
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

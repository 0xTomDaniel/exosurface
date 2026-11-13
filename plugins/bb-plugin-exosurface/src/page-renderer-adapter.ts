// Thin durable-page ↔ existing WorkspaceView adapter. No renderer, schema, or input limits.
// Transport injection keeps the BB RPC contract and isolated loopback fixture interchangeable.
import type { Snapshot } from './snapshot-data.ts';
interface Draft {surfaceId:string;path:string;value:unknown}
interface Delivery {epoch:string;checkpoint:unknown;updates:unknown[];preview:null}
interface View {committed:Snapshot|null;drafts:{edits:Map<string,Draft>};accept:(delivery:Delivery)=>void}
interface PageInput {threadId:string;baseRevision:number;mutationId:string;surfaceId:string;ref:string}
// Replies are transport data: refresh reads only the page snapshot, everything else passes through to the caller.
type Rpc=(method:'pageRead'|'pageEdit'|'pagePress',input:(PageInput&({value:unknown}|{values:Record<string,unknown>}))|null)=>Promise<unknown>;
export class PageRendererAdapter {
readonly view: View;
readonly rpc: Rpc;
readonly threadId: string;
readonly mutationId: ()=>string;

 private saving:Promise<void>|null=null;
 private pressing=false;
 private uncertain=false;
 constructor( view:View, rpc:Rpc, threadId:string, mutationId:()=>string=()=>crypto.randomUUID()){
this.view = view;
this.rpc = rpc;
this.threadId = threadId;
this.mutationId = mutationId;
}
 async refresh(){
  const page=await this.rpc('pageRead',null);
  if(page===null||page===undefined)throw TypeError('Page read returned no page');
  this.view.accept({epoch:this.threadId,checkpoint:typeof page==='object'&&'snapshot' in page?page.snapshot:undefined,updates:[],preview:null});
  return page;
 }
 flush():Promise<void>{
  if(this.saving)return this.saving;
  const work=async()=>{
   while(this.view.drafts.edits.size){
    const next=this.view.drafts.edits.values().next();if(next.done)break;const draft=next.value;
    // Owner pages already bind inputs to their top-level stable refs. Never trim/slice values.
    const ref=draft.path.slice(1);
    await this.rpc('pageEdit',{threadId:this.threadId,baseRevision:this.view.committed?.revision??0,mutationId:this.mutationId(),surfaceId:draft.surfaceId,ref,value:structuredClone(draft.value)});
    await this.refresh();
   }
  };
  this.saving=work().finally(()=>{this.saving=null;});return this.saving;
 }
 async press(action:{surfaceId:string;sourceComponentId:string;context:Record<string,unknown>}){
  if(this.uncertain)throw Error('Prior press outcome unknown; explicit reconciliation required; action was not retried');
  if(this.pressing)throw Error('A page press is already pending; action was not sent');
  this.pressing=true;
  try{
   await this.flush();
   try{
    return await this.rpc('pagePress',{threadId:this.threadId,baseRevision:this.view.committed?.revision??0,mutationId:this.mutationId(),surfaceId:action.surfaceId,ref:action.sourceComponentId,values:structuredClone(action.context)});
   }catch(e){this.uncertain=true;throw e;}
  }finally{this.pressing=false;}
 }
}

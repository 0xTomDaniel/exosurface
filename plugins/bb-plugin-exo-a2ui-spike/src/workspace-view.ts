// Retained official renderer; committed revision and provisional token preview
// are separate. Ordered native deltas persist; realtime signals do not.
import {MessageProcessor,STRICT_VALIDATION} from '@a2ui/web_core/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import {exoApiCatalog} from './exo-catalog.ts';
import type {ReactCatalogComponent} from '@a2ui/react/v0_9';
import {applyDelta,rendererMessages,moduleIds,inputBindings,moduleData,atPath,type Snapshot,type Delta} from './workspace.ts';
import {DraftStore,type Draft} from './drafts.ts';
import type {Delivery} from './delivery.ts';
const firstDiff=(a:any[],b:any[])=>{let i=0;while(i<a.length&&i<b.length&&JSON.stringify(a[i])===JSON.stringify(b[i]))i++;return i;};
export class WorkspaceView{
 processor:MessageProcessor<ReactCatalogComponent>;
 committed:Snapshot|null=null;displayed:Snapshot|null=null;epoch='';
 readonly drafts=new DraftStore();orphan:Draft[]=[];error='';
 preview:{id:string;messages:any[]}|null=null;
 private subscriptions:{unsubscribe():void}[]=[];private muted=false;
 // Frontend passes the React-rendered Exo catalog; tests use schema-only catalogs.
 constructor(private action:(a:any)=>void,private changed:()=>void,private catalogs:any[]=[basicCatalog,exoApiCatalog]){this.processor=this.create();}
 private create(){return new MessageProcessor<ReactCatalogComponent>(this.catalogs,a=>this.action(a),{validationConfig:{...STRICT_VALIDATION,allowOrphanComponents:true,allowDanglingReferences:true,allowMissingRoot:true}});}
 cursor(){return {epoch:this.epoch,revision:this.committed?.revision??0};}
 private unsub(){this.subscriptions.forEach(s=>s.unsubscribe());this.subscriptions=[];}
 private sync(snapshot:Snapshot|null,ack:boolean){
  this.unsub();this.displayed=snapshot;if(!snapshot){this.orphan=[...this.drafts.edits.values()];return;}
  const {apply,orphan}=this.drafts.reconcile(snapshot,ack);this.orphan=orphan;
  for(const d of apply)this.processor.getSurfaces().get(d.surfaceId)?.dataModel.set(d.path,structuredClone(d.value));
  this.subscriptions=moduleIds(snapshot).flatMap(id=>[...inputBindings(snapshot,id)].map(([path,node])=>this.processor.getSurfaces().get(id)!.dataModel.subscribe(path,value=>{
   if(this.muted)return;try{this.drafts.record(id,path,node,value,atPath(moduleData(snapshot,id),path));this.error='';}catch{this.error='Local edit exceeds the offered input contract.';}this.changed();
  })));
 }
 private reset(snapshot:Snapshot|null){this.unsub();this.processor.dispose();this.processor=this.create();if(snapshot)this.processor.processMessages(rendererMessages(snapshot));this.preview=null;this.sync(snapshot,true);}
 private commit(d:Delta){
  if(d.revision<=(this.committed?.revision??0))return;
  const next=applyDelta(this.committed,d);
  if(this.preview){
   // Only the preview's last message may differ (a partly streamed updateComponents); re-sending it upserts.
   const i=firstDiff(this.preview.messages,d.messages);
   if(i>=this.preview.messages.length-1)this.processor.processMessages(structuredClone(d.messages.slice(i)));
   else{this.reset(this.committed);this.processor.processMessages(structuredClone(d.messages));}
  }else this.processor.processMessages(structuredClone(d.messages));
  this.preview=null;this.committed=next;this.sync(next,true);
 }
 accept(value:Delivery){
  this.muted=true;
  try{
   if(Object.hasOwn(value,'checkpoint')){
    const newer=value.epoch!==this.epoch||(value.checkpoint?.revision??0)>(this.committed?.revision??0);
    if(newer||!this.epoch){this.epoch=value.epoch;this.committed=value.checkpoint??null;this.reset(this.committed);}
   }else if(value.epoch!==this.epoch)throw Error('Workspace epoch changed; checkpoint required');
   for(const d of value.updates)this.commit(d);
   const p=value.preview;
   if(p&&p.baseRevision===(this.committed?.revision??0)){
    // Previews grow by whole messages and by components of the last message being written.
    if(this.preview&&(this.preview.id!==p.toolCallId||p.messages.length<this.preview.messages.length||firstDiff(this.preview.messages,p.messages)<this.preview.messages.length-1))this.reset(this.committed);
    const n=this.preview?firstDiff(this.preview.messages,p.messages):0;
    if(n<p.messages.length){
     const displayed=applyDelta(this.committed,{baseRevision:p.baseRevision,revision:p.baseRevision+1,messages:p.messages});
     this.processor.processMessages(structuredClone(p.messages.slice(n)));this.preview={id:p.toolCallId,messages:structuredClone(p.messages)};this.sync(displayed,false);
    }
   }else if(this.preview)this.reset(this.committed);
  }finally{this.muted=false;this.changed();}
 }
 dispose(){this.unsub();this.processor.dispose();}
}

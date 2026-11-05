import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PageRendererAdapter} from '../src/page-renderer-adapter.ts';
const text=' leading whitespace\n🧪 Unicode full text\n'.repeat(4000)+' FINAL SENTINEL \n';
function fixture(value:unknown=text){
 let revision=1,published:unknown='initial';const calls:{method:string;input:any}[]=[];
 const view={committed:{revision:1,messages:[]},drafts:{edits:new Map([['page:/entry',{surfaceId:'page',path:'/entry',value}]])},accept(delivery:any){
  this.committed=delivery.checkpoint;
  if(this.drafts.edits.get('page:/entry')?.value===published)this.drafts.edits.delete('page:/entry');
 }};
 const rpc=async(method:string,input:any)=>{calls.push({method,input});if(method==='pageRead')return {revision,snapshot:{revision,messages:[]}};revision++;if(method==='pageEdit')published=input.value;return {revision,duplicate:false};};
 let id=0;return {view,rpc,calls,id:()=>`mutation-${++id}`};
}
test('adapter preserves entire long values, serializes edits, acknowledges exact published value and never seeds',async()=>{
 const f=fixture(),adapter=new PageRendererAdapter(f.view,f.rpc,'primary',f.id);
 const one=adapter.flush(),two=adapter.flush();assert.ok(one===two,'a second flush joins the one in flight');await one;
 assert.deepEqual(f.calls.map(c=>c.method),['pageEdit','pageRead']);
 assert.equal(f.calls[0].input.value,text);assert.equal(f.calls[0].input.ref,'entry');assert.equal(f.view.drafts.edits.size,0);
 await adapter.refresh();assert.deepEqual(f.calls.map(c=>c.method),['pageEdit','pageRead','pageRead']);
});
test('adapter saves edits before press and forwards offered ref/context without inventing action authority',async()=>{
 const f=fixture(),adapter=new PageRendererAdapter(f.view,f.rpc,'primary',f.id);
 await adapter.press({surfaceId:'page',sourceComponentId:'send',context:{entry:text}});
 assert.deepEqual(f.calls.map(c=>c.method),['pageEdit','pageRead','pagePress']);
 assert.deepEqual(f.calls[2].input,{threadId:'primary',baseRevision:2,mutationId:'mutation-2',surfaceId:'page',ref:'send',values:{entry:text}});
});
test('adapter does not acknowledge newer drafts with an older edit response',async()=>{
 const f=fixture('first'),rpc=async(method:string,input:any)=>{
  if(method==='pageEdit'&&input.value==='first')f.view.drafts.edits.set('page:/entry',{surfaceId:'page',path:'/entry',value:'newer complete edit'});
  return f.rpc(method,input);
 };
 await new PageRendererAdapter(f.view,rpc,'primary',f.id).flush();
 assert.deepEqual(f.calls.filter(c=>c.method==='pageEdit').map(c=>c.input.value),['first','newer complete edit']);assert.equal(f.view.drafts.edits.size,0);
});
test('adapter never automatically retries an uncertain press, even with a new mutation ID',async()=>{
 const f=fixture();f.view.drafts.edits.clear();let sent=0;
 const adapter=new PageRendererAdapter(f.view,async()=>{sent++;throw Error('Disconnected after dispatch');},'primary',f.id);
 const action={surfaceId:'page',sourceComponentId:'send',context:{entry:text}};
 await assert.rejects(adapter.press(action),/Disconnected/);await assert.rejects(adapter.press(action),/explicit reconciliation/);assert.equal(sent,1);
});
test('adapter rejects a concurrent second press and never sends a press after failed edit',async()=>{
 const f=fixture();f.view.drafts.edits.clear();let release:any,sent=0;
 const adapter=new PageRendererAdapter(f.view,async()=>{sent++;return new Promise(r=>{release=r;});},'primary',f.id);
 const action={surfaceId:'page',sourceComponentId:'send',context:{}};const first=adapter.press(action);
 await assert.rejects(adapter.press(action),/already pending/);await new Promise(r=>setImmediate(r));release({revision:2,duplicate:false});await first;assert.equal(sent,1);
 const g=fixture(),bad=new PageRendererAdapter(g.view,async(method)=>{g.calls.push({method,input:null});throw Error('Stale edit');},'primary',g.id);
 await assert.rejects(bad.press(action),/Stale edit/);assert.deepEqual(g.calls.map(c=>c.method),['pageEdit']);assert.equal(g.view.drafts.edits.size,1);
});

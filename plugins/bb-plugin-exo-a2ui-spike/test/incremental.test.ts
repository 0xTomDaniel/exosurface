import test from 'node:test';import assert from 'node:assert/strict';
import {CATALOG,UPDATE,applyDelta,validateSnapshot,latestSnapshot,moduleData,moduleNodes,moduleIds,type Delta} from '../src/workspace.ts';
import {WorkspaceView} from '../src/workspace-view.ts';import {StreamFrames} from '../src/stream-frames.ts';import {delivery} from '../src/delivery.ts';
const m=(key:string,body:any)=>({version:'v0.9.1',[key]:body});
const create=(id:string)=>m('createSurface',{surfaceId:id,catalogId:CATALOG});
const components=(id:string,nodes:any[])=>m('updateComponents',{surfaceId:id,components:nodes});
const data=(id:string,path:string,value:any)=>m('updateDataModel',{surfaceId:id,path,value});
const nodes=()=>[{id:'root',component:'Column',children:['title','input','button']},{id:'title',component:'Text',text:'Initial'},{id:'input',component:'TextField',label:'Note',value:{path:'/note'}},{id:'button',component:'Button',child:'label',action:{event:{name:'submit',context:{note:{path:'/note'}}}}},{id:'label',component:'Text',text:'Submit'}];
const initial=()=>validateSnapshot({revision:1,messages:['one','two'].flatMap(id=>[create(id),components(id,nodes()),data(id,'/',{note:'committed',x:1})])});
const delta=(baseRevision:number,messages:any[]):Delta=>({baseRevision,revision:baseRevision+1,messages});
const boot=(v:WorkspaceView,s=initial())=>v.accept({epoch:'e',checkpoint:s,updates:[],preview:null});
test('Pinned official renderer accepts stable v0.9.1, retains untouched surfaces/components and applies data/component deltas',()=>{
 const v=new WorkspaceView(()=>{},()=>{}),s=initial();boot(v,s);const p=v.processor,one=p.getSurfaces().get('one'),two=p.getSurfaces().get('two');
 const d=delta(1,[data('one','/x',2)]);v.accept({epoch:'e',updates:[d],preview:null});assert.equal(v.processor,p);assert.equal(p.getSurfaces().get('one'),one);assert.equal(p.getSurfaces().get('two'),two);assert.equal(two!.dataModel.get('/x'),1);assert.equal(one!.dataModel.get('/x'),2);
 assert.deepEqual(v.committed!.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId==='two'),s.messages.slice(3));
 v.accept({epoch:'e',updates:[delta(2,[components('one',[{id:'title',component:'Text',text:'Changed'}])])],preview:null});assert.equal(moduleNodes(v.committed!,'one').find(n=>n.id==='title').text,'Changed');assert.equal(moduleNodes(v.committed!,'one').length,5);v.dispose();
});
test('Progressive initial create/root/child/data accepts dangling references until complete; explicit deletion retires only its target',()=>{
 let s=applyDelta(null,delta(0,[create('novel')]));assert.ok(s.incomplete);
 s=applyDelta(s,delta(1,[components('novel',[{id:'root',component:'Column',children:['later']}]) ]));assert.ok(s.incomplete);
 s=applyDelta(s,delta(2,[components('novel',[{id:'later',component:'Text',text:'Arrived'}]) ]));assert.equal(s.incomplete,false);
 s=applyDelta(s,delta(3,[data('novel','/x',10)]));assert.equal(moduleData(s,'novel').x,10);
 const gone=applyDelta(s,delta(4,[m('deleteSurface',{surfaceId:'novel'})]));assert.deepEqual(moduleIds(gone),[]);
});
test('Stable leaf removal/root replacement use official DataModel semantics; stale/unknown/unsafe/oversize updates rejected',()=>{
 const s=initial();const next=applyDelta(s,delta(1,[m('updateDataModel',{surfaceId:'one',path:'/x'})]));assert.equal(moduleData(next,'one').x,undefined);assert.equal(moduleData(s,'one').x,1);
 for(const d of[delta(0,[data('one','/x',2)]),delta(1,[data('absent','/x',2)]),delta(1,[create('one')]),delta(1,[data('one','/__proto__/x','bad')]),delta(1,[data('one','/x','a'.repeat(42000))]),delta(1,[components('one',[{id:'title',component:'Text',text:{call:'evil'}}])]),delta(1,[components('one',[{id:'root',component:'Column',children:['root']}])]),delta(1,[{version:'v0.9',deleteSurface:{surfaceId:'one'}}]),delta(1,[m('createSurface',{surfaceId:'three',catalogId:CATALOG,sendDataModel:true})])])assert.throws(()=>applyDelta(s,d));
});
test('Native checkpoint plus deltas restores exactly; failed patches, prose and abandoned branch do not become authority',()=>{
 const s=initial(),d=delta(1,[data('one','/x',2)]),checkpoint={message:{role:'toolResult',toolName:'publish_workspace',details:{workspace:s}}},patch={message:{role:'toolResult',toolName:UPDATE,details:{delta:d}}};
 assert.deepEqual(latestSnapshot([checkpoint,patch,{message:{role:'assistant',content:[]}}]),applyDelta(s,d));
 assert.deepEqual(latestSnapshot([checkpoint,{...patch,message:{...patch.message,isError:true}}]),s);
 assert.deepEqual(latestSnapshot([checkpoint]),s);assert.throws(()=>latestSnapshot([patch]));
});
test('Bounded cursor catch-up uses deltas; missed epoch/window returns checkpoint instead of hiding a gap',()=>{
 const s=applyDelta(initial(),delta(1,[data('one','/x',2)])),updates=[delta(1,[data('one','/x',2)])],projection={epoch:'e',workspace:s,updates};
 assert.equal(delivery(projection,{epoch:'e',revision:1},null).updates.length,1);assert.ok(!Object.hasOwn(delivery(projection,{epoch:'e',revision:1},null),'checkpoint'));
 for(const cursor of[null,{epoch:'old',revision:1},{epoch:'e',revision:0},{epoch:'e',revision:99}])assert.deepEqual(delivery(projection,cursor,null).checkpoint,s);
});
test('Duplicate delivery idempotent; revision gap fails visibly without inventing state; new epoch restores checkpoint',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);const p=v.processor,d=delta(1,[data('one','/x',2)]),envelope={epoch:'e',updates:[d],preview:null};v.accept(envelope);v.accept(envelope);assert.equal(v.processor,p);assert.equal(v.committed?.revision,2);
 assert.throws(()=>v.accept({epoch:'e',updates:[delta(4,[data('one','/x',5)])],preview:null}));assert.equal(v.committed?.revision,2);
 v.accept({epoch:'new',checkpoint:initial(),updates:[],preview:null});assert.notEqual(v.processor,p);assert.equal(v.committed?.revision,1);v.dispose();
});
test('Unsent local draft survives unaffected data/heading deltas; submit acknowledgement clears it without aliasing commit',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);const model=v.processor.getSurfaces().get('one')!.dataModel;
 model.set('/note','draft');assert.equal(v.drafts.edits.size,1);assert.equal(moduleData(v.committed!,'one').note,'committed');
 v.accept({epoch:'e',updates:[delta(1,[data('two','/x',7),components('one',[{id:'title',component:'Text',text:'Other text'}])])],preview:null});assert.equal(model.get('/note'),'draft');assert.equal(v.drafts.edits.size,1);
 v.accept({epoch:'e',updates:[delta(2,[data('one','/note','draft')])],preview:null});assert.equal(v.drafts.edits.size,0);assert.equal(moduleData(v.committed!,'one').note,'draft');v.dispose();
});
test('Complete-token preview appears before native commit; abort restores committed state AND draft, never acknowledgement',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);const p=v.processor;p.getSurfaces().get('one')!.dataModel.set('/note','draft');
 const messages=[data('one','/note','draft'),components('one',[{id:'title',component:'Text',text:'Preview'}])];
 v.accept({epoch:'e',updates:[],preview:{toolCallId:'t',baseRevision:1,messages}});assert.ok(v.preview);assert.equal(v.committed?.revision,1);assert.equal(moduleData(v.committed!,'one').note,'committed');assert.equal(v.drafts.edits.size,1);
 v.accept({epoch:'e',updates:[],preview:null});assert.equal(v.preview,null);assert.equal(moduleNodes(v.displayed!,'one').find(n=>n.id==='title').text,'Initial');assert.equal(v.drafts.edits.size,1);assert.equal(v.processor.getSurfaces().get('one')!.dataModel.get('/note'),'draft');v.dispose();
});
test('Component-level preview: a growing last message shows each new component and commits without rebuilding',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);const p=v.processor;
 const kids=[{id:'root',component:'Column',children:['a','b']},{id:'a',component:'Text',text:'First'},{id:'b',component:'Text',text:'Second'}];
 const step=(k:number)=>({epoch:'e',updates:[],preview:{toolCallId:'t',baseRevision:1,messages:[create('three'),components('three',kids.slice(0,k))]}});
 v.accept(step(1));assert.equal(moduleNodes(v.displayed!,'three').length,1);
 v.accept(step(2));assert.equal(moduleNodes(v.displayed!,'three').length,2);assert.equal(v.processor,p);
 v.accept(step(3));assert.equal(moduleNodes(v.displayed!,'three').length,3);assert.equal(v.processor,p);
 const surface=p.getSurfaces().get('three')!;assert.ok(surface);
 v.accept({epoch:'e',updates:[delta(1,[create('three'),components('three',kids),data('three','/',{})])],preview:null});
 assert.equal(v.processor,p);assert.equal(v.preview,null);assert.equal(v.committed?.revision,2);assert.equal(p.getSurfaces().get('three'),surface);v.dispose();
});
test('Matching preview commits without rebuilding the processor or replaying preview frames',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);const p=v.processor,messages=[data('one','/x',3)];
 v.accept({epoch:'e',updates:[],preview:{toolCallId:'t',baseRevision:1,messages}});v.accept({epoch:'e',updates:[delta(1,messages)],preview:null});assert.equal(v.processor,p);assert.equal(v.preview,null);assert.equal(v.committed?.revision,2);assert.equal(p.getSurfaces().get('one')!.dataModel.get('/x'),3);v.dispose();
});
test('Streaming scanner previews each completed component of an updateComponents message while it is still being written',()=>{
 const kids=[{id:'root',component:'Column',children:['a','b','c']},{id:'a',component:'Text',text:'First } ] "quoted"'},{id:'b',component:'Text',text:'Second'},{id:'c',component:'Text',text:'Third'}];
 const frames=[create('one'),components('one',kids),data('one','/',{})],text=JSON.stringify({baseRevision:0,messages:frames}),p=new StreamFrames();
 const seen:number[]=[];let last:any;
 for(const c of text){const v=p.append(c);if(!v)continue;last=v;const u=v.messages.find((x:any)=>x.updateComponents);seen.push(u?u.updateComponents.components.length:0);}
 assert.deepEqual(seen,[0,1,2,3,4,4,4]);assert.deepEqual(last,{baseRevision:0,messages:frames});
 // Each partial preview applies as a valid incremental snapshot, marked incomplete until children arrive.
 const q=new StreamFrames();let partial:any;for(const c of JSON.stringify({baseRevision:0,messages:[create('one'),components('one',kids)]}).slice(0,-60)){const v=q.append(c);if(v)partial=v;}
 const snap=applyDelta(null,{...partial,revision:1});assert.equal(snap.incomplete,true);
 // components before surfaceId: no partial preview (complete message still previews)
 const r=new StreamFrames();assert.equal(r.append('{"baseRevision":0,"messages":[{"version":"v0.9.1","updateComponents":{"components":[{"id":"root","component":"Text","text":"x"},'),null);
});
test('Retired/incompatible controls expose drafts; preview prefixes never silently discard them',()=>{
 const v=new WorkspaceView(()=>{},()=>{});boot(v);v.processor.getSurfaces().get('one')!.dataModel.set('/note','keep');
 v.accept({epoch:'e',updates:[delta(1,[m('deleteSurface',{surfaceId:'one'})])],preview:null});assert.equal(v.orphan[0].value,'keep');assert.equal(v.drafts.edits.size,1);v.dispose();
});
test('Streaming scanner accepts ONLY delimited complete JSON frames, handles arbitrary chunks, strings and escapes, and bounds memory',()=>{
 const frames=[create('one'),components('one',[{id:'root',component:'Text',text:'Quotes " and braces } ] \\ end'}]),data('one','/',{})],text=JSON.stringify({baseRevision:0,messages:frames}),p=new StreamFrames();let last:any;
 for(const c of text){const v=p.append(c);if(v)last=v;}assert.deepEqual(last,{baseRevision:0,messages:frames});
 const q=new StreamFrames();assert.equal(q.append('{"baseRevision":0,"messages":[{"version":"v0.9.1","updateComponents":{"surfaceId":"one","components":[{"id":"root","component":"Text","text":"part'),null);
 assert.equal(new StreamFrames().append('{"messages":['),null);assert.throws(()=>new StreamFrames().append(' '.repeat(90000)));
});

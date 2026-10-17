import test from 'node:test';import assert from 'node:assert/strict';
import {CATALOG,RESET,rendererMessages,moduleIds,moduleData,validateSnapshot,validateAction,latestSnapshot,inputBindings,checkPath} from '../src/workspace.ts';
import {DraftStore} from '../src/drafts.ts';
import {MessageProcessor,STRICT_VALIDATION} from '@a2ui/web_core/v0_9';import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
const messages=(id:string)=>[
 {version:'v0.9',createSurface:{surfaceId:id,catalogId:CATALOG}},
 {version:'v0.9',updateComponents:{surfaceId:id,components:[{id:'root',component:'Column',children:['heading','note','options','submit']},{id:'heading',component:'Text',text:'A novel composition',variant:'h2'},{id:'note',component:'TextField',label:'Your assumption',value:{path:'/note'}},{id:'options',component:'ChoicePicker',label:'Alternatives',value:{path:'/choice'},options:[{label:'A',value:'a'},{label:'B',value:'b'}]},{id:'submit',component:'Button',child:'label',action:{event:{name:'reconsider_assumptions',context:{note:{path:'/note'},selection:{path:'/choice'},constant:'fixed'}}}},{id:'label',component:'Text',text:'Reconsider'}]}},
 {version:'v0.9',updateDataModel:{surfaceId:id,path:'/',value:{note:'',choice:[]}}}
];
const snapshot=(revision=1)=>validateSnapshot({revision,messages:messages('unknown_module'),layout:{columns:1}});
const event=()=>({surfaceId:'unknown_module',sourceComponentId:'submit',timestamp:new Date().toISOString(),name:'reconsider_assumptions',context:{note:'A different assumption',selection:['b'],constant:'fixed'}});
test('Generative identifiers/count/order/layout: empty, one, three, eight; nine rejected',()=>{
 for(const count of[0,1,3,8]){const s=validateSnapshot({revision:1,messages:Array.from({length:count},(_,i)=>messages(`novel_${i}`)).flat(),layout:{columns:3,wide:count?['novel_0']:[]}});assert.equal(moduleIds(s).length,count);}
 assert.throws(()=>validateSnapshot({revision:1,messages:Array.from({length:9},(_,i)=>messages(`novel_${i}`)).flat()}));
 assert.throws(()=>validateSnapshot({revision:1,messages:messages('x'),layout:{columns:1,wide:['missing']}}));
});
test('Dynamic Button event submits ONLY declared editable bindings; literal keys stay exact',()=>{
 const s=snapshot(),offered=event();assert.deepEqual(validateAction(s,1,offered),offered);
 for(const mutate of[(a:any)=>a.context.selection=['not-an-option'],(a:any)=>a.context.selection=['a','b'],(a:any)=>a.context.note=42,(a:any)=>a.context.constant='changed',(a:any)=>a.context.extra='injected',(a:any)=>delete a.context.note,(a:any)=>a.sourceComponentId='note',(a:any)=>a.name='shell_command',(a:any)=>a.surfaceId='arbitrary']){const a=event();mutate(a);assert.throws(()=>validateAction(s,1,a));}
 assert.throws(()=>validateAction(s,0,event()));
});
test('Cycles, missing/unreachable children, duplicate surfaces, invalid inputs/bindings and pointer escapes rejected',()=>{
 for(const mutate of[(s:any)=>s.messages.push(...messages('unknown_module')),(s:any)=>s.messages[1].updateComponents.components[0].children.push('root'),(s:any)=>s.messages[1].updateComponents.components[0].children.push('absent'),(s:any)=>s.messages[2].updateDataModel.value.choice=['absent'],(s:any)=>s.messages[1].updateComponents.components[2].value={path:'/__proto__/evil'},(s:any)=>s.messages[1].updateComponents.components[2].value='not-bound']){const s={revision:1,messages:messages('unknown_module')};mutate(s);assert.throws(()=>validateSnapshot(s));}
 for(const path of['/constructor/x','/prototype','/__proto__/x','relative','/'])assert.throws(()=>checkPath(path));assert.equal(checkPath('/foo~1bar'),'/foo~1bar');
});
test('Renderer actual CheckBox/Slider/Tabs/List/Divider vocabulary validates, not invented schemas',()=>{
 const s={revision:1,messages:messages('rich')};const n=s.messages[1].updateComponents.components as any[];
 n[0].children.push('bool','range','tabs','divider');n.push({id:'bool',component:'CheckBox',label:'Assume yes',value:{path:'/yes'}},{id:'range',component:'Slider',label:'Priority',min:0,max:100,value:{path:'/priority'}},{id:'tabs',component:'Tabs',tabs:[{title:'Details',child:'list'}]},{id:'list',component:'List',children:['extra']},{id:'extra',component:'Text',text:'Details'},{id:'divider',component:'Divider',axis:'horizontal'});
 Object.assign(s.messages[2].updateDataModel.value,{yes:false,priority:50});assert.ok(validateSnapshot(s));
});
test('Local drafts survive compatible generated revision; not committed/model-known until publication ack',()=>{
 const s=snapshot(),drafts=new DraftStore(),n=inputBindings(s,'unknown_module').get('/note');drafts.record('unknown_module','/note',n,'unsent',moduleData(s,'unknown_module').note);
 const reshaped=snapshot(2);reshaped.messages[1].updateComponents.components[1].text='Changed heading';assert.equal(drafts.reconcile(reshaped).apply[0].value,'unsent');assert.equal(moduleData(reshaped,'unknown_module').note,'');
 const committed=snapshot(3);moduleData(committed,'unknown_module').note='unsent';assert.equal(drafts.reconcile(committed).apply.length,0);assert.equal(drafts.edits.size,0);
});
test('Retired/incompatible local drafts surfaced for recovery, not silently discarded or mapped to other module',()=>{
 const s=snapshot(),drafts=new DraftStore(),n=inputBindings(s,'unknown_module').get('/note');drafts.record('unknown_module','/note',n,'unsent','');
 const retired=validateSnapshot({revision:2,messages:messages('other')});assert.equal(drafts.reconcile(retired).orphan[0].value,'unsent');assert.equal(drafts.edits.size,1);
});
test('Actual renderer data-model edit cannot mutate the authoritative publication; subscription records unsent draft',()=>{
 const s=snapshot(),p=new MessageProcessor([basicCatalog],undefined,{validationConfig:STRICT_VALIDATION});p.processMessages(rendererMessages(s));const store=new DraftStore(),data=p.getSurfaces().get('unknown_module')!.dataModel,n=inputBindings(s,'unknown_module').get('/note');
 const sub=data.subscribe('/note',v=>store.record('unknown_module','/note',n,v,moduleData(s,'unknown_module').note));data.set('/note','unsent');
 assert.equal(moduleData(s,'unknown_module').note,'');assert.equal(data.get('/note'),'unsent');assert.equal(store.edits.size,1);sub.unsubscribe();p.dispose();
});
test('Native branch reset is append-only, retires old UI, then next real publication restores',()=>{
 const s=snapshot(),reset={type:'custom',customType:RESET,data:{workspace:{revision:2,messages:[]}}},entry={message:{role:'toolResult',toolName:'publish_workspace',details:{workspace:s}}};
 assert.equal(latestSnapshot([entry,reset])?.messages.length,0);assert.deepEqual(latestSnapshot([reset,entry]),s);
});

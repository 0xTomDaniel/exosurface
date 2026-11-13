// Owner-side durable snapshot/input reducer. Builtins + extracted local grammar only, no legacy runtime.
import { join } from 'node:path';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createExclusive, load, save } from './store.ts';
import { changeMessages, type Edit } from './snapshot-format.ts';
import { moduleIds, moduleNodes, moduleData, isInput, type Snapshot, type InputNode, type ButtonNode } from './snapshot-data.ts';
export const MAX_PAGE_BYTES=1024*1024, MAX_TEXT_BYTES=512*1024;
export type InputValue=string|number|boolean|string[];
export type Mutation={baseRevision:number;mutationId:string};
export type PageEdit=Mutation&{surfaceId:string;ref:string;value:InputValue};
export type PagePress=Mutation&{surfaceId:string;ref:string;values:Record<string,InputValue>};
export type PageDraw=Mutation&{snapshot?:string;edits?:Edit[];delete?:string[]};
type Receipt={id:string;kind:string;hash:string;revision:number;dispatch?:'pending'|'sent'|'unknown'};
export type PageDocument={schema:'exosurface-pages/0';revision:number;snapshot:Snapshot;receipts:Receipt[]};
const file=(state:string)=>join(state,'current-pages.json');
const own=(v:object,k:string)=>Object.hasOwn(v,k);
export function identifier(v:unknown):asserts v is string {if(typeof v!=='string'||!/^[a-zA-Z0-9_-]{1,80}$/.test(v)||['__proto__','constructor','prototype'].includes(v))throw Error('Invalid or forbidden page/ref/mutation identifier');}
/** Pre-validation budget, not a claim to mitigate legacy dependencies (none are imported here). */
export function pageBudget(v:unknown){
 let nodes=0;
 const visit=(x:unknown,depth:number)=>{if(depth>20||++nodes>20000)throw Error('Page nesting/node budget exceeded; nothing changed');if(typeof x==='number'&&!Number.isFinite(x))throw Error('Non-finite page number');if(x&&typeof x==='object'){if(Object.keys(x).length>2048)throw Error('Page collection budget exceeded');for(const[k,c]of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))throw Error('Forbidden page key');visit(c,depth+1);}}};
 visit(v,0);if(Buffer.byteLength(JSON.stringify(v,null,2)+'\n')>MAX_PAGE_BYTES)throw Error('Page exceeds 1MiB; nothing changed');
}
export function readPages(state:string):PageDocument|null{
 if(!existsSync(file(state)))return null;
 if(statSync(file(state)).size>MAX_PAGE_BYTES)throw Error('Persisted pages exceed supported budget');
 const d=load(file(state));pageBudget(d);
 if(d.schema!=='exosurface-pages/0'||!Number.isSafeInteger(d.revision)||d.revision<1||d.snapshot?.revision!==d.revision||!Array.isArray(d.receipts)||d.receipts.length>128)throw Error('Unsupported page state; refusing overwrite');
 checkSnapshot(d.snapshot);return d;
}
function checkSnapshot(s:Snapshot){
 if(!Array.isArray(s.messages)||s.messages.length>24||s.messages.length%3)throw Error('Only 8 complete current pages supported');
 const ids=moduleIds(s);if(new Set(ids).size!==ids.length||ids.length!==s.messages.length/3)throw Error('Duplicate/missing current page');
 for(const sid of ids){identifier(sid);const rows=s.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId===sid);
  if(rows.length!==3||!rows[0]?.createSurface||!rows[1]?.updateComponents||!rows[2]?.updateDataModel||rows[2].updateDataModel.path!=='/')throw Error('Invalid persisted page messages');
  const nodes=moduleNodes(s,sid);if(!Array.isArray(nodes)||nodes.length>64||new Set(nodes.map(n=>n.id)).size!==nodes.length||!nodes.some(n=>n.id==='root'))throw Error('Invalid page components');
  for(const n of nodes){identifier(n.id);if(!['Text','Column','Row','List','Card','Button','TextField','CheckBox','ChoicePicker','Slider','Divider','Tabs','Callout','Metric','Timeline','Table','Chart','Flow','Disclosure'].includes(n.component))throw Error('Unsupported page component');}
  const data=moduleData(s,sid);if(!data||Array.isArray(data)||typeof data!=='object')throw Error('Invalid page data');
  const inputs=new Set<string>();
  for(const n of nodes){
   if(isInput(n)){
    if(n.value.path!==`/${n.id}`||!own(data,n.id))throw Error('Invalid page input binding');
    inputValue(n,data[n.id]);inputs.add(n.id);
   }
   if(n.component==='Button'){
    const event=n.action.event;if(Object.keys(event.context).length>24)throw Error('Invalid offered button');identifier(event.name);
    for(const[k,v]of Object.entries(event.context)){identifier(k);if(v.path!==`/${k}`||!nodes.some(x=>x.id===k&&['TextField','CheckBox','ChoicePicker','Slider'].includes(x.component)))throw Error('Button sends unknown input ref');}
   }
  }
  if(Object.keys(data).some(k=>!inputs.has(k)))throw Error('Page data has an unoffered input');
 }
}
function inputValue(n:InputNode,v:unknown):InputValue{
 if(typeof v==='string'&&Buffer.byteLength(v)>MAX_TEXT_BYTES)throw Error('Textbox exceeds 512KiB; nothing changed');
 if(n.component==='TextField'&&typeof v==='string')return v;
 if(n.component==='CheckBox'&&typeof v==='boolean')return v;
 if(n.component==='Slider'&&typeof v==='number'&&Number.isFinite(v)&&v>=n.min&&v<=n.max)return v;
 if(n.component==='ChoicePicker'&&Array.isArray(v)&&v.length<=24&&v.every(x=>typeof x==='string'&&x.length<=160&&n.options.some(o=>o.value===x))&&new Set(v).size===v.length&&(n.variant==='multipleSelection'||v.length<=1))return v as string[];
 throw Error('Value outside offered page input contract; nothing changed');
}
function setInput(s:Snapshot,sid:string,ref:string,value:unknown){
 identifier(sid);identifier(ref);const n=moduleNodes(s,sid).find(x=>x.id===ref);
 const data=moduleData(s,sid);if(!n||!isInput(n)||n.value.path!==`/${ref}`||!data)throw Error('Unknown/noneditable page ref');
 data[ref]=inputValue(n,value);
}
function locked<T>(state:string,f:()=>T):T{
 const lock=join(state,'pages.lock');if(!createExclusive(lock,{pid:process.pid}))throw Error('Page mutation locked; interrupted lock requires reconciliation');
 try{return f();}finally{unlinkSync(lock);}
}
function mutate(state:string,kind:'draw'|'edit'|'press',args:PageDraw|PageEdit|PagePress):{revision:number;duplicate:boolean;message?:string}{return locked(state,()=>{
 pageBudget(args);
 const keys=kind==='draw'?['baseRevision','mutationId','snapshot','edits','delete']:kind==='edit'?['baseRevision','mutationId','surfaceId','ref','value']:['baseRevision','mutationId','surfaceId','ref','values'];
 if(!args||typeof args!=='object'||Object.keys(args).some(k=>!keys.includes(k)))throw Error('Invalid page mutation envelope');
 identifier(args.mutationId);if(!Number.isSafeInteger(args.baseRevision)||args.baseRevision<0)throw Error('Invalid page base revision');
 const hash=createHash('sha256').update(JSON.stringify(args)).digest('hex'),current=readPages(state),receipt=current?.receipts.find(r=>r.id===args.mutationId);
 if(receipt){if(receipt.hash!==hash||receipt.kind!==kind)throw Error('Mutation ID reused with different payload');if(kind==='press'&&receipt.dispatch!=='sent')throw Error('Prior press dispatch outcome unknown; do not retry');return {revision:receipt.revision,duplicate:true};}
 if(args.baseRevision!==(current?.revision??0))throw Error('Stale page revision; refresh without discarding edits');
 const snapshot:Snapshot=structuredClone(current?.snapshot??{revision:0,messages:[]});let message:string|undefined;
 if(kind==='draw'){
  const a=args as PageDraw;if(a.edits&&(a.edits.length>24||a.edits.some(e=>!['replace','insertAfter','insertInto','remove'].includes(e.op))))throw Error('Invalid/bounded snapshot edits required');
  if(a.delete&&(a.delete.length>8||a.delete.some(s=>{identifier(s);return false;})))throw Error('Too many deleted pages');
  const delta=changeMessages(current?.snapshot??null,a),pages=new Map(moduleIds(snapshot).map(sid=>[sid,snapshot.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId===sid)]));
  for(const m of delta.messages){if(m.deleteSurface)pages.delete(m.deleteSurface.surfaceId);else if(m.createSurface)pages.set(m.createSurface.surfaceId,[m]);else {const sid=m.updateComponents?m.updateComponents.surfaceId:m.updateDataModel.surfaceId;pages.get(sid)!.push(m);}}
  snapshot.messages=[...pages.values()].flat();
 }else{
  const a=args as PageEdit|PagePress;identifier(a.surfaceId);identifier(a.ref);
  if(kind==='edit')setInput(snapshot,a.surfaceId,a.ref,(a as PageEdit).value);
  else{
   const press=a as PagePress;if(!press.values||Array.isArray(press.values)||typeof press.values!=='object'||Object.keys(press.values).length>24)throw Error('Press values must be a bounded input map');
   const button=moduleNodes(snapshot,a.surfaceId).find((n):n is ButtonNode=>n.id===a.ref&&n.component==='Button');if(!button)throw Error('Unknown/nonbutton page ref');
   for(const[ref,v]of Object.entries(press.values))setInput(snapshot,a.surfaceId,ref,v);
   const event=button.action.event;identifier(event.name);const context:Record<string,unknown>={};
   for(const[k,v]of Object.entries(event.context)){identifier(k);const data=moduleData(snapshot,a.surfaceId);if(v.path!==`/${k}`||!data||!own(data,k))throw Error('Button sends unknown input ref');context[k]=data[k];}
   message=JSON.stringify({type:'exosurface.page.press',surfaceId:a.surfaceId,ref:a.ref,name:event.name,mutationId:a.mutationId,revision:args.baseRevision+1,values:context});
   if(Buffer.byteLength(message)>MAX_TEXT_BYTES)throw Error('Button payload exceeds 512KiB; nothing changed');
  }
 }
 const revision=args.baseRevision+1;snapshot.revision=revision;checkSnapshot(snapshot);
 const next:PageDocument={schema:'exosurface-pages/0',revision,snapshot,receipts:[...(current?.receipts??[]).slice(-127),{id:args.mutationId,kind,hash,revision,...(kind==='press'?{dispatch:'pending' as const}:{})}]};
 pageBudget(next);save(file(state),next);return {revision,duplicate:false,...(message?{message}:{})};
 });}
export const drawPages=(s:string,a:PageDraw)=>mutate(s,'draw',a);
export const editPages=(s:string,a:PageEdit)=>mutate(s,'edit',a);
export const pressPages=(s:string,a:PagePress)=>mutate(s,'press',a);
export function markPress(state:string,id:string,dispatch:'sent'|'unknown'){locked(state,()=>{const d=readPages(state);const receipt=d?.receipts.find(r=>r.id===id&&r.kind==='press');if(!d||!receipt)throw Error('Missing press receipt');receipt.dispatch=dispatch;save(file(state),d);});}

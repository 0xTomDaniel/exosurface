// Application vocabulary/IR only. json-render composes; the existing A2UI renderer renders.
import {z} from 'zod';
import type {Experimental_CompositionCatalog,Spec} from '@json-render/core';
import {CATALOG,applyDelta,moduleIds,moduleNodes,moduleData,checkPath,type Snapshot,type Delta} from '../src/workspace.ts';
export const OFFER='configure_composition', OFFER_ENTRY='exosurface-composition-offer', COMMIT='exosurface-composition-commit', RUN='exosurface-composition-run';
const id=z.string().regex(/^[a-zA-Z][a-zA-Z0-9_-]{0,47}$/);
const key={key:id};
const contextValue=z.union([z.string().max(500),z.number().finite(),z.boolean(),z.object({path:z.string().refine(p=>{try{checkPath(p);return true;}catch{return false;}})}).strict()]);
const props={
 Column:z.object(key).strict(), Row:z.object(key).strict(),
 Text:z.object({...key,slot:id,variant:z.enum(['h1','h2','h3','body','caption'])}).strict(),
 TextField:z.object({...key,label:z.string().min(1).max(120),path:z.string().refine(p=>{try{checkPath(p);return true;}catch{return false;}})}).strict(),
 Button:z.object({...key,label:z.string().min(1).max(120),event:id,context:z.record(id,contextValue)}).strict(),
 Divider:z.object(key).strict(),
};
const element=z.object({type:z.enum(['Column','Row','Text','TextField','Button','Divider']),props:z.object(key).passthrough()}).strict();
export const offerSchema=z.object({
 surfaceId:id, purpose:z.string().min(1).max(600),
 candidates:z.array(z.object({id,description:z.string().min(1).max(500),element,root:z.boolean(),resource:id.optional()}).strict()).min(3).max(16),
 slots:z.record(id,z.object({brief:z.string().min(1).max(500),fallback:z.string().min(1).max(700)}).strict()),
 data:z.record(id,z.string().max(1000)),required:z.array(id).min(1).max(12),
}).strict();
export type Offer=z.infer<typeof offerSchema>;
export function validateOffer(raw:unknown):Offer{
 const o=offerSchema.parse(raw);if(Buffer.byteLength(JSON.stringify(o))>16000)throw Error('Candidate contract exceeds 16KB');
 const ids=new Set<string>(),keys=new Set<string>(),usedSlots=new Set<string>();let roots=0;
 for(const c of o.candidates){
  if(ids.has(c.id)||keys.has(c.element.props.key))throw Error('Unique candidate and semantic component keys required');ids.add(c.id);keys.add(c.element.props.key);
  const {type}=c.element,p=c.element.props as any;props[type].parse(p);
  if(c.root){if(!['Column','Row'].includes(type))throw Error('Only layout candidates may be root');roots++;}
  if(type==='Text'){if(!o.slots[p.slot])throw Error('Unknown copy slot');usedSlots.add(p.slot);}
  if(type==='TextField'&&(p.path.split('/').length!==2||typeof o.data[p.path.slice(1)]!=='string'))throw Error('Text field needs a known string leaf');
  if(type==='Button')for(const v of Object.values(p.context) as any[])if(v?.path&&(v.path.split('/').length!==2||typeof o.data[v.path.slice(1)]!=='string'))throw Error('Button needs a known data binding');
 }
 if(!roots||Object.keys(o.slots).length>12||usedSlots.size!==Object.keys(o.slots).length||o.data.copy!==undefined)throw Error('Incomplete bounded candidate contract');
 if(o.required.some(k=>!keys.has(k)))throw Error('Unknown required semantic key');return o;
}
// Explicitly recover only a failed native call's serialization, without regenerating
// paid content or rewriting/pretending the historical tool call succeeded.
export function recoverOffer(branch:readonly any[],toolCallId:string):Offer{
 let args:any,failed=false;for(const e of branch){const m=e.message;
  if(m?.role==='assistant')for(const c of m.content??[])if(c.type==='toolCall'&&c.id===toolCallId&&c.name===OFFER)args=c.arguments;
  if(m?.role==='toolResult'&&m.toolCallId===toolCallId&&m.toolName===OFFER&&m.isError)failed=true;
 }
 if(!args||!failed)throw Error('Exact failed native candidate call required');const repaired=structuredClone(args);
 for(const k of ['slots','data'])if(typeof repaired[k]==='string')repaired[k]=JSON.parse(repaired[k]);return validateOffer(repaired);
}
const specSchema=z.object({root:z.string(),elements:z.record(z.string(),z.object({type:z.string(),props:z.record(z.string(),z.unknown()),children:z.array(z.string())}).strict()),state:z.record(z.string(),z.unknown()).optional()}).strict();
export const catalog:Experimental_CompositionCatalog={data:{components:Object.fromEntries(Object.entries(props).map(([type,p])=>[type,{props:p,...(['Column','Row'].includes(type)?{slots:['default']}: {})}]))},validate:value=>({success:specSchema.safeParse(value).success})};
export const fallbacks=(o:Offer)=>Object.fromEntries(Object.entries(o.slots).map(([k,v])=>[k,v.fallback]));
// Semantic keys, bindings, labels and offered events are app-owned, never inferred from a decision answer.
export function mapSpec(o:Offer,spec:Spec,copy:Record<string,string>,current:Snapshot|null,complete=false):Delta{
 if(!specSchema.safeParse(spec).success)throw Error('Unsupported composer IR');
 const elements=Object.entries(spec.elements),byNode=new Map(elements.map(([k,e])=>[k,k===spec.root?'root':e.props.key as string]));
 const semantic=new Set(elements.map(([,e])=>e.props.key));if(semantic.size!==elements.length)throw Error('Duplicate semantic key');
 if(complete&&o.required.some(k=>!semantic.has(k)))throw Error('Composition omitted required information or controls');
 const nodes:any[]=[],known=new Map(o.candidates.map(c=>[JSON.stringify(c.element),c]));
 for(const [node,e]of elements){
  if(!known.has(JSON.stringify({type:e.type,props:e.props})))throw Error('Composer changed candidate props');
  const p=e.props as any,id=byNode.get(node)!;
  if(e.type==='Column'||e.type==='Row')nodes.push({id,component:e.type,children:(e.children??[]).map(k=>{if(!byNode.has(k))throw Error('Missing child');return byNode.get(k);})});
  else if(e.type==='Text'){if(typeof copy[p.slot]!=='string')throw Error('Copy slot absent');nodes.push({id,component:'Text',text:{path:`/copy/${p.slot}`},variant:p.variant});}
  else if(e.type==='TextField')nodes.push({id,component:'TextField',label:p.label,value:{path:p.path},variant:'longText'});
  else if(e.type==='Divider')nodes.push({id,component:'Divider',axis:'horizontal'});
  else if(e.type==='Button')nodes.push({id:`${id}_label`,component:'Text',text:p.label},{id,component:'Button',child:`${id}_label`,variant:'primary',action:{event:{name:p.event,context:p.context}}});
  else throw Error('Unmapped component');
 }
 const surfaceId=o.surfaceId,exists=!!current&&moduleIds(current).includes(surfaceId),messages:any[]=[];
 if(!exists)messages.push({version:'v0.9.1',createSurface:{surfaceId,catalogId:CATALOG}});
 const previous=exists?moduleNodes(current!,surfaceId):[],changed=nodes.filter(n=>JSON.stringify(previous.find(p=>p.id===n.id))!==JSON.stringify(n));
 if(changed.length)messages.push({version:'v0.9.1',updateComponents:{surfaceId,components:changed}});
 const oldData=exists?moduleData(current!,surfaceId):{},data={...o.data,...oldData,copy:{...(oldData?.copy??{}),...copy}};
 if(JSON.stringify(oldData)!==JSON.stringify(data))messages.push({version:'v0.9.1',updateDataModel:{surfaceId,path:'/',value:data}});
 // A no-op still has a valid standard message, useful for identical warm comparisons.
 if(!messages.length)messages.push({version:'v0.9.1',updateDataModel:{surfaceId,path:'/copy',value:data.copy}});
 const baseRevision=current?.revision??0,delta={baseRevision,revision:baseRevision+1,messages};const next=applyDelta(current,delta);
 if(complete&&next.incomplete)throw Error('Incomplete final A2UI tree');return delta;
}

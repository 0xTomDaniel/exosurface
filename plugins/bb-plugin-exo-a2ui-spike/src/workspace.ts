// Bounded generative vocabulary over the REAL A2UI v0.9 Basic Catalog.
// Surface identifiers, count, order, composition and event names are model-chosen.
import {MessageProcessor, STRICT_VALIDATION, A2uiMessageSchema, DataModel} from '@a2ui/web_core/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import {z} from 'zod';
import {EXO_CATALOG,EXO_COMPONENTS,exoApiCatalog,checkExoComponent} from './exo-catalog.ts';
import {nextLayout} from './stage.ts';
export const CATALOG=basicCatalog.id, PUBLICATION='publish_workspace', UPDATE='apply_workspace', RESET='exosurface-workspace-reset';
// Basic catalog remains valid for existing surfaces; new surfaces use the Exo superset.
export const CATALOGS=[CATALOG,EXO_CATALOG];
export const MAX_BYTES=40*1024, MAX_SURFACES=8;
export const BASIC_COMPONENTS=['Text','Column','Row','List','Card','Button','TextField','CheckBox','ChoicePicker','Slider','Divider','Tabs'] as const;
export const COMPONENTS=[...BASIC_COMPONENTS,...EXO_COMPONENTS];
const identifier=z.string().regex(/^[a-zA-Z0-9_-]{1,80}$/);
const atom=z.union([z.string().max(2000),z.number().finite(),z.boolean(),z.array(z.string().max(160)).max(24)]);
export const actionSchema=z.object({name:identifier,surfaceId:identifier,sourceComponentId:identifier,timestamp:z.string().datetime(),context:z.record(identifier,atom)}).strict();
export const snapshotSchema=z.object({revision:z.number().int().positive(),messages:z.array(z.any()).max(MAX_SURFACES*3),layout:z.object({columns:z.number().int().min(1).max(3).optional(),wide:z.array(identifier).max(MAX_SURFACES).optional(),focus:identifier.optional(),beside:z.array(identifier).max(2).optional()}).strict().optional(),incremental:z.literal(true).optional(),incomplete:z.boolean().optional()}).strict();
export type Snapshot=z.infer<typeof snapshotSchema>;
// Official DataModel takes ownership of supplied value objects. Never let local
// input mutation alias the authoritative React/RPC/native publication snapshot.
export const rendererMessages=(s:Snapshot)=>structuredClone(s.messages);
export const moduleIds=(s:Snapshot):string[]=>s.messages.filter(m=>m.createSurface).map(m=>m.createSurface.surfaceId);
export const moduleNodes=(s:Snapshot,id:string):any[]=>s.messages.find(m=>m.updateComponents?.surfaceId===id)?.updateComponents.components??[];
export const moduleData=(s:Snapshot,id:string):any=>s.messages.find(m=>m.updateDataModel?.surfaceId===id)?.updateDataModel.value;
export function checkPath(path:string){
 if(!/^\/(?:[^/~]+(?:~[01][^/~]*)*\/?)+$/.test(path)||path==='/'||path.length>160)throw Error('Only bounded absolute JSON Pointer leaf bindings');
 if(path.split('/').some(k=>['__proto__','constructor','prototype'].includes(k.replace(/~1/g,'/').replace(/~0/g,'~'))))throw Error('Forbidden path segment');
 return path;
}
export function atPath(data:any,path:string){return checkPath(path).split('/').slice(1).reduce((v:any,k:string)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],data);}
function inspect(value:any,depth=0){
 if(depth>20)throw Error('JSON nesting exceeds bound');
 if(Array.isArray(value)){for(const v of value)inspect(v,depth+1);return;}
 if(!value||typeof value!=='object')return;
 for(const[k,v]of Object.entries(value)){
  if(['call','functionCall','url','html','script','__proto__','constructor','prototype'].includes(k))throw Error('Expressions/external content outside spike vocabulary');
  if(k==='path'&&v!==undefined)checkPath(v as string);inspect(v,depth+1);
 }
}
export function inputBindings(s:Snapshot,id:string):Map<string,any>{
 const result=new Map<string,any>();
 for(const n of moduleNodes(s,id))if(['TextField','CheckBox','ChoicePicker','Slider'].includes(n.component)){
  const path=n.value?.path;if(typeof path!=='string')throw Error('Editable controls require data-bound value');checkPath(path);
  if(result.has(path))throw Error('Duplicate editable binding');result.set(path,n);
 }
 return result;
}
export function inputSignature(n:any){return JSON.stringify({component:n.component,path:n.value.path,variant:n.variant,options:n.options?.map((o:any)=>o.value),min:n.min,max:n.max});}
export function validateInput(n:any,value:unknown){
 atom.parse(value);
 if(n.component==='TextField'&&typeof value==='string')return value;
 if(n.component==='CheckBox'&&typeof value==='boolean')return value;
 if(n.component==='Slider'&&typeof value==='number'&&value>=(n.min??0)&&value<=n.max)return value;
 if(n.component==='ChoicePicker'&&Array.isArray(value)&&value.every(v=>n.options.some((o:any)=>o.value===v))&&new Set(value).size===value.length&&(n.variant==='multipleSelection'||value.length<=1))return value;
 throw Error('Submitted value outside offered input contract');
}
export function validateSnapshot(value:unknown):Snapshot{
 const s=snapshotSchema.parse(value);
 if(new TextEncoder().encode(JSON.stringify(s)).length>MAX_BYTES)throw Error('Workspace exceeds 40KB bound; delete stale surfaces');
 // Data snapshot uses root '/', unlike leaf component bindings.
 inspect(s.messages.map(m=>m.updateDataModel?{...m,updateDataModel:{...m.updateDataModel,path:undefined}}:m));
 if(!s.incremental&&s.messages.length%3)throw Error('Full snapshot uses three consecutive messages per surface');
 const ids=moduleIds(s);if((!s.incremental&&ids.length!==s.messages.length/3)||new Set(ids).size!==ids.length)throw Error('Duplicate/missing surface');
 if(s.messages.some(m=>!ids.includes((m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId)))throw Error('Uncreated surface');
 if([...(s.layout?.wide??[]),...(s.layout?.beside??[]),...(s.layout?.focus?[s.layout.focus]:[])].some(id=>!ids.includes(id)))throw Error('Layout refers to absent surface');
 let incomplete=false;
 const p=new MessageProcessor([basicCatalog,exoApiCatalog] as any[],undefined,{validationConfig:{...STRICT_VALIDATION,...(s.incremental?{allowOrphanComponents:true,allowDanglingReferences:true,allowMissingRoot:true}:{})}});
 try{
  for(const id of ids){
   identifier.parse(id);const rows=s.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId===id),create=rows[0]?.createSurface,data=rows.at(-1)?.updateDataModel;
   if(!create||!data||(!s.incremental&&(rows.length!==3||!rows[1].updateComponents))||rows.length>3)throw Error('Checkpoint requires ordered create/components/data');
   rows.forEach(m=>A2uiMessageSchema.parse(m));
   if(!CATALOGS.includes(create.catalogId)||data.path!=='/'||!data.value||Array.isArray(data.value)||typeof data.value!=='object')throw Error('Wrong catalog or incomplete object data snapshot');
   const components=rows.find(m=>m.updateComponents)?.updateComponents.components??[];
   if(!Array.isArray(components)||(!s.incremental&&components.length<1)||components.length>64)throw Error('Component count outside bound');
   const nodes=new Map<string,any>();
   for(const c of components){
    identifier.parse(c.id);if(nodes.has(c.id))throw Error('Duplicate component ID');
    if(!(COMPONENTS as readonly string[]).includes(c.component))throw Error('Component outside bounded vocabulary');
    if(EXO_COMPONENTS.includes(c.component)){if(create.catalogId!==EXO_CATALOG)throw Error(`${c.component} requires a surface created with catalogId ${EXO_CATALOG}`);checkExoComponent(c);}
    if(c.action){
     const e=c.action.event;if(c.component!=='Button'||!e||Object.keys(c.action).join()!=='event')throw Error('Only declared Button event actions');
     identifier.parse(e.name);if(!e.context||typeof e.context!=='object'||Object.keys(e.context).length>8)throw Error('Bounded action context required');
     for(const[k,v]of Object.entries(e.context)){identifier.parse(k);if(v&&typeof v==='object'&&!Array.isArray(v)){if(Object.keys(v).join()!=='path')throw Error('Only literal or bound action values');checkPath((v as any).path);}else atom.parse(v);}
    }
    nodes.set(c.id,c);
   }
   const seen=new Set<string>();const walk=(nodeId:string,depth:number)=>{
    if(depth>8||seen.has(nodeId))throw Error('Cycle/shared child/depth violation');const n=nodes.get(nodeId);if(!n){if(s.incremental){incomplete=true;return;}throw Error('Missing child');}seen.add(nodeId);
    if(n.children&&!Array.isArray(n.children))throw Error('Only fixed child lists');
    for(const child of [...(n.children??[]),...(n.child?[n.child]:[]),...(n.tabs?.map((t:any)=>t.child)??[])])walk(child,depth+1);
   };
   walk('root',0);if(!s.incremental&&seen.size!==nodes.size)throw Error('Unreachable components');
   // Orphans may remain after a standard component replacement. Still reject
   // cycles/depth violations anywhere, including in currently unmounted nodes.
   const visiting=new Set<string>(),heights=new Map<string,number>();
   const height=(key:string):number=>{if(visiting.has(key))throw Error('Cycle violation');if(heights.has(key))return heights.get(key)!;const n=nodes.get(key);if(!n)return 0;visiting.add(key);const children=[...(n.children??[]),...(n.child?[n.child]:[]),...(n.tabs?.map((t:any)=>t.child)??[])];const h=children.length?1+Math.max(...children.map(height)):0;if(h>8)throw Error('Depth violation');visiting.delete(key);heights.set(key,h);return h;};
   for(const key of nodes.keys())height(key);
   const bindings=inputBindings(s,id);for(const[path,n]of bindings){const value=atPath(moduleData(s,id),path);if(s.incremental&&value===undefined)incomplete=true;else validateInput(n,value);}
   for(const n of nodes.values())for(const v of Object.values(n.action?.event?.context??{}))if((v as any)?.path&&atPath(moduleData(s,id),(v as any).path)===undefined){if(s.incremental)incomplete=true;else throw Error('Action binding absent from published data');}
  }
  p.processMessages(rendererMessages(s));if(p.getSurfaces().size!==ids.length)throw Error('Renderer surface count mismatch');return s.incremental?{...s,incomplete}:s;
 }finally{p.dispose();}
}
export const deltaSchema=z.object({baseRevision:z.number().int().nonnegative(),revision:z.number().int().positive(),messages:z.array(z.any()).min(1).max(32),layout:snapshotSchema.shape.layout}).strict();
export type Delta=z.infer<typeof deltaSchema>;
export function applyDelta(current:Snapshot|null,raw:unknown):Snapshot{
 const d=deltaSchema.parse(raw);if(d.baseRevision!==(current?.revision??0)||d.revision!==d.baseRevision+1)throw Error('Stale/nonsequential delta');
 if(JSON.stringify(d).length>MAX_BYTES)throw Error('Delta exceeds bound');
 const surfaces=new Map<string,{create:any;nodes:any[];data:any;componentVersion:string;dataVersion:string}>();
 for(const id of current?moduleIds(current):[])surfaces.set(id,{create:structuredClone(current!.messages.find(m=>m.createSurface?.surfaceId===id)),nodes:structuredClone(moduleNodes(current!,id)),data:structuredClone(moduleData(current!,id)),componentVersion:current!.messages.find(m=>m.updateComponents?.surfaceId===id)?.version??'v0.9.1',dataVersion:current!.messages.find(m=>m.updateDataModel?.surfaceId===id)?.version??'v0.9.1'});
 for(const rawMessage of d.messages){
  const m=A2uiMessageSchema.parse(rawMessage);if(m.version!=='v0.9.1')throw Error('New updates use current stable v0.9.1');
  const body=(m as any).createSurface??(m as any).updateComponents??(m as any).updateDataModel??(m as any).deleteSurface,id=identifier.parse(body.surfaceId);
  if('createSurface' in m){if(surfaces.has(id)||!CATALOGS.includes(body.catalogId))throw Error('Duplicate surface/wrong catalog');if(body.sendDataModel)throw Error('sendDataModel is outside this stock-chat spike; use explicit event context');inspect(body);surfaces.set(id,{create:structuredClone(m),nodes:[],data:{},componentVersion:m.version,dataVersion:m.version});continue;}
  const s=surfaces.get(id);if(!s)throw Error('Update/delete before create');
  if('deleteSurface' in m){surfaces.delete(id);continue;}
  if('updateComponents' in m){inspect(body);s.componentVersion=m.version;for(const n of body.components){const i=s.nodes.findIndex(c=>c.id===n.id);if(i<0)s.nodes.push(structuredClone(n));else s.nodes[i]=structuredClone(n);}continue;}
  const path=body.path??'/';if(path!=='/')checkPath(path);inspect(body.value);
  const data=new DataModel(structuredClone(s.data));if(Object.hasOwn(body,'value'))data.set(path,structuredClone(body.value));else data.delete(path);s.data=data.get('/')??{};s.dataVersion=m.version;data.dispose();
 }
 const messages=[...surfaces].flatMap(([id,s])=>[s.create,...(s.nodes.length?[{version:s.componentVersion,updateComponents:{surfaceId:id,components:s.nodes}}]:[]),{version:s.dataVersion,updateDataModel:{surfaceId:id,path:'/',value:s.data}}]);
 const layout=nextLayout(current?.layout,d.layout,d.messages,[...surfaces.keys()]);
 return validateSnapshot({revision:d.revision,messages,incremental:true,...(layout?{layout}:{})});
}
export function latestSnapshot(branch:readonly any[]):Snapshot|null{
 let current:Snapshot|null=null,start=0;
 for(let i=branch.length-1;i>=0;i--){const e=branch[i],m=e.message;
  if(e.type==='custom'&&e.customType===RESET){current=validateSnapshot(e.data.workspace);start=i+1;break;}
  if(m?.role==='toolResult'&&m.toolName===PUBLICATION&&!m.isError&&m.details?.workspace){current=validateSnapshot(m.details.workspace);start=i+1;break;}
 }
 for(const e of branch.slice(start)){const m=e.message;if(m?.role==='toolResult'&&m.toolName===UPDATE&&!m.isError)current=applyDelta(current,m.details?.delta);else if(e.type==='custom'&&e.customType==='exosurface-composition-commit')current=applyDelta(current,e.data?.delta);}
 return current;
}
export function validateAction(snapshot:Snapshot,revision:number,raw:unknown){
 if(snapshot.incomplete)throw Error('Workspace is still being composed');
 if(snapshot.revision!==revision)throw Error('Stale workspace action; refresh before trying again');
 if(JSON.stringify(raw).length>4096)throw Error('Action exceeds bound');
 const a=actionSchema.parse(raw),c=moduleNodes(snapshot,a.surfaceId).find(n=>n.id===a.sourceComponentId);
 if(c?.action?.event?.name!==a.name)throw Error('Action not offered by this component');
 const offered=c.action.event.context,bindings=inputBindings(snapshot,a.surfaceId);
 if(JSON.stringify(Object.keys(offered).sort())!==JSON.stringify(Object.keys(a.context).sort()))throw Error('Unexpected/missing action context keys');
 for(const[k,v]of Object.entries(offered)){
  const path=(v as any)?.path;
  if(path&&bindings.has(path)){validateInput(bindings.get(path),a.context[k]);continue;}
  const expected=path?atPath(moduleData(snapshot,a.surfaceId),path):v;
  if(JSON.stringify(expected)!==JSON.stringify(a.context[k]))throw Error('Action value not offered by this revision');
 }
 return a;
}

// No configured element candidates, json-render composer or page archetypes.
// Generic typed questions -> validated arbitrary bounded tree -> standard A2UI.
import {z} from 'zod';import{createHash}from'node:crypto';
import{CATALOG,applyDelta,moduleNodes,moduleData,type Snapshot,type Delta}from'../src/workspace.ts';
import type{Provider}from'../composition/provider.ts';
export const atomSchema=z.object({id:z.string().regex(/^[a-z][a-z0-9_]{0,39}$/),kind:z.enum(['content','input','action']),text:z.string().min(1).max(900),evidence:z.string().min(3).max(900),valueType:z.enum(['string','boolean']).optional(),initial:z.union([z.literal(''),z.literal(false)]).optional()}).strict();
export type Atom=z.infer<typeof atomSchema>;
export function acceptAtom(raw:unknown,source:string):Atom{const a=atomSchema.parse(raw);if(['root','g0','g1','g2'].includes(a.id))throw Error('Reserved atom identity');if(!source.includes(a.evidence))throw Error('Observer evidence absent from actual response');if(a.kind==='input'){if(!a.valueType||a.initial!==(a.valueType==='boolean'?false:''))throw Error('Invalid input semantics');}else if(a.valueType!==undefined||a.initial!==undefined)throw Error('Input fields on noninput atom');return a;}
const key=(a:Atom)=>'ob_'+createHash('sha256').update(a.id+'|'+a.kind+'|'+(a.kind==='input'?a.text+'|'+a.valueType:'')).digest('hex').slice(0,12);
const q=(question:string,criteria:Record<string,string>)=>({type:'choice' as const,instructions:question,criteria});
export type Plan={types:Record<string,string>;parents:Record<string,string>;positions:Record<string,number>};
export async function plan(atoms:Atom[],provider:Pick<Provider,'decide'>,signal:AbortSignal):Promise<Plan>{
 if(!atoms.length||atoms.length>12||new Set(atoms.map(a=>a.id)).size!==atoms.length||!atoms.some(a=>a.kind==='content')||atoms.filter(a=>a.kind==='input').length>2||atoms.filter(a=>a.kind==='action').length>1)throw Error('Semantic atom budget/identity violation');
 if(atoms.some(a=>a.kind==='action')&&!atoms.some(a=>a.kind==='input'))throw Error('Action without input contract');
 const state={atoms,instructions:'Compose a readable interface from these semantic facts and explicit input intentions. No page templates. Preserve every atom. Heading above its relevant content. Use side-by-side rows only for short comparable alternatives, not a whole page of long prose. Group related inputs and their discussion button. Avoid empty or redundant groups. Actions are synthetic conversation submissions only.'};
 const questions:any={root:q('Which generic root layout fits this content?',{Column:'Vertical reading flow, especially long content.',Row:'Short peer items, all appropriate side by side.'})};
 for(let i=0;i<3;i++)questions['g'+i]=q(`Does an additional grouping container ${i} help? Use none unless needed.`,{none:'No additional grouping necessary.',Column:'A vertical group of related components.',Row:'A horizontal group of short comparable components.',List:'A repeated collection of peers.'});
 for(const a of atoms)questions[a.id]=q(`How should semantic atom ${a.id} be presented?`,a.kind==='content'?{Text_h1:'The primary title or central question; use sparingly.',Text_h3:'A section heading.',Text_body:'Readable substantive information, options or explanation.',Text_caption:'Secondary supporting detail.'}:a.kind==='input'?a.valueType==='boolean'?{CheckBox:'Editable yes/no answer.'}:{TextField_short:'Short free-text answer.',TextField_long:'Multiline free-text answer.'}:{Button_primary:'The main conversational submit.',Button_default:'A secondary conversational submit.'});
 const picked=await provider.decide(state,questions,signal),types=Object.fromEntries(Object.entries(picked).map(([id,a])=>[id,a.choice]));
 const groups=['g0','g1','g2'].filter(id=>types[id]!=='none'),ids=[...groups,...atoms.map(a=>a.id)],layout:any={};
 for(const id of ids){layout['parent_'+id]=q(`Parent container for ${id}? Avoid cycles.`,Object.fromEntries(['root',...groups.filter(g=>g!==id)].map(g=>[g,g==='root'?'Top level':`Group ${g}, ${types[g]}`])));layout['position_'+id]=q(`Sibling position of ${id}; title first, submission after inputs.`,Object.fromEntries(Array.from({length:ids.length},(_,i)=>[String(i),`Position ${i}`])));}
 const arranged=await provider.decide({...state,selectedTypes:types},layout,signal),parents:Record<string,string>={},positions:Record<string,number>={};
 for(const id of ids){parents[id]=arranged['parent_'+id].choice;positions[id]=Number(arranged['position_'+id].choice);}
 // Reject cycles and empty containers; never silently substitute a manufactured tree.
 for(const id of ids){let p=id;const seen=new Set<string>();while(p!=='root'){if(seen.has(p)||!parents[p])throw Error('Invalid structural decision: cycle or detached node');seen.add(p);p=parents[p];}if(groups.includes(id)&&!Object.values(parents).includes(id))throw Error('Invalid structural decision: empty container');}
 return{types,parents,positions};
}
export function compile(atoms:Atom[],p:Plan,base:Snapshot|null,displayed:Snapshot|null,surfaceId:string):Delta{
 const old=(displayed??base)?moduleNodes((displayed??base)!,surfaceId):[],oldData=(displayed??base)?moduleData((displayed??base)!,surfaceId)??{}:{},components:any[]=[],data:any={};
 const actual=(id:string)=>id==='root'?'root':/^g[0-2]$/.test(id)?'ob_'+id:key(atoms.find(a=>a.id===id)!);
 const childIds=(id:string)=>Object.keys(p.parents).filter(k=>p.parents[k]===id).sort((a,b)=>p.positions[a]-p.positions[b]||a.localeCompare(b)).map(actual);
 components.push({id:'root',component:p.types.root,children:childIds('root')});for(const g of ['g0','g1','g2'])if(p.types[g]!=='none')components.push({id:actual(g),component:p.types[g],children:childIds(g)});
 const inputs=atoms.filter(a=>a.kind==='input');for(const a of atoms){const id=key(a),type=p.types[a.id];if(a.kind==='content')components.push({id,component:'Text',text:a.text,variant:type.slice(5)});
  else if(a.kind==='input'){const path='/'+id,n=old.find(n=>n.id===id),compatible=n?.value?.path===path&&typeof oldData[id]===(a.valueType==='boolean'?'boolean':'string');data[id]=compatible?oldData[id]:a.initial;components.push(a.valueType==='boolean'?{id,component:'CheckBox',label:a.text,value:{path}}:{id,component:'TextField',label:a.text,value:{path},variant:type==='TextField_long'?'longText':'shortText'});}
  else{const label=id+'_label';components.push({id:label,component:'Text',text:a.text,variant:'body'},{id,component:'Button',child:label,variant:type==='Button_primary'?'primary':'default',action:{event:{name:'observer_discuss',context:Object.fromEntries(inputs.map(a=>[a.id,{path:'/'+key(a)}]))}}});}}
 const messages:any[]=[];if(!(displayed??base)?.messages.some(m=>m.createSurface?.surfaceId===surfaceId))messages.push({version:'v0.9.1',createSurface:{surfaceId,catalogId:CATALOG}});
 const changed=components.filter(c=>JSON.stringify(old.find(n=>n.id===c.id))!==JSON.stringify(c));if(changed.length)messages.push({version:'v0.9.1',updateComponents:{surfaceId,components:changed}});
 // Merge leaf data. Never erase unrelated values or client-local edits.
 for(const[k,v]of Object.entries(data))if(JSON.stringify(oldData[k])!==JSON.stringify(v))messages.push({version:'v0.9.1',updateDataModel:{surfaceId,path:'/'+k,value:v}});
 if(!messages.length)messages.push({version:'v0.9.1',updateComponents:{surfaceId,components:[components[0]]}});
 const delta={baseRevision:base?.revision??0,revision:(base?.revision??0)+1,messages};return delta;
}
export function previewDelta(base:Snapshot|null,history:any[],atoms:Atom[],p:Plan,surfaceId:string){const displayed=history.length?applyDelta(base,{baseRevision:base?.revision??0,revision:(base?.revision??0)+1,messages:history}):base;const d=compile(atoms,p,base,displayed,surfaceId);history.push(...d.messages);const delta={baseRevision:base?.revision??0,revision:(base?.revision??0)+1,messages:history};const next=applyDelta(base,delta);if(next.incomplete)throw Error('Incomplete observer tree');return delta;}

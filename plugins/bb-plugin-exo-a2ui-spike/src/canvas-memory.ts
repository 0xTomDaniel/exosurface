// What the conversation remembers about the canvas: meaning, never layout.
// Deterministic text forms of (1) a canvas update ("what Exo showed"), (2) the
// current canvas for each request (outline + ids + values) and (3) a button press
// ("what the person did"). The A2UI JSON stays in native canvas entries only.
import {moduleIds,moduleNodes,moduleData,inputBindings,atPath,type Snapshot} from './workspace.ts';
import {surfaceTitle} from './stage.ts';
import {surfaceSnapshot} from './snapshot-format.ts';
const plain=(s:unknown)=>String(s??'').replace(/[*_`#>]/g,'').replace(/\[([^\]]*)\]\([^)]*\)/g,'$1').replace(/\s+/g,' ').trim();
const cut=(s:string,n:number)=>s.length>n?s.slice(0,n-1)+'…':s;
const literal=(v:unknown)=>typeof v==='string'?v:typeof v==='number'?String(v):'';
/** One component's meaning, or '' for pure structure. */
export function describeComponent(n:any):string{
 switch(n?.component){
  case 'Text':return cut(plain(literal(n.text)),160);
  case 'Callout':return cut(`${n.tone?`[${n.tone}] `:''}${n.title?plain(n.title)+': ':''}${plain(literal(n.text))}`,200);
  case 'Metric':return cut(`${plain(n.label)}: ${plain(n.value)}${n.detail?` (${plain(n.detail)})`:''}${n.progress!==undefined?` ${Math.round(n.progress*100)}%`:''}`,120);
  case 'Timeline':return cut('timeline: '+n.items.map((i:any)=>`${i.when?i.when+' ':''}${plain(i.label)}${i.state?` (${i.state})`:''}`).join('; '),320);
  case 'Table':return cut(`table${n.caption?` "${plain(n.caption)}"`:''}: ${n.columns.map(plain).filter(Boolean).join(' | ')}${n.highlightColumn!==undefined?` [recommended: ${plain(n.columns[n.highlightColumn])}]`:''} — `+n.rows.map((r:any)=>r.cells.map(plain).join(' / ')).join('; '),400);
  case 'Chart':return cut(`${n.kind} chart${n.caption?` "${plain(n.caption)}"`:''}: `+n.points.map((p:any)=>`${plain(p.label)} ${p.value}${n.unit??''}`).join(', '),240);
  case 'Flow':{const label=new Map(n.nodes.map((x:any)=>[x.id,plain(x.label)]));return cut(`flow${n.caption?` "${plain(n.caption)}"`:''}: `+(n.edges.length?n.edges.map((e:any)=>`${label.get(e.from)} → ${label.get(e.to)}${e.label?` (${plain(e.label)})`:''}`).join('; '):[...label.values()].join(', ')),280);}
  case 'Disclosure':return cut(`▸ ${plain(n.title)}${n.summary?` — ${plain(n.summary)}`:''}`,140);
  case 'Tabs':return cut('tabs: '+n.tabs.map((t:any)=>plain(t.title)).join(' | '),140);
  case 'ChoicePicker':return cut(`choice "${plain(n.label)}": `+n.options.map((o:any)=>plain(o.label)).join(' / '),200);
  case 'TextField':return cut(`text input "${plain(n.label)}"`,120);
  case 'CheckBox':return cut(`checkbox "${plain(n.label)}"`,140);
  case 'Slider':return cut(`slider "${plain(n.label)}" ${n.min??0}–${n.max}`,120);
  case 'Button':return '[button]';
  default:return '';
 }
}
/** "What Exo showed": a bounded text form of one apply_workspace call. */
export function describeDelta(after:Snapshot|null,messages:any[],layout?:any,limit=1400):string{
 const bySurface=new Map<string,string[]>(),order:string[]=[];
 const at=(id:string)=>{if(!bySurface.has(id)){bySurface.set(id,[]);order.push(id);}return bySurface.get(id)!;};
 for(const m of messages){
  if(m?.createSurface)at(m.createSurface.surfaceId).unshift('new');
  if(m?.deleteSurface)at(m.deleteSurface.surfaceId).push('removed');
  if(m?.updateComponents)for(const n of m.updateComponents.components??[]){const d=describeComponent(n);if(d&&d!=='[button]')at(m.updateComponents.surfaceId).push(d);}
  if(m?.updateDataModel){const u=m.updateDataModel,v=JSON.stringify(u.value);at(u.surfaceId).push(`data ${u.path&&u.path!=='/'?u.path:'(all)'} = ${cut(v??'removed',120)}`);}
 }
 const parts=order.map(id=>{const nodes=after&&moduleIds(after).includes(id)?moduleNodes(after,id):[];const title=surfaceTitle(nodes,id);return `${title}${title!==id?` [${id}]`:''}: ${bySurface.get(id)!.join('; ')}`;});
 if(layout?.focus)parts.push(`stage → ${layout.focus}`);if(layout?.beside?.length)parts.push(`beside: ${layout.beside.join(', ')}`);
 return cut('Showed on canvas — '+parts.join(' || '),limit);
}
/** Per-request current canvas: outline for the stage and context surfaces, titles for the rest. */
export function outlineCanvas(s:Snapshot,limit=7000):string{
 const ids=moduleIds(s),focus=s.layout?.focus&&ids.includes(s.layout.focus)?s.layout.focus:ids.at(-1),beside=(s.layout?.beside??[]).filter(id=>ids.includes(id));
 const lines=[`EXOSURFACE_CURRENT_WORKSPACE revision ${s.revision}. Outline only (component id, type, meaning); read_workspace returns exact JSON for a surface when you need it.`];
 const tree=(id:string)=>{const nodes=moduleNodes(s,id),by=new Map(nodes.map(n=>[n.id,n])),seen=new Set<string>(),out:string[]=[];
  const walk=(nid:string,depth:number)=>{const n=by.get(nid);if(!n||seen.has(nid)||out.length>70)return;seen.add(nid);const d=describeComponent(n);out.push(`${'  '.repeat(depth)}${nid} ${n.component}${d&&d!=='[button]'?': '+d:''}`);for(const c of [...(n.children??[]),...(n.child?[n.child]:[]),...(n.tabs?.map((t:any)=>t.child)??[])])walk(c,depth+1);};
  walk('root',1);return out;};
 const surface=(id:string,role:string)=>{const nodes=moduleNodes(s,id),create=s.messages.find(m=>m.createSurface?.surfaceId===id)?.createSurface;lines.push(`[${role}] ${id} "${surfaceTitle(nodes,id)}" (${create?.catalogId?.includes('exo-visual')?'exo catalog':'basic catalog'})`,...tree(id),`  data ${cut(JSON.stringify(moduleData(s,id)??{}),600)}`);};
 if(focus)surface(focus,'stage');for(const id of beside)if(id!==focus)surface(id,'beside');
 const rest=ids.filter(id=>id!==focus&&!beside.includes(id));if(rest.length)lines.push('[earlier] '+rest.map(id=>`${id} "${surfaceTitle(moduleNodes(s,id),id)}"`).join(', '));
 return cut(lines.join('\n'),limit);
}
/** "What the person did": a readable line for a button press, labels instead of keys. */
export function describePress(s:Snapshot,action:{surfaceId:string;sourceComponentId:string;context:Record<string,unknown>}):string{
 const nodes=moduleNodes(s,action.surfaceId),button=nodes.find(n=>n.id===action.sourceComponentId),label=plain(literal(nodes.find(n=>n.id===button?.child)?.text))||action.sourceComponentId;
 const bindings=inputBindings(s,action.surfaceId),offered=button?.action?.event?.context??{},parts:string[]=[];
 for(const[key,v]of Object.entries(offered)){const path=(v as any)?.path;if(!path)continue;const input=bindings.get(path),value=action.context[key];if(!input)continue;
  let shown:string;if(input.component==='ChoicePicker')shown=(value as string[]).map(x=>plain(input.options.find((o:any)=>o.value===x)?.label??x)).join(', ')||'none';
  else if(input.component==='CheckBox')shown=value?'yes':'no';else if(input.component==='TextField')shown=value?`“${cut(String(value),300)}”`:'(empty)';else shown=String(value);
  parts.push(`${cut(plain(input.label),60)}: ${shown}`);}
 return `▸ ${surfaceTitle(nodes,action.surfaceId)} · ${label}${parts.length?' — '+parts.join(' · '):''}`;
}
/** Submitted bound values as a native data patch, applied by code before Exo's turn. */
export function boundUpdates(s:Snapshot,action:{surfaceId:string;sourceComponentId:string;context:Record<string,unknown>}){
 const button=moduleNodes(s,action.surfaceId).find(n=>n.id===action.sourceComponentId),bindings=inputBindings(s,action.surfaceId),out:{path:string;value:unknown}[]=[];
 for(const[key,v]of Object.entries(button?.action?.event?.context??{})){const path=(v as any)?.path;if(path&&bindings.has(path)&&JSON.stringify(atPath(moduleData(s,action.surfaceId),path))!==JSON.stringify(action.context[key]))out.push({path,value:action.context[key]});}
 return out;
}

/** Per-request current canvas in the snapshot format the agent writes: stage and beside surfaces
 *  in full (refs, current values), shelf surfaces by title. Current state, never history. */
export type Earlier={count:number;recent:{surface:string;title:string}[]};
export function snapshotOutline(s:Snapshot,earlier:Earlier={count:0,recent:[]},limit=12000):string{
 const ids=moduleIds(s),focus=s.layout?.focus&&ids.includes(s.layout.focus)?s.layout.focus:ids.at(-1),beside=(s.layout?.beside??[]).filter(id=>ids.includes(id)&&id!==focus);
 const head=`EXOSURFACE revision ${s.revision}.${focus?` Stage: ${focus}.`:' Empty canvas.'}${beside.length?` Beside: ${beside.join(', ')}.`:''}`;
 const full=[...(focus?[focus]:[]),...beside].map(id=>surfaceSnapshot(s,id));
 const shelf=ids.filter(id=>id!==focus&&!beside.includes(id)).map(id=>`- region ${JSON.stringify(surfaceTitle(moduleNodes(s,id),id))} [ref=${id}]   (shelf)`);
 const past=earlier.recent.map(e=>`- region ${JSON.stringify(e.title)} [ref=${e.surface}]   (history)`);
 const history=earlier.count?[`Earlier in this conversation (${earlier.count}; kept by the system, nothing to manage; read_exosurface shows one, and editing or redrawing its ref brings it back):`,...past,...(earlier.count>past.length?[`…and ${earlier.count-past.length} more`]:[])]:[];
 let body=[...full,...(shelf.length?['Shelf (read_exosurface for a surface in full):',...shelf]:[]),...history].join('\n');
 if(body.length>limit&&full.length>1)body=[full[0],...beside.map(id=>`- region ${JSON.stringify(surfaceTitle(moduleNodes(s,id),id))} [ref=${id}]   (beside; read_exosurface for it in full)`),...(shelf.length?['Shelf:',...shelf]:[]),...history].join('\n');
 return `${head}\n${cut(body,limit)}`;
}
/** The person's canvas edits since the agent's last turn, as snapshot-style lines. */
export function describeEdits(s:Snapshot,deltas:{messages:any[]}[]):string[]{
 const last=new Map<string,{surfaceId:string;path:string}>();
 for(const d of deltas)for(const m of d.messages){const u=m.updateDataModel;if(u?.path&&u.path!=='/')last.set(`${u.surfaceId} ${u.path}`,{surfaceId:u.surfaceId,path:u.path});}
 const out:string[]=[];
 for(const {surfaceId,path} of last.values()){
  if(!moduleIds(s).includes(surfaceId))continue;const input=inputBindings(s,surfaceId).get(path);if(!input)continue;const v=atPath(moduleData(s,surfaceId),path);
  const shown=input.component==='ChoicePicker'?(Array.isArray(v)?v:[v]).map((x:any)=>plain(input.options.find((o:any)=>o.value===x)?.label??x)).join(', ')||'(none)':input.component==='CheckBox'?(v?'checked':'unchecked'):String(v??'')||'(empty)';
  out.push(`- ${surfaceId} · ${plain(literal(input.label))||input.id} [ref=${input.id}]: ${cut(shown,400)}`);
 }
 return out;
}

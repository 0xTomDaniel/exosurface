// Exosurface snapshot format: one line per component, modelled on Playwright's
// aria snapshot YAML (`- role "name" [attr=value]: text`, indentation = nesting,
// `- /prop: value` child lines for extra properties). The agent draws, reads,
// remembers and edits the canvas in this one language; code translates to and
// from standard A2UI for the renderer. Parsed line by line, not as YAML, so text
// after `: ` needs no quoting (use \n for a line break, \| for a literal pipe in rows).
import {EXO_CATALOG} from './exo-catalog.ts';
import {moduleIds,moduleNodes,moduleData,atPath,MAX_SURFACES,type Snapshot} from './workspace.ts';
import {surfaceTitle} from './stage.ts';

export const SNAPSHOT_FORMAT=`Exosurface snapshot format — one line per component, modelled on Playwright aria snapshots:
  - role "name" [attr] [attr=value]: inline text
Indentation (2 spaces) nests children. Quote names with JSON escaping; text after ": " is literal to the end of the line (markdown allowed in text and notes; \\n for a line break). [ref=id] gives a stable id (letters, digits, _ -); refs are unique within a surface and are how you edit later. Lines you write without a ref get one assigned (you'll see it in the canvas outline). "- /prop: value" child lines set extra properties.
One surface per top-level line:  - region "Surface title" [ref=surface_id]:
Roles:
  heading "Text" [level=1|2|3]                     (default level 2)
  text: Paragraph (markdown)          text [caption]: Small print
  group:  (vertical stack)   group [layout=row]:  (side by side)   article "Optional title":  (card)
  group "Title" [collapsible] [expanded]:  - /summary: one line   (disclosure; children hidden until opened)
  separator
  list:  - listitem: Item text   (children allowed under a listitem)
  list [timeline]:  - listitem "Label" [when=Sep 20] [state=done|now|next|later|blocked]: optional detail
  list [flow] [direction=right|down]:  - listitem "Label" [ref=a] [to=b,c] [tone=…]: optional detail
  tablist:  - tab "Title":  (children = panel content)
  note "Optional title" [tone=note|decision|caution|good]: Text (markdown)
  meter "Label" [tone=…] [progress=0..1]: Value      with optional child  - /detail: one line
  table "Caption" [highlight=column index]:  - row [header]: A | B | C   then  - row [tone=…]: a | b | c   (≤6 columns, ≤14 rows)
  figure "Caption" [chart=bar|line] [unit=…] [max=…]:  - row [tone=…]: Label | number | optional note   (≤16 rows; the chart's data, like an accessible data table)
  textbox "Label" [ref=id] [multiline]: current value
  checkbox "Label" [ref=id] [checked]
  slider "Label" [ref=id] [min=0] [max=10]: current number
  radiogroup "Label" [ref=id] [chips]:  - radio "Option" [checked] [value=opt]   (pick one)
  listbox "Label" [ref=id] [chips]:  - option "Option" [selected] [value=opt]   (pick several)
  button "Label" [ref=id] [action=event_name] [primary|borderless] [sends=input_ref,…]   (sends the named inputs' current values)
tone ∈ neutral|accent|good|caution|risk. Bounds: 64 components per surface, depth 8.`;

export type Line={depth:number;role:string;name?:string;attrs:Record<string,string|true>;text?:string;children:Line[];at:number};
const HEAD=/^-\s+(\/?[a-z][a-z-]*)(?:\s+"((?:[^"\\]|\\.)*)")?((?:\s*\[[^\]]*\])*)\s*(?::(?:\s(.*))?)?$/;
const ID=/^[a-zA-Z0-9_-]{1,80}$/;
const unescapeText=(s:string)=>s.replace(/\\n/g,'\n');
const escapeText=(s:string)=>s.replace(/\r?\n/g,'\\n');

export function parseLines(src:string,base=0):Line[]{
 const roots:Line[]=[],stack:Line[]=[];
 src.replace(/\r/g,'').split('\n').forEach((raw,i)=>{
  if(!raw.trim()||raw.trim().startsWith('#'))return;
  const indent=raw.match(/^ */)![0].length,m=HEAD.exec(raw.trim());
  if(!m)throw Error(`line ${base+i+1}: expected "- role \\"name\\" [attrs]: text", got: ${raw.trim().slice(0,80)}`);
  const attrs:Record<string,string|true>={};
  for(const a of (m[3]??'').match(/\[[^\]]*\]/g)??[]){const [k,...v]=a.slice(1,-1).split('=');attrs[k.trim()]=v.length?v.join('=').trim():true;}
  const node:Line={depth:indent,role:m[1],name:m[2]!==undefined?JSON.parse(`"${m[2]}"`):undefined,attrs,text:m[4]?.trim()?unescapeText(m[4].trim()):undefined,children:[],at:base+i+1};
  while(stack.length&&stack.at(-1)!.depth>=indent)stack.pop();
  (stack.length?stack.at(-1)!.children:roots).push(node);stack.push(node);
 });
 return roots;
}

/** Lines back to text (canonical attribute order: ref first). */
export function formatLines(lines:Line[],depth=0):string{
 return lines.map(n=>{
  const attrs=Object.entries(n.attrs).sort(([a],[b])=>a==='ref'?-1:b==='ref'?1:0).map(([k,v])=>v===true?`[${k}]`:`[${k}=${v}]`).join(' ');
  const head=`${'  '.repeat(depth)}- ${n.role}${n.name!==undefined?' '+JSON.stringify(n.name):''}${attrs?' '+attrs:''}`;
  const tail=n.text!==undefined?`: ${escapeText(n.text)}`:n.children.length?':':'';
  return head+tail+(n.children.length?'\n'+formatLines(n.children,depth+1):'');
 }).join('\n');
}

const num=(v:unknown,at:number,what:string)=>{const n=Number(String(v).replace(/[,\s]/g,''));if(!Number.isFinite(n))throw Error(`line ${at}: ${what} must be a number, got ${v}`);return n;};
const cells=(t:string|undefined)=>(t??'').split(/(?<!\\)\|/).map(s=>s.trim().replace(/\\\|/g,'|'));
const joinCells=(c:string[])=>c.map(s=>String(s).replace(/\|/g,'\\|')).join(' | ');
const prop=(n:Line,key:string)=>n.children.find(c=>c.role===`/${key}`)?.text;
const tone=(n:Line)=>typeof n.attrs.tone==='string'?n.attrs.tone:undefined;
const clean=<T extends object>(o:T)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as {[K in keyof T]:Exclude<T[K],undefined>};
const L=(role:string,o:Partial<Line>={}):Line=>({depth:0,role,attrs:{},children:[],at:0,...o});
const optionValue=(label:string)=>label.toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60)||'option';

type Built={sid:string;title?:string;components:any[];data:Record<string,unknown>};
/** One region line → one surface (components root-first, data). Helper nodes get ids derived
 *  from their parent (`<id>__label`, `<id>__body`, …) so translation is deterministic. */
export function buildSurface(region:Line):Built{
 if(region.role!=='region')throw Error(`line ${region.at}: top-level lines must be region surfaces`);
 const sid=String(region.attrs.ref??'');if(!ID.test(sid))throw Error(`line ${region.at}: region needs [ref=surface_id]`);
 const components:any[]=[],data:Record<string,unknown>={},used=new Set<string>(['root']);let auto=0;
 const claim=(v:string,at:number)=>{if(!ID.test(v))throw Error(`line ${at}: bad ref ${v}`);if(used.has(v))throw Error(`line ${at}: duplicate ref ${v}`);used.add(v);return v;};
 const id=(n:Line,hint:string)=>{if(typeof n.attrs.ref==='string')return claim(n.attrs.ref,n.at);let v;do v=`${hint}${++auto}`;while(used.has(v));return claim(v,n.at);};
 const kids=(ls:Line[])=>ls.filter(k=>!k.role.startsWith('/'));
 const stack=(i:string,ls:Line[],layout:'Column'|'Row'='Column')=>{claim(i,0);const c:any={id:i,component:layout,children:[]};components.push(c);c.children=kids(ls).map(build);return i;};
 const titled=(name:string|undefined,owner:string,ls:Line[])=>name!==undefined?[L('heading',{name,attrs:{ref:`${owner}__title`,level:'3'}}),...ls]:ls;
 const build=(n:Line):string=>{
  const a=n.attrs;
  switch(n.role){
   case 'heading':{const i=id(n,'h');components.push({id:i,component:'Text',text:n.name??n.text??'',variant:`h${Math.min(3,Math.max(1,Number(a.level??2)))}`});return i;}
   case 'text':case 'paragraph':{const i=id(n,'t');components.push(clean({id:i,component:'Text',text:n.text??n.name??'',variant:a.caption?'caption':undefined}));return i;}
   case 'separator':{const i=id(n,'d');components.push({id:i,component:'Divider'});return i;}
   case 'article':{const i=id(n,'c'),c:any={id:i,component:'Card',child:''};components.push(c);c.child=stack(`${i}__body`,titled(n.name,i,n.children));return i;}
   case 'group':{
    if(a.collapsible||'expanded' in a){const i=id(n,'x'),c:any=clean({id:i,component:'Disclosure',title:n.name??'Details',summary:prop(n,'summary'),open:a.expanded===true||a.expanded==='true',child:''});components.push(c);c.child=stack(`${i}__body`,n.children);return i;}
    const i=id(n,'g'),c:any={id:i,component:a.layout==='row'?'Row':'Column',children:[]};components.push(c);c.children=kids(titled(n.name,i,n.children)).map(build);return i;}
   case 'list':{
    const items=n.children.filter(k=>k.role==='listitem');
    if(a.timeline){const i=id(n,'tl');components.push({id:i,component:'Timeline',items:items.map(k=>clean({label:k.name??k.text??'',when:typeof k.attrs.when==='string'?k.attrs.when:undefined,detail:k.name!==undefined?k.text:undefined,state:typeof k.attrs.state==='string'?k.attrs.state:undefined}))});return i;}
    if(a.flow){const i=id(n,'fl'),nodes=items.map((k,j)=>({id:typeof k.attrs.ref==='string'?k.attrs.ref:`n${j+1}`,k}));
     components.push(clean({id:i,component:'Flow',caption:n.name,direction:typeof a.direction==='string'?a.direction:undefined,nodes:nodes.map(({id,k})=>clean({id,label:k.name??k.text??'',detail:k.name!==undefined?k.text:undefined,tone:tone(k)})),edges:nodes.flatMap(({id,k})=>typeof k.attrs.to==='string'?k.attrs.to.split(',').map(t=>({from:id,to:t.trim()})):[])}));return i;}
    const i=id(n,'l'),c:any={id:i,component:'List',children:[]};
    const wrap=n.name!==undefined?`${i}__wrap`:null;
    if(wrap){claim(wrap,n.at);components.push({id:wrap,component:'Column',children:[]});}
    components.push(c);
    if(wrap){const w=components.find(x=>x.id===wrap);claim(`${i}__title`,n.at);components.push({id:`${i}__title`,component:'Text',text:n.name,variant:'h3'});w.children=[`${i}__title`,i];}
    c.children=items.map((k,j)=>{const item=`${i}__item${j+1}`;
     if(!k.children.length){claim(item,k.at);components.push({id:item,component:'Text',text:k.text??k.name??''});return item;}
     return stack(item,[...(k.text?[L('text',{text:k.text,attrs:{ref:`${item}__text`}})]:[]),...k.children]);});
    return wrap??i;}
   case 'tablist':{const i=id(n,'tabs'),c:any={id:i,component:'Tabs',tabs:[]};components.push(c);c.tabs=n.children.filter(k=>k.role==='tab').map((k,j)=>({title:k.name??k.text??'Tab',child:stack(`${i}__tab${j+1}`,k.children)}));return i;}
   case 'note':{const i=id(n,'n'),text=[n.text,...n.children.filter(k=>k.role==='text').map(k=>k.text)].filter(Boolean).join('\n\n');components.push(clean({id:i,component:'Callout',title:n.name,tone:typeof a.tone==='string'?a.tone:undefined,text}));return i;}
   case 'meter':{const i=id(n,'m');components.push(clean({id:i,component:'Metric',label:n.name??'',value:n.text??'',detail:prop(n,'detail'),tone:tone(n),progress:a.progress!==undefined?num(a.progress,n.at,'progress'):undefined}));return i;}
   case 'table':{const i=id(n,'tb'),rows=n.children.filter(k=>k.role==='row'),head=rows.find(r=>r.attrs.header)??rows[0];
    components.push(clean({id:i,component:'Table',caption:n.name,columns:cells(head?.text),rows:rows.filter(r=>r!==head).map(r=>clean({cells:cells(r.text),tone:tone(r)})),highlightColumn:a.highlight!==undefined?num(a.highlight,n.at,'highlight'):undefined}));return i;}
   case 'figure':{const i=id(n,'ch'),rows=[...n.children,...n.children.filter(k=>k.role==='table').flatMap(k=>k.children)].filter(k=>k.role==='row'&&!k.attrs.header);
    const points=rows.filter(r=>Number.isFinite(Number(cells(r.text)[1]?.replace(/[,\s$%]/g,'')))).map(r=>{const [label,value,note]=cells(r.text);return clean({label,value:num(value.replace(/[$%]/g,''),r.at,'chart value'),note:note||undefined,tone:tone(r)});});
    components.push(clean({id:i,component:'Chart',kind:a.chart==='line'?'line':'bar',caption:n.name,unit:typeof a.unit==='string'?a.unit:undefined,max:a.max!==undefined?num(a.max,n.at,'max'):undefined,points}));return i;}
   case 'textbox':{const i=id(n,'in');data[i]=n.text??'';components.push({id:i,component:'TextField',label:n.name??'',value:{path:`/${i}`},variant:a.multiline?'longText':'shortText'});return i;}
   case 'checkbox':{const i=id(n,'cb');data[i]=a.checked===true||a.checked==='true';components.push({id:i,component:'CheckBox',label:n.name??'',value:{path:`/${i}`}});return i;}
   case 'slider':{const i=id(n,'sl'),min=num(a.min??0,n.at,'min'),max=num(a.max??10,n.at,'max');data[i]=n.text!==undefined?num(n.text,n.at,'slider value'):min;components.push({id:i,component:'Slider',label:n.name??'',min,max,value:{path:`/${i}`}});return i;}
   case 'radiogroup':case 'listbox':{const i=id(n,'ch'),opts=n.children.filter(k=>k.role==='radio'||k.role==='option');
    const options=opts.map(k=>({label:k.name??k.text??'',value:typeof k.attrs.value==='string'?k.attrs.value:optionValue(k.name??k.text??'')}));
    data[i]=opts.flatMap((k,j)=>k.attrs.checked||k.attrs.selected?[options[j].value]:[]);
    components.push({id:i,component:'ChoicePicker',label:n.name??'',options,value:{path:`/${i}`},variant:n.role==='radiogroup'?'mutuallyExclusive':'multipleSelection',displayStyle:a.chips?'chips':'checkbox'});return i;}
   case 'button':{const i=id(n,'b'),label=claim(`${i}__label`,n.at);components.push({id:label,component:'Text',text:n.name??n.text??'OK'});
    const sends=typeof a.sends==='string'?a.sends.split(',').map(s=>s.trim()).filter(Boolean):[];
    components.push({id:i,component:'Button',child:label,variant:a.primary?'primary':a.borderless?'borderless':'default',action:{event:{name:typeof a.action==='string'?a.action:i,context:Object.fromEntries(sends.map(s=>[s,{path:`/${s}`}]))}}});return i;}
   default:throw Error(`line ${n.at}: unknown role "${n.role}"`);
  }
 };
 // The region name titles the surface; rendered only when the surface doesn't open with its own heading.
 const first=kids(region.children)[0],body=region.name!==undefined&&first?.role!=='heading'?[L('heading',{name:region.name,attrs:{ref:`${sid}__title`,level:'2'}}),...region.children]:region.children;
 const root:any={id:'root',component:'Column',children:[]};components.push(root);root.children=kids(body).map(build);
 components.sort((x,y)=>x.id==='root'?-1:y.id==='root'?1:0);
 if(components.length>64)throw Error(`region ${sid}: ${components.length} components exceeds 64`);
 return {sid,title:region.name,components,data};
}

const create=(sid:string)=>({version:'v0.9.1',createSurface:{surfaceId:sid,catalogId:EXO_CATALOG}});
const surfaceMessages=(b:Built,data:Record<string,unknown>)=>[create(b.sid),{version:'v0.9.1',updateComponents:{surfaceId:b.sid,components:b.components}},{version:'v0.9.1',updateDataModel:{surfaceId:b.sid,path:'/',value:data}}];

/** Translate a snapshot (one or more complete surfaces) to A2UI messages for an empty canvas. */
export function snapshotToA2ui(src:string){
 const regions=parseLines(src);if(!regions.length)throw Error('Snapshot has no region surface');
 return regions.flatMap(r=>{const b=buildSurface(r);return surfaceMessages(b,b.data);});
}

// ---------- A2UI → snapshot (reading direction) ----------
const literal=(v:unknown,data:any)=>typeof v==='string'?v:typeof v==='number'?String(v):v&&typeof v==='object'&&typeof (v as any).path==='string'?String(atPath(data,(v as any).path)??''):'';
/** One committed surface as snapshot lines (refs = component ids; values = current data). */
export function surfaceLines(s:Snapshot,sid:string):Line{
 const nodes=new Map(moduleNodes(s,sid).map((n:any)=>[n.id,n])),data=moduleData(s,sid);
 const inputByPath=new Map<string,string>();for(const n of nodes.values())if(n.value?.path)inputByPath.set(n.value.path,n.id);
 const ref=(id:string):Record<string,string|true>=>id.includes('__')?{}:{ref:id};
 const children=(ids:string[]=[])=>ids.flatMap(c=>nodes.has(c)?[line(nodes.get(c))]:[]);
 const inline=(id:string|undefined)=>{const n=id?nodes.get(id):undefined;return n&&n.component==='Column'?children(n.children):n?[line(n)]:[];};
 const line=(n:any):Line=>{
  const r=ref(n.id);
  switch(n.component){
   case 'Text':{const t=literal(n.text,data),v=n.variant;
    if(v==='h1'||v==='h2'||v==='h3')return L('heading',{name:t,attrs:{...r,...(v!=='h2'?{level:v.slice(1)}:{})}});
    return L('text',{text:t,attrs:{...r,...(v==='caption'?{caption:true as const}:{})}});}
   case 'Divider':return L('separator',{attrs:r});
   case 'Row':case 'Column':{
    const kids=children(n.children),title=kids[0]?.attrs.ref===undefined&&kids[0]?.role==='heading'&&String(n.children[0]).endsWith('__title')?kids.shift()!.name:undefined;
    if(n.id.endsWith('__wrap')){const list=kids.find(k=>k.role==='list');if(list){list.name=title;return list;}}
    return L('group',{name:title,attrs:{...r,...(n.component==='Row'?{layout:'row'}:{})},children:kids});}
   case 'Card':{const body=inline(n.child),title=body[0]?.role==='heading'&&String(nodes.get(n.child)?.children?.[0]).endsWith('__title')?body.shift()!.name:undefined;return L('article',{name:title,attrs:r,children:body});}
   case 'List':return L('list',{attrs:r,children:(n.children??[]).flatMap((c:string)=>{const k=nodes.get(c);if(!k)return [];
    if(k.component==='Text')return [L('listitem',{text:literal(k.text,data)})];
    const inner=k.component==='Column'?children(k.children):[line(k)],lead=inner[0]?.role==='text'&&String(k.children?.[0]).endsWith('__text')?inner.shift()!.text:undefined;
    return [L('listitem',{text:lead,children:inner})];})});
   case 'Tabs':return L('tablist',{attrs:r,children:n.tabs.map((t:any)=>L('tab',{name:t.title,children:inline(t.child)}))});
   case 'Callout':return L('note',{name:n.title,text:literal(n.text,data),attrs:{...r,...(n.tone?{tone:n.tone}:{})}});
   case 'Metric':return L('meter',{name:n.label,text:n.value,attrs:{...r,...(n.tone?{tone:n.tone}:{}),...(n.progress!==undefined?{progress:String(n.progress)}:{})},children:n.detail?[L('/detail',{text:n.detail})]:[]});
   case 'Timeline':return L('list',{attrs:{...r,timeline:true},children:n.items.map((i:any)=>L('listitem',{name:i.label,text:i.detail,attrs:clean({when:i.when,state:i.state})}))});
   case 'Flow':return L('list',{name:n.caption,attrs:{...r,flow:true,...(n.direction?{direction:n.direction}:{})},children:n.nodes.map((x:any)=>{const to=n.edges.filter((e:any)=>e.from===x.id).map((e:any)=>e.to);return L('listitem',{name:x.label,text:x.detail,attrs:clean({ref:x.id,to:to.length?to.join(','):undefined,tone:x.tone})});})});
   case 'Table':return L('table',{name:n.caption,attrs:{...r,...(n.highlightColumn!==undefined?{highlight:String(n.highlightColumn)}:{})},children:[L('row',{attrs:{header:true},text:joinCells(n.columns)}),...n.rows.map((x:any)=>L('row',{attrs:clean({tone:x.tone}),text:joinCells(x.cells)}))]});
   case 'Chart':return L('figure',{name:n.caption,attrs:clean({...r,chart:n.kind,unit:n.unit,max:n.max!==undefined?String(n.max):undefined}),children:n.points.map((p:any)=>L('row',{attrs:clean({tone:p.tone}),text:joinCells([p.label,String(p.value),...(p.note?[p.note]:[])])}))});
   case 'Disclosure':return L('group',{name:n.title,attrs:{...r,collapsible:true,...(n.open?{expanded:true as const}:{})},children:[...(n.summary?[L('/summary',{text:n.summary})]:[]),...inline(n.child)]});
   case 'TextField':return L('textbox',{name:literal(n.label,data),text:String(atPath(data,n.value?.path)??'')||undefined,attrs:{...r,...(n.variant==='longText'?{multiline:true as const}:{})}});
   case 'CheckBox':return L('checkbox',{name:literal(n.label,data),attrs:{...r,...(atPath(data,n.value?.path)===true?{checked:true as const}:{})}});
   case 'Slider':return L('slider',{name:literal(n.label,data),text:String(atPath(data,n.value?.path)??''),attrs:{...r,min:String(n.min??0),max:String(n.max)}});
   case 'ChoicePicker':{const picked=atPath(data,n.value?.path),sel=Array.isArray(picked)?picked:[picked],single=n.variant==='mutuallyExclusive';
    return L(single?'radiogroup':'listbox',{name:literal(n.label,data),attrs:{...r,...(n.displayStyle==='chips'?{chips:true as const}:{})},children:n.options.map((o:any)=>L(single?'radio':'option',{name:literal(o.label,data),attrs:{...(sel.includes(o.value)?{[single?'checked':'selected']:true as const}:{}),value:o.value}}))});}
   case 'Button':{const label=literal(nodes.get(n.child)?.text,data),e=n.action?.event,sends=Object.values(e?.context??{}).flatMap((v:any)=>v?.path&&inputByPath.has(v.path)?[inputByPath.get(v.path)!]:[]);
    return L('button',{name:label,attrs:clean({...r,action:e?.name&&e.name!==n.id?e.name:undefined,...(n.variant==='primary'?{primary:true as const}:n.variant==='borderless'?{borderless:true as const}:{}),sends:sends.length?sends.join(','):undefined})});}
   default:return L('text',{text:`(${n.component})`,attrs:r});
  }
 };
 // Title once: from our own title helper, else omitted when the surface opens with its own heading.
 const rootKids=children(nodes.get('root')?.children),title=rootKids[0]?.role==='heading'&&String(nodes.get('root')?.children?.[0]).endsWith('__title')?rootKids.shift()!.name:rootKids[0]?.role==='heading'?undefined:surfaceTitle(moduleNodes(s,sid),sid);
 return L('region',{name:title,attrs:{ref:sid},children:rootKids});
}
export const surfaceSnapshot=(s:Snapshot,sid:string)=>formatLines([surfaceLines(s,sid)]);

// ---------- edits by ref ----------
export type Edit={surface:string;ref:string;op:'replace'|'insertAfter'|'insertInto'|'remove';lines?:string};
function find(lines:Line[],ref:string,parent:Line|null=null):{list:Line[];index:number;node:Line}|null{
 for(let i=0;i<lines.length;i++){const n=lines[i];if(n.attrs.ref===ref)return {list:lines,index:i,node:n};const hit=find(n.children,ref,n);if(hit)return hit;}
 return null;
}
export function applyEdits(region:Line,edits:Edit[]):Line{
 const root=structuredClone(region);
 for(const e of edits){
  const hit=e.ref===root.attrs.ref?{list:[root],index:0,node:root}:find(root.children,e.ref);if(!hit)throw Error(`No ref ${e.ref} in surface ${e.surface}`);
  const fresh=e.op==='remove'?[]:parseLines(e.lines??'');if(e.op!=='remove'&&!fresh.length)throw Error(`Edit ${e.op} on ${e.ref} needs lines`);
  if(e.op==='replace'){if(hit.node===root){if(fresh.length!==1||fresh[0].role!=='region')throw Error('Replacing a surface needs one region line');Object.assign(root,fresh[0]);}else hit.list.splice(hit.index,1,...fresh);}
  else if(e.op==='insertAfter'){if(hit.node===root)throw Error('Insert after a surface: draw a new region instead');hit.list.splice(hit.index+1,0,...fresh);}
  else if(e.op==='insertInto')hit.node.children.push(...fresh);
  else{if(hit.node===root)throw Error('Remove a surface with delete');hit.list.splice(hit.index,1);}
 }
 return root;
}

// ---------- one call → one A2UI delta ----------
const isDefault=(v:unknown)=>v===''||v===false||(Array.isArray(v)&&!v.length)||v===undefined;
/** Messages that (re)draw surfaces, apply edits and delete surfaces against the committed canvas.
 *  A redrawn surface keeps the person's input values by component id when the new line leaves them at default. */
export function changeMessages(current:Snapshot|null,args:{snapshot?:string;edits?:Edit[];delete?:string[]}){
 const existing=new Set(current?moduleIds(current):[]),messages:any[]=[],drawn:string[]=[],edited:string[]=[];
 const replace=(b:Built)=>{
  let data=b.data;
  if(current&&existing.has(b.sid)){
   const old=moduleData(current,b.sid),oldNodes=new Map(moduleNodes(current,b.sid).map((n:any)=>[n.id,n]));data={...b.data};
   for(const n of b.components)if(n.value?.path){const o=oldNodes.get(n.id);if(o?.value?.path&&o.component===n.component&&isDefault(data[n.id])){const v=atPath(old,o.value.path);if(v!==undefined)data[n.id]=v;}}
   messages.push({version:'v0.9.1',deleteSurface:{surfaceId:b.sid}});
  }
  messages.push(...surfaceMessages(b,data));existing.add(b.sid);
 };
 for(const r of args.snapshot?parseLines(args.snapshot):[]){const b=buildSurface(r);if(drawn.includes(b.sid))throw Error(`Surface ${b.sid} drawn twice`);replace(b);drawn.push(b.sid);}
 const bySurface=new Map<string,Edit[]>();for(const e of args.edits??[])bySurface.set(e.surface,[...(bySurface.get(e.surface)??[]),e]);
 for(const [sid,edits] of bySurface){
  if(!current||!moduleIds(current).includes(sid))throw Error(`No surface ${sid} to edit`);if(drawn.includes(sid))throw Error(`Surface ${sid} is both redrawn and edited; do one`);
  const region=applyEdits(surfaceLines(current,sid),edits);if(region.attrs.ref!==sid)throw Error('An edit cannot change a surface ref');replace(buildSurface(region));edited.push(sid);
 }
 for(const sid of args.delete??[]){if(!existing.has(sid))throw Error(`No surface ${sid} to delete`);messages.push({version:'v0.9.1',deleteSurface:{surfaceId:sid}});existing.delete(sid);}
 if(!messages.length)throw Error('Nothing to change: give snapshot, edits or delete');
 if(existing.size>MAX_SURFACES){
  const keep=new Set([...drawn,...edited]),stale=[...existing].filter(id=>!keep.has(id)&&current&&moduleIds(current).includes(id));
  throw Error(`The canvas holds at most ${MAX_SURFACES} surfaces and this call would leave ${existing.size}. Nothing is wrong with your surface: retire ${existing.size-MAX_SURFACES} stale one(s) in the same call with delete: [...], then draw. Current surfaces: ${stale.map(id=>`${id} (${JSON.stringify(surfaceTitle(moduleNodes(current!,id),id))})`).join(', ')}.`);
 }
 return {messages,drawn,edited,deleted:args.delete??[]};
}

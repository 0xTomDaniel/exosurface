// Exosurface snapshot format: one line per component, modelled on Playwright's
// aria snapshot YAML (`- role "name" [attr=value]: text`, indentation = nesting,
// `- /prop: value` child lines for extra properties). The agent writes it; code
// translates it to standard A2UI for the renderer. Parsed line by line, not as
// YAML, so text after `: ` needs no quoting or escaping.
import {EXO_CATALOG} from './exo-catalog.ts';

export const SNAPSHOT_FORMAT=`Exosurface snapshot format — one line per component, modelled on Playwright aria snapshots:
  - role "name" [attr] [attr=value]: inline text
Indentation (2 spaces) nests children. Quote names with JSON escaping; text after ": " is literal to the end of the line (markdown allowed in text and notes). [ref=id] gives a stable id (letters, digits, _ -); give refs to inputs, buttons and anything you may edit later. "- /prop: value" child lines set extra properties.
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
  textbox "Label" [ref=id] [multiline]: initial value
  checkbox "Label" [ref=id] [checked]
  slider "Label" [ref=id] [min=0] [max=10]: initial number
  radiogroup "Label" [ref=id] [chips]:  - radio "Option" [checked] [value=opt]   (pick one)
  listbox "Label" [ref=id] [chips]:  - option "Option" [selected] [value=opt]   (pick several)
  button "Label" [ref=id] [action=event_name] [primary|borderless] [sends=input_ref,…]   (sends the named inputs' current values)
tone ∈ neutral|accent|good|caution|risk. Bounds: 64 components per surface, depth 8.`;

type Line={depth:number;role:string;name?:string;attrs:Record<string,string|true>;text?:string;children:Line[];at:number};
const HEAD=/^-\s+(\/?[a-z][a-z-]*)(?:\s+"((?:[^"\\]|\\.)*)")?((?:\s*\[[^\]]*\])*)\s*(?::(?:\s(.*))?)?$/;
const ID=/^[a-zA-Z0-9_-]{1,80}$/;

export function parseLines(src:string):Line[]{
 const roots:Line[]=[],stack:Line[]=[];
 src.replace(/\r/g,'').split('\n').forEach((raw,i)=>{
  if(!raw.trim()||raw.trim().startsWith('#'))return;
  const indent=raw.match(/^ */)![0].length,m=HEAD.exec(raw.trim());
  if(!m)throw Error(`line ${i+1}: expected "- role \\"name\\" [attrs]: text", got: ${raw.trim().slice(0,80)}`);
  const attrs:Record<string,string|true>={};
  for(const a of (m[3]??'').match(/\[[^\]]*\]/g)??[]){const [k,...v]=a.slice(1,-1).split('=');attrs[k.trim()]=v.length?v.join('=').trim():true;}
  const node:Line={depth:indent,role:m[1],name:m[2]!==undefined?JSON.parse(`"${m[2]}"`):undefined,attrs,text:m[4]?.trim()||undefined,children:[],at:i+1};
  while(stack.length&&stack.at(-1)!.depth>=indent)stack.pop();
  (stack.length?stack.at(-1)!.children:roots).push(node);stack.push(node);
 });
 return roots;
}

const num=(v:unknown,at:number,what:string)=>{const n=Number(String(v).replace(/[,\s]/g,''));if(!Number.isFinite(n))throw Error(`line ${at}: ${what} must be a number, got ${v}`);return n;};
const cells=(t:string|undefined)=>(t??'').split('|').map(s=>s.trim());
const prop=(n:Line,key:string)=>n.children.find(c=>c.role===`/${key}`)?.text;
const tone=(n:Line)=>typeof n.attrs.tone==='string'?n.attrs.tone:undefined;
const clean=<T extends object>(o:T)=>Object.fromEntries(Object.entries(o).filter(([,v])=>v!==undefined)) as T;

/** Translate one snapshot (one or more surfaces) to A2UI v0.9.1 messages. */
export function snapshotToA2ui(src:string){
 const messages:any[]=[];
 for(const region of parseLines(src)){
  if(region.role!=='region')throw Error(`line ${region.at}: top-level lines must be region surfaces`);
  const sid=String(region.attrs.ref??'');if(!ID.test(sid))throw Error(`line ${region.at}: region needs [ref=surface_id]`);
  const components:any[]=[],data:Record<string,unknown>={},used=new Set<string>();let auto=0;
  const id=(n:Line,hint:string)=>{let v=typeof n.attrs.ref==='string'?n.attrs.ref:`${hint}${++auto}`;if(!ID.test(v))throw Error(`line ${n.at}: bad ref ${v}`);if(used.has(v))throw Error(`line ${n.at}: duplicate ref ${v}`);used.add(v);return v;};
  const textNode=(text:string,variant?:string,hint='t')=>{const i=`${hint}${++auto}`;used.add(i);components.push(clean({id:i,component:'Text',text,variant}));return i;};
  const stackOf=(kids:Line[],layout:'Column'|'Row',fixed?:string)=>{const i=fixed??`g${++auto}`;used.add(i);const c:any={id:i,component:layout,children:[]};components.push(c);c.children=kids.filter(k=>!k.role.startsWith('/')).map(build);return i;};
  const build=(n:Line):string=>{
   const a=n.attrs;
   switch(n.role){
    case 'heading':{const i=id(n,'h');components.push({id:i,component:'Text',text:n.name??n.text??'',variant:`h${Math.min(3,Math.max(1,Number(a.level??2)))}`});return i;}
    case 'text':case 'paragraph':{const i=id(n,'t');components.push(clean({id:i,component:'Text',text:n.text??n.name??'',variant:a.caption?'caption':undefined}));return i;}
    case 'separator':{const i=id(n,'d');components.push({id:i,component:'Divider'});return i;}
    case 'article':{const i=id(n,'c'),body=n.name?[{depth:0,role:'heading',name:n.name,attrs:{level:'3'},children:[],at:n.at} as Line,...n.children]:n.children;components.push({id:i,component:'Card',child:''});const c=components.at(-1);c.child=stackOf(body,'Column');return i;}
    case 'group':{
     if(a.collapsible||'expanded' in a){const i=id(n,'x');const c:any=clean({id:i,component:'Disclosure',title:n.name??'Details',summary:prop(n,'summary'),open:a.expanded===true||a.expanded==='true'});components.push(c);c.child=stackOf(n.children,'Column');return i;}
     const i=id(n,'g');const kids=n.name?[{depth:0,role:'heading',name:n.name,attrs:{level:'3'},children:[],at:n.at} as Line,...n.children]:n.children;
     const c:any={id:i,component:a.layout==='row'?'Row':'Column',children:[]};components.push(c);c.children=kids.filter(k=>!k.role.startsWith('/')).map(build);return i;}
    case 'list':{
     const items=n.children.filter(k=>k.role==='listitem');
     if(a.timeline){const i=id(n,'tl');components.push({id:i,component:'Timeline',items:items.map(k=>clean({label:k.name??k.text??'',when:typeof k.attrs.when==='string'?k.attrs.when:undefined,detail:k.name?k.text:undefined,state:typeof k.attrs.state==='string'?k.attrs.state:undefined}))});return i;}
     if(a.flow){const i=id(n,'fl'),nodes=items.map((k,j)=>({id:typeof k.attrs.ref==='string'?k.attrs.ref:`n${j+1}`,k}));
      components.push(clean({id:i,component:'Flow',caption:n.name,direction:typeof a.direction==='string'?a.direction:undefined,nodes:nodes.map(({id,k})=>clean({id,label:k.name??k.text??'',detail:k.name?k.text:undefined,tone:tone(k)})),edges:nodes.flatMap(({id,k})=>typeof k.attrs.to==='string'?k.attrs.to.split(',').map(t=>({from:id,to:t.trim()})):[])}));return i;}
     const i=id(n,'l');const c:any={id:i,component:'List',children:[]};components.push(c);
     c.children=items.map(k=>k.children.length?stackOf([...(k.text?[{depth:0,role:'text',text:k.text,attrs:{},children:[],at:k.at} as Line]:[]),...k.children],'Column'):textNode(k.text??k.name??'','body','li'));
     if(n.name){const g=`g${++auto}`;used.add(g);components.push({id:g,component:'Column',children:[textNode(n.name,'h3'),i]});return g;}
     return i;}
    case 'tablist':{const i=id(n,'tabs');const c:any={id:i,component:'Tabs',tabs:[]};components.push(c);c.tabs=n.children.filter(k=>k.role==='tab').map(k=>({title:k.name??k.text??'Tab',child:stackOf(k.children,'Column')}));return i;}
    case 'note':{const i=id(n,'n');const text=[n.text,...n.children.filter(k=>k.role==='text').map(k=>k.text)].filter(Boolean).join('\n\n');components.push(clean({id:i,component:'Callout',title:n.name,tone:typeof a.tone==='string'?a.tone:undefined,text}));return i;}
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
     const options=opts.map(k=>({label:k.name??k.text??'',value:typeof k.attrs.value==='string'?k.attrs.value:(k.name??k.text??'').toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'').slice(0,60)||'option'}));
     data[i]=opts.flatMap((k,j)=>k.attrs.checked||k.attrs.selected?[options[j].value]:[]);
     components.push({id:i,component:'ChoicePicker',label:n.name??'',options,value:{path:`/${i}`},variant:n.role==='radiogroup'?'mutuallyExclusive':'multipleSelection',displayStyle:a.chips?'chips':'checkbox'});return i;}
    case 'button':{const i=id(n,'b'),label=textNode(n.name??n.text??'OK',undefined,'bl');
     const sends=typeof a.sends==='string'?a.sends.split(',').map(s=>s.trim()).filter(Boolean):[];
     components.push({id:i,component:'Button',child:label,variant:a.primary?'primary':a.borderless?'borderless':'default',action:{event:{name:typeof a.action==='string'?a.action:i,context:Object.fromEntries(sends.map(s=>[s,{path:`/${s}`}]))}}});return i;}
    default:throw Error(`line ${n.at}: unknown role "${n.role}"`);
   }
  };
  // The region name titles the surface; render it only when the surface doesn't open with its own heading.
  const body=region.name&&region.children.find(k=>!k.role.startsWith('/'))?.role!=='heading'?[{depth:0,role:'heading',name:region.name,attrs:{level:'2'},children:[],at:region.at} as Line,...region.children]:region.children;
  used.add('root');components.push({id:'root',component:'Column',children:[]});const root=components.at(-1);root.children=body.filter(k=>!k.role.startsWith('/')).map(build);
  // root first, then document order (as the streaming contract asks)
  components.sort((x,y)=>x.id==='root'?-1:y.id==='root'?1:0);
  messages.push({version:'v0.9.1',createSurface:{surfaceId:sid,catalogId:EXO_CATALOG}},{version:'v0.9.1',updateComponents:{surfaceId:sid,components}},{version:'v0.9.1',updateDataModel:{surfaceId:sid,path:'/',value:data}});
 }
 if(!messages.length)throw Error('Snapshot has no region surface');
 return messages;
}

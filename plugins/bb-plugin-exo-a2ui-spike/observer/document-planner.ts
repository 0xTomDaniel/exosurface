// Jev chooses generic composition over the ORIGINAL semantic hierarchy.
// Code owns coverage, parentage and source order. No prepared page archetypes.
import type{Provider}from'../composition/provider.ts';import{CATALOG,moduleNodes,moduleData,type Snapshot,type Delta}from'../src/workspace.ts';
import{nodes,documentState,digest,reconstruct,type Document,type Section,type Hints}from'./document.ts';
const q=(instructions:string,criteria:Record<string,string>)=>({type:'choice'as const,instructions,criteria});
export type DocumentPlan=Record<string,{style:string;layout:string}>;
export async function planDocument(doc:Document,hints:Hints,provider:Pick<Provider,'decide'>,signal:AbortSignal):Promise<DocumentPlan>{
 const sections=nodes(doc).filter((n):n is Section=>n.kind==='section'),questions:any={};
 for(const s of sections){
  questions[s.id+'_style']=q(`Presentation boundary for ${s.id}? Preserve its meaning; cards only for genuinely independent units, not every paragraph.`,s.level>1?{Column:'Continuous section within the document hierarchy; quiet, no decorative box.',Card:'A distinct bounded decision, contingency, or answer area.'}:{Column:'Continuous document flow, not a card around the entire response.'});
  const layouts:Record<string,string>={Column:'Read top-to-bottom in original source order. Always appropriate for dependent steps and substantive prose.'};
  if(s.children.length>1&&s.children.every(n=>n.kind==='block')&&hints.roles[s.id]==='reference')layouts.List='A collection of peer information, preserving every item and its ordering.';
  // Horizontal/tab presentation only for actual short independent alternative SECTIONS.
  // Never hide/rearrange a sequence, question, contingency or long explanation.
  if(hints.roles[s.id]==='alternatives'&&s.children.length>=2&&s.children.length<=3&&s.children.every(n=>n.kind==='section'&&n.title.length<=80&&reconstruct(n).length<=700)&&!nodes({ ...doc,root:s}).some(n=>n.kind==='block'&&(n.ordered||n.raw.includes('?')))){
   layouts.Row='Short independent alternative sections, side by side on wide screens.';layouts.Tabs='Independent alternative sections, each explicitly labelled by its own source heading.';
  }
  questions[s.id+'_layout']=q(`Layout of children of ${s.id}, role=${hints.roles[s.id]}? Keep all source parents/order, priority and qualifications.`,layouts);
 }
 const selected=await provider.decide({document:documentState(doc),roles:hints.roles,instructions:'Presentation only. The semantic hierarchy is immutable, not optional content. Choose helpful boundaries and layouts, never a summary or a page template.'},questions,signal);
 return Object.fromEntries(sections.map(s=>[s.id,{style:selected[s.id+'_style'].choice,layout:selected[s.id+'_layout'].choice}]));
}
export function compileDocument(doc:Document,hints:Hints,plan:DocumentPlan,base:Snapshot|null,displayed:Snapshot|null,surfaceId:string):Delta{
 const current=displayed??base,old=current?moduleNodes(current,surfaceId):[],oldData=current?moduleData(current,surfaceId)??{}:{},components:any[]=[],data:any={},inputs=hints.inputs.map(id=>doc.questions.find(q=>q.id===id)!).sort((a,b)=>doc.questions.indexOf(a)-doc.questions.indexOf(b));
 if(inputs.some(q=>!q))throw Error('Unknown document question');
 const inputKey=(i:number)=>'doc_answer_'+digest(inputs[i].text).slice(0,12),lastBlock=inputs.at(-1)?.blockId;
 const build=(n:Document['root']|Document['root']['children'][number]):string=>{
  if(n.kind==='block'){
   components.push({id:n.id,component:'Text',variant:'body',text:n.raw.trim()});
   const own=inputs.map((q,i)=>({q,i})).filter(({q})=>q.blockId===n.id);if(!own.length)return n.id;
   const children=[n.id];for(const{i}of own){const id=inputKey(i),previous=old.find(c=>c.id===id);data[id]=previous?.value?.path==='/'+id&&typeof oldData[id]==='string'?oldData[id]:'';components.push({id,component:'TextField',label:`Answer ${i+1}`,variant:'longText',value:{path:'/'+id}});children.push(id);}
   if(n.id===lastBlock){const label='doc_discuss_label',button='doc_discuss';components.push({id:label,component:'Text',variant:'body',text:'Discuss answers'},{id:button,component:'Button',variant:'primary',child:label,action:{event:{name:'observer_discuss',context:Object.fromEntries(inputs.map((_,i)=>['answer_'+(i+1),{path:'/'+inputKey(i)}]))}}});children.push(button);}
   const id=n.id+'_answers';components.push({id,component:'Column',children});return id;
  }
  const p=plan[n.id];if(!p||!['Column','Card'].includes(p.style)||!['Column','List','Row','Tabs'].includes(p.layout))throw Error('Invalid document composition');
  const id=n===doc.root?'root':n.id,children:string[]=[];
  if(n.raw.trim()){
   const title=n.id+'_title';// Only actual source headings can become headings. Long titles degrade to body, never huge prose.
   const isHeading=n.level>0&&n.title.length<=100&&!/[\[*_`]/.test(n.title),text=n.level?n.title:n.raw.trim();components.push({id:title,component:'Text',text:isHeading?text:n.level&&n.title.length>100?text:n.raw.trim(),variant:isHeading?'h'+Math.min(n.level,3):'body'});children.push(title);
  }
  const childIds=n.children.map(build);
  if(p.layout==='Tabs'){
   if(n.children.some(c=>c.kind!=='section'))throw Error('Tabs require labelled semantic sections');const tabs=n.id+'_peers';components.push({id:tabs,component:'Tabs',tabs:n.children.map((c,i)=>({title:(c as Section).title,child:childIds[i]}))});children.push(tabs);
  }else if(p.layout==='Column')children.push(...childIds);
  else{const group=n.id+'_peers';components.push({id:group,component:p.layout,children:childIds});children.push(group);}
  if(p.style==='Card'){const inner=n.id+'_content';components.push({id:inner,component:'Column',children},{id,component:'Card',child:inner});}
  else components.push({id,component:'Column',children});return id;
 };
 build(doc.root);if(components.length>64)throw Error('Document component count outside bound');
 // Retire old flat-experiment definitions, or compact accumulated orphan definitions.
 // Standard delete/create only for this test surface; compatible bound values survive.
 const exists=!!current?.messages.some(m=>m.createSurface?.surfaceId===surfaceId),reset=exists&&(old.some(n=>n.id!=='root'&&!n.id.startsWith('doc_'))||new Set([...old,...components].map(n=>n.id)).size>64),messages:any[]=[];
 if(reset)messages.push({version:'v0.9.1',deleteSurface:{surfaceId}});
 if(!exists||reset)messages.push({version:'v0.9.1',createSurface:{surfaceId,catalogId:CATALOG}});
 const changed=reset||!exists?components:components.filter(c=>JSON.stringify(old.find(n=>n.id===c.id))!==JSON.stringify(c));if(changed.length)messages.push({version:'v0.9.1',updateComponents:{surfaceId,components:changed}});
 if(reset||!exists)messages.push({version:'v0.9.1',updateDataModel:{surfaceId,path:'/',value:data}});else for(const[k,v]of Object.entries(data))if(JSON.stringify(oldData[k])!==JSON.stringify(v))messages.push({version:'v0.9.1',updateDataModel:{surfaceId,path:'/'+k,value:v}});
 if(!messages.length)messages.push({version:'v0.9.1',updateComponents:{surfaceId,components:[components.find(c=>c.id==='root')]}});
 return{baseRevision:base?.revision??0,revision:(base?.revision??0)+1,messages};
}

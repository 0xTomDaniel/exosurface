// Lossless semantic document, not a summary or a scenario/page template.
// Reuse the Markdown parser already required by the pinned official React renderer.
import{createRequire}from'node:module';import{createHash}from'node:crypto';
const require=createRequire(import.meta.url),MarkdownIt=createRequire(require.resolve('@a2ui/react/v0_9'))('markdown-it'),md=new MarkdownIt({html:false,linkify:false,typographer:false});
export type Block={id:string;kind:'block';format:string;raw:string;ordered:boolean;emphasis:string[];times:string[];listItems:number};
export type Section={id:string;kind:'section';level:number;title:string;raw:string;children:DocNode[]};
export type DocNode=Section|Block;
export type Question={id:string;blockId:string;text:string};
export type Document={root:Section;questions:Question[];sha256:string;chars:number};
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
export function nodes(doc:Document):DocNode[]{const out:DocNode[]=[];const visit=(n:DocNode)=>{out.push(n);if(n.kind==='section')n.children.forEach(visit);};visit(doc.root);return out;}
export function reconstruct(n:DocNode):string{return n.kind==='section'?n.raw+n.children.map(reconstruct).join(''):n.raw;}
export function parseDocument(source:string):Document{
 if(!source.trim()||source.length>18000)throw Error('Document source outside bound');
 const lines=source.match(/[^\n]*\n|[^\n]+$/g)??[],offsets=[0];for(const l of lines)offsets.push(offsets.at(-1)!+l.length);
 const tokens=md.parse(source,{}),top=tokens.filter((t:any)=>t.level===0&&t.map&&t.nesting!==-1),root:Section={id:'doc_root',kind:'section',level:0,title:'',raw:'',children:[]},stack=[root],questions:Question[]=[];
 if(top.length&&top[0].map[0]>0)root.raw=source.slice(0,offsets[top[0].map[0]]);
 for(let i=0;i<top.length;i++){
  const token=top[i],start=token.map[0],end=top[i+1]?.map[0]??lines.length,raw=source.slice(offsets[start],offsets[end]);
  if(token.type==='heading_open'){
   const level=Number(token.tag.slice(1)),at=tokens.indexOf(token),title=tokens[at+1]?.content??'';
   while(stack.at(-1)!.level>=level)stack.pop();const section:Section={id:'doc_s_'+start,kind:'section',level,title,raw,children:[]};stack.at(-1)!.children.push(section);stack.push(section);
  }else{
   const inner=tokens.filter((t:any)=>t.map&&t.map[0]>=start&&t.map[0]<end),inline=inner.filter((t:any)=>t.type==='inline');
   const block:Block={id:'doc_b_'+start,kind:'block',format:token.type.replace(/_open$/,''),raw,ordered:inner.some((t:any)=>t.type==='ordered_list_open'),listItems:inner.filter((t:any)=>t.type==='list_item_open').length,emphasis:inline.flatMap((t:any)=>{const out:string[]=[];let text:string|null=null;for(const c of t.children??[]){if(c.type==='strong_open')text='';else if(c.type==='strong_close'){if(text!==null)out.push(text);text=null;}else if(text!==null)text+=c.content??'';}return out;}),times:raw.match(/\b\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?)\b|\b\d{1,2}:\d{2}\b/gi)??[]};
   stack.at(-1)!.children.push(block);
   for(const t of inline)if(t.content.includes('?')&&t.content.length<=600)questions.push({id:'q_'+t.map[0],blockId:block.id,text:t.content});
  }
 }
 const doc={root,questions,sha256:digest(source),chars:source.length};if(reconstruct(root)!==source)throw Error('Document source coverage mismatch');if(nodes(doc).length>44)throw Error('Document node budget exceeded');return doc;
}
export const ROLES=['context','sequence','alternatives','reference','conditions','questions']as const;
export type Hints={roles:Record<string,typeof ROLES[number]>;inputs:string[]};
export function acceptHint(raw:any,doc:Document,hints:Hints){
 if(!raw||typeof raw!=='object')throw Error('Invalid document hint');
 if(raw.kind==='role'&&Object.keys(raw).sort().join()==='id,kind,role'&&nodes(doc).some(n=>n.kind==='section'&&n.id===raw.id)&&ROLES.includes(raw.role)&&!hints.roles[raw.id]){hints.roles[raw.id]=raw.role;return;}
 if(raw.kind==='input'&&Object.keys(raw).sort().join()==='id,kind'&&doc.questions.some(q=>q.id===raw.id)&&!hints.inputs.includes(raw.id)&&hints.inputs.length<2){hints.inputs.push(raw.id);return;}
 throw Error('Unbound/duplicate/excess document hint; no source rewrite or authority accepted');
}
export function documentState(doc:Document){return{nodes:nodes(doc).map(n=>n.kind==='section'?{id:n.id,kind:n.kind,level:n.level,title:n.title,children:n.children.map(c=>c.id)}:{...n,text:n.raw,raw:undefined}),questions:doc.questions};}

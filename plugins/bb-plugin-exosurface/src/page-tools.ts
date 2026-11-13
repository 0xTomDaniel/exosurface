// Fresh-owner Pi extension: extracted grammar + durable page reducer, never imports legacy deployment/profile state.
import { drawPages, readPages, isPageDraw } from './pages.ts';
import { moduleIds } from './snapshot-data.ts';
import { SNAPSHOT_FORMAT, surfaceSnapshot } from './snapshot-format.ts';
import { checkUpdateArguments, OP_WORDS } from './update-arguments.ts';
// The part of Pi's extension API these tools use; plain JSON schemas keep TypeBox out of the runtime.
interface ToolResult {content:{type:'text';text:string}[];details:unknown}
interface PageTool {name:string;label:string;description:string;executionMode?:'sequential';parameters:object;execute:(toolCallId:string,args:unknown)=>Promise<ToolResult>}
interface ToolHost {registerTool:(tool:PageTool)=>void}
// Pi hands execute the call's arguments as JSON. Guards only: drawPages still sees the arguments as sent and refuses unknown keys.
const isArguments=(v:unknown):v is Record<string,unknown>=>typeof v==='object'&&v!==null&&!Array.isArray(v);
// Runs f as an async body would: a throw becomes a rejection.
const settled=<T>(f:()=>T)=>new Promise<T>(resolve=>{resolve(f());});
export default function pageTools(pi:ToolHost){
 const state=process.env["EXO_PAGE_STATE"];
 if(!state)throw Error('Explicit private EXO_PAGE_STATE required for page tools');
 const text=(value:string,details:unknown={}):ToolResult=>({content:[{type:'text',text:value}],details});
 // Ordinary JSON schemas are consumed by Pi's public registerTool API; no runtime TypeBox/A2UI dependency.
 const id={type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'},string={type:'string'};
 pi.registerTool({name:'update_exosurface',label:'Update Exosurface pages',executionMode:'sequential',
  description:'Draw or edit the current persisted pages. Read first for the current revision. Refs remain stable. '+SNAPSHOT_FORMAT,
  parameters:{type:'object',additionalProperties:false,required:['mutationId'],properties:{
   // Format checks (baseRevision, edit surface/ref/op) are in execute, so a malformed call reaches Exo in plain words (#108).
   baseRevision:{type:'number',description:'The current revision: a whole number 0 or more.'},mutationId:id,snapshot:{type:'string',maxLength:128*1024},
   edits:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,properties:{surface:id,ref:id,op:{type:'string',description:`One of ${OP_WORDS}.`},lines:string}}},delete:{type:'array',maxItems:8,items:id}}},
  execute:(_id:string,args:unknown)=>settled(()=>{
   if(!isArguments(args))throw Error('Invalid page mutation envelope');checkUpdateArguments(args,'surface');if(!isPageDraw(args))throw Error('Invalid page mutation envelope');const result=drawPages(state,args);return text(`Pages saved at revision ${String(result.revision)}.`,result);})});
 pi.registerTool({name:'read_exosurface',label:'Read current Exosurface pages',description:'Read the persisted current page snapshot and exact revision/refs before editing.',
  parameters:{type:'object',properties:{},additionalProperties:false},execute:()=>settled(()=>{
   const d=readPages(state);return text(d?`Revision ${String(d.revision)}\n`+moduleIds(d.snapshot).map(sid=>surfaceSnapshot(d.snapshot,sid)).join('\n'):'Revision 0: no current pages.',{revision:d?.revision??0});})});
}

// Fresh-owner Pi extension: extracted grammar + durable page reducer, never imports legacy deployment/profile state.
import { drawPages, readPages, type PageDraw } from './pages.ts';
import { moduleIds } from './snapshot-data.ts';
import { SNAPSHOT_FORMAT, surfaceSnapshot } from './snapshot-format.ts';
export default function pageTools(pi:any){
 const state=process.env.EXO_PAGE_STATE;
 if(!state)throw Error('Explicit private EXO_PAGE_STATE required for page tools');
 const text=(value:string,details:unknown={})=>({content:[{type:'text',text:value}],details});
 // Ordinary JSON schemas are consumed by Pi's public registerTool API; no runtime TypeBox/A2UI dependency.
 const id={type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'},string={type:'string'};
 pi.registerTool({name:'update_exosurface',label:'Update Exosurface pages',executionMode:'sequential',
  description:'Draw or edit the current persisted pages. Read first for the current revision. Refs remain stable. '+SNAPSHOT_FORMAT,
  parameters:{type:'object',additionalProperties:false,required:['baseRevision','mutationId'],properties:{
   baseRevision:{type:'integer',minimum:0},mutationId:id,snapshot:{type:'string',maxLength:128*1024},
   edits:{type:'array',maxItems:24,items:{type:'object',additionalProperties:false,required:['surface','ref','op'],properties:{surface:id,ref:id,op:{enum:['replace','insertAfter','insertInto','remove']},lines:string}}},delete:{type:'array',maxItems:8,items:id}}},
  execute:async(_id:string,args:PageDraw)=>{const result=drawPages(state,args);return text(`Pages saved at revision ${result.revision}.`,result);}});
 pi.registerTool({name:'read_exosurface',label:'Read current Exosurface pages',description:'Read the persisted current page snapshot and exact revision/refs before editing.',
  parameters:{type:'object',properties:{},additionalProperties:false},execute:async()=>{
   const d=readPages(state);return text(d?`Revision ${d.revision}\n`+moduleIds(d.snapshot).map(sid=>surfaceSnapshot(d.snapshot,sid)).join('\n'):'Revision 0: no current pages.',{revision:d?.revision??0});}});
}

// Client-local drafts, NOT conversation authority or model knowledge.
import {inputBindings,inputSignature,validateInput,moduleIds,atPath,moduleData,type Snapshot} from './workspace.ts';
export type Draft={surfaceId:string;path:string;signature:string;value:any};
export class DraftStore{
 readonly edits=new Map<string,Draft>();
 key(surfaceId:string,path:string){return `${surfaceId}:${path}`;}
 record(surfaceId:string,path:string,node:any,value:any,published:any){
  validateInput(node,value);const key=this.key(surfaceId,path);
  if(JSON.stringify(value)===JSON.stringify(published))this.edits.delete(key);
  else this.edits.set(key,{surfaceId,path,signature:inputSignature(node),value:structuredClone(value)});
 }
 reconcile(snapshot:Snapshot,acknowledge=true){
  const apply:Draft[]=[],orphan:Draft[]=[];
  for(const[key,d]of this.edits){
   const n=moduleIds(snapshot).includes(d.surfaceId)?inputBindings(snapshot,d.surfaceId).get(d.path):null;
   if(!n||inputSignature(n)!==d.signature){orphan.push(d);continue;}
   try{validateInput(n,d.value);}catch{orphan.push(d);continue;}
   if(acknowledge&&JSON.stringify(atPath(moduleData(snapshot,d.surfaceId),d.path))===JSON.stringify(d.value))this.edits.delete(key);
   else apply.push(d);
  }
  return {apply,orphan};
 }
}

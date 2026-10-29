// Extracted from bb-plugin-exo-a2ui-spike/src/workspace.ts at 981941ade8f35ccc1a96628bbc2f317370e3692a.
// Pure data helpers/types extracted from the local spike, without A2UI/Zod/legacy state.
export const EXO_CATALOG='urn:exosurface:catalog:exo-visual:v1';
export const MAX_SENDS=24;
export type Snapshot={revision:number;messages:any[]};
export const moduleIds=(s:Snapshot):string[]=>s.messages.filter(m=>m.createSurface).map(m=>m.createSurface.surfaceId);
export const moduleNodes=(s:Snapshot,id:string):any[]=>s.messages.find(m=>m.updateComponents?.surfaceId===id)?.updateComponents.components??[];
export const moduleData=(s:Snapshot,id:string):any=>s.messages.find(m=>m.updateDataModel?.surfaceId===id)?.updateDataModel.value;
export function checkPath(path:string){
 if(!/^\/(?:[^/~]+(?:~[01][^/~]*)*\/?)+$/.test(path)||path==='/'||path.length>160)throw Error('Only bounded absolute JSON Pointer leaf bindings');
 if(path.split('/').some(k=>['__proto__','constructor','prototype'].includes(k.replace(/~1/g,'/').replace(/~0/g,'~'))))throw Error('Forbidden path segment');
 return path;
}
export function atPath(data:any,path:string){return checkPath(path).split('/').slice(1).reduce((v:any,k:string)=>v?.[k.replace(/~1/g,'/').replace(/~0/g,'~')],data);}

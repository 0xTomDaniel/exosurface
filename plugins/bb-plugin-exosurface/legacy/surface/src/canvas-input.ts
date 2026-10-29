// Existing page limits, measured exactly as before. Pure preflight runs before any native commit/send.
import {applyDelta,inputBindings,moduleIds,validateInput,type Snapshot,type Delta} from './workspace.ts';
import {retirement,versionSnapshot,type Version} from './canvas-history.ts';
export const MAX_OWNER_COMMAND_UNITS=12000; // JSON.stringify(request).length: UTF-16 code units, not 12 KiB.
export function assertOwnerCommand(request:unknown){
 if(JSON.stringify(request).length>MAX_OWNER_COMMAND_UNITS)throw Error('Page command exceeds 12000 serialized UTF-16 units. Nothing was changed or sent.');
}
export type DataRequest={revision:number;surfaceId:string;updates:{path:string;value?:unknown}[];mutationId:string;source:'edit'|'press'};
export function planData(current:Snapshot,r:DataRequest){
 assertOwnerCommand(r);
 if(r.revision!==current.revision)throw Error(`stale_revision ${current.revision}`);
 if(!/^[0-9a-f-]{36}$/.test(r.mutationId)||!Array.isArray(r.updates)||!r.updates.length||r.updates.length>16)throw Error('Invalid page edit. Nothing was changed or sent.');
 const bindings=inputBindings(current,r.surfaceId),messages=r.updates.map(u=>{const n=bindings.get(u.path);if(!n)throw Error('Only offered inputs can be edited');return {version:'v0.9.1',updateDataModel:{surfaceId:r.surfaceId,path:u.path,value:validateInput(n,u.value)}};});
 const delta:Delta={baseRevision:current.revision,revision:current.revision+1,messages};
 return {delta,next:applyDelta(current,delta)};
}
export function planRestore(current:Snapshot|null,v:Version,r:{surfaceId:string;revision:number;updates:{path:string;value?:unknown}[];mutationId:string}){
 assertOwnerCommand(r);
 if(!/^[0-9a-f-]{36}$/.test(r.mutationId)||typeof r.surfaceId!=='string'||!Number.isInteger(r.revision)||!Array.isArray(r.updates)||r.updates.length>16)throw Error('Invalid bring-back');
 const old=versionSnapshot(v),bindings=inputBindings(old,r.surfaceId);
 const data=structuredClone(old.messages.find(m=>m.updateDataModel)?.updateDataModel.value??{});
 for(const u of r.updates){const n=bindings.get(u.path);if(!n)throw Error('Only offered inputs can be edited');const keys=String(u.path).split('/').slice(1);let o:any=data;keys.slice(0,-1).forEach(k=>{o[k]??={};o=o[k];});o[keys.at(-1)!]=validateInput(n,u.value);}
 const body=old.messages.filter(m=>m.createSurface||m.updateComponents);
 const msgs=[...(current&&moduleIds(current).includes(r.surfaceId)?[{version:'v0.9.1',deleteSurface:{surfaceId:r.surfaceId}}]:[]),...body,{version:'v0.9.1',updateDataModel:{surfaceId:r.surfaceId,path:'/',value:data}}];
 const layout={focus:r.surfaceId,...(current?.layout?.beside?{beside:current.layout.beside.filter(b=>b!==r.surfaceId)}:{})};
 const {messages,retired}=retirement(current,msgs,layout,[r.surfaceId]);
 const delta:Delta={baseRevision:current?.revision??0,revision:(current?.revision??0)+1,messages,layout};
 return {delta,retired,next:applyDelta(current,delta)};
}

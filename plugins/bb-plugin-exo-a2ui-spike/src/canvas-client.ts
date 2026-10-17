// Command-only owner connection for shared canvas state: no attachment, no model call.
import{createConnection}from'node:net';import{join}from'node:path';import{HOME}from'./state.ts';
export type CanvasData={revision:number;surfaceId:string;updates:{path:string;value?:unknown}[];mutationId:string;source:'edit'|'press'};
export function canvasDataViaOwner(threadId:string,request:CanvasData):Promise<void>{return ownerCommand(threadId,'canvas-data',request);}
export type CanvasRestore={surfaceId:string;revision:number;updates:{path:string;value?:unknown}[];mutationId:string;announced?:boolean};
export function restoreViaOwner(threadId:string,request:CanvasRestore):Promise<void>{return ownerCommand(threadId,'canvas-restore',request);}
function ownerCommand(threadId:string,type:string,request:{mutationId:string}):Promise<void>{return new Promise((resolve,reject)=>{
 const s=createConnection(join(HOME,'owner/rpc.sock'));let buffer='',done=false;const end=(e?:Error)=>{if(done)return;done=true;s.destroy();e?reject(e):resolve();};
 s.setEncoding('utf8');s.setTimeout(10000);s.once('timeout',()=>end(Error('Canvas edit timed out')));s.once('error',()=>end(Error('Clone owner unavailable')));
 s.once('connect',()=>s.write(JSON.stringify({id:request.mutationId,type,threadId,request})+'\n'));
 s.on('data',v=>{buffer+=v;if(buffer.length>16000)return end(Error('Owner response exceeds bound'));let i:number;while((i=buffer.indexOf('\n'))>=0){const l=buffer.slice(0,i);buffer=buffer.slice(i+1);try{const r=JSON.parse(l);if(r.id===request.mutationId)end(r.ok?undefined:Error(r.error??'Canvas edit rejected'));}catch{end(Error('Invalid owner response'));}}});
 s.once('close',()=>{if(!done)end(Error('Owner disconnected'));});});}

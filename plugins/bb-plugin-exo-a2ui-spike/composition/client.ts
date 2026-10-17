import {createConnection} from 'node:net';
import {join} from 'node:path';
import {HOME} from '../src/state.ts';
import type {CompositionRequest} from './engine.ts';
// One non-attaching command connection. Never launches Pi or replaces a view owner.
export function composeViaOwner(threadId:string,request:CompositionRequest):Promise<void>{
 return new Promise((resolve,reject)=>{
  const socket=createConnection(join(HOME,'owner/rpc.sock'));let buffer='',done=false;
  const finish=(error?:Error)=>{if(done)return;done=true;socket.destroy();error?reject(error):resolve();};
  socket.setEncoding('utf8');socket.setTimeout(60000);socket.once('timeout',()=>finish(Error('Composition command timed out; inspect native run before retrying')));socket.once('error',()=>finish(Error('Existing clone owner unavailable; no fallback spawned')));
  socket.once('connect',()=>socket.write(JSON.stringify({id:request.runId,type:'compose',threadId,request})+'\n'));
  socket.on('data',chunk=>{buffer+=chunk;if(buffer.length>16000)return finish(Error('Owner response exceeds bound'));let at:number;while((at=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,at);buffer=buffer.slice(at+1);try{const v=JSON.parse(line);if(v.id===request.runId)finish(v.ok?undefined:Error('Native composition request rejected; inspect retained state'));}catch{finish(Error('Invalid owner response'));}}});
  socket.once('close',()=>{if(!done)finish(Error('Owner disconnected; inspect retained native run before retrying'));});
 });
}

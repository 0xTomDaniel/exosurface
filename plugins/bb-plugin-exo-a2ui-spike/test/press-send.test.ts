import './isolation.ts';
// Real plugin action handler and RPC schema; fake BB boundary + a disposable Unix owner socket.
// No owner/model process, auth, external network, background services or user directories.
import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import plugin,{rpcContract} from '../server.ts';
import {CLONE_HOME,save} from '../src/state.ts';
import {applyDelta,MAX_TEXT,CATALOG} from '../src/workspace.ts';
import {EXO_CATALOG} from '../src/exo-catalog.ts';
const V='v0.9.1';
const note=('A complete multiline fixture note.\n'+'x'.repeat(50)+'\n').repeat(14)+'FINAL SENTINEL';
const action=(value:string)=>({name:'apply',surfaceId:'note',sourceComponentId:'go',timestamp:new Date(0).toISOString(),context:{note:value}});
const request=(value:string)=>({threadId:'fixture-thread',revision:1,event:{version:V,action:action(value)},actionId:randomUUID(),metadata:{a2uiClientCapabilities:{[V]:{supportedCatalogIds:[CATALOG]}}}});

test('#31 real RPC action handler passes >=1,000 characters to BB send after committing the identical owner patch',async t=>{
 assert.ok(note.length>=1000);
 const workspace=applyDelta(null,{baseRevision:0,revision:1,messages:[
  {version:V,createSurface:{surfaceId:'note',catalogId:EXO_CATALOG}},
  {version:V,updateComponents:{surfaceId:'note',components:[
   {id:'root',component:'Column',children:['field','go']},
   {id:'field',component:'TextField',label:'Note',value:{path:'/note'},variant:'longText'},
   {id:'go',component:'Button',child:'caption',action:{event:{name:'apply',context:{note:{path:'/note'}}}}},
   {id:'caption',component:'Text',text:'Submit'}]}},
  {version:V,updateDataModel:{surfaceId:'note',value:{note:''}}}],layout:{focus:'note'}});
 save(join(CLONE_HOME,'canonical-thread.json'),{threadId:'fixture-thread'});
 save(join(CLONE_HOME,'owner/state.json'),{ready:true,streaming:false,sessionFile:'fixture-session.jsonl'});
 save(join(CLONE_HOME,'workspace/latest.json'),{sessionId:'fixture-session',workspace});
 save(join(CLONE_HOME,'bindings/fixture-thread.json'),{runtimeKind:'canonical'});
 const patches:any[]=[],sent:any[]=[];let handlers:any;
 const owner=createServer(socket=>{let buffer='';socket.setEncoding('utf8');socket.on('data',data=>{
  buffer+=data;if(!buffer.includes('\n'))return;
  const message=JSON.parse(buffer.split('\n')[0]);patches.push(message);
  socket.end(JSON.stringify({id:message.id,ok:true})+'\n');
 });});
 await new Promise<void>((resolve,reject)=>{owner.once('error',reject);owner.listen(join(CLONE_HOME,'owner/rpc.sock'),resolve);});
 t.after(()=>new Promise<void>((resolve,reject)=>owner.close(e=>e?reject(e):resolve())));
 plugin({providers:{register(){}},background:{service(){}},ui:{registerMentionProvider(){}},experimental_hooks:{on(){}},realtime:{publish(){}},rpc:{register(_contract:any,h:any){handlers=h;}},sdk:{threads:{async get(){return{providerId:'exo-a2ui-spike'};},async send(value:any){assert.equal(patches.length,1,'commit precedes send');sent.push(value);}}}} as any);
 const parsed=rpcContract.action.input.parse(request(note));
 assert.deepEqual(await handlers.action(parsed),{accepted:true});
 assert.equal(patches[0].type,'canvas-data');assert.equal(patches[0].request.updates[0].value,note);
 assert.equal(sent.length,1);assert.ok(sent[0].input[0].text.includes(`“${note}”`));
 // The actual RPC boundary rejects oversized text explicitly; it never reaches the handler/send.
 assert.throws(()=>rpcContract.action.input.parse(request('x'.repeat(MAX_TEXT+1))),e=>e instanceof Error&&e.message.includes(`${MAX_TEXT}`)&&e.message.includes('nothing was sent'));
 assert.equal(sent.length,1);
});

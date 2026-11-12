// Actual retained handlers, synthetic state + Unix owner socket, registration-only test API.
// Not native BB/provider/auth/inference evidence. Explicit disposable HOME required.
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {join,resolve} from 'node:path';
import {mkdirSync,writeFileSync,readFileSync,existsSync,rmSync} from 'node:fs';
import {createServer} from 'node:net';
const plugin=resolve(process.argv[2]),home=resolve(process.env["HOME"]??'');
assert.ok(process.env["EXO_NATIVE_ROOT"]&&home.startsWith(resolve(process.env["EXO_NATIVE_ROOT"])+'/'),'Disposable fixture HOME required');
const {default:register,composeDispatchHooks}=await import(pathToFileURL(join(plugin,'server.ts')));
let registrations=0,dispatch;const providers=[],services=[],signals=[];
// Test transport only, not a substituted dependency/module or host behavior proof.
const bb={providers:{register:p=>providers.push(p)},rpc:{register(){}},sdk:{threads:{}},
 background:{service:(name,value)=>services.push({name,value})},realtime:{publish:(...value)=>signals.push(value)},
 ui:{registerMentionProvider(){}},log:{warn(){}},experimental_hooks:{on(name,handler){assert.equal(name,'message.dispatch');assert.equal(dispatch,undefined,'BB permits one hook per plugin');registrations++;dispatch=handler;}}};
register(bb);assert.equal(registrations,1);assert.deepEqual(providers.map(p=>p.id),['exo-spike']);assert.equal(services.length,2);
assert.equal(typeof dispatch,'function');
const state=join(home,'.exo-bb-spike'),write=(file,data)=>{mkdirSync(join(file,'..'),{recursive:true});writeFileSync(file,JSON.stringify(data));};
const context=(overrides={})=>({...overrides,attempt:overrides.attempt??'start-turn',thread:{id:'fixture-child',providerId:'exo-spike',parentThreadId:null,...overrides.thread},input:{text:'hello',...overrides.input}});
let cases=1,socket;const requests=[];
try{
 assert.deepEqual(await dispatch(context()),{action:'proceed'});cases++;
 assert.deepEqual(await dispatch(context({thread:{id:'fixture-child',providerId:'other'},input:{text:'/attach fixture run-one'}})),{action:'proceed'});cases++;
 // Real surface fallback must preserve start-turn filtering and owner request/removal.
 write(join(state,'canonical-thread.json'),{threadId:'fixture-child'});
 const pending=join(state,'workspace/pending-restore.json');
 const value={deployment:'main',threadId:'fixture-child',surface:'page',revision:1,title:'Fixture',at:'2000-01-01T00:00:00Z',updates:[]};
 write(pending,value);
 assert.deepEqual(await dispatch(context({attempt:'steer'})),{action:'proceed'});assert.ok(existsSync(pending));cases++;
 mkdirSync(join(state,'owner'),{recursive:true});socket=createServer(s=>{let data='';s.on('data',chunk=>{data+=chunk;const i=data.indexOf('\n');if(i<0)return;const request=JSON.parse(data.slice(0,i));requests.push(request);s.end(JSON.stringify({id:request.id,ok:true})+'\n');});});
 await new Promise(r=>socket.listen(join(state,'owner/rpc.sock'),r));
 // Primary reject must short-circuit before surface's pending restore.
 assert.equal((await dispatch(context({thread:{id:'fixture-child',providerId:'exo-spike',parentThreadId:'fixture-parent'},input:{text:'/exosurface-new-surface'}}))).action,'reject');assert.ok(existsSync(pending));assert.equal(requests.length,0);cases++;
 assert.deepEqual(await dispatch(context({attempt:'start-turn'})),{action:'proceed'});assert.ok(!existsSync(pending));assert.equal(requests.length,1);assert.equal(requests[0].type,'canvas-restore');assert.equal(requests[0].threadId,'fixture-child');assert.deepEqual(requests[0].request.updates,[]);cases++;
 // Surface's existing owner-error handling remains local to that handler, not composition.
 await new Promise(r=>socket.close(r));socket=null;write(pending,value);
 assert.deepEqual(await dispatch(context({attempt:'start-turn'})),{action:'proceed'});assert.ok(existsSync(pending));cases++;
 const order=[],ctx=context(),failure=new Error('must propagate'),rejected={action:'reject',message:'unchanged'};
 assert.deepEqual(await composeDispatchHooks([async c=>{assert.equal(c,ctx);await Promise.resolve();order.push('primary');return {action:'proceed'};},c=>{assert.equal(c,ctx);order.push('surface');return {action:'proceed'};}])(ctx),{action:'proceed'});assert.deepEqual(order,['primary','surface']);cases++;
 assert.equal(await composeDispatchHooks([()=>rejected,()=>{throw Error('must not run');}])(ctx),rejected);cases++;
 await assert.rejects(()=>composeDispatchHooks([()=>{throw failure;},()=>{throw Error('must not run');}])(ctx),e=>e===failure);cases++;
 await assert.rejects(()=>composeDispatchHooks([()=>({action:'proceed'}),async()=>{throw failure;}])(ctx),e=>e===failure);cases++;
 const wait={action:'wait',reason:'first'};let later=false;assert.equal(await composeDispatchHooks([()=>wait,()=>{later=true;return {action:'proceed'};}])(ctx),wait);assert.ok(later);cases++;
 console.log(JSON.stringify({passed:true,cases,registrations,actualRetainedHandlers:true,providerDispatch:false,ownerRequests:requests.length,releaseReady:false},null,2));
}finally{if(socket)await new Promise(r=>socket.close(r));rmSync(state,{recursive:true,force:true});}

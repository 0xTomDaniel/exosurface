// Live check of the shared-state path through the real BB plugin server → owner → extension.
// One no-op edit (an existing input re-saved with its current value): revision +1, data unchanged,
// a native canvas-edit entry, and NO new conversation message or model call. Also loads the page.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';import{randomUUID}from'node:crypto';
import { chromium } from './playwright.mjs';
const H=process.env.HOME+'/.exo-a2ui-spike',load=p=>JSON.parse(readFileSync(p,'utf8')),proof={passed:false,pageErrors:[]};let browser;
const[surfaceId,path,value]=process.argv.slice(2,5);
try{
 const owner=load(`${H}/owner/state.json`),before=load(`${H}/workspace/latest.json`),journal=()=>readFileSync(owner.sessionFile,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 const messagesBefore=journal().filter(e=>e.type==='message').length;assert.ok(owner.ready&&!owner.streaming);
 const r=await fetch('http://127.0.0.1:38886/api/v1/plugins/exo-a2ui-spike/rpc/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({threadId:owner.threadId,revision:before.workspace.revision,surfaceId,updates:[{path,value:JSON.parse(value)}],mutationId:randomUUID()})});
 const body=await r.json();proof.rpc=body;assert.ok(body.ok,JSON.stringify(body));
 const after=load(`${H}/workspace/latest.json`),entries=journal();
 assert.equal(after.workspace.revision,before.workspace.revision+1);
 assert.deepEqual(after.workspace.messages.find(m=>m.updateDataModel?.surfaceId===surfaceId).updateDataModel.value,before.workspace.messages.find(m=>m.updateDataModel?.surfaceId===surfaceId).updateDataModel.value,'data unchanged (no-op value)');
 assert.equal(entries.filter(e=>e.type==='message').length,messagesBefore,'no conversation message, no model turn');
 const last=entries.filter(e=>e.type==='custom'&&e.customType==='exosurface-composition-commit').at(-1);assert.equal(last.data.source,'canvas-edit');
 // A stale revision is refused, not applied.
 const stale=await(await fetch('http://127.0.0.1:38886/api/v1/plugins/exo-a2ui-spike/rpc/edit',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({threadId:owner.threadId,revision:before.workspace.revision,surfaceId,updates:[{path,value:JSON.parse(value)}],mutationId:randomUUID()})})).json();
 assert.ok(!stale.ok);assert.equal(load(`${H}/workspace/latest.json`).workspace.revision,after.workspace.revision);proof.staleRefused=true;
 browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:2400,height:1200},colorScheme:'dark'});p.on('pageerror',e=>proof.pageErrors.push(e.message));
 await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.locator('.exo-stage section[data-surface]').waitFor();await p.waitForTimeout(800);
 await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:'evidence/presentation/shared-state-loaded.png'});assert.equal(proof.pageErrors.length,0);
 Object.assign(proof,{passed:true,revision:[before.workspace.revision,after.workspace.revision],surfaceId,path,noConversationMessage:true});
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{await browser?.close();writeFileSync('evidence/presentation/shared-state-verify.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

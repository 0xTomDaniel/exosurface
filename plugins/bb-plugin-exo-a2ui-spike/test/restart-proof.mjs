// Explicitly restart ONLY the idle cloned owner. Delete ONLY derived view cache.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';import {execFile} from 'node:child_process';import {promisify} from 'node:util';
import { chromium } from './playwright.mjs';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label)=>{const end=Date.now()+60000;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error(label);};
const cli=async(...args)=>exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30000});
const proof={passed:false,pageErrors:[]};let browser;
try{
 const before=load(`${H}/owner/state.json`),main=load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`),cache=readFileSync(`${H}/workspace/latest.json`);assert.ok(before.ready&&!before.streaming);
 await cli('thread','stop',before.threadId,'--json');
 const label=`gui/${process.getuid()}/local.exocortex.a2ui-owner`;await exec('/bin/launchctl',['bootout',label]);
 await until(async()=>{try{process.kill(before.piPid,0);return false;}catch{return true;}},'clone Pi exited');
 await until(async()=>{try{await exec('/bin/launchctl',['print',label]);return false;}catch{return true;}},'clone supervisor unregistered');
 writeFileSync('evidence/view-cache-before-rebuild.json',cache,{mode:0o600});unlinkSync(`${H}/workspace/latest.json`);
 await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,`${process.env.HOME}/Library/LaunchAgents/local.exocortex.a2ui-owner.plist`]);
 await cli('thread','tell',before.threadId,'/exo-info','--json');
 const after=await until(()=>{const o=load(`${H}/owner/state.json`);return o.ready&&o.piPid!==before.piPid&&o;},'clone owner reloaded native session');
 assert.equal(after.sessionFile,before.sessionFile);assert.deepEqual(load(`${H}/workspace/latest.json`),JSON.parse(cache));
 assert.equal(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).piPid,main.piPid);assert.ok(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).ready);
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1512,height:1000}});page.on('pageerror',e=>proof.pageErrors.push(e.message));await page.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');
 const restored=load(`${H}/workspace/latest.json`).workspace,ids=restored.messages.filter(m=>m.createSurface).map(m=>m.createSurface.surfaceId);
 await until(async()=>(await page.getByLabel('Workspace revision').innerText())===`Revision ${restored.revision}`,'native-rebuilt generative UI revision');
 for(const id of ids)await page.getByLabel(`Module ${id}`).waitFor();
 assert.equal(proof.pageErrors.length,0);proof.passed=true;proof.oldClonePiPid=before.piPid;proof.newClonePiPid=after.piPid;proof.mainPiPidUnchanged=main.piPid;proof.revision=load(`${H}/workspace/latest.json`).workspace.revision;proof.check='Derived cache removed; exact UI restored from native active-branch publication after explicit idle clone-owner restart, same cloned session; main owner untouched; zero model calls';
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{await browser?.close();writeFileSync('evidence/restart-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));}

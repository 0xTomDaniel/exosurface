// Explicit, owner-approved idle clone upgrade + public plugin reload for the
// presentation spike. Backend and BB plugin server must change TOGETHER (the
// new layout fields are rejected by the old server). No paid calls, locks, main
// service, queue clearing or history changes. Reload discards unsent tab drafts.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,statSync}from'node:fs';const startedAt=Date.now();import{execFile}from'node:child_process';import{promisify}from'node:util';
import { chromium } from './playwright.mjs';
import{replayLive}from'./stage-fixtures.ts';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error(label);};
const cli=async(...args)=>exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30000});
const outFile=process.argv.find(a=>a.startsWith('--out='))?.slice(6)??'evidence/presentation/upgrade.json',proof={passed:false};let browser;
try{
 const before=load(`${H}/owner/state.json`),main=load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`),projection=load(`${H}/workspace/latest.json`);
 assert.ok(before.ready&&!before.streaming&&!before.composing&&!projection.observer?.running&&!projection.composition?.running,'Idle clone required');
 const expected=replayLive(before.sessionFile);assert.equal(expected.revision,projection.workspace.revision);assert.deepEqual(expected.messages,projection.workspace.messages);
 const journal=()=>readFileSync(before.sessionFile),prefix=journal(),assistants=()=>journal().toString().trim().split('\n').map(l=>JSON.parse(l)).filter(e=>e.message?.role==='assistant').length,beforeCount=assistants();
 const label=`gui/${process.getuid()}/local.exocortex.a2ui-owner`;
 await cli('thread','stop',before.threadId,'--json');await exec('/bin/launchctl',['bootout',label]);
 await until(()=>{try{process.kill(before.piPid,0);return false;}catch{return true;}},'clone Pi exited');
 await until(async()=>{try{await exec('/bin/launchctl',['print',label]);return false;}catch{return true;}},'clone label unregistered');
 await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,`${process.env.HOME}/Library/LaunchAgents/local.exocortex.a2ui-owner.plist`]);
 if(!process.argv.includes('--no-reload'))await cli('plugin','reload','exo-a2ui-spike');
 await cli('thread','tell',before.threadId,'/exo-info','--json');
 await until(()=>{const o=load(`${H}/owner/state.json`),w=load(`${H}/workspace/latest.json`);return o.ready&&o.piPid!==before.piPid&&w.workspace?.layout?.focus;},'upgraded clone materialized stage');
 const info=()=>load(`${H}/runtime-info/${before.threadId}.json`);await until(()=>info().sessionFile===before.sessionFile&&statSync(`${H}/runtime-info/${before.threadId}.json`).mtimeMs>startedAt,'fresh runtime info');proof.runtimeTools=info().tools;proof.exosurfaceSkill=info().skills.some(s=>s.name==='skill:exosurface');
 const after=load(`${H}/owner/state.json`),restored=load(`${H}/workspace/latest.json`);
 assert.equal(after.sessionFile,before.sessionFile);assert.deepEqual(restored.workspace,expected);assert.deepEqual(restored.presentation?.activeTools?.slice(0,2),['update_exosurface','read_exosurface']);assert.ok(restored.presentation.activeTools.includes('zoom'),'OptChat zoom available');
 assert.ok(journal().subarray(0,prefix.length).equals(prefix),'native prefix unchanged');assert.equal(assistants(),beforeCount);
 assert.equal(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).piPid,main.piPid);
 browser=await chromium.launch({headless:true});const p=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.locator('.exo-stage section[data-surface]').waitFor({timeout:20000});
 const stage=await p.locator('.exo-stage section[data-surface]').getAttribute('data-surface');assert.equal(stage,expected.layout.focus);
 await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:outFile.replace(/\.json$/,'.png')});assert.equal(errors.length,0,errors.join('\n'));
 Object.assign(proof,{passed:true,oldPiPid:before.piPid,newPiPid:after.piPid,mainPiPidUnchanged:main.piPid,sameNativeSession:true,nativePrefixBytes:prefix.length,assistantCount:beforeCount,revision:restored.workspace.revision,stage,derivedLayout:restored.workspace.layout});
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{await browser?.close();writeFileSync(outFile,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

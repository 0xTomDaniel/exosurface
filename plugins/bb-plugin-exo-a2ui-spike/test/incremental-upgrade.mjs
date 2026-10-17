// Explicit idle CLONE upgrade. No main service, locks or history deletion.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync,unlinkSync}from'node:fs';import{execFile}from'node:child_process';import{promisify}from'node:util';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label)=>{const end=Date.now()+60000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error(label);};
const cli=async(...args)=>exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30000});
const cacheFree=process.argv.includes('--cache-free'),proof={passed:false,cacheFree};
try{
 const before=load(`${H}/owner/state.json`),main=load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`),workspace=load(`${H}/workspace/latest.json`).workspace;assert.ok(before.ready&&!before.streaming);assert.notEqual(before.piPid,main.piPid);
 const assistantCount=()=>readFileSync(before.sessionFile,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.message?.role==='assistant').length,beforeCount=assistantCount();
 const label=`gui/${process.getuid()}/local.exocortex.a2ui-owner`;assert.ok(label.endsWith('/local.exocortex.a2ui-owner'));
 await cli('thread','stop',before.threadId,'--json');await exec('/bin/launchctl',['bootout',label]);
 await until(()=>{try{process.kill(before.piPid,0);return false;}catch{return true;}},'clone Pi exited');
 await until(async()=>{try{await exec('/bin/launchctl',['print',label]);return false;}catch{return true;}},'clone label unregistered');
 if(cacheFree){writeFileSync('evidence/incremental/cache-before-native-recovery.json',readFileSync(`${H}/workspace/latest.json`),{mode:0o600});unlinkSync(`${H}/workspace/latest.json`);}
 await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,`${process.env.HOME}/Library/LaunchAgents/local.exocortex.a2ui-owner.plist`]);
 await cli('thread','tell',before.threadId,'/exo-info','--json');await until(()=>{const o=load(`${H}/owner/state.json`);return o.ready&&o.piPid!==before.piPid&&existsSync(`${H}/workspace/latest.json`);},'upgraded clone ready');
 const after=load(`${H}/owner/state.json`);assert.equal(after.sessionFile,before.sessionFile);assert.deepEqual(load(`${H}/workspace/latest.json`).workspace,workspace);assert.equal(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).piPid,main.piPid);
 proof.oldPiPid=before.piPid;proof.newPiPid=after.piPid;proof.mainPiPidUnchanged=main.piPid;proof.sameNativeSession=true;proof.exactCommittedStateRestored=true;proof.assistantCountBefore=beforeCount;proof.assistantCountAfter=assistantCount();assert.equal(proof.assistantCountAfter,beforeCount);proof.newEpoch=load(`${H}/workspace/latest.json`).epoch;proof.nativeRevision=workspace.revision;proof.passed=true;
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{writeFileSync(cacheFree?'evidence/incremental/native-recovery.json':'evidence/incremental/upgrade.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

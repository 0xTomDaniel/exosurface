// Explicit idle clone upgrade/recovery. No paid calls, locks, main service, or history deletion.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync,unlinkSync}from'node:fs';import{execFile}from'node:child_process';import{promisify}from'node:util';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label)=>{const end=Date.now()+60000;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,200));}throw Error(label);};
const cli=async(...args)=>exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30000});
const cacheFree=process.argv.includes('--cache-free'),proof={passed:false,cacheFree};
try{
 const before=load(`${H}/owner/state.json`),main=load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`),projection=load(`${H}/workspace/latest.json`);assert.ok(before.ready&&!before.streaming&&!before.composing&&!projection.composition?.running);assert.notEqual(before.piPid,main.piPid);
 const assistantCount=()=>readFileSync(before.sessionFile,'utf8').trim().split('\n').map(JSON.parse).filter(e=>e.message?.role==='assistant').length,beforeCount=assistantCount();
 const label=`gui/${process.getuid()}/local.exocortex.a2ui-owner`;assert.ok(label.endsWith('/local.exocortex.a2ui-owner'));
 await cli('thread','stop',before.threadId,'--json');assert.ok(!load(`${H}/owner/state.json`).streaming);await exec('/bin/launchctl',['bootout',label]);
 await until(()=>{try{process.kill(before.piPid,0);return false;}catch{return true;}},'clone Pi exited');await until(async()=>{try{await exec('/bin/launchctl',['print',label]);return false;}catch{return true;}},'clone label unregistered');
 if(cacheFree){writeFileSync('evidence/jev/cache-before-native-recovery.json',JSON.stringify(projection),{mode:0o600});unlinkSync(`${H}/workspace/latest.json`);}
 await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,`${process.env.HOME}/Library/LaunchAgents/local.exocortex.a2ui-owner.plist`]);
 await cli('thread','tell',before.threadId,'/exo-info','--json');await until(()=>{const o=load(`${H}/owner/state.json`);return o.ready&&o.piPid!==before.piPid&&existsSync(`${H}/workspace/latest.json`);},'upgraded clone ready');
 const after=load(`${H}/owner/state.json`),restored=load(`${H}/workspace/latest.json`);assert.equal(after.sessionFile,before.sessionFile);assert.deepEqual(restored.workspace,projection.workspace);assert.equal(restored.composition.configured,projection.composition?.configured??false);assert.equal(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).piPid,main.piPid);
 Object.assign(proof,{oldPiPid:before.piPid,newPiPid:after.piPid,mainPiPidUnchanged:main.piPid,sameNativeSession:true,exactCommittedStateRestored:true,assistantCountBefore:beforeCount,assistantCountAfter:assistantCount(),newEpoch:restored.epoch,nativeRevision:restored.workspace.revision});assert.equal(proof.assistantCountAfter,beforeCount);proof.passed=true;
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{writeFileSync(cacheFree?'evidence/jev/native-recovery.json':'evidence/jev/upgrade.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

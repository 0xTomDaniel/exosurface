// Tom-requested (2026-10-15) physical pruning of retired per-turn instruction copies
// (custom_message exosurface-guide / observer-guide) from the CLONE journal only.
// Clone stopped first; verified private backup; children re-parented; every other
// line byte-identical except a re-pointed parentId; projection cursor remapped.
// No model calls; main Exo untouched.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,openSync,fsyncSync,closeSync,renameSync,mkdirSync,chmodSync,statSync}from'node:fs';
import{createHash}from'node:crypto';import{execFile}from'node:child_process';import{promisify}from'node:util';
import{latestSnapshot}from'../src/workspace.ts';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const RETIRED=['exosurface-guide','observer-guide'];
const until=async(fn,label,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){try{if(await fn())return;}catch{}await new Promise(r=>setTimeout(r,250));}throw Error(label);};
const cli=async(...a)=>exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...a],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30000});
const branchOf=lines=>{const es=lines.slice(1).map(l=>JSON.parse(l)),by=new Map(es.map(e=>[e.id,e])),out=[];let e=es.at(-1);while(e){out.unshift(e);e=by.get(e.parentId);}return out;};
const proof={passed:false};
try{
 const before=load(`${H}/owner/state.json`),main=load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`),projection=load(`${H}/workspace/latest.json`);
 assert.ok(before.ready&&!before.streaming&&!before.composing,'Idle clone required');
 const file=before.sessionFile,label=`gui/${process.getuid()}/local.exocortex.a2ui-owner`;
 await cli('thread','stop',before.threadId,'--json');await exec('/bin/launchctl',['bootout',label]);
 await until(()=>{try{process.kill(before.piPid,0);return false;}catch{return true;}},'clone Pi exited');
 await until(async()=>{try{await exec('/bin/launchctl',['print',label]);return false;}catch{return true;}},'clone owner stopped');
 const raw=readFileSync(file),text=raw.toString('utf8');assert.ok(text.endsWith('\n'));
 const backupDir=`${H}/backups`;mkdirSync(backupDir,{recursive:true,mode:0o700});
 const backup=`${backupDir}/clone-session-before-guide-prune-${new Date().toISOString().replace(/[:.]/g,'-')}.jsonl`;writeFileSync(backup,raw,{mode:0o600,flag:'wx'});assert.equal(sha(readFileSync(backup)),sha(raw));
 const lines=text.slice(0,-1).split('\n'),entries=lines.map(l=>JSON.parse(l));
 const removed=new Map(entries.filter(e=>e.type==='custom_message'&&RETIRED.includes(e.customType)).map(e=>[e.id,e.parentId]));
 for(const e of entries)for(const k of['targetId','firstKeptEntryId','fromId'])assert.ok(!removed.has(e[k]),`entry ${e.id} references a retired copy via ${k}`);
 const resolve=id=>{while(id&&removed.has(id))id=removed.get(id);return id;};
 const out=[],cursorMap=new Map();let oldAt=0,newAt=0,reparented=0;
 for(let i=0;i<lines.length;i++){
  const line=lines[i],e=entries[i],len=Buffer.byteLength(line)+1;cursorMap.set(oldAt,newAt);
  if(removed.has(e.id)){oldAt+=len;continue;}
  let next=line;
  if(e.parentId&&removed.has(e.parentId)){const target=resolve(e.parentId),needle=`"parentId":"${e.parentId}"`;assert.equal(line.split(needle).length,2,`unique parentId field in ${e.id}`);next=line.replace(needle,target===null?'"parentId":null':`"parentId":"${target}"`);assert.deepEqual(JSON.parse(next),{...e,parentId:target});reparented++;}
  out.push(next);oldAt+=len;newAt+=Buffer.byteLength(next)+1;
 }
 cursorMap.set(oldAt,newAt);
 const result=out.join('\n')+'\n',newLines=out;
 // Validation before replacing the live file.
 const ids=new Set(newLines.slice(1).map(l=>JSON.parse(l).id));
 for(const l of newLines.slice(1)){const e=JSON.parse(l);assert.ok(e.parentId===null||ids.has(e.parentId),`dangling parent ${e.id}`);assert.ok(!(e.type==='custom_message'&&RETIRED.includes(e.customType)));}
 const oldBranch=branchOf(lines).filter(e=>!removed.has(e.id)).map(e=>e.id),newBranch=branchOf(newLines).map(e=>e.id);assert.deepEqual(newBranch,oldBranch,'active branch identical minus retired copies');
 const assistants=ls=>ls.filter(l=>JSON.parse(l).message?.role==='assistant').length;assert.equal(assistants(newLines),assistants(lines));
 assert.deepEqual(latestSnapshot(branchOf(newLines)),latestSnapshot(branchOf(lines)));
 const cursorFile=`${H}/owner/projection.json`,cursor=load(cursorFile);assert.equal(cursor.sessionFile,file);assert.ok(cursorMap.has(cursor.offset),'projection cursor on a record boundary');
 const tmp=`${file}.prune-tmp`;writeFileSync(tmp,result,{mode:statSync(file).mode&0o777,flag:'wx'});const fd=openSync(tmp,'r');fsyncSync(fd);closeSync(fd);
 assert.equal(statSync(file).size,raw.length,'journal unchanged while stopped');renameSync(tmp,file);
 writeFileSync(`${cursorFile}.tmp`,JSON.stringify({...cursor,offset:cursorMap.get(cursor.offset)}));renameSync(`${cursorFile}.tmp`,cursorFile);
 Object.assign(proof,{backup,backupSha256:sha(raw),bytesBefore:raw.length,bytesAfter:Buffer.byteLength(result),removed:{total:removed.size,exosurfaceGuide:entries.filter(e=>removed.has(e.id)&&e.customType==='exosurface-guide').length,observerGuide:entries.filter(e=>removed.has(e.id)&&e.customType==='observer-guide').length},reparented,linesBefore:lines.length,linesAfter:newLines.length,assistantRecords:assistants(newLines),cursor:{before:cursor.offset,after:cursorMap.get(cursor.offset)},sha256After:sha(Buffer.from(result))});
 chmodSync(backup,0o600);
 await exec('/bin/launchctl',['bootstrap',`gui/${process.getuid()}`,`${process.env.HOME}/Library/LaunchAgents/local.exocortex.a2ui-owner.plist`]);
 await cli('thread','tell',before.threadId,'/exo-info','--json');
 await until(()=>{const o=load(`${H}/owner/state.json`);return o.ready&&o.piPid!==before.piPid;},'clone ready after prune');
 await until(()=>load(`${H}/workspace/latest.json`).workspace?.revision===projection.workspace.revision,'workspace restored');
 const after=load(`${H}/owner/state.json`),restored=load(`${H}/workspace/latest.json`),info=load(`${H}/runtime-info/${before.threadId}.json`);
 assert.equal(after.sessionFile,file);assert.deepEqual(restored.workspace,projection.workspace);assert.deepEqual(info.tools,['apply_workspace','read_workspace']);
 assert.equal(load(`${process.env.HOME}/.exo-bb-spike/owner/state.json`).piPid,main.piPid);
 const now=readFileSync(file,'utf8');assert.ok(now.startsWith(result),'pruned journal prefix intact after restart');assert.ok(!now.split('\n').filter(Boolean).some(l=>{const e=JSON.parse(l);return e.type==='custom_message'&&RETIRED.includes(e.customType);}));
 Object.assign(proof,{passed:true,oldPiPid:before.piPid,newPiPid:after.piPid,mainPiPidUnchanged:main.piPid,revision:restored.workspace.revision,runtimeTools:info.tools});
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{writeFileSync('evidence/presentation/prune-guides.json',JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

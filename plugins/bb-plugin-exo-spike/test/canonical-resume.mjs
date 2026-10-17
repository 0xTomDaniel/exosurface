import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync } from 'node:fs';
import { createConnection } from 'node:net';
import { chromium } from './playwright.mjs';
const exec=promisify(execFile), H=`${process.env.HOME}/.exo-bb-spike`;
const before=JSON.parse(readFileSync('evidence/canonical-handoff.json','utf8'));
const BB='/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb';
const cli=async(...args)=>JSON.parse((await exec(process.execPath,[BB,...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30_000})).stdout);
const browser=await chromium.launch({headless:true});const result={passed:false,threadId:before.threadId};
try {
 const page=await browser.newPage();await page.goto(before.url);
 const old=readFileSync(`${H}/audit/${before.threadId}.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 await page.getByRole('button',{name:'Runtime info',exact:true}).click();
 const end=Date.now()+30_000;let info;
 while(Date.now()<end){
  info=JSON.parse(readFileSync(`${H}/runtime-info/${before.threadId}.json`,'utf8'));
  const a=readFileSync(`${H}/audit/${before.threadId}.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l));
  if(a.slice(old.length).some(e=>e.event==='owner-started')&&a.slice(old.length).some(e=>e.event==='prompt-response'&&e.disposition==='handled'))break;
  await new Promise(r=>setTimeout(r,200));
 }
 const audit=readFileSync(`${H}/audit/${before.threadId}.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l));
 assert.ok(audit.slice(old.length).some(e=>e.event==='owner-started'));
 assert.equal(audit.slice(old.length).filter(e=>e.event==='agent_start').length,0,'Diagnostic resume makes no model call');
 assert.equal(info.sessionId,before.runtime.sessionId);assert.equal(info.profile,'exo-optchat');assert.equal(info.sessionFile,before.binding.sessionFile);
 result.owner=await new Promise((resolve,reject)=>{let text='';const s=createConnection(`${process.env.HOME}/.optchat-exocortex-test/profiles/exo-optchat/lock.sock`);s.setEncoding('utf8');s.setTimeout(2000,()=>{s.destroy();reject(new Error('Owner timeout'));});s.on('data',x=>text+=x);s.on('end',()=>resolve(text));s.on('error',reject);});
 assert.match(result.owner,/^exo-optchat · PID \d+ ·/);
 result.bbStatus=(await cli('thread','get',before.threadId,'--json')).thread.status;assert.equal(result.bbStatus,'idle');
 result.sessionId=info.sessionId;result.checks=['Actual stop/release → resume via rendered native command', 'Same canonical profile/session/file', 'Current native socket owner verified, no model call', 'Owner left running, conversation idle'];result.passed=true;
} finally{await browser.close();writeFileSync('evidence/canonical-resume.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}

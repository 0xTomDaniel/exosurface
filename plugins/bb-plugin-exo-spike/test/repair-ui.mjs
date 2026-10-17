import assert from 'node:assert/strict';
import { readFileSync,writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { chromium } from './playwright.mjs';
const exec=promisify(execFile),H=`${process.env.HOME}/.exo-bb-spike`,id='thr_k8wgg5mbnu';
const cli=async(...args)=>JSON.parse((await exec(process.execPath,['/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb',...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:30_000})).stdout);
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label)=>{const end=Date.now()+60_000;while(Date.now()<end){try{const v=await fn();if(v)return v;}catch{}await new Promise(r=>setTimeout(r,200));}throw Error(label);};
const r={passed:false,threadId:id,checks:[],pageErrors:[]};let browser;
try {
 let start=performance.now();await cli('thread','get',id,'--json');r.nativeThreadGetMs=performance.now()-start;
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('pageerror',e=>r.pageErrors.push(e.message));
 start=performance.now();await page.goto(`http://127.0.0.1:38886/plugins/exo-spike/proof/${id}`);
 await page.getByRole('button',{name:'Runtime info',exact:true}).click();
 const owner=await until(()=>load(`${H}/owner/state.json`).ready&&load(`${H}/owner/state.json`),'external owner startup');
 await until(async()=>(await cli('thread','get',id,'--json')).thread.status==='idle','handled command idle');
 r.pageReadyMs=performance.now()-start;r.owner={ownerPid:owner.ownerPid,piPid:owner.piPid,sessionFile:owner.sessionFile};
 const parent=+(await exec('ps',['-p',String(owner.ownerPid),'-o','ppid='])).stdout.trim();assert.equal(parent,1,'Owner must not be a descendant supervised by BB');r.ownerParentPid=parent;
 r.checks.push('Same primary BB thread, normal command feedback, detached owner parent PID1');
 await cli('thread','stop',id,'--json');await new Promise(x=>setTimeout(x,500));
 const detached=load(`${H}/owner/state.json`);assert.equal(detached.piPid,owner.piPid);assert.equal(detached.ready,true);r.checks.push('Actual BB stop/release does not terminate native Pi');
 await page.getByRole('button',{name:'Runtime info',exact:true}).click();
 await until(()=>load(`${H}/owner/state.json`).clients===1,'view reattach');
 assert.equal(load(`${H}/owner/state.json`).piPid,owner.piPid);
 assert.equal(load(`${H}/runtime-info/${id}.json`).sessionId,'01a12ccd-a7bc-75c9-98bc-0518a8b0c6fd');
 await page.waitForTimeout(8000);r.checks.push('Same Pi/session after view reconnect; sustained single-flight UI polling');
 assert.equal(r.pageErrors.length,0);await page.screenshot({path:'evidence/repair-desktop.png'});r.passed=true;
}finally{await browser?.close();writeFileSync('evidence/repair-ui.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify(r,null,2));}

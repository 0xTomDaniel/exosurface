// Staged (no model call): exercises the surface-history server calls and the composer banner in the real BB
// page. Sets and then clears a pending bring-back; commits nothing.
import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {chromium} from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,thread=JSON.parse(readFileSync(`${H}/canonical-thread.json`,'utf8')).threadId;
const versions=readFileSync(`${H}/workspace/history.jsonl`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
const old=versions.find(v=>v.action==='drew'&&versions.some(x=>x.surface===v.surface&&x.revision>v.revision&&x.action!=='retired'));assert.ok(old,'a surface with a later version');
const before=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision;
const b=await chromium.launch();const out={staged:true};
try{
 const p=await b.newPage({viewport:{width:1500,height:1000}});await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.waitForTimeout(2500);
 const rpc=(m,input)=>p.evaluate(async([m,input])=>{const r=await fetch(`/api/v1/plugins/exo-a2ui-spike/rpc/${m}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(input)});return {status:r.status,body:await r.json()};},[m,input]);
 const at=await rpc('surfaceAt',{threadId:thread,surface:old.surface,revision:old.revision});out.surfaceAt={status:at.status,title:at.body.result?.title,current:at.body.result?.current,revision:at.body.result?.revision};
 assert.equal(at.status,200);assert.equal(at.body.result.current,false);assert.equal(at.body.result.title,old.title);
 const set=await rpc('pending',{threadId:thread,op:'set',version:{surface:old.surface,revision:old.revision},updates:[]});assert.equal(set.body.result.surface,old.surface);
 await p.waitForTimeout(1200);out.bannerVisible=await p.getByText(/Bringing back/).count();
 await p.screenshot({path:'evidence/streaming/bring-back-banner.png'});
 const clear=await rpc('pending',{threadId:thread,op:'clear'});await p.waitForTimeout(800);out.bannerAfterClear=await p.getByText(/Bringing back/).count();assert.equal(clear.body.result,null);
}finally{await b.close();}
out.pendingFileGone=!existsSync(`${H}/workspace/pending-restore.json`);out.revisionUnchanged=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision===before;
console.log(JSON.stringify(out));assert.ok(out.pendingFileGone&&out.revisionUnchanged);

// Staged (no model call): two earlier versions in a row leave ONE pill; the ✕ in the input cancels it. Commits nothing.
import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {chromium} from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,thread=JSON.parse(readFileSync(`${H}/canonical-thread.json`,'utf8')).threadId;
const vs=readFileSync(`${H}/workspace/history.jsonl`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(v=>v.action==='drew');
const [a,b]=[vs[2],vs.find(v=>v.surface!==vs[2].surface&&v.revision>vs[2].revision)];const before=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision;
const br=await chromium.launch(),out={staged:true};
try{
 const p=await br.newPage({viewport:{width:1500,height:1000}});await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.waitForTimeout(2500);
 const rpc=(m,i)=>p.evaluate(async([m,i])=>(await fetch(`/api/v1/plugins/exo-a2ui-spike/rpc/${m}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(i)})).json(),[m,i]);
 const pills=()=>p.locator('[contenteditable="true"]').evaluate(el=>(el.textContent.match(/↺/g)??[]).length);
 await rpc('pending',{threadId:thread,op:'set',version:{surface:a.surface,revision:a.revision}});await p.waitForTimeout(1200);out.afterFirst=await pills();
 await rpc('pending',{threadId:thread,op:'set',version:{surface:b.surface,revision:b.revision}});await p.waitForTimeout(1500);out.afterSecond=await pills();
 out.secondTitleShown=await p.locator('[contenteditable="true"]').evaluate((el,t)=>el.textContent.includes(t.slice(0,15)),b.title);
 const x=p.getByRole('button',{name:/Stop bringing back/});out.cancelButton=await x.count();await p.screenshot({path:'evidence/streaming/pill-two-clicks.png'});
 if(out.cancelButton){await x.first().click();await p.waitForTimeout(1200);}out.pillsAfterCancel=await pills();out.cancelButtonAfter=await x.count();
}finally{await br.close();}
out.pendingGone=!existsSync(`${H}/workspace/pending-restore.json`);out.revisionUnchanged=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision===before;
console.log(JSON.stringify(out));

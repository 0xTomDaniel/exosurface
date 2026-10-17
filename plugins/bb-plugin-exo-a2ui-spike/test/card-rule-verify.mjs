// Staged (no model call): the latest card of the stage surface just loads it (no pill); the latest card of a surface
// that is NOT on stage opens it with a pill. Cancels afterwards; commits nothing.
import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import {chromium} from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,ws=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace,before=ws.revision;
const b=await chromium.launch(),p=await b.newPage({viewport:{width:1500,height:1000}}),out={staged:true,stage:ws.layout?.focus};
const pills=()=>p.locator('[contenteditable="true"]').evaluate(el=>(el.textContent.match(/↺/g)??[]).length);
const click=async name=>{const c=p.getByRole('button',{name:/^Show .* on the canvas$/}).filter({hasText:name});const n=await c.count();await c.nth(n-1).scrollIntoViewIfNeeded();await c.nth(n-1).click();await p.waitForTimeout(1800);return n;};
try{
 await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.waitForTimeout(3000);
 out.stageCards=await click('Diffusion');out.stage={pill:await pills(),rewind:await p.getByText(/Earlier version|Not on stage/).count()};
 out.besideCards=await click('Telling chaos');out.beside={pill:await pills(),label:await p.getByText('Not on stage').count()};
 await p.screenshot({path:'evidence/streaming/card-rule.png'});
 const x=p.getByRole('button',{name:/Stop bringing back/});if(await x.count()){await x.first().click();await p.waitForTimeout(1200);}out.afterCancel=await pills();
}finally{await b.close();}
out.pendingGone=!existsSync(`${H}/workspace/pending-restore.json`);out.revisionUnchanged=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision===before;
console.log(JSON.stringify(out));assert.equal(out.stage.pill,0);assert.equal(out.beside.pill,1);assert.equal(out.afterCancel,0);assert.ok(out.pendingGone&&out.revisionUnchanged);

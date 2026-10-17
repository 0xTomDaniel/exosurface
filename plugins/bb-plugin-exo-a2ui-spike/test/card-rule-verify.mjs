// Staged (no model call): the latest card of the stage surface just loads it (no pill); the latest card of a surface
// that is NOT on stage opens it with a pill. Cancels afterwards; commits nothing.
import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import {chromium} from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,ws=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace,before=ws.revision;
const vs=readFileSync(`${H}/workspace/history.jsonl`,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)),ids=ws.messages.flatMap(m=>m.createSurface?[m.createSurface.surfaceId]:[]),stageId=ws.layout?.focus??ids.at(-1);
const titleOf=id=>vs.filter(v=>v.surface===id).at(-1).title.slice(0,18),stageTitle=titleOf(stageId),otherId=[...vs].reverse().find(v=>v.surface!==stageId&&ids.includes(v.surface)&&v.action!=='retired').surface,otherTitle=titleOf(otherId);
const b=await chromium.launch(),p=await b.newPage({viewport:{width:1500,height:1000}}),out={staged:true,stage:stageId,other:otherId};
const pills=()=>p.locator('[contenteditable="true"]').evaluate(el=>(el.textContent.match(/↺/g)??[]).length);
const click=async name=>{const c=p.getByRole('button',{name:/^Show .* on the canvas$/}).filter({hasText:name});const n=await c.count();await c.nth(n-1).scrollIntoViewIfNeeded();await c.nth(n-1).click();await p.waitForTimeout(1800);return n;};
try{
 await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.waitForTimeout(3000);
 // Bring one surface back with an edit pending, switch to another, then go back to the current stage: no pill left.
 out.besideFirst=await click(otherTitle);out.firstPill=await pills();
 const input=p.locator('.exo-canvas input[type="text"], .exo-canvas textarea').first();if(await input.count()){await input.fill('staged edit');await p.waitForTimeout(1200);}
 out.stageCards=await click(stageTitle);out.afterStageClick=await pills();out.pendingAfterStage=existsSync(`${H}/workspace/pending-restore.json`);
out.stage={pill:await pills(),rewind:await p.getByText(/Earlier version|Not on stage/).count()};
 out.besideCards=await click(otherTitle);out.beside={pill:await pills(),label:await p.getByText('Not on stage').count()};
 await p.screenshot({path:'evidence/streaming/card-rule.png'});
 const x=p.getByRole('button',{name:/Stop bringing back/});if(await x.count()){await x.first().click();await p.waitForTimeout(1200);}out.afterCancel=await pills();
}finally{await b.close();}
out.pendingGone=!existsSync(`${H}/workspace/pending-restore.json`);out.revisionUnchanged=JSON.parse(readFileSync(`${H}/workspace/latest.json`,'utf8')).workspace.revision===before;
console.log(JSON.stringify(out));assert.equal(out.firstPill,1);assert.equal(out.afterStageClick,0);assert.equal(out.pendingAfterStage,false);assert.equal(out.stage.pill,0);assert.equal(out.beside.pill,1);assert.equal(out.afterCancel,0);assert.ok(out.pendingGone&&out.revisionUnchanged);

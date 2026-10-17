// One bounded real-model composition call: no UI JSON/template supplied in prompt.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import { chromium } from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8'));
const until=async(fn,label)=>{const end=Date.now()+180000;while(Date.now()<end){const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,300));}throw Error(label);};
const before=load(`${H}/workspace/latest.json`).workspace,agenda=JSON.stringify(before.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel).surfaceId==='agenda'));
const proof={passed:false,checks:[],pageErrors:[],baseRevision:before.revision};let browser;
try{
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1512,height:1000}});page.on('pageerror',e=>proof.pageErrors.push(e.message));await page.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');
 const e=page.getByLabel('Clone conversation').locator('[contenteditable="true"]');await e.waitFor();await e.fill('Owner-authorized synthetic UI experiment on the clone, not real planning. Evolve ONLY the decision module: make it a choice between Fast prototype and Robust baseline. Give it a title, a short explanation of the tradeoff, a data-bound current-selection text, and two actionable buttons named Choose Fast prototype and Choose Robust baseline. Bind both buttons to choose_option with the respective literal value. Preserve the entire agenda module EXACTLY. Use your current workspace frame and the allowed A2UI basic catalog to compose this yourself; no JSON template is supplied. Publish one next revision and reply in one short line. No other tools/domain actions.');await e.press('Enter');
 const next=await until(()=>{const s=load(`${H}/workspace/latest.json`).workspace;return s.revision===before.revision+1&&s;},'agent-composed update');
 assert.equal(JSON.stringify(next.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel).surfaceId==='agenda')),agenda);
 await until(async()=>await page.getByLabel('Module decision').getByRole('button',{name:'Choose Fast prototype',exact:true}).isVisible(),'first generated action');assert.ok(await page.getByLabel('Module decision').getByRole('button',{name:'Choose Robust baseline',exact:true}).isVisible());
 await until(()=>!load(`${H}/owner/state.json`).streaming,'settle');assert.equal(proof.pageErrors.length,0);proof.revision=next.revision;proof.checks.push('Actual Exo composed new title/copy/bound state/two actions from natural-language request without supplied JSON; agenda snapshot unchanged');proof.passed=true;
 await page.screenshot({path:'evidence/a2ui-desktop.png'});await page.setViewportSize({width:390,height:844});await page.screenshot({path:'evidence/a2ui-mobile-layout.png'});
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{await browser?.close();writeFileSync('evidence/compose-proof.json',JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof,null,2));}

// Staged (no model call): drive the loaded BB canvas through the same preview file the live
// parser writes, growing one updateComponents message component by component, then clear it.
// Never commits; history untouched. Proves the renderer shows each component as it arrives.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync,rmSync,renameSync} from 'node:fs';
import {chromium} from './playwright.mjs';import {StreamFrames} from '../src/stream-frames.ts';
const H=`${process.env.HOME}/.exo-a2ui-spike/workspace`,latest=JSON.parse(readFileSync(`${H}/latest.json`,'utf8')),file=`${H}/preview.json`;
const owner=JSON.parse(readFileSync(`${process.env.HOME}/.exo-a2ui-spike/owner/state.json`,'utf8'));assert.ok(owner.ready&&!owner.streaming,'idle clone required');
const rev=latest.workspace.revision,sid='stream_check',labels=['Alpha','Bravo','Charlie','Delta','Echo'];
const call={baseRevision:rev,messages:[{version:'v0.9.1',createSurface:{surfaceId:sid,catalogId:'urn:exosurface:catalog:exo-visual:v1'}},{version:'v0.9.1',updateComponents:{surfaceId:sid,components:[{id:'root',component:'Column',children:labels.map((_,i)=>`t${i}`)},...labels.map((l,i)=>({id:`t${i}`,component:'Text',text:`Streaming check ${l}`}))]}}]};
const p=new StreamFrames(),frames=[];for(const c of JSON.stringify(call)){const v=p.append(c);if(v)frames.push(v);}
const write=v=>{writeFileSync(file+'.tmp',JSON.stringify({sessionId:latest.sessionId,epoch:latest.epoch,toolCallId:'stream-check',...v}));renameSync(file+'.tmp',file);};
const browser=await chromium.launch();const counts=[];
try{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});page.on('pageerror',e=>console.error('pageerror',String(e).slice(0,200)));page.on('console',m=>{if(m.type()==='error')console.error('console',m.text().slice(0,200));});await page.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await page.waitForTimeout(2500);
 for(const f of frames){write(f);await page.waitForTimeout(400);counts.push(await page.getByText(/^Streaming check /).count());}
 await page.screenshot({path:'evidence/streaming/staged-partial.png'});
}finally{rmSync(file,{force:true});}
const page=(await browser.contexts()[0].pages())[0];await page.waitForTimeout(800);const after=await page.getByText(/^Streaming check /).count();await browser.close();
const out={staged:true,frames:frames.length,visibleTextsPerFrame:counts,afterClear:after};console.log(JSON.stringify(out));
assert.ok(counts.join().includes('1,2,3,4,5'),'one component at a time');assert.equal(after,0);

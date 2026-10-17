// Nine planned live runs (3/mode), never an automatic retry. --resume reuses completed/failed run evidence.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,existsSync}from'node:fs';import { chromium } from './playwright.mjs';
const H=`${process.env.HOME}/.exo-a2ui-spike`,load=p=>JSON.parse(readFileSync(p,'utf8')),latest=()=>load(`${H}/workspace/latest.json`),file='evidence/jev/live-timed.json',resume=process.argv.includes('--resume');
if(existsSync(file)&&!resume)throw Error('Existing paid probe retained; use --resume');
const proof=resume?load(file):{passed:false,runs:[],pageErrors:[],token:`JEV_DRAFT_${Date.now().toString(36)}`};delete proof.error;const offer=load('evidence/jev/recovered-offer.json').offer,agenda=load('evidence/jev/native-before.json').workspace;let browser;
const save=()=>writeFileSync(file,JSON.stringify(proof,null,2));const until=async(fn,label,ms=60000)=>{const end=Date.now()+ms;while(Date.now()<end){if(await fn())return;await new Promise(r=>setTimeout(r,30));}throw Error(label);};
const agendaRows=s=>s.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel).surfaceId!==offer.surfaceId);
const modes=[['jev','haiku','haiku-both'],['haiku-both','jev','haiku'],['haiku','haiku-both','jev']];
try{
 const owner=load(`${H}/owner/state.json`);assert.ok(owner.ready&&!owner.streaming&&!owner.composing);assert.deepEqual(agendaRows(latest().workspace),agenda.messages);
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1700,height:1200}});page.on('pageerror',e=>proof.pageErrors.push(e.message));await page.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await page.getByLabel('Workspace revision').filter({hasText:`Revision ${latest().workspace.revision}`}).waitFor();await page.locator('details').filter({has:page.getByText('Composition spike (synthetic)',{exact:true})}).evaluate(el=>el.open=true);
 const module=()=>page.getByLabel(`Module ${offer.surfaceId}`),field=()=>module().locator('a2ui-basic-textfield').getByRole('textbox');
 const remember=async()=>{await module().scrollIntoViewIfNeeded();await field().fill(proof.token);await page.evaluate(id=>{window.__keptSection=document.querySelector(`[aria-label="Module ${id}"]`);window.__keptInput=window.__keptSection.querySelector('a2ui-basic-textfield');},offer.surfaceId);};
 if(latest().workspace.messages.some(m=>m.createSurface?.surfaceId===offer.surfaceId))await remember();
 for(let round=0;round<3;round++)for(const mode of modes[round]){
  if(proof.runs.some(r=>r.round===round&&r.mode===mode))continue;
  const before=latest().workspace;assert.deepEqual(agendaRows(before),agenda.messages);assert.ok(!load(`${H}/owner/state.json`).streaming);const startBytes=readFileSync(owner.sessionFile).length,oldId=latest().composition.lastRun?.id??null;
  const run={round,mode,startBytes,baseRevision:before.revision,status:'attempting',startedAt:Date.now()};proof.runs.push(run);save();
  await page.getByLabel('Composition engine').selectOption(mode);
  const request='Compare the two fictional movie-night alternatives side by side. Keep all required content and controls. Heading first, shared assumption tester and button last. Synthetic scope only.';
  await page.getByLabel('Synthetic presentation request').fill(request);
  await page.evaluate(id=>{
   window.__compositionFrames=[];window.__compositionGo=true;window.__compositionStart=performance.now();window.__scrolledThisRun=false;let last='';
   const text=node=>node.nodeType===Node.TEXT_NODE?node.textContent:['STYLE','SCRIPT'].includes(node.nodeName)?'':Array.from(node instanceof HTMLSlotElement?(node.assignedNodes({flatten:true}).length?node.assignedNodes({flatten:true}):node.childNodes):node.shadowRoot?.childNodes??node.childNodes??[]).map(text).join(' ');
   const frame=()=>{if(!window.__compositionGo)return;const el=document.querySelector(`[aria-label="Module ${id}"]`),canvas=document.querySelector('[aria-label="Exosurface canvas"]');
    if(el){const t=text(el).replace(/\s+/g,' ').trim(),preview=(canvas?.innerText??'').includes('Provisional streaming preview'),key=preview+' '+t;
     if(preview&&!window.__scrolledThisRun){el.scrollIntoView({block:'center'});window.__scrolledThisRun=true;}
     if(key!==last){last=key;const b=el.getBoundingClientRect(),c=canvas.getBoundingClientRect();window.__compositionFrames.push({ms:Math.round(performance.now()-window.__compositionStart),text:t,preview,visible:b.top>=c.top&&b.bottom<=c.bottom,field:!!el.querySelector('a2ui-basic-textfield'),button:!!el.querySelector('a2ui-basic-button')});}
    }requestAnimationFrame(frame);};requestAnimationFrame(frame);
  },offer.surfaceId);
  await page.getByRole('button',{name:'Compose synthetic surface',exact:true}).click();
  await until(()=>{const c=latest().composition;return c.lastRun?.id!==oldId&&['complete','failed'].includes(c.lastRun?.status);},'native composition completion');
  await until(()=>!load(`${H}/owner/state.json`).composing&&!latest().composition.running,'native command released');
  const state=latest(),summary=state.composition.lastRun,rows=readFileSync(owner.sessionFile).subarray(startBytes).toString('utf8').trim().split('\n').filter(Boolean).map(JSON.parse),record=rows.findLast(e=>e.type==='custom'&&e.customType==='exosurface-composition-run'&&e.data.runId===summary.id)?.data;
  assert.ok(record);run.id=summary.id;run.status=summary.status;run.record=record;run.afterRevision=state.workspace.revision;run.finishedAt=Date.now();assert.equal(rows.filter(e=>e.message?.role==='assistant').length,0);run.noExoModelCall=true;
  // Observe a rendered frame after RPC/React delivery, not just server completion time.
  await page.getByLabel('Workspace revision').filter({hasText:`Revision ${state.workspace.revision}`}).waitFor();await page.waitForTimeout(100);
  run.frames=await page.evaluate(()=>{window.__compositionGo=false;return window.__compositionFrames;});
  const first=run.frames.find(f=>f.preview&&f.visible&&f.field&&f.button&&/indoor/i.test(f.text)&&/outdoor/i.test(f.text));run.firstUsefulPreviewFrameMs=first?.ms??null;
  const copy=record.copy??record.partial?.copy??{},generated=run.frames.find(f=>f.visible&&Object.values(copy).some(v=>v&&f.text.includes(v)&&!run.frames[0]?.text.includes(v)));run.firstChangedCopyFrameMs=generated?.ms??null;
  assert.deepEqual(agendaRows(state.workspace),agenda.messages);assert.ok(!JSON.stringify(state.workspace).includes(proof.token));run.unchangedAgenda=true;
  if(summary.status==='complete'){
   assert.equal(state.workspace.revision,before.revision+1);assert.equal(record.stopReason,'finish');assert.equal(record.calls.length,mode==='haiku-both'?2:3);
   const el=record.spec.elements,fieldNode=Object.entries(el).find(([,e])=>e.type==='TextField')?.[0],buttonNode=Object.entries(el).find(([,e])=>e.type==='Button')?.[0];
   const walk=id=>[id,...(el[id].children??[]).flatMap(walk)],order=walk(record.spec.root),parent=id=>Object.entries(el).find(([,e])=>(e.children??[]).includes(id));
   const inside=Object.entries(el).find(([,e])=>e.props.slot==='indoor')?.[0],outside=Object.entries(el).find(([,e])=>e.props.slot==='outdoor')?.[0],heading=Object.entries(el).find(([,e])=>e.props.slot==='heading')?.[0];
   run.requirements={allRequired:offer.required.every(k=>Object.values(el).some(e=>e.props.key===k)),headingBeforeAlternatives:order.indexOf(heading)<Math.min(order.indexOf(inside),order.indexOf(outside)),fieldBeforeButton:order.indexOf(fieldNode)<order.indexOf(buttonNode),sideBySide:!!parent(inside)&&parent(inside)?.[0]===parent(outside)?.[0]&&parent(inside)?.[1].type==='Row'};
   if(before.messages.some(m=>m.createSurface?.surfaceId===offer.surfaceId)){
    assert.equal(await field().inputValue(),proof.token);run.draftPreserved=true;run.domContinuity=await page.evaluate(id=>({section:window.__keptSection===document.querySelector(`[aria-label="Module ${id}"]`),input:window.__keptInput===document.querySelector(`[aria-label="Module ${id}"]`).querySelector('a2ui-basic-textfield')}),offer.surfaceId);
    await page.evaluate(id=>{window.__keptSection=document.querySelector(`[aria-label="Module ${id}"]`);window.__keptInput=window.__keptSection.querySelector('a2ui-basic-textfield');},offer.surfaceId);
   }else await remember();
  }else{assert.deepEqual(state.workspace,before);run.rollbackPreserved=true;}
  assert.equal(proof.pageErrors.length,0);save();if(await module().count())await module().screenshot({path:`evidence/jev/${round}-${mode}.png`});console.log(JSON.stringify({round,mode,status:run.status,previewMs:run.firstUsefulPreviewFrameMs,changedCopyMs:run.firstChangedCopyFrameMs,completionMs:record.elapsedMs,costUsd:summary.costUsd,requirements:run.requirements,error:record.error}));
 }
 proof.passed=proof.runs.length===9&&proof.runs.every(r=>r.status==='complete'&&r.noExoModelCall&&r.unchangedAgenda)&&!proof.pageErrors.length;save();
}catch(e){proof.error=e.stack;process.exitCode=1;save();}finally{await browser?.close();console.log(JSON.stringify({passed:proof.passed,runs:proof.runs.map(({round,mode,status})=>({round,mode,status})),error:proof.error,pageErrors:proof.pageErrors},null,2));}

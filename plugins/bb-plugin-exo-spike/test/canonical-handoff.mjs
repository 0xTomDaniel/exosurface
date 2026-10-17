// Authorized one-time handoff. Do not run as a disposable/fixture-history test.
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from './playwright.mjs';
const exec = promisify(execFile), HOME = `${process.env.HOME}/.exo-bb-spike`, PROFILE = `${process.env.HOME}/.optchat-exocortex-test/profiles/exo-optchat`;
const BB = '/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb';
const cli = async (...args) => JSON.parse((await exec(process.execPath,[BB,...args],{env:{...process.env,BB_SERVER_URL:'http://127.0.0.1:38886'},timeout:60_000,maxBuffer:5_000_000})).stdout);
const load = p => JSON.parse(readFileSync(p,'utf8'));
async function wait(fn,label) { const end=Date.now()+180_000; while(Date.now()<end) {const v=await fn();if(v)return v;await new Promise(r=>setTimeout(r,300));}throw new Error(`Handoff wait expired: ${label}`); }
const result = { canonicalCutover: false, checks: [], errors: [] };let browser, main;
try {
  assert.ok(existsSync('evidence/canonical-before-handoff.json'), 'Verified backup required');
  if (existsSync(`${HOME}/canonical-thread.json`)) main = {id:load(`${HOME}/canonical-thread.json`).threadId};
  else {
    const project=(await cli('thread','get','thr_hpkdzye5am','--json')).thread.projectId;
    main=await cli('thread','spawn','--project',project,'--new-environment','personal','--provider','exo-spike','--model','exo-opus-5-5','--reasoning-level','high','--permission-mode','full','--title','Exo','--pinned','--prompt','/exo-info','--json');
  }
  result.threadId=main.id;result.url=`http://127.0.0.1:38886/plugins/exo-spike/proof/${main.id}`;
  await wait(()=>existsSync(`${HOME}/bindings/${main.id}.json`),'canonical binding');
  const binding=load(`${HOME}/bindings/${main.id}.json`), info=load(`${HOME}/runtime-info/${main.id}.json`);
  assert.equal(binding.profile,'exo-optchat');assert.equal(binding.runtimeKind,'canonical');assert.equal(binding.providerThreadId,'exo:exo-optchat:main');
  assert.equal(info.profile,'exo-optchat');assert.equal(info.runtimeKind,'canonical');assert.equal(info.model.id,'claude-opus-5-5');
  assert.equal(info.hasVaultInstructions,true);assert.equal(info.fixtureLoaded,false);assert.ok(info.skills.length>=17);
  assert.ok(binding.sessionFile.startsWith(`${process.env.HOME}/.optchat-exocortex-test/pi-sessions/`));
  result.binding={profile:binding.profile,runtimeKind:binding.runtimeKind,providerThreadId:binding.providerThreadId,sessionFile:binding.sessionFile};
  result.runtime={model:info.model,cwd:info.cwd,skills:info.skills.length,sessionId:info.sessionId};
  result.checks.push('Existing profile/native binding, canonical session directory, normal vault resources, no fixture');
  browser=await chromium.launch({headless:true}); const page=await browser.newPage({viewport:{width:1440,height:1000}});
  page.on('pageerror',e=>result.errors.push(e.message));await page.goto(result.url);
  await wait(async()=>await page.getByRole('heading',{name:'Exo',exact:true}).isVisible(),'canonical UI');
  assert.equal(await page.getByRole('button',{name:'Native child',exact:true}).count(),0,'Do not expose synthetic test buttons on personal history');
  const chat=page.locator('section[aria-label="Native BB conversation"]');
  const before=existsSync(binding.sessionFile)?readFileSync(binding.sessionFile,'utf8').split('\n').filter(Boolean).length:0;
  const prompt='Exo-generated implementation handoff, authorized by Tom: the previous standalone owner was closed normally and this new BB conversation now uses the same existing exo-optchat profile, not a copied or rebuilt history. Normal Exocortex instructions and skills remain loaded. Native workers are available, but linked BB child projections are off for now. Acknowledge the handoff briefly in one sentence. Do not call tools, create tasks, change vault notes, or treat this as verbatim user journaling.';
  const editor=chat.locator('[contenteditable="true"]');await editor.waitFor();await editor.fill(prompt);await editor.press('Enter');
  const fresh=await wait(()=>{
    if(!existsSync(binding.sessionFile))return false;
    const es=readFileSync(binding.sessionFile,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l));
    return es.slice(before).find(e=>e.message?.role==='assistant'&&e.message.provider==='anthropic'&&e.message.stopReason==='stop');
  },'actual canonical model reply');
  await wait(async()=>(await cli('thread','get',main.id,'--json')).thread.status==='idle','settled canonical chat');
  const text=fresh.message.content.filter(p=>p.type==='text').map(p=>p.text).join('\n');
  await wait(async()=>(await chat.innerText()).includes(text),'native BB assistant rendering');
  await page.getByRole('button',{name:'Runtime info',exact:true}).click();
  await wait(async()=>(await page.getByLabel('Pi feedback').innerText()).includes('Exo is connected'),'canonical visible command feedback');
  result.checks.push('Actual Opus reply rendered in native BB chat, idle, then command-only feedback');
  // Source-preservation checks against the verified snapshot. Old files are read,
  // never restored. Native original/tree/usage journals may append; never rewrite.
  const manifest=load('evidence/canonical-before-handoff.json').fileManifest;
  const crypto=await import('node:crypto');const changed=[];let unchanged=0,prefix=0;
  for(const [relative,record] of Object.entries(manifest)) {
    if(relative.startsWith('.git/'))continue;
    const file=`${PROFILE}/${relative}`;assert.ok(existsSync(file),`Existing file lost: ${relative}`);
    const bytes=readFileSync(file),hash=crypto.createHash('sha256').update(bytes).digest('hex');
    if(hash===record.sha256){unchanged++;continue;}
    const prefixHash=crypto.createHash('sha256').update(bytes.subarray(0,record.bytes)).digest('hex');
    if(bytes.length>=record.bytes&&prefixHash===record.sha256){prefix++;continue;}
    changed.push(relative);
  }
  // Expected mutable operational journals are not immutable history.
  const permitted=new Set(['pending-inputs.json','pending-reports.json']);
  assert.ok(changed.every(p=>permitted.has(p)),`Unexpected rewrite: ${changed.join(', ')}`);
  for(const p of ['config.json','AGENTS.md','active-memory.json','DO-NOT-DELETE.md']) assert.ok(!changed.includes(p));
  result.preservation={existingNonGitFilesUnchanged:unchanged,existingFilesAppendOnly:prefix,mutableJournalsChanged:changed,oldHistoryPreserved:true};
  await chat.screenshot({path:'evidence/canonical-chat.png'});
  assert.equal(result.errors.length,0);result.canonicalCutover=true;result.ownerLeftRunning=true;
} catch(error){result.failure=error.stack;process.exitCode=1;}
finally{await browser?.close();writeFileSync('evidence/canonical-handoff.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));}

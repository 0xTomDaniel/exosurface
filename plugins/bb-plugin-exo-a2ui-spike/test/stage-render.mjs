// Disposable-browser design review. Read-only: serves the BUILT frontend and
// implementer-authored fixtures through intercepted reads; no native writes, no
// model calls, no refresh of the owner's tab. --loaded skips asset substitution.
import assert from'node:assert/strict';import{readFileSync,writeFileSync,mkdirSync}from'node:fs';
import { chromium } from './playwright.mjs';
import{guided,sampler,replayLive}from'./stage-fixtures.ts';
const loaded=process.argv.includes('--loaded'),out='evidence/presentation',H=process.env.HOME+'/.exo-a2ui-spike';mkdirSync(out,{recursive:true});
const before=readFileSync(H+'/workspace/latest.json','utf8'),live=replayLive(JSON.parse(readFileSync(H+'/owner/state.json','utf8')).sessionFile);
assert.equal(live.revision,JSON.parse(before).workspace.revision);
const fixtures={live,guided:guided(live),sampler:sampler(live)};
const proof={staged:!loaded,fixturesAreImplementerAuthored:true,noModelCalls:true,noNativeWrites:true,pageErrors:[],checks:{}};
const ours=new Map();
async function isOurs(url){const hash=url.split('/').at(-2);if(!ours.has(hash)){const js=await(await fetch(url.replace(/app\.css$/,'app.js'))).text();ours.set(hash,js.includes('Exosurface clone'));}return ours.get(hash);}
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const scheme of['light','dark'])for(const[name,snapshot]of Object.entries(fixtures)){
  const ctx=await browser.newContext({viewport:{width:1600,height:1000},colorScheme:scheme});const p=await ctx.newPage();p.on('pageerror',e=>proof.pageErrors.push(`${name}/${scheme}: ${e.message}`));
  if(!loaded)await p.route(/plugin-app-assets\/[^/]+\/app\.(js|css)$/,async route=>{const url=route.request().url();if(!(await isOurs(url)))return route.continue();await route.fulfill({status:200,contentType:url.endsWith('.js')?'text/javascript':'text/css',body:readFileSync(url.endsWith('.js')?'dist/app.js':'dist/app.css','utf8')});});
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/workspace',async route=>{const r=await route.fetch(),j=await r.json();j.result={...j.result,revision:snapshot.revision,streaming:false,delivery:{epoch:`fixture-${name}`,checkpoint:snapshot,updates:[],preview:null}};await route.fulfill({response:r,json:j});});
  // Fixtures must never write: block actions AND shared-state edits.
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/action',route=>route.abort());
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/edit',route=>route.abort());
  await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');
  await p.locator('.exo-stage section[data-surface]').first().waitFor({timeout:15000});await p.waitForTimeout(700);
  const stage=await p.locator('.exo-stage section[data-surface]').getAttribute('data-surface'),pills=await p.locator('.exo-shelf .exo-pill').count(),beside=await p.locator('.exo-beside section[data-surface]').count();
  proof.checks[`${name}/${scheme}`]={stage,shelf:pills,beside};
  await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:`${out}/${name}-${scheme}.png`});
  if(scheme==='light'&&name==='guided'){
   assert.equal(stage,'fixture-trip');assert.equal(beside,1);assert.ok(pills>=1&&pills<=3);
   await p.getByRole('button',{name:'Mountain hike',exact:true}).click();
   await p.locator('.exo-shelf .exo-pill').nth(1).click();
   const away=await p.locator('.exo-stage section[data-surface]').getAttribute('data-surface');assert.notEqual(away,'fixture-trip');
   await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:`${out}/guided-shelf-pick.png`});
   await p.getByRole('button',{name:'Back to the current topic'}).click();
   assert.equal(await p.locator('.exo-stage section[data-surface]').getAttribute('data-surface'),'fixture-trip');
   assert.match(await p.locator('main[aria-label="Exosurface canvas"]').innerText(),/Saving your changes/);
   await p.locator('.exo-stage summary',{hasText:'Packing list'}).click();await p.waitForTimeout(250);assert.equal(await p.locator('.exo-stage input[type=checkbox]').count(),3);
   proof.checks.shelfRoundTripKeepsDraft=true;proof.checks.disclosureRevealsDetail=true;
   const fold=await p.evaluate(()=>{const main=document.querySelector('main[aria-label="Exosurface canvas"]'),top=main.getBoundingClientRect().top,h=main.clientHeight;return [...document.querySelectorAll('.exo-stage [data-surface] *')].filter(e=>e.matches('h1,.exo-callout,.exo-table,button.a2ui-button.primary')).map(e=>({tag:e.className||e.tagName,bottom:Math.round(e.getBoundingClientRect().bottom-top),fold:h}));});
   proof.checks.aboveFold=fold;
   await p.setViewportSize({width:900,height:1000});await p.waitForTimeout(300);await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:`${out}/guided-narrow.png`});
  }
  await p.setViewportSize({width:1600,height:2600});await p.waitForTimeout(300);await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:`${out}/${name}-${scheme}-full.png`});
  await ctx.close();
 }
 assert.equal(readFileSync(H+'/workspace/latest.json','utf8'),before);
 assert.equal(proof.pageErrors.length,0);proof.passed=true;
}catch(e){proof.error=e.stack;process.exitCode=1;}
finally{await browser?.close();writeFileSync(`${out}/${loaded?'render-loaded':'render-staged'}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

// Read-only layout check of the ACTUAL current canvas (no fixture), centered frame
// and unsquashed context column. --loaded skips built-asset substitution.
import assert from'node:assert/strict';import{readFileSync,writeFileSync}from'node:fs';
import { chromium } from './playwright.mjs';
const loaded=process.argv.includes('--loaded'),out='evidence/presentation',proof={staged:!loaded,widths:{},pageErrors:[]};const ours=new Map();
async function isOurs(url){const hash=url.split('/').at(-2);if(!ours.has(hash)){const js=await(await fetch(url.replace(/app\.css$/,'app.js'))).text();ours.set(hash,js.includes('Exosurface clone'));}return ours.get(hash);}
let browser;
try{
 browser=await chromium.launch({headless:true});
 for(const width of[2400,1900,1500]){
  const p=await browser.newPage({viewport:{width,height:1200},colorScheme:'dark'});p.on('pageerror',e=>proof.pageErrors.push(e.message));
  if(!loaded)await p.route(/plugin-app-assets\/[^/]+\/app\.(js|css)$/,async route=>{const url=route.request().url();if(!(await isOurs(url)))return route.continue();await route.fulfill({status:200,contentType:url.endsWith('.js')?'text/javascript':'text/css',body:readFileSync(url.endsWith('.js')?'dist/app.js':'dist/app.css','utf8')});});
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/action',route=>route.abort());
  await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.locator('.exo-stage section[data-surface]').waitFor();await p.waitForTimeout(800);
  const m=await p.evaluate(()=>{const r=e=>e?.getBoundingClientRect(),main=document.querySelector('main.exo-canvas'),frame=r(document.querySelector('.exo-frame')),mr=r(main),pad=parseFloat(getComputedStyle(main).paddingLeft);
   const cards=[...document.querySelectorAll('.exo-beside a2ui-basic-row>*')].map(c=>Math.round(r(c).width)).filter(Boolean);
   return{canvas:Math.round(mr.width),frameLeft:Math.round(frame.left-mr.left-pad),frameRight:Math.round(mr.right-pad-frame.right-(main.offsetWidth-main.clientWidth)),stage:Math.round(r(document.querySelector('.exo-stage')).width),beside:Math.round(r(document.querySelector('.exo-beside'))?.width??0),besideTop:Math.round((r(document.querySelector('.exo-beside'))?.top??0)-r(document.querySelector('.exo-stage')).top),besideRowItems:cards};});
  proof.widths[width]=m;
  assert.ok(Math.abs(m.frameLeft-m.frameRight)<=24,`frame centered at ${width}: ${JSON.stringify(m)}`);
  assert.ok(m.besideRowItems.every(w=>w>=180),`context row items readable at ${width}: ${m.besideRowItems}`);
  await p.locator('main[aria-label="Exosurface canvas"]').screenshot({path:`${out}/layout-${loaded?'loaded':'staged'}-${width}.png`});await p.close();
 }
 assert.equal(proof.pageErrors.length,0);proof.passed=true;
}catch(e){proof.error=e.stack;process.exitCode=1;}finally{await browser?.close();writeFileSync(`${out}/layout-${loaded?'loaded':'staged'}.json`,JSON.stringify(proof,null,2));console.log(JSON.stringify(proof,null,2));}

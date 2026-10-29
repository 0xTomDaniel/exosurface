// Isolated existing-renderer → compiled RPC → INDEPENDENT owner → mock Pi/tool → persisted page → fresh-browser reopen.
// No BB process, real authentication, provider network, launchctl, global state, or product-ready assertion.
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {createRequire,syncBuiltinESMExports} from 'node:module';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,readdirSync,writeFileSync,existsSync,rmSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,relative} from 'node:path';
import {tmpdir} from 'node:os';
import {pathToFileURL} from 'node:url';
import {interactiveChromium} from './chromium-control.mjs';
const plugin=resolve(import.meta.dirname,'../..'),legacy=resolve(plugin,'../bb-plugin-exo-a2ui-spike');
const required=name=>{const value=process.env[name];if(!value?.startsWith('/'))throw Error('Set absolute '+name);return value;};
const graph=required('EXO_REVIEW_A2UI_RUNTIME'),tools=required('EXO_REVIEW_BROWSER_TOOLS'),baselineBackend=required('EXO_REVIEW_BACKEND'),evidence=required('EXO_REVIEW_EVIDENCE');
const stage=realpathSync(mkdtempSync(join(tmpdir(),'exo-roundtrip-'))),backend=join(stage,'backend'),client=join(stage,'client');mkdirSync(evidence,{recursive:true});
const hash=value=>createHash('sha256').update(value).digest('hex');
const fullText='  leading whitespace\n🧪 Unicode & <script>literal textbox value</script>\n'.repeat(12)+'  FINAL COMPLETE VALUE  \n';
const source='- region "Fixture page" [ref=page]:\n  - heading "Review" [ref=heading]\n  - textbox "Full text" [ref=entry] [multiline]: initial\n  - button "Send" [ref=send] [action=submit] [sends=entry]';
const scrubbed={HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,PATH:process.env.PATH};
let owner,ownerExited,server,failed=true,report,ownerStderr='',forbiddenServiceAttempts=0;
const originalSpawnSync=childProcess.spawnSync;
childProcess.spawnSync=(file,...args)=>{if(file==='/bin/launchctl'){forbiddenServiceAttempts++;throw Error('Fixture forbids launchctl; no service action executed');}return originalSpawnSync(file,...args);};syncBuiltinESMExports();
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const waitFor=async(predicate,label)=>{const until=Date.now()+5000;while(!await predicate()){if(Date.now()>until)throw Error('Fixture wait failed: '+label);await sleep(20);}};
try{
 // Reuse only an explicitly supplied disposable production dependency/build tree. No global installation.
 mkdirSync(backend);for(const file of ['package.json','package-lock.json','server.ts','build.mjs']){assert.deepEqual(readFileSync(join(plugin,file)),readFileSync(join(baselineBackend,file)),file+' production source must match');cpSync(join(plugin,file),join(backend,file));}
 for(const name of readdirSync(join(baselineBackend,'src')).filter(n=>n.endsWith('.ts')))assert.deepEqual(readFileSync(join(plugin,'src',name)),readFileSync(join(baselineBackend,'src',name)),name+' production source must match');
 cpSync(join(plugin,'src'),join(backend,'src'),{recursive:true});cpSync(join(baselineBackend,'node_modules'),join(backend,'node_modules'),{recursive:true});
 mkdirSync(join(backend,'dist'));cpSync(join(baselineBackend,'dist/server.js'),join(backend,'dist/server.js'));
 execFileSync(process.execPath,[join(backend,'build.mjs')],{cwd:backend,env:scrubbed,stdio:'pipe',timeout:10000});
 const backendRequire=createRequire(join(backend,'package.json'));assert.equal(backendRequire('zod/package.json').version,'4.6.6');
 const {drawPages,readPages}=await import(pathToFileURL(join(backend,'dist/pages.js')));
 const {layout}=await import(pathToFileURL(join(backend,'dist/config.js')));
 const {save}=await import(pathToFileURL(join(backend,'dist/store.js')));
 const model={provider:'fixture',model:'mock',thinking:'medium'};
 const config={file:join(stage,'config.json'),vault:join(stage,'vault'),stateDir:join(stage,'state'),agentDir:join(stage,'agent'),profile:'exo',piCli:join(stage,'mock-pi.mjs'),optchat:join(stage,'mock-optchat'),node:process.execPath,models:{main:model,compactor:model,subagent:model},exosurfacePlugin:backend};
 mkdirSync(config.vault);mkdirSync(config.agentDir);mkdirSync(config.optchat);writeFileSync(join(config.vault,'AGENTS.md'),'# Synthetic fixture vault, NOT populated by plugin\n');save(join(config.agentDir,'auth.json'),{});save(config.file,config);save(layout(config.stateDir).primary,{threadId:'primary'});
 drawPages(config.stateDir,{baseRevision:0,mutationId:'fixture-draw',snapshot:source});
 const receipt=join(config.stateDir,'mock-pi-receipt.json');
 writeFileSync(config.piCli,`import{createInterface}from'node:readline';import{createServer}from'node:net';import{mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';
const registry=new Map();(await import(${JSON.stringify(pathToFileURL(join(backend,'dist/page-tools.js')).href)})).default({registerTool:tool=>registry.set(tool.name,tool)});
const dir=join(process.env.OPTCHAT_HOME,'profiles','exo');mkdirSync(dir,{recursive:true});const lock=createServer(s=>s.end('exo · PID '+process.pid+' · MOCK fixture'));await new Promise(r=>lock.listen(join(dir,'lock.sock'),r));
let promptCount=0;const out=value=>console.log(JSON.stringify(value));
for await(const line of createInterface({input:process.stdin})){const request=JSON.parse(line);if(request.type==='prompt'){
const press=JSON.parse(request.message);if(press.type!=='exosurface.page.press')throw Error('Expected actual offered page press');
const before=await registry.get('read_exosurface').execute('fixture-read',{});
const updated=await registry.get('update_exosurface').execute('fixture-update',{baseRevision:press.revision,mutationId:'owner-update',edits:[{surface:'page',ref:'heading',op:'replace',lines:'- heading "Owner updated page" [ref=heading]'}]});
writeFileSync(${JSON.stringify(receipt)},JSON.stringify({piPid:process.pid,ownerPid:process.ppid,promptCount:++promptCount,press,readRevision:before.details.revision,writeRevision:updated.details.revision}));
out({type:'response',id:request.id,success:true,data:{}});out({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'Mock owner updated the durable page.'}]}});out({type:'agent_end'});
}else out({type:'response',id:request.id,success:true,data:{}});}await new Promise(r=>lock.close(r));`);
 const ownerEnv={...scrubbed,EXO_CONFIG:config.file,EXO_STATE_DIR:config.stateDir};
 process.env.EXO_CONFIG=config.file;process.env.EXO_STATE_DIR=config.stateDir;
 owner=spawn(process.execPath,[join(backend,'dist/owner-service.js')],{env:ownerEnv,detached:true,stdio:['ignore','ignore','pipe']});
 ownerExited=new Promise((accept,reject)=>{owner.once('error',reject);owner.once('exit',(code,signal)=>accept({code,signal}));});owner.stderr.on('data',chunk=>{ownerStderr=(ownerStderr+chunk).slice(-6000);});
 await waitFor(()=>existsSync(layout(config.stateDir).ownerState)&&JSON.parse(readFileSync(layout(config.stateDir).ownerState)).ready,'independent owner startup');
 assert.notEqual(owner.pid,process.pid);
 const compiled=await import(pathToFileURL(join(backend,'dist/server.js')));let handlers,provider;
 compiled.default({providers:{register(value){provider=value;}},rpc:{register(_contract,value){handlers=value;}}});assert.equal(provider.id,'exosurface');
 const calls=[];
 server=createServer(async(req,res)=>{try{
  const path=new URL(req.url,'http://127.0.0.1').pathname;
  if(path==='/rpc'&&req.method==='POST'){
   let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);
   if(!['pageRead','pageEdit','pagePress'].includes(request.method))throw Error('Fixture only permits existing page RPCs');
   if(request.method!=='pageRead'&&(!existsSync(layout(config.stateDir).ownerSocket)||owner.exitCode!==null||owner.signalCode!==null))throw Error('Fixture owner absent; refusing any path that could call launchctl');
   const input=compiled.rpcContract[request.method].input.parse(request.input);
   const result=compiled.rpcContract[request.method].output.parse(await handlers[request.method](input));
   if(request.method!=='pageRead')calls.push({method:request.method,input,result});
   res.setHeader('Content-Type','application/json');res.end(JSON.stringify(result));return;
  }
  if(req.method!=='GET'){res.writeHead(405).end();return;}
  res.setHeader('Cache-Control','no-store');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'");
  if(path==='/'){res.setHeader('Content-Type','text/html');res.end('<!doctype html><meta charset="utf-8"><title>Isolated existing Exosurface renderer</title><style>:root{color-scheme:light;--foreground:#1d2128;--background:#fff;--muted-foreground:#646b78;--border:#dde1e7;background:var(--background);color:var(--foreground)}</style><div id="root"></div><script type="module" src="/client.js"></script>');return;}
  if(path==='/client.js'){res.setHeader('Content-Type','text/javascript');res.end(readFileSync(join(client,'bundle.js')));return;}
  res.writeHead(404).end();
 }catch(error){res.writeHead(400,{'Content-Type':'application/json'}).end(JSON.stringify({error:String(error)}));}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 // Byte-for-byte copy of the existing renderer support. No change to any spike file.
 mkdirSync(client);cpSync(join(legacy,'src'),join(client,'legacy/src'),{recursive:true});cpSync(join(legacy,'lib'),join(client,'legacy/lib'),{recursive:true});
 for(const file of ['client.tsx'])cpSync(join(import.meta.dirname,file),join(client,file));cpSync(join(plugin,'src/page-renderer-adapter.ts'),join(client,'page-renderer-adapter.ts'));cpSync(join(plugin,'src/snapshot-data.ts'),join(client,'snapshot-data.ts'));
 const graphRequire=createRequire(join(graph,'package.json'));assert.equal(graphRequire('zod/package.json').version,'3.25.76+exosurface.1');assert.equal(graphRequire('dompurify').version,'3.4.17');
 const esbuild=await import(pathToFileURL(join(tools,'node_modules/esbuild/lib/main.js')));
 const bundled=await esbuild.build({absWorkingDir:client,entryPoints:[join(client,'client.tsx')],outfile:join(client,'bundle.js'),bundle:true,format:'esm',platform:'browser',jsx:'automatic',nodePaths:[join(graph,'node_modules')],define:{'process.env.NODE_ENV':'"production"'},metafile:true,legalComments:'inline',logLevel:'silent'});
 const inputs=Object.keys(bundled.metafile.inputs).map(file=>resolve(client,file));
 const reused=inputs.filter(file=>file.includes('/legacy/')).map(file=>{const staged=resolve(file),path=relative(join(client,'legacy'),staged);assert.deepEqual(readFileSync(staged),readFileSync(join(legacy,path)),path+' unchanged renderer bytes');return {path:'bb-plugin-exo-a2ui-spike/'+path,sha256:hash(readFileSync(staged))};});
 assert.ok(reused.some(x=>x.path.endsWith('workspace-view.ts')));assert.ok(reused.some(x=>x.path.endsWith('exo-components.tsx')));assert.ok(inputs.some(p=>p.endsWith('dompurify/dist/purify.es.mjs')));assert.ok(inputs.some(p=>p.endsWith('zod/v3/types.js')));
 const url=`http://127.0.0.1:${server.address().port}/`;
 const first=await interactiveChromium(url,async({send,evaluate,waitFor,screenshot})=>{
  await waitFor('window.__fixture?.ready && document.querySelector("textarea") && [...document.querySelectorAll("button")].some(b=>b.textContent.trim()==="Send")');
  assert.equal(await evaluate('window.__fixture.error'),'');assert.equal(await evaluate('document.querySelector("textarea").value'),'initial');
  // Real browser focus and input; no direct draft/model injection, no programmatic button.click().
  await evaluate('document.querySelector("textarea").focus();document.querySelector("textarea").select()');await send('Input.insertText',{text:fullText});
  await waitFor('window.__fixture.view.committed?.revision===2 && window.__fixture.view.drafts.edits.size===0');
  assert.equal(await evaluate('document.querySelector("textarea").value'),fullText);
  const point=await evaluate('(()=>{const r=[...document.querySelectorAll("button")].find(b=>b.textContent.trim()==="Send").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
  await send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...point});await send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...point});
  await waitFor('window.__fixture.pressComplete && window.__fixture.view.committed?.revision===4 && document.body.innerText.includes("Owner updated page")');
  assert.equal(await evaluate('window.__fixture.error'),'');assert.equal(await evaluate('document.querySelector("textarea").value'),fullText);
  writeFileSync(join(evidence,'updated-page.png'),await screenshot());
  return {inputMethod:'CDP Input.insertText + actual pointer press',revision:4,fullTextPreserved:true,updatedHeadingVisible:true};
 });
 const pageBefore=readFileSync(join(config.stateDir,'current-pages.json'));assert.equal(readPages(config.stateDir).revision,4);
 assert.equal(owner.exitCode,null);assert.equal(owner.signalCode,null);
 const reopened=await interactiveChromium(url,async({evaluate,waitFor,screenshot})=>{
  await waitFor('window.__fixture?.ready && window.__fixture.view.committed?.revision===4 && document.body.innerText.includes("Owner updated page")');
  assert.equal(await evaluate('window.__fixture.error'),'');assert.equal(await evaluate('document.querySelector("textarea").value'),fullText);assert.equal(await evaluate('window.__fixture.view.drafts.edits.size'),0);
  writeFileSync(join(evidence,'reopened-page.png'),await screenshot());return {freshBrowserProfile:true,revision:4,fullTextPreserved:true,updatedHeadingVisible:true};
 });
 assert.deepEqual(readFileSync(join(config.stateDir,'current-pages.json')),pageBefore,'Opening UI does not mutate or seed persisted pages');
 const pi=JSON.parse(readFileSync(receipt));assert.equal(pi.ownerPid,owner.pid);assert.notEqual(pi.piPid,owner.pid);assert.notEqual(pi.piPid,process.pid);assert.equal(pi.promptCount,1);assert.equal(pi.press.values.entry,fullText);assert.equal(pi.press.name,'submit');assert.equal(pi.readRevision,3);assert.equal(pi.writeRevision,4);
 assert.equal(forbiddenServiceAttempts,0);assert.deepEqual(calls.map(c=>c.method),['pageEdit','pagePress']);assert.equal(calls[0].input.value,fullText);assert.equal(calls[1].input.values.entry,fullText);
 const document=readPages(config.stateDir);assert.equal(document.receipts.find(r=>r.kind==='press').dispatch,'sent');
 report={schema:'exosurface-existing-ui-roundtrip/0',releaseReady:false,passed:true,first,reopened,fullText:{characters:fullText.length,bytes:Buffer.byteLength(fullText),sha256:hash(fullText)},graph:{react:graphRequire('react/package.json').version,a2ui:JSON.parse(readFileSync(join(graph,'node_modules/@a2ui/react/package.json'))).version,markdown:'0.2.1',dompurify:'3.4.17',rendererZod:'3.25.76+exosurface.1',backendZod:'4.6.6'},reused,backendBundleSha256:hash(readFileSync(join(backend,'dist/server.js'))),browserBundleSha256:hash(readFileSync(join(client,'bundle.js'))),calls,owner:{independentProcess:true,ownerPid:owner.pid,piPid:pi.piPid,promptCount:pi.promptCount,compiledPageTools:true,dispatch:'sent'},persistedPageSha256:hash(pageBefore),limitations:['Mock Pi, manually registered compiled tools, synthetic auth artifact; NOT actual Pi extension loader, inference or authentication proof','Loopback stand-in for BB transport; no native BB/ThreadChat/product integration proof','Existing isolated candidate graph, not adoption into production plugin lock','Single-page browser milestone; not minimum-Node/platform/layout/release acceptance','Same-account scrubbed HOME isolation, not an OS sandbox']};
 failed=false;
}catch(error){writeFileSync(join(evidence,'failure.json'),JSON.stringify({error:String(error),stack:error.stack,ownerStderr},null,2));throw error;}
finally{
 let cleanupError;
 if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}
 if(owner){
  owner.kill('SIGTERM');let timer;const exit=await Promise.race([ownerExited,new Promise(r=>{timer=setTimeout(()=>r(null),15000);})]);clearTimeout(timer);
  if(!exit||exit.code!==0||exit.signal){cleanupError=Error('Independent owner shutdown failed: '+JSON.stringify(exit));try{process.kill(-owner.pid,'SIGKILL');}catch{}}
  else if(report)report.owner.exit=exit;
  try{process.kill(-owner.pid,0);cleanupError=Error('Independent owner process group survived shutdown');process.kill(-owner.pid,'SIGKILL');}catch(error){if(error.code!=='ESRCH')cleanupError??=error;}
  if(report&&!cleanupError)report.owner.processGroupGone=true;
 }
 childProcess.spawnSync=originalSpawnSync;syncBuiltinESMExports();
 rmSync(stage,{recursive:true,force:true});
 if(cleanupError){writeFileSync(join(evidence,'cleanup-failure.json'),JSON.stringify({error:String(cleanupError),ownerStderr},null,2));throw cleanupError;}
 if(!failed){report.cleanup={fixtureRemoved:!existsSync(stage),httpServerClosed:true,forbiddenServiceAttempts};writeFileSync(join(evidence,'roundtrip.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));}
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { drawPages, editPages, pressPages, markPress, readPages } from '../src/pages.ts';
import { moduleData, moduleNodes } from '../src/snapshot-data.ts';
import { snapshotToA2ui, surfaceSnapshot } from '../src/snapshot-format.ts';
import { save } from '../src/store.ts';
import { layout, type Config } from '../src/config.ts';
import { startOwner } from '../src/owner-runtime.ts';
import { ownerConnection } from '../src/owner-client.ts';
import { fixtureCleanup } from './fixture-cleanup.ts';
const source='- region "Fixture page" [ref=page]:\n  - heading "Review" [ref=heading]\n  - textbox "Full text" [ref=entry] [multiline]: initial\n  - button "Send" [ref=send] [action=submit] [sends=entry]';
const longText=' leading whitespace\n🧪 multiline Unicode complete field\n'.repeat(4000)+' FINAL FULL-TEXT SENTINEL \n';
function temp(t:any){const home=mkdtempSync(join(tmpdir(),'exo-pages-'));return {home,cleanup:fixtureCleanup(t,home)};}
test('extracted snapshot grammar preserves stable refs and ordinary message conversion without A2UI runtime',()=>{
 const messages=snapshotToA2ui(source),s={revision:1,messages};
 assert.equal(moduleNodes(s,'page').find(n=>n.id==='entry').component,'TextField');
 assert.deepEqual(moduleNodes(s,'page').find(n=>n.id==='send').action.event,{name:'submit',context:{entry:{path:'/entry'}}});
 assert.match(surfaceSnapshot(s,'page'),/textbox "Full text" \[ref=entry\]/);
 for(const bad of [source.replace('ref=entry','ref=constructor'),source+'\n'+source,source.replace('[multiline]','[__proto__=x]'),' '.repeat(18)+'- region "Deep" [ref=deep]']) {
  if(bad===source+'\n'+source)continue; // Duplicate page is rejected at document admission, not by standalone conversion.
  assert.throws(()=>snapshotToA2ui(bad));
 }
 assert.throws(()=>snapshotToA2ui('- region "Huge" [ref=p]:\n  - text: '+ 'x'.repeat(8193)),/line exceeds/);
});
test('durable draw/ref edits/full textbox values and revision/mutation guards reject without truncation or overwrite',t=>{
 const state=temp(t).home;assert.equal(drawPages(state,{baseRevision:0,mutationId:'draw1',snapshot:source}).revision,1);
 const edit={baseRevision:1,mutationId:'edit1',surfaceId:'page',ref:'entry',value:longText};
 assert.equal(editPages(state,edit).revision,2);assert.equal(moduleData(readPages(state)!.snapshot,'page').entry,longText);
 assert.equal(editPages(state,edit).duplicate,true);
 const before=readFileSync(join(state,'current-pages.json'),'utf8');
 for(const mutation of [{...edit,mutationId:'stale'}, {...edit,baseRevision:2,mutationId:'missing',ref:'missing'}, {...edit,baseRevision:2,mutationId:'button',ref:'send'}, {...edit,baseRevision:2,mutationId:'huge',value:'x'.repeat(512*1024+1)}, {...edit,baseRevision:2,mutationId:'type',value:true}]) assert.throws(()=>editPages(state,mutation));
 assert.equal(readFileSync(join(state,'current-pages.json'),'utf8'),before);
 assert.throws(()=>editPages(state,{...edit,value:'different'}),/Mutation ID reused/);
 assert.throws(()=>drawPages(state,{baseRevision:2,mutationId:'duplicatepage',snapshot:source+'\n'+source}),/drawn twice/);
 drawPages(state,{baseRevision:2,mutationId:'update',edits:[{surface:'page',ref:'heading',op:'replace',lines:'- heading "Updated" [ref=heading]'}]});
 assert.equal(moduleData(readPages(state)!.snapshot,'page').entry,longText);
 assert.match(surfaceSnapshot(readPages(state)!.snapshot,'page'),/Updated/);
 assert.throws(()=>editPages(state,{baseRevision:3,mutationId:'nested',surfaceId:'page',ref:'entry',value:{bad:1}} as any));
});
test('press uses only offered button refs/event/context and durable dispatch receipt; unknown outcome cannot retry',t=>{
 const state=temp(t).home;drawPages(state,{baseRevision:0,mutationId:'draw',snapshot:source});
 const press={baseRevision:1,mutationId:'press',surfaceId:'page',ref:'send',values:{entry:longText}};
 const result=pressPages(state,press);assert.equal(JSON.parse(result.message!).values.entry,longText);
 assert.equal(moduleData(readPages(state)!.snapshot,'page').entry,longText);
 assert.throws(()=>pressPages(state,press),/outcome unknown/);markPress(state,'press','unknown');assert.throws(()=>pressPages(state,press),/outcome unknown/);
 markPress(state,'press','sent');assert.equal(pressPages(state,press).duplicate,true);
 const before=readFileSync(join(state,'current-pages.json'),'utf8');
 assert.throws(()=>pressPages(state,{...press,baseRevision:2,mutationId:'wrong',ref:'entry'}),/nonbutton/);
 assert.throws(()=>pressPages(state,{...press,baseRevision:2,mutationId:'badinput',values:{unknown:'x'}}),/noneditable/);
 assert.equal(readFileSync(join(state,'current-pages.json'),'utf8'),before);
});
test('production owner socket → mock Pi running compiled page tools → persisted updated page; full text survives chunking',async t=>{
 const {home,cleanup}=temp(t),vault=join(home,'vault'),agentDir=join(home,'agent');mkdirSync(vault);mkdirSync(agentDir);writeFileSync(join(vault,'AGENTS.md'),'# Synthetic');
 const model={provider:'fixture',model:'mock',thinking:'medium' as const};
 const config:Config={file:join(home,'config.json'),vault,stateDir:join(home,'state'),agentDir,profile:'exo',piCli:join(home,'pi.mjs'),optchat:join(home,'optchat'),node:process.execPath,models:{main:model,compactor:model,subagent:model},exosurfacePlugin:''};
 save(config.file,config);
 save(layout(config.stateDir).primary,{threadId:'primary'});save(join(agentDir,'auth.json'),{});
 const tools=pathToFileURL(resolve(import.meta.dirname,'../dist/page-tools.js')).href;
 writeFileSync(config.piCli,`import{createInterface}from'node:readline';import{createServer}from'node:net';import{mkdirSync,writeFileSync}from'node:fs';import{join}from'node:path';
writeFileSync(join(process.env.EXO_PAGE_STATE,'fixture-pi.pid'),String(process.pid));
process.on('exit',code=>writeFileSync(join(process.env.EXO_PAGE_STATE,'fixture-pi-exit.json'),JSON.stringify({pid:process.pid,code})));
const registry=new Map();(await import(${JSON.stringify(tools)})).default({registerTool:t=>registry.set(t.name,t)});
const dir=join(process.env.OPTCHAT_HOME,'profiles','exo');mkdirSync(dir,{recursive:true});const lock=createServer(s=>s.end('exo · PID '+process.pid+' · fixture'));await new Promise(r=>lock.listen(join(dir,'lock.sock'),r));
const out=x=>console.log(JSON.stringify(x));for await(const line of createInterface({input:process.stdin})){const r=JSON.parse(line);if(r.type==='prompt'){const p=JSON.parse(r.message);if(p.type!=='exosurface.page.press')throw Error('Expected page press');
await registry.get('update_exosurface').execute('fixture-tool-call',{baseRevision:p.revision,mutationId:'owner-update',edits:[{surface:'page',ref:'heading',op:'replace',lines:'- heading "Owner updated page" [ref=heading]'}]});
out({type:'response',id:r.id,success:true,data:{}});out({type:'message_end',message:{role:'assistant',content:[{type:'text',text:'Page action received full '+p.values.entry}]}});out({type:'agent_end'});
}else out({type:'response',id:r.id,success:true,data:{}});}lock.close();`);
 drawPages(config.stateDir,{baseRevision:0,mutationId:'draw',snapshot:source});
 const owner=await startOwner(config);cleanup.beforeRemove(async()=>{const pid=Number(readFileSync(join(config.stateDir,'fixture-pi.pid'),'utf8'));await owner.close();assert.deepEqual(JSON.parse(readFileSync(join(config.stateDir,'fixture-pi-exit.json'),'utf8')),{pid,code:0});cleanup.verifyGone(pid);});let ended=false;
 const client=ownerConnection(config,e=>{if(e.type==='agent_end')ended=true;});cleanup.beforeRemove(()=>client.close());
 await assert.rejects(client.send('wrong-thread','page.edit',{baseRevision:1,mutationId:'wrong',surfaceId:'page',ref:'entry',value:longText}),/Not the primary/);
 const edit={baseRevision:1,mutationId:'edit',surfaceId:'page',ref:'entry',value:longText};
 const compiled=await import(pathToFileURL(resolve(import.meta.dirname,'../dist/first-run-shell-server.js')).href);
 let handlers:any;compiled.default({providers:{register(){}},rpc:{register(_contract:any,value:any){handlers=value;}}});
 const priorConfig=process.env.EXO_CONFIG;process.env.EXO_CONFIG=config.file;
 t.after(()=>{if(priorConfig===undefined)delete process.env.EXO_CONFIG;else process.env.EXO_CONFIG=priorConfig;});
 assert.equal((await handlers.pageEdit(compiled.rpcContract.pageEdit.input.parse({threadId:'primary',...edit}))).revision,2);
 const press={baseRevision:2,mutationId:'press',surfaceId:'page',ref:'send',values:{entry:longText}};
 assert.equal((await handlers.pagePress(compiled.rpcContract.pagePress.input.parse({threadId:'primary',...press}))).revision,3);
 for(let n=0;n<200&&!ended;n++)await new Promise(r=>setTimeout(r,10));assert.equal(ended,true);
 const page=readPages(config.stateDir)!;assert.equal(page.revision,4);assert.equal(moduleData(page.snapshot,'page').entry,longText);
 assert.match(surfaceSnapshot(page.snapshot,'page'),/Owner updated page/);
 assert.equal(JSON.parse(readFileSync(join(config.stateDir,'response-page.json'),'utf8')).body,'Page action received full '+longText);
 assert.equal((await client.send('primary','page.press',press)).duplicate,true,'acknowledged duplicate cannot trigger another owner update');
 assert.equal(readPages(config.stateDir)!.revision,4);
 const read=compiled.rpcContract.pageRead.output.parse(await handlers.pageRead());assert.equal(read.revision,4);
 const reloaded=readPages(config.stateDir)!;assert.equal(moduleData(reloaded.snapshot,'page').entry,longText);
 // This exercises compiled tools and real socket transport with a MOCK Pi API, not browser rendering/paid inference.
});

test('built Zod4 edit/press envelopes preserve long text, reject unknown fields and bound input maps',async()=>{
 const {rpcContract}=await import(pathToFileURL(resolve(import.meta.dirname,'../dist/first-run-shell-server.js')).href);
 const base={threadId:'primary',baseRevision:1,mutationId:'mutation',surfaceId:'page',ref:'entry'};
 assert.equal(rpcContract.pageEdit.input.parse({...base,value:longText}).value,longText);
 for(const bad of [{...base,value:'x',action:'unoffered'}, {...base,value:'x',baseRevision:-1}, {...base,value:'x'.repeat(512*1024+1)}, {...base,value:{nested:'no'}}])assert.equal(rpcContract.pageEdit.input.safeParse(bad).success,false);
 assert.equal(rpcContract.pagePress.input.safeParse({...base,values:Object.fromEntries(Array.from({length:25},(_,i)=>['input'+i,'x']))}).success,false);
});
test('unsupported persisted pages and interrupted mutation locks fail closed without overwrite',t=>{
 const state=temp(t).home;drawPages(state,{baseRevision:0,mutationId:'draw',snapshot:source});
 const path=join(state,'current-pages.json');const valid=readFileSync(path,'utf8');
 save(join(state,'pages.lock'),{pid:99999999});assert.throws(()=>editPages(state,{baseRevision:1,mutationId:'locked',surfaceId:'page',ref:'entry',value:'x'}),/locked/);
 assert.equal(readFileSync(path,'utf8'),valid);rmSync(join(state,'pages.lock'));
 const d=JSON.parse(valid);d.schema='exosurface-pages/99';save(path,d);const newer=readFileSync(path,'utf8');
 assert.throws(()=>drawPages(state,{baseRevision:1,mutationId:'no-overwrite',snapshot:source}),/Unsupported page state/);assert.equal(readFileSync(path,'utf8'),newer);
});

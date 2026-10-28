import './isolation.ts';
import test from'node:test';import assert from'node:assert/strict';import{readFileSync,mkdirSync,writeFileSync}from'node:fs';
import{CANONICAL_HOME,HOME}from'../src/state.ts';
import{PRESS_PREFIX,PROMPT_SECTION,REMINDER_SECTION,REMINDER,SURFACE_GUIDELINES,SURFACE_DESCRIPTION}from'../src/tool-contract.ts';
import{PRESENTATION_GUIDE_SNAPSHOT}from'../src/presentation-guide.ts';
import{EXO_CATALOG}from'../src/exo-catalog.ts';
// Behavioural check against a fake Pi: registers handlers only; never fires
// session_start, so no runtime files are written.
async function load(){
 process.env.EXO_A2UI_SPIKE='1';process.env.OPTCHAT_HOME=CANONICAL_HOME;
 mkdirSync(HOME,{recursive:true});writeFileSync(HOME+'/clone.json','{}');
 const {default:workspace}=await import('../src/workspace-extension.ts');
 const handlers=new Map<string,Function[]>(),tools=new Map<string,any>(),entries:any[]=[];let active:string[]=[];
 const pi:any={getAllTools:()=>[...tools.keys(),'zoom','date','spawn','bash'].map(name=>({name})),on:(n:string,h:Function)=>{handlers.set(n,[...(handlers.get(n)??[]),h]);return()=>{};},registerTool:(t:any)=>tools.set(t.name,t),registerCommand:()=>{},appendEntry:(type:string,data:any)=>entries.push({type,data}),setActiveTools:(t:string[])=>{active=t;},getActiveTools:()=>active};
 workspace(pi);return{handlers,tools,entries,active:()=>active};
}
const V='v0.9.1',call=(id:string,args:any)=>({type:'toolCall',id,name:'apply_workspace',arguments:args});
const canvas={baseRevision:0,messages:[{version:V,createSurface:{surfaceId:'tomorrow',catalogId:EXO_CATALOG}},{version:V,updateComponents:{surfaceId:'tomorrow',components:[{id:'root',component:'Column',children:['h','tl','rec']},{id:'h',component:'Text',variant:'h1',text:'Tomorrow'},{id:'tl',component:'Timeline',items:[{label:'Breakfast',when:'07:00',state:'now'},{label:'Trailhead',when:'08:00'}]},{id:'rec',component:'Callout',tone:'decision',title:'Leave before 8',text:'Rain arrives at noon.'}]}},{version:V,updateDataModel:{surfaceId:'tomorrow',value:{}}}],layout:{focus:'tomorrow'}};
test('Guide is a stable system-prompt section, never a per-turn transcript message',async()=>{
 const{handlers,active}=await load();const e:any={prompt:'hi',systemPromptOptions:{sections:{}}};
 const results=handlers.get('before_agent_start')!.map(h=>h(e,{signal:new AbortController().signal,sessionManager:{getSessionId:()=>'x',getBranch:()=>[]}}));
 assert.ok(results.every(r=>r===undefined||!(r as any).message),'no injected message');
 assert.ok(e.systemPromptOptions.sections[PROMPT_SECTION].includes(PRESENTATION_GUIDE_SNAPSHOT));
 assert.equal(Object.keys(e.systemPromptOptions.sections).at(-1),REMINDER_SECTION);assert.equal(e.systemPromptOptions.sections[REMINDER_SECTION],REMINDER);
 assert.deepEqual(active(),['update_exosurface','read_exosurface','zoom','date'],'canvas tools plus OptChat memory tools; no spawn/bash');
 const guard=handlers.get('tool_call')!.at(-1)!;assert.equal(guard({toolName:'zoom'}),undefined);assert.ok(guard({toolName:'bash'})?.block);assert.ok(guard({toolName:'spawn'})?.block);
 assert.equal(handlers.get('context'),undefined,'nothing rewrites the conversation context (OptChat builds it)');
});
test('Canvas contract travels with the tool',async()=>{
 const{tools}=await load(),t=tools.get('update_exosurface');
 assert.equal(t.description,SURFACE_DESCRIPTION);assert.deepEqual(t.promptGuidelines,SURFACE_GUIDELINES);assert.ok(t.promptSnippet);
 for(const x of['baseRevision FIRST','snapshot:','edits:','insertAfter','delete:','- region "Page title" [ref=page_id]','figure "Caption" [chart=bar|line]'])assert.ok(t.description.includes(x),x);
 assert.ok(SURFACE_GUIDELINES.some(g=>g.includes(PRESS_PREFIX)&&g.includes('already saved')));assert.ok(SURFACE_GUIDELINES.some(g=>g.includes('[page-edits]')));
 assert.deepEqual(Object.keys(tools.get('read_exosurface').parameters.properties),['page']);
});
const snap='- region "Tomorrow" [ref=tomorrow]:\n  - list [ref=tl] [timeline]:\n    - listitem "Breakfast" [when=07:00] [state=now]\n  - note "Leave before 8" [ref=rec] [tone=decision]: Rain arrives at noon.';
test('Nothing in history is rewritten: Exo\'s canvas call stays as written; the tool commits translated A2UI',async()=>{
 const{handlers,tools}=await load();
 const message:any={role:'assistant',content:[{type:'toolCall',id:'c1',name:'update_exosurface',arguments:{baseRevision:0,snapshot:snap}}],stopReason:'toolUse'};
 assert.ok((handlers.get('message_end')??[]).every(h=>!h({type:'message_end',message},{sessionManager:{getSessionId:()=>'x',getBranch:()=>[]}})?.message),'no message_end replacement');
 const result=await tools.get('update_exosurface').execute('c1',{baseRevision:0,snapshot:snap});
 assert.match(result.content[0].text,/^Surface revision 1: drew page tomorrow\. On stage: tomorrow\./);
 assert.ok(result.details.delta.messages.some((m:any)=>m.updateComponents?.components.some((c:any)=>c.id==='rec'&&c.component==='Callout')));
 assert.ok(!result.content[0].text.includes('component'),'result is plain words');
});
test('Failed canvas calls are recorded and explained; the call itself stays in history as written',async()=>{
 const{tools,entries}=await load();
 await assert.rejects(()=>tools.get('update_exosurface').execute('c9',{baseRevision:0,snapshot:'- region "x":\n  - text: no ref'}),/ref=page_id/);
 assert.equal(entries.at(-1).type,'exosurface-failed-call');assert.match(entries.at(-1).data.error,/ref=page_id/);
 await assert.rejects(()=>tools.get('update_exosurface').execute('c10',{baseRevision:3,snapshot:snap}),/stale baseRevision 3/);
});
test('Button presses reach the conversation as a readable line; values are committed by code first',()=>{
 const server=readFileSync(new URL('../server.ts',import.meta.url),'utf8');
 assert.ok(server.includes('text:describePress(s.workspace,a)'));assert.ok(server.indexOf('canvasDataViaOwner(threadId,{revision,surfaceId:a.surfaceId')<server.indexOf('text:describePress'));
 assert.ok(!server.includes('Owner UI interaction')&&!server.includes('[Exosurface event]'));
});
test('Portable package; clone loads Exosurface before upstream OptChat',()=>{
 const pkg=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
 assert.deepEqual(pkg.pi,{extensions:['./src/workspace-extension.ts','./src/workspace-frame.ts','./src/live.ts'],skills:['./skills']});
 const skill=readFileSync(new URL('../skills/exosurface/SKILL.md',import.meta.url),'utf8');assert.match(skill,/^---\nname: exosurface\ndescription: /);
 const rt=readFileSync(new URL('../src/runtime.ts',import.meta.url),'utf8');assert.ok(rt.includes("'--approve', '-ne', '-e', join(SOURCE, 'src/workspace-extension.ts'), '-e', OPTCHAT, '-e', join(SOURCE, 'src/workspace-frame.ts')"));
 assert.ok(readFileSync(new URL('../src/state.ts',import.meta.url),'utf8').includes("OPTCHAT = local('optchatCanvas')"));
});
test('Outline is attached after OptChat rebuilds the request, to whatever head OptChat produced',async()=>{
 const{withOutline,MACHINE_STATE}=await import('../src/workspace-frame.ts');const{applyDelta}=await import('../src/workspace.ts');
 const snap=applyDelta(null,{baseRevision:0,revision:1,messages:canvas.messages,layout:canvas.layout});
 const optchatBuilt=[{role:'system',content:'OPTCHAT MASTER… CHAT COMPLEMENTS THE CANVAS…'},{role:'user',content:[{type:'text',text:'<chat>view</chat>'},{type:'text',text:'hi'}]}];
 const out=withOutline(optchatBuilt,snap);assert.deepEqual(out.slice(0,2),optchatBuilt,'system prompt and earlier messages untouched (stable cache prefix)');
 assert.equal(out.length,3);assert.equal(out[2].role,'user');assert.ok(out[2].content[0].text.startsWith(MACHINE_STATE+'EXOSURFACE revision 1.'));assert.ok(out[2].content[0].text.includes('[ref=rec]'),'outline in the snapshot format');
 const status={role:'user',content:[{type:'text',text:'[OptChat status] Agents at work now: a1 "Fix it"'}]},withStatus=withOutline([...optchatBuilt,status],snap);
 assert.deepEqual(withStatus.at(-1),status,'OptChat status line stays last');assert.ok(withStatus.at(-2).content[0].text.includes('EXOSURFACE revision'));
 assert.throws(()=>withOutline([{role:'user',content:'x'}],snap),/System-first/);
});
test('What moves to the primary session says nothing about a clone or synthetic content',async()=>{
 const{MAIN_HEADER}=await import('../src/tool-contract.ts');const{PRESENTATION_GUIDE_SNAPSHOT}=await import('../src/presentation-guide.ts');const{SURFACE_DESCRIPTION,SURFACE_GUIDELINES}=await import('../src/tool-contract.ts');
 for(const text of [MAIN_HEADER,PRESENTATION_GUIDE_SNAPSHOT,SURFACE_DESCRIPTION,...SURFACE_GUIDELINES])assert.ok(!/clone|synthetic|isolated|not main/i.test(text),text.slice(0,80));
});
test('Vocabulary (GLOSSARY.md): nothing the agent reads or the person sees says "canvas"',async()=>{
 const c=await import('../src/tool-contract.ts'),g=await import('../src/presentation-guide.ts'),f=await import('../src/snapshot-format.ts'),w=await import('../src/workspace-frame.ts');
 const agent=[c.CLONE_HEADER,c.MAIN_HEADER,c.SURFACE_SNIPPET,c.SURFACE_DESCRIPTION,c.SURFACE_READ_DESCRIPTION,...c.SURFACE_GUIDELINES,g.PRESENTATION_GUIDE_SNAPSHOT,f.SNAPSHOT_FORMAT,w.MACHINE_STATE];
 for(const t of agent)assert.ok(!/canvas/i.test(t),t.slice(0,90));
 const skill=readFileSync(new URL('../skills/exosurface/SKILL.md',import.meta.url),'utf8');assert.ok(!/canvas/i.test(skill));
 // UI strings and agent-facing messages in the plugin sources (identifiers and comments aside)
 for(const file of ['../app.tsx','../host.ts','../server.ts','../src/workspace-extension.ts','../src/canvas-memory.ts']){
  const strings=(readFileSync(new URL(file,import.meta.url),'utf8').match(/(['"`])(?:(?!\1)[^\\\n]|\\.)*\1/g)??[]).filter(x=>/\s/.test(x)&&!/^['"`][\w./-]*['"`]$/.test(x));
  const bad=strings.filter(x=>/\bcanvas\b/i.test(x)&&!/exo-canvas|canvas-|className/.test(x));assert.deepEqual(bad,[],file);
 }
});
test('Main mode: only the page tools are added; Exo keeps every tool; nothing is blocked except legacy page tools',async()=>{
 const {spawnSync}=await import('node:child_process'),{mkdtempSync,mkdirSync,writeFileSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');
 const home=mkdtempSync(join(tmpdir(),'exo-main-')),optchat=mkdtempSync(join(tmpdir(),'exo-optchat-'));mkdirSync(join(home,'owner'));writeFileSync(join(home,'owner','state.json'),'{}');
 const script=`
  const {default:ext}=await import(${JSON.stringify(new URL('../src/workspace-extension.ts',import.meta.url).href)});
  const tools=[],handlers={},setActive=[];
  const pi={getAllTools:()=>['read','bash','codemode','spawn',...tools].map(name=>({name})),getActiveTools:()=>['read','bash','codemode','spawn',...tools],setActiveTools:t=>setActive.push(t),
   on:(n,h)=>{(handlers[n]??=[]).push(h);return()=>{}},registerTool:t=>tools.push(t.name),registerCommand:()=>{},appendEntry:()=>{}};
  ext(pi);
  const guard=handlers.tool_call.at(-1);
  console.log(JSON.stringify({tools,setActive:setActive.length,bash:guard({toolName:'bash'})??null,codemode:guard({toolName:'codemode'})??null,legacy:!!guard({toolName:'apply_workspace'})?.block}));`;
 const r=spawnSync(process.execPath,['--experimental-transform-types','--input-type=module','-e',script],{env:{...process.env,EXOSURFACE_MODE:'main',EXOSURFACE_HOME:home,EXOSURFACE_OPTCHAT_HOME:optchat,OPTCHAT_HOME:optchat},encoding:'utf8'});
 const out=JSON.parse(r.stdout.trim().split('\n').at(-1)!);
 assert.deepEqual(out.tools.sort(),['read_exosurface','update_exosurface']);assert.equal(out.setActive,0,'never narrows the active tool set');
 assert.equal(out.bash,null);assert.equal(out.codemode,null);assert.equal(out.legacy,true);
});

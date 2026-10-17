import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{CANONICAL_HOME}from'../src/state.ts';
import{PRESS_PREFIX,PROMPT_SECTION,REMINDER_SECTION,REMINDER,UPDATE_GUIDELINES,UPDATE_DESCRIPTION}from'../src/tool-contract.ts';
import{PRESENTATION_GUIDE}from'../src/presentation-guide.ts';
import{OMITTED}from'../src/workspace-extension.ts';
import{EXO_CATALOG}from'../src/exo-catalog.ts';
// Behavioural check against a fake Pi: registers handlers only; never fires
// session_start, so no runtime files are written.
async function load(){
 process.env.EXO_A2UI_SPIKE='1';process.env.OPTCHAT_HOME=CANONICAL_HOME;
 const {default:workspace}=await import('../src/workspace-extension.ts');
 const handlers=new Map<string,Function[]>(),tools=new Map<string,any>(),entries:any[]=[];let active:string[]=[];
 const pi:any={getAllTools:()=>[...tools.keys(),'zoom','date','spawn','bash'].map(name=>({name})),on:(n:string,h:Function)=>{handlers.set(n,[...(handlers.get(n)??[]),h]);return()=>{};},registerTool:(t:any)=>tools.set(t.name,t),registerCommand:()=>{},appendEntry:(type:string,data:any)=>entries.push({type,data}),setActiveTools:(t:string[])=>{active=t;},getActiveTools:()=>active};
 workspace(pi);return{handlers,tools,entries,active:()=>active};
}
const V='v0.9.1',call=(id:string,args:any)=>({type:'toolCall',id,name:'apply_workspace',arguments:args});
const canvas={baseRevision:0,messages:[{version:V,createSurface:{surfaceId:'tomorrow',catalogId:EXO_CATALOG}},{version:V,updateComponents:{surfaceId:'tomorrow',components:[{id:'root',component:'Column',children:['h','tl','rec']},{id:'h',component:'Text',variant:'h1',text:'Tomorrow'},{id:'tl',component:'Timeline',items:[{label:'Breakfast',when:'07:00',state:'now'},{label:'Trailhead',when:'08:00'}]},{id:'rec',component:'Callout',tone:'decision',title:'Leave before 8',text:'Rain arrives at noon.'}]}},{version:V,updateDataModel:{surfaceId:'tomorrow',value:{}}}],layout:{focus:'tomorrow'}};
test('Guide is a stable system-prompt section, never a per-turn transcript message',async()=>{
 const{handlers,active}=await load();const e:any={prompt:'hi',systemPromptOptions:{sections:{}}};
 const results=handlers.get('before_agent_start')!.map(h=>h(e,{signal:new AbortController().signal,sessionManager:{getSessionId:()=>'x'}}));
 assert.ok(results.every(r=>r===undefined||!(r as any).message),'no injected message');
 assert.ok(e.systemPromptOptions.sections[PROMPT_SECTION].includes(PRESENTATION_GUIDE));
 assert.equal(Object.keys(e.systemPromptOptions.sections).at(-1),REMINDER_SECTION);assert.equal(e.systemPromptOptions.sections[REMINDER_SECTION],REMINDER);
 assert.deepEqual(active(),['apply_workspace','read_workspace','zoom','date'],'canvas tools plus OptChat memory tools; no spawn/bash');
 const guard=handlers.get('tool_call')!.at(-1)!;assert.equal(guard({toolName:'zoom'}),undefined);assert.ok(guard({toolName:'bash'})?.block);assert.ok(guard({toolName:'spawn'})?.block);
 assert.equal(handlers.get('context'),undefined,'nothing rewrites the conversation context (OptChat builds it)');
});
test('Canvas contract travels with the tool',async()=>{
 const{tools}=await load(),t=tools.get('apply_workspace');
 assert.equal(t.description,UPDATE_DESCRIPTION);assert.deepEqual(t.promptGuidelines,UPDATE_GUIDELINES);assert.ok(t.promptSnippet);
 for(const s of['baseRevision FIRST','deleteSurface','Callout:','40 KB','layout:{focus?'])assert.ok(t.description.includes(s),s);
 assert.ok(UPDATE_GUIDELINES.some(g=>g.includes(PRESS_PREFIX)&&g.includes('already saved')));assert.ok(UPDATE_GUIDELINES.some(g=>g.includes('Do not imitate that summary form')));
 assert.deepEqual(Object.keys(tools.get('read_workspace').parameters.properties),['surfaceId']);
});
test('Canvas JSON never reaches history or OptChat: the logged call says what was shown; the tool still runs the full call',async()=>{
 const{handlers,tools}=await load(),end=handlers.get('message_end')!;
 const message:any={role:'assistant',content:[{type:'text',text:'Here is tomorrow.'},call('c1',structuredClone(canvas))],stopReason:'toolUse'};
 const replaced=end.map(h=>h({type:'message_end',message},{})).find(r=>r?.message)?.message;
 assert.ok(replaced,'assistant message replaced at message_end');
 const logged=replaced.content[1].arguments,text=JSON.stringify(replaced);
 assert.equal(logged.messages[0].omitted,OMITTED);assert.match(logged.messages[0].shown,/Showed on canvas — Tomorrow \[tomorrow\]: new; Tomorrow; timeline: 07:00 Breakfast \(now\); 08:00 Trailhead; \[decision\] Leave before 8: Rain arrives at noon\./);
 assert.ok(!text.includes('"component"')&&!text.includes('updateComponents'),'no layout JSON in what OptChat logs');
 assert.ok(text.length<900);assert.equal(replaced.content[0].text,'Here is tomorrow.');
 const result=await tools.get('apply_workspace').execute('c1',logged);
 assert.deepEqual(result.details.delta.messages,canvas.messages,'full call executed from the stash; details keep it for native replay');
 assert.match(result.content[0].text,/^Canvas updated: revision 1/);
 await assert.rejects(()=>tools.get('apply_workspace').execute('c2',logged),/only repeats a history summary/);
});
test('Failed canvas calls keep their exact arguments in a native entry that is not conversation context',async()=>{
 const{handlers,tools,entries}=await load(),bad={baseRevision:0,messages:[{version:V,updateComponents:{surfaceId:'missing',components:[]}}]};
 const message:any={role:'assistant',content:[call('c9',bad)]};handlers.get('message_end')!.forEach(h=>h({type:'message_end',message},{}));
 await assert.rejects(()=>tools.get('apply_workspace').execute('c9',{baseRevision:0,messages:[{omitted:OMITTED,shown:'x'}]}));
 assert.deepEqual(entries.at(-1).data.args,bad);assert.equal(entries.at(-1).type,'exosurface-failed-call');
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
 assert.equal(out.length,3);assert.equal(out[2].role,'user');assert.ok(out[2].content[0].text.startsWith(MACHINE_STATE+'EXOSURFACE_CURRENT_WORKSPACE revision 1'));
 const status={role:'user',content:[{type:'text',text:'[OptChat status] Agents at work now: a1 "Fix it"'}]},withStatus=withOutline([...optchatBuilt,status],snap);
 assert.deepEqual(withStatus.at(-1),status,'OptChat status line stays last');assert.ok(withStatus.at(-2).content[0].text.includes('EXOSURFACE_CURRENT_WORKSPACE'));
 assert.throws(()=>withOutline([{role:'user',content:'x'}],snap),/System-first/);
});

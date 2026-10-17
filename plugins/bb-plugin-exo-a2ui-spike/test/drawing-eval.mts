// Drawing-format test: can the agent draw as well in the snapshot format as in A2UI?
// Phases (run separately): extract | draw | render | grade | report.
// Real case data and outputs live in a PRIVATE directory (--dir=…), never in this repo.
// Draw/grade make paid model calls (catalog cost recorded); render is staged (no model, no writes).
//   node --experimental-transform-types test/drawing-eval.mts extract --dir=… --session=… --at=ISO,ISO,…
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {Type} from 'typebox';
import {applyDelta} from '../src/workspace.ts';
import {UPDATE_DESCRIPTION} from '../src/tool-contract.ts';
import {PRESENTATION_GUIDE} from '../src/presentation-guide.ts';
import {SNAPSHOT_FORMAT,snapshotToA2ui} from '../src/snapshot-format.ts';

const arg=(k:string)=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const phase=process.argv[2],DIR=arg('dir');if(!DIR)throw Error('--dir required (private output directory)');
mkdirSync(DIR,{recursive:true});
const J=(f:string)=>JSON.parse(readFileSync(join(DIR,f),'utf8')),W=(f:string,v:unknown)=>{mkdirSync(dirname(join(DIR,f)),{recursive:true});writeFileSync(join(DIR,f),typeof v==='string'?v:JSON.stringify(v,null,1));};
const cut=(s:string,n:number)=>s.length>n?s.slice(0,n)+` …[${s.length-n} more chars]`:s;

// ---------- extract: real turns that created a new surface ----------
function extract(){
 const session=arg('session')!,ats=arg('at')!.split(',');
 const msgs=readFileSync(session,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(r=>r.type==='message');
 const text=(m:any)=>typeof m.content==='string'?m.content:m.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('\n');
 const render=(m:any)=>{
  if(m.role==='user')return `TOM: ${text(m)}`;
  if(m.role==='assistant'){const t=text(m),calls=m.content.filter((p:any)=>p.type==='toolCall').map((c:any)=>`[EXO CALLED ${c.name} ${cut(JSON.stringify(c.arguments),400)}]`);return [t&&`EXO: ${t}`,...calls].filter(Boolean).join('\n');}
  if(m.role==='toolResult')return `[RESULT ${m.toolName}${m.isError?' (error)':''}] ${cut(text(m),2500)}`;
  return '';
 };
 const cases=ats.map(at=>{
  const k=msgs.findIndex(r=>r.timestamp.startsWith(at)&&r.message.role==='toolResult'&&r.message.toolName==='apply_workspace');if(k<0)throw Error(`no draw at ${at}`);
  let u=k;while(msgs[u].message.role!=='user')u--;
  const before=msgs.slice(Math.max(0,u-12),u).map(r=>render(r.message)).filter(Boolean).join('\n\n');
  // research done in this turn before the draw (skip the draw call itself)
  const research=msgs.slice(u+1,k).map(r=>{const m=r.message;if(m.role==='assistant')return render({...m,content:m.content.filter((p:any)=>!(p.type==='toolCall'&&p.name==='apply_workspace'))});return m.role==='toolResult'&&m.toolName!=='apply_workspace'?`[RESULT ${m.toolName}] ${cut(text(m),6000)}`:'';}).filter(Boolean).join('\n\n');
  return {id:at.replace(/[^0-9T]/g,'').slice(0,13),at,request:text(msgs[u].message),before,research,original:msgs[k].message.details?.delta};
 });
 W('cases.json',cases);console.log(`extracted ${cases.length} cases`,cases.map(c=>`${c.id} ${c.request.slice(0,50)} (${c.before.length+c.research.length} chars context)`));
}

// ---------- shared prompt ----------
const IDENTITY=`You are Exo, Tom's exocortex: executive assistant and coach, working over his shared memory. You speak with him through chat and a visual canvas (Exosurface) shown beside the chat.`;
const SNAPSHOT_GUIDE=PRESENTATION_GUIDE
 .replace(/\nCATALOGS\.[\s\S]*$/,'')
 .replace('layout.focus names the stage surface; by default it becomes','The stage is')
 .replace(/ Optional layout\.beside:[^.]*\./,'')
 +`\n\nCOMPONENT NAMES above map to snapshot roles: Callout → note; Metric → meter; Timeline → list [timeline]; Table → table; Chart → figure [chart=…]; Flow → list [flow]; Disclosure → group [collapsible]; Tabs → tablist; Card → article; Row → group [layout=row]; ChoicePicker → radiogroup / listbox; TextField → textbox.`;
const SNAPSHOT_TOOL=`Draw or replace surfaces on the Exosurface canvas. snapshot: one or more complete surfaces in the snapshot format below; a surface whose ref already exists is replaced. baseRevision: the current canvas revision (0 if empty). The person watches the canvas fill in line by line while you write, so write top-down in reading order.\n\n${SNAPSHOT_FORMAT}`;
const ARMS={
 a2ui:{system:`${IDENTITY}\n\n${PRESENTATION_GUIDE}`,tool:{name:'apply_workspace',description:UPDATE_DESCRIPTION,parameters:Type.Object({baseRevision:Type.Integer({minimum:0}),messages:Type.Array(Type.Any(),{minItems:1,maxItems:32}),layout:Type.Optional(Type.Object({focus:Type.Optional(Type.String()),beside:Type.Optional(Type.Array(Type.String(),{maxItems:2}))}))})},
  apply:(a:any)=>applyDelta(null,{baseRevision:0,revision:1,messages:a.messages,...(a.layout?{layout:a.layout}:{})})},
 snapshot:{system:`${IDENTITY}\n\n${SNAPSHOT_GUIDE}`,tool:{name:'update_exosurface',description:SNAPSHOT_TOOL,parameters:Type.Object({baseRevision:Type.Integer({minimum:0}),snapshot:Type.String()})},
  apply:(a:any)=>applyDelta(null,{baseRevision:0,revision:1,messages:snapshotToA2ui(String(a.snapshot))})},
} as const;
const userPrompt=(c:any)=>`<conversation_so_far>\n${c.before}\n</conversation_so_far>\n\n<this_turn>\nTOM: ${c.request}\n\n${c.research?`Research you already did this turn:\n${c.research}\n`:''}</this_turn>\n\nRespond to Tom's message as you would live, by drawing this turn's canvas with the canvas tool: one new surface (the canvas is otherwise empty; baseRevision 0). Only the canvas is evaluated, so call the tool and then stop.`;

async function registry(){
 const G=join(dirname(process.execPath),'..','lib','node_modules','@earendil-works','pi-coding-agent');
 const {ModelRuntime,ModelRegistry}=await import(join(G,'dist','index.js'));
 return new ModelRegistry(await ModelRuntime.create({}));
}

// ---------- draw ----------
async function draw(){
 const reg=await registry(),model=reg.find('anthropic','claude-opus-5-5');if(!model)throw Error('opus unavailable');
 const cases=J('cases.json'),only=arg('case');
 for(const c of cases)for(const [arm,spec] of Object.entries(ARMS)){
  if(only&&c.id!==only)continue;const out=`draw/${c.id}-${arm}.json`;if(existsSync(join(DIR,out))&&!process.argv.includes('--force'))continue;
  const messages:any[]=[{role:'user',content:userPrompt(c),timestamp:Date.now()}],attempts:any[]=[];let snapshot=null,args=null;
  for(let attempt=1;attempt<=2&&!snapshot;attempt++){
   const t0=Date.now(),r=await reg.streamSimple(model,{systemPrompt:spec.system,messages,tools:[spec.tool]},{reasoning:'high',signal:AbortSignal.timeout(600000)}).result();
   const call=r.content.find((p:any)=>p.type==='toolCall'&&p.name===spec.tool.name);let error=r.stopReason==='error'?r.errorMessage:null;
   if(call&&!error){try{snapshot=spec.apply(call.arguments);args=call.arguments;}catch(e){error=String((e as Error).message).slice(0,600);}}
   else if(!error)error='No canvas tool call';
   attempts.push({attempt,ms:Date.now()-t0,ok:!!snapshot,error,argBytes:call?JSON.stringify(call.arguments).length:0,outputTokens:r.usage?.output,cost:r.usage?.cost?.total??0});
   if(!snapshot&&call){messages.push(r,{role:'toolResult',toolCallId:call.id,toolName:call.name,content:[{type:'text',text:`Error: ${error}`}],isError:true,timestamp:Date.now()});}
   else if(!snapshot)messages.push(r,{role:'user',content:'Please draw the canvas with the tool now.',timestamp:Date.now()});
  }
  W(out,{case:c.id,arm,attempts,args,snapshot});
  console.log(`${c.id} ${arm}: ${attempts.map(a=>a.ok?'ok':'fail').join('→')} ${attempts.at(-1).argBytes} B, ${attempts.reduce((s,a)=>s+a.ms,0)/1000|0} s, $${attempts.reduce((s,a)=>s+a.cost,0).toFixed(3)}${snapshot?'':' — '+attempts.at(-1).error}`);
 }
}

// ---------- render (staged: route interception, no model, no writes) ----------
async function renderAll(){
 const {chromium}=await import('./playwright.mjs');const browser=await chromium.launch({headless:true});
 try{for(const c of J('cases.json'))for(const arm of Object.keys(ARMS)){
  const f=`draw/${c.id}-${arm}.json`;if(!existsSync(join(DIR,f)))continue;const d=J(f);if(!d.snapshot)continue;
  const ctx=await browser.newContext({viewport:{width:1400,height:2600},colorScheme:'light'}),p=await ctx.newPage();
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/workspace',async route=>{const r=await route.fetch(),j=await r.json();j.result={...j.result,revision:1,streaming:false,delivery:{epoch:`eval-${c.id}-${arm}`,checkpoint:d.snapshot,updates:[],preview:null}};await route.fulfill({response:r,json:j});});
  await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/action',route=>route.abort());await p.route('**/api/v1/plugins/exo-a2ui-spike/rpc/edit',route=>route.abort());
  await p.goto('http://127.0.0.1:38886/plugins/exo-a2ui-spike/workspace');await p.locator('.exo-stage section[data-surface]').first().waitFor({timeout:15000});await p.waitForTimeout(900);
  await p.locator('.exo-stage section[data-surface]').first().screenshot({path:join(DIR,`render/${c.id}-${arm}.png`)});await ctx.close();console.log('rendered',c.id,arm);
 }}finally{await browser.close();}
}

// ---------- grade (blind, GPT-6.1 Sol high, randomized A/B) ----------
const RUBRIC=`You are grading two canvases an assistant drew for the same moment in a conversation, shown as screenshots A and B. The canvas sits beside the chat and should make understanding, choosing or acting easier than prose would. Judge only the canvases.
Score each 1-5 on:
- usefulness: does it make the person's request easier to understand, decide or act on than prose? Is the one thing that matters obvious?
- faithfulness: is it consistent with the source material (no invented facts or numbers, nothing important lost or distorted)?
- visual: clear hierarchy, overview first with depth behind disclosure, readable, not cluttered, right visual for each relationship.
Then pick the overall better canvas (A, B or tie) with one sentence why.
Answer with JSON only: {"A":{"usefulness":n,"faithfulness":n,"visual":n},"B":{...},"winner":"A|B|tie","why":"..."}`;
async function grade(){
 const reg=await registry(),model=reg.find('openai-codex','gpt-6.1-sol');if(!model)throw Error('sol unavailable');
 for(const c of J('cases.json')){
  const out=`grade/${c.id}.json`;if(existsSync(join(DIR,out))&&!process.argv.includes('--force'))continue;
  const imgs=Object.keys(ARMS).map(arm=>({arm,file:join(DIR,`render/${c.id}-${arm}.png`)}));if(imgs.some(i=>!existsSync(i.file))){console.log('skip (missing render)',c.id);continue;}
  const flip=createHash('sha256').update(c.id).digest()[0]%2===1,[A,B]=flip?[imgs[1],imgs[0]]:imgs;
  const content=[{type:'text',text:`${RUBRIC}\n\n<source_material>\n${cut(c.before,12000)}\n\nTHIS TURN — TOM: ${c.request}\n${cut(c.research,14000)}\n</source_material>\n\nCanvas A:`},{type:'image',data:readFileSync(A.file).toString('base64'),mimeType:'image/png'},{type:'text',text:'Canvas B:'},{type:'image',data:readFileSync(B.file).toString('base64'),mimeType:'image/png'}];
  const r=await reg.streamSimple(model,{systemPrompt:'You are a careful, blind evaluator of interface quality. Output JSON only.',messages:[{role:'user',content,timestamp:Date.now()}]},{reasoning:'high',signal:AbortSignal.timeout(600000)}).result();
  const t=r.content.filter((p:any)=>p.type==='text').map((p:any)=>p.text).join('');const g=JSON.parse(t.slice(t.indexOf('{'),t.lastIndexOf('}')+1));
  const unblind=(k:string)=>k==='A'?A.arm:k==='B'?B.arm:'tie';
  W(out,{case:c.id,order:{A:A.arm,B:B.arm},scores:{[A.arm]:g.A,[B.arm]:g.B},winner:unblind(g.winner),why:g.why,cost:r.usage?.cost?.total??0});
  console.log(c.id,'winner',unblind(g.winner),'—',g.why);
 }
}

// ---------- report ----------
function report(){
 const rows:any[]=[];let cost=0;
 for(const c of J('cases.json')){
  const d=Object.fromEntries(Object.keys(ARMS).map(arm=>{const f=`draw/${c.id}-${arm}.json`;return [arm,existsSync(join(DIR,f))?J(f):null];}));
  const g=existsSync(join(DIR,`grade/${c.id}.json`))?J(`grade/${c.id}.json`):null;cost+=(g?.cost??0)+Object.values(d).reduce((s:number,x:any)=>s+(x?.attempts??[]).reduce((t:number,a:any)=>t+a.cost,0),0);
  rows.push({case:c.id,request:c.request.slice(0,60),...Object.fromEntries(Object.entries(d).map(([arm,x]:any)=>[arm,x&&{firstTry:x.attempts[0].ok,ok:!!x.snapshot,bytes:x.attempts.at(-1).argBytes,tokens:x.attempts.reduce((s:number,a:any)=>s+(a.outputTokens??0),0),s:Math.round(x.attempts.reduce((s:number,a:any)=>s+a.ms,0)/1000),score:g?.scores?.[arm]}])),winner:g?.winner,why:g?.why});
 }
 W('report.json',{cost,rows});
 const sum=(arm:string,f:(r:any)=>number)=>rows.map(r=>r[arm]).filter(Boolean).map(f);
 const med=(a:number[])=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor(s.length/2)]:NaN;},mean=(a:number[])=>a.length?(a.reduce((x,y)=>x+y,0)/a.length).toFixed(2):'–';
 for(const arm of Object.keys(ARMS))console.log(arm.padEnd(9),`firstTry ${sum(arm,r=>r.firstTry?1:0).reduce((a,b)=>a+b,0)}/${rows.length}`,`ok ${sum(arm,r=>r.ok?1:0).reduce((a,b)=>a+b,0)}`,`median bytes ${med(sum(arm,r=>r.bytes))}`,`median tokens ${med(sum(arm,r=>r.tokens))}`,`median s ${med(sum(arm,r=>r.s))}`,`usefulness ${mean(sum(arm,r=>r.score?.usefulness??NaN).filter(Number.isFinite))}`,`faithfulness ${mean(sum(arm,r=>r.score?.faithfulness??NaN).filter(Number.isFinite))}`,`visual ${mean(sum(arm,r=>r.score?.visual??NaN).filter(Number.isFinite))}`);
 console.log('wins',JSON.stringify(rows.reduce((m:any,r)=>(m[r.winner??'ungraded']=(m[r.winner??'ungraded']??0)+1,m),{})),`catalog cost $${cost.toFixed(2)}`);
 for(const r of rows)console.log(r.case,r.winner,'—',r.why);
}

await ({extract,draw,render:renderAll,grade,report} as any)[phase]();

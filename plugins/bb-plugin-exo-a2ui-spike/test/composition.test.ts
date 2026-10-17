import {test} from 'node:test';import assert from 'node:assert/strict';
import {validateOffer,mapSpec,fallbacks,COMMIT,recoverOffer,type Offer} from '../composition/contract.ts';
import {offerParameters} from '../composition/tool-schema.ts';
import {Provider,JEV,choices,copyFrame} from '../composition/provider.ts';
import {compose,syntheticConversation} from '../composition/engine.ts';
import {applyDelta,latestSnapshot,moduleData,type Snapshot} from '../src/workspace.ts';
import {WorkspaceView} from '../src/workspace-view.ts';
const fixture=()=>validateOffer({surfaceId:'synthetic_lab',purpose:'Synthetic comparison only',candidates:[
 {id:'stack',description:'Outer vertical group',root:true,element:{type:'Column',props:{key:'outer'}}},
 ...['heading','inside','outside'].map(key=>({id:key,description:key,root:false,element:{type:'Text',props:{key,slot:key,variant:key==='heading'?'h2':'body'}}})),
 {id:'assumption',description:'Shared assumption field',root:false,element:{type:'TextField',props:{key:'assumption',label:'Assumption',path:'/assumption'}}},
 {id:'test',description:'Synthetic test request button last',root:false,element:{type:'Button',props:{key:'test',label:'Test assumption',event:'test_synthetic',context:{assumption:{path:'/assumption'}}}}},
 ],slots:Object.fromEntries(['heading','inside','outside'].map(k=>[k,{brief:k,fallback:`Source ${k}`} ])),data:{assumption:'Not submitted'},required:['heading','inside','outside','assumption','test']});
const request=(mode:'jev'|'haiku'|'haiku-both',baseRevision=0)=>({mode,baseRevision,runId:crypto.randomUUID(),prompt:'Compare alternatives; retain all required information and controls.'});
function answer(questions:any,omit?:string){return Object.fromEntries(Object.entries(questions).map(([k,q]:any)=>[k,k==='root'?'stack':k.startsWith('select_')?(Object.keys(q.criteria).find(s=>s.startsWith('use:')&&!s.endsWith(omit??'__never'))??'omit'):Object.keys(q.criteria)[0]]));}
function mock(offer:Offer,{omit,missingCopy=false,lateCopy=false}:{omit?:string;missingCopy?:boolean;lateCopy?:boolean}={}){
 const bodies:any[]=[];let release=()=>{};const gate=new Promise<void>(r=>release=r);let evals=0;
 const transport:typeof fetch=async(_url,init)=>{
  const b=JSON.parse(String(init?.body));bodies.push(b);
  if(b.model===JEV)return Response.json({model:JEV,answers:Object.fromEntries(Object.entries(answer(b.questions,omit)).map(([k,v])=>[k,{choice:v}])),usage:{input_tokens:100,cost:0.0000042}});
  const state=JSON.parse(b.messages[1].content),frames:any[]=[];
  if(state.questions){evals++;if(evals>1)release();frames.push({answers:answer(state.questions,omit)});}
  const slots=state.copy?.slots??state.slots;
  if(slots)for(const slot of Object.keys(slots).filter((_,i)=>!missingCopy||i>0))frames.push({slot,text:`Generated ${slot}`});
  const enc=new TextEncoder();return new Response(new ReadableStream({async start(c){
   for(let i=0;i<frames.length;i++){if(lateCopy&&state.copy&&i===1)await gate;c.enqueue(enc.encode('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify(frames[i])+'\n'}}]})+'\n\n'));}
   c.enqueue(enc.encode('data: '+JSON.stringify({usage:{prompt_tokens:100,completion_tokens:40,prompt_tokens_details:{cached_tokens:0},cost:0.00003}})+'\n\ndata: [DONE]\n\n'));c.close();
  }}),{headers:{'Content-Type':'text/event-stream'}});
 };
 return {provider:new Provider(performance.now(),transport,()=> 'MOCK_NOT_A_CREDENTIAL'),bodies};
}
const run=async(mode:'jev'|'haiku'|'haiku-both',options:any={})=>{const offer=fixture(),m=mock(offer,options);const result=await compose({offer,current:null,context:[{role:'user',text:'Synthetic alternatives'}],request:request(mode),signal:new AbortController().signal,fresh:()=>true,preview:()=>{},provider:m.provider});return {...m,result};};
test('contract is dynamic atomic vocabulary, rejects executable props, bad roots and lost binding contracts',()=>{
 const o=fixture();assert.equal(o.candidates.length,6);const bad=structuredClone(o);(bad.candidates[1].element.props as any).script='alert(1)';assert.throws(()=>validateOffer(bad));
 bad.candidates[1]=structuredClone(o.candidates[1]);bad.candidates[1].root=true;assert.throws(()=>validateOffer(bad));
 const missing=structuredClone(o);delete missing.data.assumption;assert.throws(()=>validateOffer(missing));
});
test('offered typed decisions and copy slots reject hallucinations, omissions, extra fields and input mutation',()=>{
 const q={a:{type:'choice' as const,instructions:'Choose',criteria:{x:'X'}}};assert.deepEqual(choices({a:'x'},q),{a:{choice:'x'}});
 assert.throws(()=>choices({a:'y'},q));assert.throws(()=>choices({},q));assert.throws(()=>choices({a:'x',b:'x'},q));
 assert.throws(()=>copyFrame({slot:'assumption',text:'overwrite'},fixture(),()=>{}));assert.throws(()=>copyFrame({slot:'heading',text:'copy',script:'no'},fixture(),()=>{}));
});
for(const mode of ['jev','haiku','haiku-both'] as const)test(`${mode}: real pinned composer, identical choice contract, complete A2UI mapping and accounted calls (MOCK transport)`,async()=>{
 const {result,bodies}=await run(mode);assert.equal(result.stopReason,'finish');const s=applyDelta(null,result.delta);assert.equal(s.incomplete,false);assert.deepEqual(moduleData(s,'synthetic_lab').copy,{heading:'Generated heading',inside:'Generated inside',outside:'Generated outside'});
 assert.equal(result.calls.length,mode==='haiku-both'?2:3);assert.ok(result.calls.every(c=>c.status==='complete'&&c.costUsd!==null));
 assert.ok(bodies.filter(b=>b.model===JEV).every(b=>b.state.context.conversation[0].text==='Synthetic alternatives'));assert.equal(s.revision,1);
});
test('Haiku combined lane starts dependent layout before its first response finishes streaming copy (MOCK)',async()=>{const {result}=await run('haiku-both',{lateCopy:true});assert.equal(result.calls.length,2);});
test('missing required candidate or copy fails rather than silently committing a plausible partial UI',async()=>{
 await assert.rejects(()=>run('jev',{omit:'assumption'}),/required information/);await assert.rejects(()=>run('haiku',{missingCopy:true}),/Incomplete composition or copy/);
});
test('stale generation aborts outstanding work and retains paid-attempt diagnostics instead of committing',async()=>{
 const o=fixture(),{provider}=mock(o);let failure:any;try{await compose({offer:o,current:null,context:[],request:request('jev'),signal:new AbortController().signal,fresh:()=>false,preview:()=>assert.fail('stale preview'),provider});}catch(e){failure=e;}
 assert.match(failure.message,/Stale composition generation/);assert.ok(failure.partial.calls.length>0);
});
test('explicit copy-only recovery reuses completed paid composition rather than reevaluating its choices',async()=>{
 const o=fixture(),first=await run('jev'),{provider,bodies}=mock(o);const result=await compose({offer:o,current:null,context:[],request:request('jev'),signal:new AbortController().signal,fresh:()=>true,preview:()=>{},provider,resume:{spec:first.result.spec,copy:fallbacks(o),received:[]}});
 assert.deepEqual(result.spec,first.result.spec);assert.equal(bodies.length,1);assert.equal(result.calls[0].kind,'copy');assert.equal(result.calls[0].status,'complete');
});
test('native custom composition delta reconstructs alongside existing successful apply_workspace results',async()=>{
 const {result}=await run('jev');const branch=[{type:'custom',customType:COMMIT,data:{delta:result.delta}},{type:'custom',customType:'exosurface-composition-run',data:{status:'complete'}}];assert.deepEqual(latestSnapshot(branch),applyDelta(null,result.delta));
});
test('retained processor, surface, input and unsent draft survive streamed copy and final native commit',async()=>{
 const o=fixture(),first=await run('jev');const initial=applyDelta(null,first.result.delta);const view=new WorkspaceView(()=>{},()=>{});view.accept({epoch:'test',checkpoint:initial,updates:[],preview:null});
 const processor=view.processor,surface=processor.getSurfaces().get('synthetic_lab')!;surface.dataModel.set('/assumption','UNSENT');const {provider}=mock(o);const req=request('jev',1);
 const result=await compose({offer:o,current:initial,context:[],request:req,signal:new AbortController().signal,fresh:()=>true,provider,preview:messages=>view.accept({epoch:'test',updates:[],preview:{toolCallId:req.runId,baseRevision:1,messages}})});
 view.accept({epoch:'test',updates:[result.delta],preview:null});assert.equal(view.processor,processor);assert.equal(processor.getSurfaces().get('synthetic_lab'),surface);assert.equal(surface.dataModel.get('/assumption'),'UNSENT');assert.equal(moduleData(view.committed!,'synthetic_lab').assumption,'Not submitted');assert.equal(view.drafts.edits.size,1);view.dispose();
});
test('real failed top-level JSON-string serialization is recoverable with exact native provenance; tool records now have explicit object schemas',()=>{
 assert.equal((offerParameters as any).properties.slots.type,'object');assert.equal((offerParameters as any).properties.data.type,'object');
 const o=fixture(),args={...o,slots:JSON.stringify(o.slots),data:JSON.stringify(o.data)},branch=[{message:{role:'assistant',content:[{type:'toolCall',id:'paid_call',name:'configure_composition',arguments:args}]}},{message:{role:'toolResult',toolCallId:'paid_call',toolName:'configure_composition',isError:true}}];
 const before=JSON.stringify(branch);assert.deepEqual(recoverOffer(branch,'paid_call'),o);assert.equal(JSON.stringify(branch),before);assert.throws(()=>recoverOffer(branch,'other'));assert.throws(()=>recoverOffer(branch.slice(0,1),'paid_call'));
});
test('earlier owner agenda/history is excluded from synthetic comparison context',()=>{
 const msg=(text:string)=>({message:{role:'user',content:[{type:'text',text}]}});assert.throws(()=>syntheticConversation([msg('Private agenda')]),/marker required/);
 assert.deepEqual(syntheticConversation([msg('Private agenda'),msg('JEV_SPIKE_SYNTHETIC: Compare fictional settings')]),[{role:'user',text:'JEV_SPIKE_SYNTHETIC: Compare fictional settings'}]);
});

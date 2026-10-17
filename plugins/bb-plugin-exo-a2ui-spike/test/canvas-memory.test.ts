import test from'node:test';import assert from'node:assert/strict';
import{applyDelta}from'../src/workspace.ts';
import{EXO_CATALOG}from'../src/exo-catalog.ts';
import{describeDelta,outlineCanvas,describePress,boundUpdates,describeComponent}from'../src/canvas-memory.ts';
const V='v0.9.1';
const s=applyDelta(null,{baseRevision:0,revision:1,messages:[{version:V,createSurface:{surfaceId:'tomorrow',catalogId:EXO_CATALOG}},{version:V,updateComponents:{surfaceId:'tomorrow',components:[
 {id:'root',component:'Column',children:['h','m','tf','run','note','go']},{id:'h',component:'Text',variant:'h1',text:'**Saturday**, as it stands'},{id:'m',component:'Metric',label:'Training this week',value:'under 10 h',tone:'risk',progress:.3},
 {id:'tf',component:'ChoicePicker',label:'Training hours so far',options:[{label:'Under 10',value:'lt10'},{label:'10–20',value:'mid'}],value:{path:'/tf'},variant:'mutuallyExclusive'},
 {id:'run',component:'CheckBox',label:'Run in the morning',value:{path:'/run'}},{id:'note',component:'TextField',label:'Anything fixed?',value:{path:'/fixed'}},
 {id:'go',component:'Button',variant:'primary',child:'goT',action:{event:{name:'adjust',context:{tf:{path:'/tf'},run:{path:'/run'},fixed:{path:'/fixed'},kind:'literal'}}}},{id:'goT',component:'Text',text:'Adjust tomorrow'}]}},
 {version:V,updateDataModel:{surfaceId:'tomorrow',value:{tf:[],run:false,fixed:''}}}],layout:{focus:'tomorrow'}});
test('What was shown is meaning only, bounded, with no layout JSON',()=>{
 const text=describeDelta(s,s.messages,{focus:'tomorrow'});
 assert.match(text,/^Showed on canvas — Saturday, as it stands \[tomorrow\]: new; Saturday, as it stands; Training this week: under 10 h 30%; choice "Training hours so far": Under 10 \/ 10–20; checkbox "Run in the morning"; text input "Anything fixed\?"; Adjust tomorrow; data \(all\)/);
 assert.ok(!/"component"|updateComponents|createSurface/.test(text));
 assert.ok(describeDelta(s,Array.from({length:30},()=>s.messages[1]),undefined,500).length<=500);
 assert.equal(describeComponent({component:'Row',children:[]}),'');
 assert.match(describeComponent({component:'Flow',nodes:[{id:'a',label:'Click'},{id:'b',label:'Reply'}],edges:[{from:'a',to:'b',label:'event'}]}),/Click → Reply \(event\)/);
});
test('Per-request outline: ids, types, meaning and values for the stage; titles for the rest; small',()=>{
 const two=applyDelta(s,{baseRevision:1,revision:2,messages:[{version:V,createSurface:{surfaceId:'old',catalogId:EXO_CATALOG}},{version:V,updateComponents:{surfaceId:'old',components:[{id:'root',component:'Text',variant:'h2',text:'Earlier plan'}]}},{version:V,updateDataModel:{surfaceId:'old',value:{}}}],layout:{focus:'tomorrow'}});
 const o=outlineCanvas(two);
 assert.match(o,/revision 2/);assert.match(o,/\[stage\] tomorrow "Saturday, as it stands" \(exo catalog\)/);assert.match(o,/ {4}tf ChoicePicker: choice "Training hours so far"/);
 assert.match(o,/data \{"tf":\[\],"run":false,"fixed":""\}/);assert.match(o,/\[earlier\] old "Earlier plan"/);
 assert.ok(!o.includes('"component"'));assert.ok(o.length<JSON.stringify(two).length/2);
});
test('A press reads as the person speaking, with labels; only changed bound values are committed by code',()=>{
 const action={surfaceId:'tomorrow',sourceComponentId:'go',context:{tf:['lt10'],run:true,fixed:'Run first, after a light meal',kind:'literal'}};
 assert.equal(describePress(s,action),'▸ Saturday, as it stands · Adjust tomorrow — Training hours so far: Under 10 · Run in the morning: yes · Anything fixed?: “Run first, after a light meal”');
 assert.deepEqual(boundUpdates(s,action),[{path:'/tf',value:['lt10']},{path:'/run',value:true},{path:'/fixed',value:'Run first, after a light meal'}]);
 assert.deepEqual(boundUpdates(s,{...action,context:{tf:[],run:false,fixed:'',kind:'literal'}}),[],'unchanged values are not re-committed');
});
test('Canvas document: one reducer for every change, fold equals replay, section equals outline (pi-durable shape)',async()=>{
 const{CANVAS_DOC,reduceCanvas,foldCanvas,canvasSection}=await import('../src/canvas-doc.ts');const{snapshotOutline}=await import('../src/canvas-memory.ts');
 assert.deepEqual({kind:CANVAS_DOC.kind,version:CANVAS_DOC.version,scope:CANVAS_DOC.scope,fork:CANVAS_DOC.fork},{kind:'exosurface.canvas',version:1,scope:'conversation',fork:'current'});
 assert.equal(CANVAS_DOC.initial(),null);assert.equal(canvasSection(null),null);
 const d1={baseRevision:0,revision:1,messages:s.messages,layout:{focus:'tomorrow'}},d2={baseRevision:1,revision:2,messages:[{version:V,updateDataModel:{surfaceId:'tomorrow',path:'/run',value:true}}]};
 const a=reduceCanvas(null,{source:'agent',delta:d1}),b=reduceCanvas(a,{source:'edit',delta:d2,mutationId:'m'});
 const branch=[{type:'message',message:{role:'toolResult',toolName:'apply_workspace',isError:false,details:{delta:d1}}},{type:'custom',customType:'exosurface-composition-commit',data:{source:'canvas-edit',delta:d2}}];
 assert.deepEqual(foldCanvas(branch),b,'reading the document = replaying its commits');
 assert.equal(canvasSection(b),snapshotOutline(b));assert.throws(()=>reduceCanvas(b,{source:'edit',delta:d2,mutationId:'m'}),/Stale/);
});

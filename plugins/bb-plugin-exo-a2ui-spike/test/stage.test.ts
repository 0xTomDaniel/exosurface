import test from'node:test';import assert from'node:assert/strict';
import{applyDelta,moduleIds,CATALOG,MAX_BYTES}from'../src/workspace.ts';
import{EXO_CATALOG,EXO_COMPONENTS}from'../src/exo-catalog.ts';
import{nextLayout,stagePlan,surfaceTitle}from'../src/stage.ts';
import{PRESENTATION_GUIDE,EXO_VOCABULARY}from'../src/presentation-guide.ts';
const V='v0.9.1',create=(id:string,catalogId=EXO_CATALOG)=>({version:V,createSurface:{surfaceId:id,catalogId}}),comps=(id:string,components:any[])=>({version:V,updateComponents:{surfaceId:id,components}}),data=(id:string,value:any={},path?:string)=>({version:V,updateDataModel:{surfaceId:id,...(path?{path}:{}),value}});
const surface=(id:string,title:string,extra:any[]=[],catalogId=EXO_CATALOG)=>[create(id,catalogId),comps(id,[{id:'root',component:'Column',children:['h',...extra.filter(e=>!extra.some(x=>x.child===e.id)).map(e=>e.id)]},{id:'h',component:'Text',variant:'h1',text:title},...extra]),data(id)];
const step=(s:any,messages:any[],layout?:any)=>applyDelta(s,{baseRevision:s?.revision??0,revision:(s?.revision??0)+1,messages,...(layout?{layout}:{})});
test('A new topic takes the stage; earlier surfaces recede but stay intact',()=>{
 let s=step(null,surface('day','Saturday plan',[],CATALOG),{columns:2,wide:['day']});assert.equal(s.layout!.focus,'day');
 s=step(s,surface('trip','Weekend trip'));assert.equal(s.layout!.focus,'trip');assert.deepEqual(moduleIds(s),['day','trip']);
 const plan=stagePlan(moduleIds(s),s.layout,null);assert.deepEqual(plan,{mode:'stage',focus:'trip',beside:[],receded:['day']});
});
test('Data-only updates (applying submitted values) do not move the stage; redesign does',()=>{
 let s=step(null,surface('a','A'));s=step(s,surface('b','B'));
 s=step(s,[data('a','x','/note')]);assert.equal(s.layout!.focus,'b');
 s=step(s,[comps('a',[{id:'h',component:'Text',variant:'h1',text:'A, revisited'}])]);assert.equal(s.layout!.focus,'a');
});
test('Explicit focus/beside win; beside is bounded, excludes focus, and survives deletion safely',()=>{
 let s=step(null,[...surface('a','A'),...surface('b','B'),...surface('c','C')],{focus:'a',beside:['b','a']});
 assert.equal(s.layout!.focus,'a');assert.deepEqual(s.layout!.beside,['b']);
 assert.throws(()=>step(s,[data('a',{})],{focus:'a',beside:['b','c','a']}));
 s=step(s,[{version:V,deleteSurface:{surfaceId:'a'}}]);assert.equal(s.layout!.focus,'b');assert.equal(s.layout!.beside,undefined);
 assert.throws(()=>step(s,[data('b',{})],{focus:'missing'}));
});
test('Owner shelf pick is temporary: it lapses when Exo moves the stage',()=>{
 const ids=['a','b','c'],layout={focus:'c',beside:['b']};
 assert.deepEqual(stagePlan(ids,layout,{id:'a',nativeFocus:'c'}),{mode:'stage',focus:'a',beside:['b'],receded:['c']});
 assert.equal((stagePlan(ids,{focus:'b'},{id:'a',nativeFocus:'c'}) as any).focus,'b');
 assert.deepEqual(stagePlan(ids,undefined,null),{mode:'grid',all:ids});
 assert.equal(nextLayout(undefined,undefined,[],[]),undefined);
});
test('Exo visual vocabulary validates real shapes and rejects incoherent ones',()=>{
 const good=[{id:'c',component:'Callout',tone:'decision',title:'Pick one',text:'Weekly **wins** for mixed readers.'},{id:'m',component:'Metric',label:'Readers',value:'6',progress:.5},{id:'t',component:'Timeline',items:[{label:'Read',state:'done'},{label:'Meet',state:'now',when:'Thu'}]},{id:'tb',component:'Table',columns:['','Weekly','Monthly'],rows:[{cells:['Pace','Even','Uneven'],tone:'good'}],highlightColumn:1},{id:'ch',component:'Chart',kind:'line',unit:'%',points:[{label:'Mon',value:20},{label:'Tue',value:45}]},{id:'f',component:'Flow',nodes:[{id:'a',label:'Draft'},{id:'b',label:'Review'}],edges:[{from:'a',to:'b'},{from:'b',to:'a',label:'revise'}]},{id:'d',component:'Disclosure',title:'Why',child:'dt'},{id:'dt',component:'Text',text:'Because.'}];
 const s=step(null,surface('viz','Viz',good));assert.equal(moduleIds(s).length,1);
 const bad=[{component:'Table',columns:['x'],rows:[{cells:['1','2']}]},{component:'Table',columns:['x'],rows:[{cells:['1']}],highlightColumn:3},{component:'Flow',nodes:[{id:'a',label:'A'},{id:'a',label:'B'}],edges:[]},{component:'Flow',nodes:[{id:'a',label:'A'}],edges:[{from:'a',to:'a'}]},{component:'Chart',kind:'pie',points:[{label:'a',value:1}]},{component:'Chart',kind:'bar',max:5,points:[{label:'a',value:9}]},{component:'Timeline',items:[]},{component:'Metric',label:'x',value:'1',url:'https://example.com'},{component:'Callout',text:{call:'evil'}}];
 for(const b of bad)assert.throws(()=>step(s,[comps('viz',[{id:'h',...b}])]),JSON.stringify(b));
 assert.throws(()=>step(s,[...surface('old','Old',[{id:'c2',component:'Callout',text:'x'}],CATALOG)]),/requires a surface created with catalogId/);
 assert.deepEqual([...EXO_COMPONENTS].sort(),['Callout','Chart','Disclosure','Flow','Metric','Table','Timeline']);
});
test('Shelf titles come from the first heading, without markdown',()=>{
 assert.equal(surfaceTitle([{id:'x',component:'Text',variant:'body',text:'body'},{id:'h',component:'Text',variant:'h2',text:'**Next** spike'}],'spike'),'Next spike');
 assert.equal(surfaceTitle([],'reading_group'),'Reading group');
});
test('Presentation guide carries the agreed principles to the model',()=>{
 for(const phrase of['THE STAGE FOLLOWS THE CONVERSATION','Overview first, zoom and filter, details on demand','CHAT COMPLEMENTS THE CANVAS','remove every sentence whose information is already visible','do not mention revision numbers','pure visual context','Do not build wizards','CHANGE CAUTIOUSLY','No redundancy','Never rely on colour alone',EXO_CATALOG])assert.ok(PRESENTATION_GUIDE.includes(phrase),phrase);
 for(const c of EXO_COMPONENTS)assert.ok(EXO_VOCABULARY.includes(c+':'),c);
 assert.ok(MAX_BYTES>=40*1024);
});

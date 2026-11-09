import './isolation.ts';
// Issue #31: what a person types into a textbox must reach Exo in full; any bound is stated, never silent.
import test from 'node:test';import assert from 'node:assert/strict';
import{applyDelta,validateAction,MAX_TEXT,MAX_ACTION}from'../src/workspace.ts';
import{EXO_CATALOG}from'../src/exo-catalog.ts';
import{describePress,describeEdits,snapshotOutline}from'../src/canvas-memory.ts';
const V='v0.9.1';
const label='A very long label that explains exactly what to write here, far longer than sixty characters';
const page=(boxes=1)=>applyDelta(null,{baseRevision:0,revision:1,messages:[{version:V,createSurface:{surfaceId:'ct',catalogId:EXO_CATALOG}},{version:V,updateComponents:{surfaceId:'ct',components:[
 {id:'root',component:'Column',children:[...Array.from({length:boxes},(_,i)=>`n${i}`),'go']},
 ...Array.from({length:boxes},(_,i)=>({id:`n${i}`,component:'TextField',label:i?`Note ${i}`:label,value:{path:`/n${i}`},variant:'longText'})),
 {id:'go',component:'Button',variant:'primary',child:'goT',action:{event:{name:'apply',context:Object.fromEntries(Array.from({length:boxes},(_,i)=>[`n${i}`,{path:`/n${i}`}]))}}},{id:'goT',component:'Text',text:'Apply batch 2'}]}},
 {version:V,updateDataModel:{surfaceId:'ct',value:Object.fromEntries(Array.from({length:boxes},(_,i)=>[`n${i}`,'']))}}],layout:{focus:'ct'}});
// 1,000+ characters, several lines, with the 25 Oct ending that was lost after character 300.
const NOTE=('Keep these in C7 for now.\n'+'x'.repeat(40)+' ').repeat(14)+'Keep active in C7 -- just because it isn\'t checked, doesn\'t mean me close it';
const press=(context:Record<string,unknown>)=>({name:'apply',surfaceId:'ct',sourceComponentId:'go',timestamp:new Date(0).toISOString(),context});

test('#31 a 1,000-character multiline note reaches Exo in full, newlines intact',()=>{
 assert.ok(NOTE.length>=1000&&NOTE.includes('\n'));
 const s=page(),a=validateAction(s,1,press({n0:NOTE})),line=describePress(s,a);
 assert.ok(line.includes(`“${NOTE}”`),'whole note, verbatim');
 assert.ok(line.endsWith('doesn\'t mean me close it”'));
 assert.ok(!line.includes(NOTE.slice(0,300)+'…'),'typed note has no silent cut marker (labels may be abbreviated)');
});
test('#31 the largest single box a press accepts is passed through whole',()=>{
 const big='y'.repeat(MAX_TEXT-1)+'Z',s=page(),line=describePress(s,validateAction(s,1,press({n0:big})));
 assert.ok(line.includes(`“${big}”`));
});
test('#31 labels may be shortened, the person\'s value never is',()=>{
 const s=page(),line=describePress(s,press({n0:NOTE}));
 assert.ok(!line.includes(label),'long label is shortened');assert.ok(line.includes(NOTE));
});
test('#31 a box over the text limit is refused with a clear reason before anything is sent',()=>{
 const s=page();
 assert.throws(()=>validateAction(s,1,press({n0:'z'.repeat(MAX_TEXT+1)})),(e:Error)=>e.message.includes(`${MAX_TEXT+1} characters`)&&e.message.includes(`${MAX_TEXT}`)&&e.message.includes('A very long label')&&!/ZodError|too_big/.test(e.message));
});
test('#31 a press over the action bound is refused with its size, never trimmed',()=>{
 const n=Math.ceil(MAX_ACTION/MAX_TEXT)+1,s=page(n),context=Object.fromEntries(Array.from({length:n},(_,i)=>[`n${i}`,'w'.repeat(MAX_TEXT)]));
 assert.throws(()=>validateAction(s,1,press(context)),(e:Error)=>/Press is \d+ characters; the most one press can send is 16384/.test(e.message));
});
test('#31 the person\'s page edits reach Exo in full as well',()=>{
 const s=page(),d={messages:[{version:V,updateDataModel:{surfaceId:'ct',path:'/n0',value:NOTE}}]},b=applyDelta(s,{baseRevision:1,revision:2,...d});
 const [line]=describeEdits(b,[d]);assert.ok(line.endsWith(NOTE),'whole edit');assert.ok(!line.endsWith('…'));
});
test('#31 an over-long canvas outline says it was cut and how to read the rest',()=>{
 const s=applyDelta(page(),{baseRevision:1,revision:2,messages:[{version:V,updateDataModel:{surfaceId:'ct',path:'/n0',value:NOTE}}]});
 const out=snapshotOutline(s,undefined,600);
 assert.match(out,/\[outline cut at 600 of \d+ characters; read_exosurface ct shows the page in full\]$/);
 assert.ok(!snapshotOutline(s).includes('[outline cut'),'default bound fits a normal page');
});

// Source/reducer checks only. These do NOT establish native packaged-product acceptance.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {snapshotToA2ui} from '../legacy/surface/src/snapshot-format.ts';
import {validateSnapshot,validateAction,moduleNodes,moduleData} from '../legacy/surface/src/workspace.ts';
import {boundUpdates,describePress} from '../legacy/surface/src/canvas-memory.ts';
import {planData,planRestore,assertOwnerCommand} from '../legacy/surface/src/canvas-input.ts';
import {versionsOf,replayHistory} from '../legacy/surface/src/canvas-history.ts';
const source='- region "Fixture" [ref=page]:\n  - textbox "Full input" [ref=entry] [multiline]: initial\n  - button "Send" [ref=send] [action=submit] [sends=entry]';
const initial=()=>validateSnapshot({revision:1,messages:snapshotToA2ui(source)});
const value=('Line α 🧪 e\u0301\n').repeat(90); // 1170 UTF-16 units; >1000 code points, within the press bound.
const mutationId='00000000-0000-4000-8000-000000000001';
function action(s:ReturnType<typeof initial>,text:string){const offered=moduleNodes(s,'page').find(n=>n.id==='send').action.event;return {...offered,surfaceId:'page',sourceComponentId:'send',timestamp:'2000-01-01T00:00:00.000Z',context:{entry:text}};}
test('complete Unicode/multiline press description and native history replay are lossless',()=>{
 const s=initial(),before=JSON.stringify(s),a=validateAction(s,1,action(s,value));
 assert.ok([...value].length>1000);assert.ok(value.length<2000);
 assert.ok(describePress(s,a).includes(`“${value}”`));
 const r={revision:1,surfaceId:'page',updates:boundUpdates(s,a),mutationId,source:'press' as const};
 const {delta,next}=planData(s,r);assert.equal(JSON.stringify(s),before);
 const replayed=replayHistory([{type:'custom',customType:'exosurface-workspace-reset',data:{workspace:s}},{type:'custom',customType:'exosurface-composition-commit',data:{source:'canvas-press',delta}}]);
 assert.deepEqual(replayed.current,next);assert.equal(moduleData(next,'page').entry,value);
 const v=versionsOf(s,next,delta,'press','2000-01-01T00:00:00.000Z')[0];
 const restored=planRestore(s,v,{surfaceId:'page',revision:v.revision,updates:[],mutationId});
 assert.equal(moduleData(restored.next,'page').entry,value);assert.equal(JSON.stringify(s),before);
});
test('oversize atoms and whole owner commands reject before touching the original snapshot',()=>{
 const s=initial(),before=JSON.stringify(s);
 assert.doesNotThrow(()=>assertOwnerCommand({text:'中'.repeat(5000)})); // UTF-8 bytes are not the owner-command unit.
 assert.equal(JSON.stringify(s),before);
});
test('prospective whole-workspace and historical restore validation reject without mutation',()=>{
 let s:ReturnType<typeof initial>|undefined;
 // Choose the last valid bounded fixture, rather than assuming serialized metadata overhead.
 for(let width=1000;width<2000;width+=25){try{s=validateSnapshot({revision:1,messages:snapshotToA2ui(source+'\n'+Array.from({length:20},()=>`  - text: ${'x'.repeat(width)}`).join('\n'))});}catch{break;}}
 assert.ok(s);const before=JSON.stringify(s),r={revision:1,surfaceId:'page',updates:[{path:'/entry',value:'中'.repeat(2000)}],mutationId,source:'press' as const};
 assert.doesNotThrow(()=>assertOwnerCommand(r));
 assert.throws(()=>planData(s!,r),/Workspace exceeds/);assert.equal(JSON.stringify(s),before);
 const small=initial(),{delta,next}=planData(small,{...r,updates:[{path:'/entry',value:'remembered'}]});
 const v=versionsOf(small,next,delta,'press','2000-01-01T00:00:00.000Z')[0];
 assert.equal(moduleData(small,'page').entry,'initial');
});

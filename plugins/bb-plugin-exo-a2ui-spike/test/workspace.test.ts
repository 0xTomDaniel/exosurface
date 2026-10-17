import test from 'node:test';import assert from 'node:assert/strict';
import {validateSnapshot,validateAction,latestSnapshot,MAX_BYTES} from '../src/workspace.ts';
import {sampleMessages} from './sample.ts';
import {readFileSync} from 'node:fs';
const snap=()=>({revision:1,messages:sampleMessages()});
test('Real official A2UI processor validates two bound basic-catalog surfaces',()=>assert.equal(validateSnapshot(snap()).messages.length,6));
test('Invalid components, scripts, oversized state, unreachable nodes and cycles rejected',()=>{
 for(const mutate of [
  (s:any)=>s.messages[1].updateComponents.components[1].component='WebView',
  (s:any)=>s.messages[1].updateComponents.components[1].text={call:'eval',args:{code:'bad'}},
  (s:any)=>s.messages[2].updateDataModel.value.description='x'.repeat(MAX_BYTES),
  (s:any)=>s.messages[1].updateComponents.components.push({id:'orphan',component:'Text',text:'bad'}),
  (s:any)=>s.messages[1].updateComponents.components[0].children.push('root'),
 ]){const s=snap();mutate(s);assert.throws(()=>validateSnapshot(s));}
});
test('Action bound to current revision and offered component/value; stale/spoofed rejected',()=>{
 const s=validateSnapshot(snap()),a={name:'choose_focus',surfaceId:'agenda',sourceComponentId:'choose',timestamp:new Date().toISOString(),context:{value:'Prototype canvas'}};
 assert.deepEqual(validateAction(s,1,a),a);assert.throws(()=>validateAction(s,0,a));assert.throws(()=>validateAction(s,1,{...a,context:{value:'other'}}));assert.throws(()=>validateAction(s,1,{...a,surfaceId:'decision'}));
});
test('Rebuild latest UI from successful native branch publications, not failed/old results',()=>{
 const s=snap();assert.deepEqual(latestSnapshot([{message:{role:'toolResult',toolName:'publish_workspace',isError:false,details:{workspace:s}}},{message:{role:'toolResult',toolName:'publish_workspace',isError:true}}]),s);assert.equal(latestSnapshot([]),null);
});
test('Clone routes cannot select main owner/home or whole-history startup',()=>{
 const state=readFileSync(new URL('../src/state.ts',import.meta.url),'utf8');assert.ok(state.includes("'.optchat-exo-a2ui'"));assert.ok(!state.includes("'.optchat-exocortex-test'"));
 const client=readFileSync(new URL('../src/owner-client.ts',import.meta.url),'utf8');assert.ok(client.includes('local.exocortex.a2ui-owner'));assert.ok(!client.includes('local.exocortex.exo-owner'));
 const extension=readFileSync(new URL('../src/workspace-extension.ts',import.meta.url),'utf8');assert.ok(extension.includes("process.env.OPTCHAT_HOME!==CANONICAL_HOME"));const frame=readFileSync(new URL('../src/workspace-frame.ts',import.meta.url),'utf8');assert.ok(frame.includes("pi.on('context_with_system'"));assert.ok(frame.includes('exactFramePresent:found'));assert.ok(frame.includes("process.env.OPTCHAT_HOME!==CANONICAL_HOME"));
});

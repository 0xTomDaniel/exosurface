import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { replayJournalSuffix } from '../src/journal.ts';
test('suffix replay skips old history, restores reports/tools and preserves opaque signatures', () => {
 const dir=mkdtempSync(join(tmpdir(),'exo-journal-test-'));const file=join(dir,'test.jsonl');
 try {
  const prefix=Array.from({length:12000},(_,i)=>JSON.stringify({type:'message',message:{role:'assistant',content:[{type:'text',text:`old ${i} ${'x'.repeat(700)}`} ]}})+'\n').join('');
  const assistant={role:'assistant',content:[{type:'thinking',thinking:'private reasoning',thinkingSignature:'opaque'}, {type:'toolCall',id:'call1',name:'read',arguments:{path:'a\u2028b'}},{type:'text',text:'actual suffix'}],stopReason:'toolUse'};
  const records=[{type:'message',message:assistant},{type:'message',message:{role:'toolResult',toolCallId:'call1',toolName:'read',isError:false,content:[{type:'text',text:'result'}]}},{type:'custom_message',customType:'optchat.agent_report',content:'native report',display:true}];
  writeFileSync(file,prefix+records.map(r=>JSON.stringify(r)+'\n').join(''));const events:any[]=[];
  const r=replayJournalSuffix(file,Buffer.byteLength(prefix),statSync(file).size,e=>events.push(e));assert.equal(r.opened,true);
  assert.deepEqual(events.find(e=>e.type==='message_start').message,assistant);
  assert.ok(events.some(e=>e.type==='tool_execution_end'&&e.toolCallId==='call1'));
  assert.ok(events.some(e=>e.message?.customType==='optchat.agent_report'));assert.ok(!JSON.stringify(events).includes('old 11999'));
  assert.throws(()=>replayJournalSuffix(file,statSync(file).size+1,statSync(file).size,()=>{}));
 } finally {rmSync(dir,{recursive:true,force:true});}
});

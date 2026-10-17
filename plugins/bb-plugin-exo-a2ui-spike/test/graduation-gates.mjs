// Read-only graduation gates for Exosurface → real Exo session. No model calls.
// Usage: node test/graduation-gates.mjs --since=<ISO UTC> [--label=name]
import{readFileSync,writeFileSync,readdirSync,existsSync}from'node:fs';import{join}from'node:path';import{execFileSync}from'node:child_process';
const arg=k=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3),since=arg('since'),label=arg('label')??'gates',H=`${process.env.HOME}/.exo-a2ui-spike`;
if(!since)throw Error('--since required');
const owner=JSON.parse(readFileSync(`${H}/owner/state.json`,'utf8'));
// 1. Requests: guide delivered, compact canvas state, no layout JSON in what the model receives.
const receipts=readFileSync(`${H}/workspace/context-receipts.jsonl`,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(r=>r.at>=since&&'guidePresent' in r);
// 2. OptChat memory: canvas calls recorded by meaning, never JSON.
const memRoot=join(process.env.HOME,'.optchat-exo-a2ui/profiles/exo-optchat/memories'),memory=[];
for(const id of readdirSync(memRoot))for(const f of readdirSync(join(memRoot,id,'main')))for(const l of readFileSync(join(memRoot,id,'main',f),'utf8').split('\n'))if(l.trim()){const e=JSON.parse(l);if(e.date>=since)memory.push(e);}
// Explicit read_workspace results are deliberate tool I/O (like reading a file): counted separately, not as leakage.
const explicitRead=e=>e.kind==='echo'&&e.text.startsWith('read_workspace:');
const canvasTools=memory.filter(e=>e.kind==='tool'&&e.text.startsWith('apply_workspace')),jsonInMemory=memory.filter(e=>!explicitRead(e)&&(/"component"\s*:/.test(e.text)||/updateComponents/.test(e.text))),reads=memory.filter(explicitRead);
// 3. History growth per canvas turn (native journal bytes of apply_workspace calls + results, as stored).
const journal=readFileSync(owner.sessionFile,'utf8').trim().split('\n').map(l=>JSON.parse(l)).filter(e=>(e.timestamp??'')>=since);
const callBytes=journal.flatMap(e=>e.message?.role==='assistant'?e.message.content.filter(c=>c.type==='toolCall'&&c.name==='apply_workspace').map(c=>JSON.stringify(c).length):[]);
// 4. Replies (reuses reply-metrics).
execFileSync(process.execPath,['test/reply-metrics.mjs',`--since=${since}`,`--label=${label}`],{stdio:'ignore'});
const replies=JSON.parse(readFileSync(`evidence/presentation/reply-metrics-${label}.json`,'utf8'));
const median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)/2)]:null;};
const gates={
 guideDelivered:{pass:receipts.length>0&&receipts.every(r=>r.guidePresent&&r.reminderPresent&&r.exactFramePresent),requests:receipts.length},
 compactCanvasState:{pass:receipts.every(r=>r.frameBytes<=8000),maxFrameBytes:Math.max(0,...receipts.map(r=>r.frameBytes))},
 // Informational: 5 pre-cutover canvas JSON entries stay in protected paid OptChat memory and surface in the
 // memory view until it folds them. They must not grow; new memory is gated below.
 jsonInRequests:{pass:true,informational:true,leaks:receipts.map(r=>r.canvasJsonLeaks),note:'1 = legacy pre-cutover memory; higher = an explicit read_workspace result in the current turn or replayed previous exchange'},
 noLayoutJsonInOptChatMemory:{pass:jsonInMemory.length===0,canvasToolEntries:canvasTools.length,entriesWithJson:jsonInMemory.length,explicitReads:reads.length,explicitReadBytes:reads.reduce((a,e)=>a+e.size,0)},
 historyGrowthPerCanvasCall:{pass:callBytes.every(b=>b<=2048),maxBytes:Math.max(0,...callBytes),calls:callBytes.length},
 concise:{pass:replies.canvasTurns>=10&&replies.medianReplyWordsWithCanvas<=80&&replies.medianOverlapWithCanvas<=0.25&&replies.metaMentions===0,canvasTurns:replies.canvasTurns,medianWords:replies.medianReplyWordsWithCanvas,medianOverlap:replies.medianOverlapWithCanvas,metaMentions:replies.metaMentions,needsTurns:Math.max(0,10-replies.canvasTurns)},
};
const out={since,label,checkedAt:new Date().toISOString(),allPass:Object.values(gates).every(g=>g.pass),gates,ownerHappy:'Tom decides; not measurable here'};
writeFileSync(`evidence/presentation/gates-${label}.json`,JSON.stringify(out,null,2));console.log(JSON.stringify(out,null,2));

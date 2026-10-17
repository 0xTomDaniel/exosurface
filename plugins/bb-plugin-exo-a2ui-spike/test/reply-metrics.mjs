// Read-only reply/canvas overlap metrics from the clone journal. No model calls.
// Usage: node test/reply-metrics.mjs --since=<ISO> [--label=name]
// overlap = share of the reply's longer words (>4 chars) that also appear in the
// canvas text written that turn: a rough redundancy signal, not a quality score.
import{readFileSync,writeFileSync}from'node:fs';
const arg=k=>process.argv.find(a=>a.startsWith(`--${k}=`))?.slice(k.length+3);
const since=arg('since')??'1970',label=arg('label')??'metrics',H=`${process.env.HOME}/.exo-a2ui-spike`;
const file=JSON.parse(readFileSync(`${H}/owner/state.json`,'utf8')).sessionFile;
const entries=readFileSync(file,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter(e=>(e.timestamp??'')>=since);
const KEYS=new Set(['text','label','title','summary','detail','caption','cells','columns','when','items','rows','points','nodes','options','components','messages','updateComponents','tabs']);
const words=s=>s.toLowerCase().match(/[a-z0-9$%.,'’-]+/g)?.map(w=>w.replace(/^[.,'’-]+|[.,'’-]+$/g,'')).filter(Boolean)??[];
const canvasText=v=>{const out=[];const walk=x=>{if(typeof x==='string')out.push(x);else if(Array.isArray(x))x.forEach(walk);else if(x&&typeof x==='object')for(const[k,y]of Object.entries(x))if(KEYS.has(k))walk(y);};walk(v);return out.join(' ');};
// Narration the guide forbids. Briefly pointing at the canvas is allowed.
const META=[/\brevision\s+\d+/i,/\btest (ui|version|clone)\b/i,/\b(isolated|test) clone\b/i,/nothing (real|was) (changed|booked|written)/i];
const turns=[];let cur=null;
for(const e of entries){const m=e.message;if(!m)continue;
 if(m.role==='user'){const t=typeof m.content==='string'?m.content:m.content.filter(c=>c.type==='text').map(c=>c.text).join(' ');cur={at:e.timestamp,user:t.slice(0,80).replace(/\s+/g,' '),canvas:'',reply:''};turns.push(cur);}
 else if(m.role==='assistant'&&cur)for(const c of m.content){if(c.type==='toolCall'&&c.name==='apply_workspace'&&!c.arguments?.messages?.[0]?.omitted)cur.canvas+=' '+canvasText(c.arguments);if(c.type==='text')cur.reply+=c.text+'\n';}
 // Canvas calls are logged by meaning since 2026-10-15; the full update lives in the tool result's details.
 else if(m.role==='toolResult'&&(m.toolName==='apply_workspace'||m.toolName==='update_exosurface')&&!m.isError&&cur&&m.details?.delta)cur.canvas+=' '+canvasText(m.details.delta);}
const rows=turns.map(t=>{const rw=words(t.reply),cw=new Set(words(t.canvas)),long=rw.filter(w=>w.length>4);
 return{at:t.at,user:t.user,canvasChanged:!!t.canvas.trim(),replyWords:rw.length,canvasWords:words(t.canvas).length,overlap:long.length?+(long.filter(w=>cw.has(w)).length/long.length).toFixed(2):0,metaMentions:META.map(r=>(t.reply.match(new RegExp(r,'gi'))??[]).length).reduce((a,b)=>a+b,0)};});
const withCanvas=rows.filter(r=>r.canvasChanged),median=a=>{const s=[...a].sort((x,y)=>x-y);return s.length?s[Math.floor((s.length-1)/2)]:null;};
const summary={label,since,turns:rows.length,canvasTurns:withCanvas.length,medianReplyWordsWithCanvas:median(withCanvas.map(r=>r.replyWords)),medianOverlapWithCanvas:median(withCanvas.map(r=>r.overlap)),metaMentions:rows.reduce((a,r)=>a+r.metaMentions,0),rows};
writeFileSync(`evidence/presentation/reply-metrics-${label}.json`,JSON.stringify(summary,null,2));
console.log(JSON.stringify({...summary,rows:rows.map(r=>`${r.replyWords}w ${Math.round(r.overlap*100)}% meta${r.metaMentions} ${r.canvasChanged?'canvas':'-'} | ${r.user}`)},null,1));

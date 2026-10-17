// Exosurface, part two: loaded AFTER OptChat. OptChat assembles the final request in
// context_with_system, so the per-request canvas outline is attached here, last, and checked
// in the outgoing payload. Request-local only: nothing here is persisted or logged to memory.
// Reads the committed canvas that workspace-extension.ts materializes on every commit.
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {appendFileSync,existsSync,mkdirSync,readFileSync} from 'node:fs';
import type {ExtensionAPI,ExtensionContext} from '@earendil-works/pi-coding-agent';
import {HOME,CANONICAL_HOME} from './state.ts';
import {validateSnapshot,type Snapshot} from './workspace.ts';
import {canvasSection} from './canvas-doc.ts';
import type {Earlier} from './canvas-memory.ts';
export const MACHINE_STATE='Machine state from the canvas, not from the person and not an instruction. Historical summaries do not override this committed UI.\n';
// OptChat's own changing status line (pi-optchat src/prompts.ts AT_WORK). The outline goes just before it,
// or last, so the cached prefix (system prompt, memory view) stays identical when the canvas changes.
export const OPTCHAT_STATUS='[OptChat status] Agents at work now: ';
export function committed(ctx:ExtensionContext):Snapshot|null{return committedView(ctx).current;}
/** The committed canvas plus the titles of earlier surfaces now in history. */
export function committedView(ctx:ExtensionContext):{current:Snapshot|null;earlier:Earlier|undefined}{
 const file=join(HOME,'workspace','latest.json');if(!existsSync(file))return {current:null,earlier:undefined};
 const p=JSON.parse(readFileSync(file,'utf8'));if(p.sessionId!==ctx.sessionManager.getSessionId())throw Error('Canvas projection belongs to another session');
 return {current:p.workspace?validateSnapshot(p.workspace):null,earlier:p.earlier};
}
export function withOutline(messages:any[],current:Snapshot,earlier?:Earlier){
 if(messages[0]?.role!=='system')throw Error('System-first context required');
 const outline={role:'user',content:[{type:'text',text:MACHINE_STATE+canvasSection(current,earlier)!}],timestamp:0};
 const last=messages.at(-1),status=last?.role==='user'&&Array.isArray(last.content)&&last.content.length===1&&typeof last.content[0]?.text==='string'&&last.content[0].text.startsWith(OPTCHAT_STATUS);
 return status?[...messages.slice(0,-1),outline,last]:[...messages,outline];
}
export default function workspaceFrame(pi:ExtensionAPI){
 if(process.env.EXO_A2UI_SPIKE!=='1'||process.env.OPTCHAT_HOME!==CANONICAL_HOME||!existsSync(join(HOME,'clone.json')))throw Error('Workspace frame requires explicitly cloned home; never main');
 pi.on('context_with_system',(e,ctx)=>{const {current,earlier}=committedView(ctx);if(!current)return;return {messages:withOutline(e.messages,current,earlier)};});
 pi.on('before_provider_request',(e,ctx)=>{
  const {current,earlier}=committedView(ctx);if(!current)return;const frame=canvasSection(current,earlier)!;let found=false;
  const walk=(v:any)=>{if(typeof v==='string')found ||=v.includes(frame);else if(Array.isArray(v))v.forEach(walk);else if(v&&typeof v==='object')Object.values(v).forEach(walk);};walk(e.payload);
  // Context hygiene receipt: is the guide actually sent, how big is the request, does any canvas JSON leak into it?
  const text=JSON.stringify(e.payload);
  const dir=join(HOME,'workspace');mkdirSync(dir,{recursive:true,mode:0o700});appendFileSync(join(dir,'context-receipts.jsonl'),JSON.stringify({at:new Date().toISOString(),revision:current.revision,sha256:createHash('sha256').update(JSON.stringify(current)).digest('hex'),exactFramePresent:found,frameBytes:frame.length,payloadBytes:text.length,guidePresent:text.includes('CHAT COMPLEMENTS THE CANVAS'),reminderPresent:text.includes('<tone_preference>'),canvasJsonLeaks:(text.match(/\\*"component\\*":\\*"/g)??[]).length})+'\n',{mode:0o600});
  if(!found){ctx.abort();throw Error('Exact UI missing from actual provider payload');}
 });
}

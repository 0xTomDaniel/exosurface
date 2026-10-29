// Surfaces as conversation history: every version of every surface, derived from the
// native session (never a second source of truth), plus the system's rule for keeping
// the live canvas small. The agent never manages the past; nothing is ever deleted.
import {applyDelta,moduleIds,moduleNodes,validateSnapshot,MAX_BYTES,MAX_SURFACES,RESET,PUBLICATION,UPDATE,SURFACE_UPDATE_TOOL,type Snapshot,type Delta} from './workspace.ts';
import {surfaceTitle} from './stage.ts';

export type Action='drew'|'edited'|'changed'|'brought back'|'retired'|'withdrawn';
export type Version={revision:number;at:string;surface:string;title:string;action:Action;messages:any[]};

const surfaceMessages=(s:Snapshot,id:string)=>s.messages.filter(m=>(m.createSurface??m.updateComponents??m.updateDataModel)?.surfaceId===id);
const touched=(delta:Delta)=>{const t=new Set<string>(),created=new Set<string>(),deleted=new Set<string>();
 for(const m of delta.messages){const b=m.createSurface??m.updateComponents??m.updateDataModel??m.deleteSurface;if(!b)continue;if(m.deleteSurface)deleted.add(b.surfaceId);else{t.add(b.surfaceId);if(m.createSurface)created.add(b.surfaceId);}}
 return {t,created,deleted};};

/** Versions produced by one committed change. `cards` (from the tool result) names the agent's actions. */
export function versionsOf(prev:Snapshot|null,next:Snapshot,delta:Delta,source:'agent'|'edit'|'press'|'restore'|'system',at:string,cards?:{surface:string;action:Action}[],retired:string[]=[]):Version[]{
 const {t,created,deleted}=touched(delta),out:Version[]=[],live=new Set(moduleIds(next));
 for(const id of t)if(live.has(id)){
  const action:Action=cards?.find(c=>c.surface===id)?.action??(source==='agent'?(created.has(id)?'drew':'edited'):source==='restore'?'brought back':'changed');
  out.push({revision:next.revision,at,surface:id,title:surfaceTitle(moduleNodes(next,id),id),action,messages:surfaceMessages(next,id)});
 }
 for(const id of deleted)if(!live.has(id)&&prev&&moduleIds(prev).includes(id))
  out.push({revision:next.revision,at,surface:id,title:surfaceTitle(moduleNodes(prev,id),id),action:retired.includes(id)?'retired':'withdrawn',messages:surfaceMessages(prev,id)});
 return out;
}

/** Replay the active branch from its last reset, visiting every committed canvas change in order. */
export function replayHistory(branch:readonly any[]):{current:Snapshot|null;versions:Version[]}{
 let current:Snapshot|null=null,start=0;const versions:Version[]=[];
 for(let i=branch.length-1;i>=0;i--){const e=branch[i],m=e.message;
  if(e.type==='custom'&&e.customType===RESET){current=validateSnapshot(e.data.workspace);start=i+1;break;}
  if(m?.role==='toolResult'&&m.toolName===PUBLICATION&&!m.isError&&m.details?.workspace){current=validateSnapshot(m.details.workspace);start=i+1;break;}
 }
 for(const e of branch.slice(start)){const m=e.message,at=e.timestamp??new Date(0).toISOString();
  let delta:Delta|undefined,source:any,cards,retired:string[]=[];
  if(m?.role==='toolResult'&&(m.toolName===UPDATE||m.toolName===SURFACE_UPDATE_TOOL)&&!m.isError&&m.details?.delta){delta=m.details.delta;source='agent';cards=m.details.cards;
   // Before surfaces became history (no cards in the result), the agent deleted surfaces to keep the canvas tidy:
   // those were housekeeping, so they count as retired (reachable), not withdrawn.
   retired=m.details.cards?m.details.retired??[]:delta!.messages.flatMap((x:any)=>x.deleteSurface?[x.deleteSurface.surfaceId]:[]);}
  else if(e.type==='custom'&&e.customType==='exosurface-composition-commit'&&e.data?.delta){delta=e.data.delta;source=e.data.source==='canvas-restore'?'restore':e.data.source==='canvas-press'?'press':e.data.source==='canvas-edit'?'edit':'agent';retired=e.data.retired??[];}
  if(!delta)continue;
  const next=applyDelta(current,delta);versions.push(...versionsOf(current,next,delta,source,at,cards,retired));current=next;
 }
 return {current,versions};
}

/** The surface as it was at `revision` (latest version at or before it). */
export function versionAt(versions:readonly Version[],surface:string,revision:number):Version|null{
 let hit:Version|null=null;for(const v of versions)if(v.surface===surface&&v.revision<=revision&&v.action!=='retired'&&v.action!=='withdrawn')hit=v;return hit;
}
/** Latest known version of every surface not on the live canvas (most recent first). */
export function archived(versions:readonly Version[],live:readonly string[]):Version[]{
 const last=new Map<string,Version>();for(const v of versions)if(v.action!=='retired'&&v.action!=='withdrawn')last.set(v.surface,v);
 const gone=new Set<string>();for(const v of versions)if(v.action==='withdrawn')gone.add(v.surface);else if(v.action!=='retired')gone.delete(v.surface);
 return [...last.values()].filter(v=>!live.includes(v.surface)&&!gone.has(v.surface)).sort((a,b)=>b.revision-a.revision);
}
/** One historical version as a single-surface snapshot the renderer and translator accept. */
export const versionSnapshot=(v:Version):Snapshot=>validateSnapshot({revision:v.revision,messages:v.messages,incremental:true});

const idsAfter=(current:Snapshot|null,messages:any[])=>{const order=current?moduleIds(current):[];for(const m of messages){const id=(m.createSurface??m.deleteSurface)?.surfaceId;if(!id)continue;const i=order.indexOf(id);if(i>=0)order.splice(i,1);if(m.createSurface)order.push(id);}return order;};
/** The live canvas holds what is in view. When a change would leave more than MAX_SURFACES surfaces
 *  (or exceed the byte bound), the system retires the least recently changed ones that are not
 *  protected (stage, beside, just changed). Retired surfaces stay in history and can be reopened. */
export function retirement(current:Snapshot|null,messages:any[],layout:Delta['layout'],protect:readonly string[]):{messages:any[];retired:string[]}{
 const baseRevision=current?.revision??0,retired:string[]=[];let all=messages;
 for(let guard=0;guard<64;guard++){
  let next:Snapshot;try{next=applyDelta(current,{baseRevision,revision:baseRevision+1,messages:all,...(layout?{layout}:{})});}
  catch(e){const tooMany=String(e).includes('too_big')||String(e).includes('exceeds 40KB');if(!tooMany)throw e;next=null as any;}
  const ids=next?moduleIds(next):idsAfter(current,all);
  const bytes=next?JSON.stringify(next).length:Infinity;
  if(next&&ids.length<=MAX_SURFACES&&bytes<=MAX_BYTES*0.9)return {messages:all,retired};
  const keep=new Set([...protect,...(next?.layout?.focus?[next.layout.focus]:[]),...(next?.layout?.beside??[])]);
  const victim=ids.find(id=>!keep.has(id)&&!retired.includes(id));if(!victim){if(next)return {messages:all,retired};throw Error('Canvas bound exceeded by the surfaces in this call alone; split it into smaller surfaces');}
  retired.push(victim);all=[...all,{version:'v0.9.1',deleteSurface:{surfaceId:victim}}];
 }
 throw Error('Retirement did not converge');
}

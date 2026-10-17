import test from 'node:test';import assert from 'node:assert/strict';
import {applyDelta,moduleIds,moduleNodes} from '../src/workspace.ts';
import {changeMessages} from '../src/snapshot-format.ts';
import {versionsOf,replayHistory,versionAt,archived,versionSnapshot,retirement} from '../src/canvas-history.ts';
const region=(id:string,title:string,extra='')=>`- region "${title}" [ref=${id}]:\n  - text [ref=t]: ${title} body${extra}`;
// Drive the canvas like the update tool does: translate, retire, commit, record; also build a native-like branch.
function session(){
 let current:any=null,versions:any[]=[];const branch:any[]=[];let clock=0;
 const call=(args:any,protect:string[]=[])=>{
  const fromHistory=(sid:string)=>{const v=archived(versions,current?moduleIds(current):[]).find(x=>x.surface===sid);return v?versionSnapshot(v):null;};
  const change=changeMessages(current,args,fromHistory),{messages,retired}=retirement(current,change.messages,undefined,[...change.drawn,...change.edited,...protect]);
  const delta={baseRevision:current?.revision??0,revision:(current?.revision??0)+1,messages},next=applyDelta(current,delta);
  const cards=[...change.drawn.map(surface=>({surface,action:'drew'})),...change.edited.map(surface=>({surface,action:'edited'}))] as any;
  const at=new Date(Date.UTC(2026,9,17,12,clock++)).toISOString();
  versions.push(...versionsOf(current,next,delta,'agent',at,cards,retired));branch.push({type:'message',timestamp:at,message:{role:'toolResult',toolName:'update_exosurface',isError:false,details:{delta,cards,retired}}});
  current=next;return {next,retired,change};
 };
 return {call,get current(){return current;},get versions(){return versions;},branch};
}
test('No surface limit for the agent: the system retires the oldest surfaces from view and keeps them in history',()=>{
 const s=session();for(let i=1;i<=12;i++){const r=s.call({snapshot:region(`s${i}`,`Surface ${i}`)});assert.ok(moduleIds(r.next).length<=8);}
 assert.deepEqual(moduleIds(s.current),['s5','s6','s7','s8','s9','s10','s11','s12']);
 const old=archived(s.versions,moduleIds(s.current));assert.deepEqual(old.map(v=>v.surface),['s4','s3','s2','s1']);
 assert.equal(versionAt(s.versions,'s1',1)?.title,'Surface 1');
});
test('Editing a retired surface by ref brings it back as the current version',()=>{
 const s=session();for(let i=1;i<=9;i++)s.call({snapshot:region(`s${i}`,`Surface ${i}`)});
 assert.ok(!moduleIds(s.current).includes('s1'));
 const r=s.call({edits:[{surface:'s1',ref:'t',op:'replace',lines:'- text [ref=t]: Reopened'}]});
 assert.ok(moduleIds(r.next).includes('s1'));assert.equal(moduleNodes(r.next,'s1').find((n:any)=>n.id==='t').text,'Reopened');
 assert.equal(s.versions.at(-1)?.action,'retired','something else made room');
});
test('Every version is kept: rewinding shows the surface as it was at that revision',()=>{
 const s=session();s.call({snapshot:region('plan','Plan',' v1')});s.call({snapshot:region('other','Other')});
 s.call({edits:[{surface:'plan',ref:'t',op:'replace',lines:'- text [ref=t]: Plan body v2'}]});
 assert.equal(moduleNodes(versionSnapshot(versionAt(s.versions,'plan',1)!),'plan').find((n:any)=>n.id==='t').text,'Plan body v1');
 assert.equal(moduleNodes(versionSnapshot(versionAt(s.versions,'plan',2)!),'plan').find((n:any)=>n.id==='t').text,'Plan body v1');
 assert.equal(moduleNodes(versionSnapshot(versionAt(s.versions,'plan',3)!),'plan').find((n:any)=>n.id==='t').text,'Plan body v2');
 assert.deepEqual(s.versions.map(v=>[v.revision,v.surface,v.action]),[[1,'plan','drew'],[2,'other','drew'],[3,'plan','edited']]);
});
test('History rebuilds from the native branch exactly (derived, never a second source of truth)',()=>{
 const s=session();for(let i=1;i<=10;i++)s.call({snapshot:region(`s${i}`,`Surface ${i}`)});s.call({edits:[{surface:'s10',ref:'t',op:'remove'}]});
 const r=replayHistory(s.branch);assert.deepEqual(r.current,s.current);assert.deepEqual(r.versions,s.versions);
});
test('Withdrawn surfaces (explicit delete) leave history; retired ones stay reachable',()=>{
 const s=session();s.call({snapshot:region('a','A')});s.call({snapshot:region('b','B')});s.call({delete:['a']});
 assert.equal(s.versions.at(-1).action,'withdrawn');assert.deepEqual(archived(s.versions,moduleIds(s.current)).map(v=>v.surface),[]);
});

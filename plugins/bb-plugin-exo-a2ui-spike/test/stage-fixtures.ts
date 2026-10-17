// STAGED design fixtures with fictional content, authored to exercise the stage and the
// visual vocabulary. NOT agent output and not evidence of model behaviour.
import {readFileSync} from 'node:fs';
import {applyDelta,latestSnapshot,moduleIds,type Snapshot} from '../src/workspace.ts';
import {EXO_CATALOG} from '../src/exo-catalog.ts';
const V='v0.9.1';
const create=(surfaceId:string)=>({version:V,createSurface:{surfaceId,catalogId:EXO_CATALOG}});
const comps=(surfaceId:string,components:any[])=>({version:V,updateComponents:{surfaceId,components}});
const data=(surfaceId:string,value:any)=>({version:V,updateDataModel:{surfaceId,path:'/',value}});
const step0=(s:Snapshot,messages:any[],layout?:any)=>applyDelta(s,{baseRevision:s.revision,revision:s.revision+1,messages,...(layout?{layout}:{})});
/** Room for the fixture's surfaces on a copy of the live canvas: keep only the newest `keep` live surfaces. */
const roomy=(s:Snapshot,keep:number)=>{const old=moduleIds(s).slice(0,Math.max(0,moduleIds(s).length-keep));return old.length?step0(s,old.map(surfaceId=>({version:V,deleteSurface:{surfaceId}}))):s;};
const step=(s:Snapshot,messages:any[],layout?:any)=>step0(roomy(s,5),messages,layout);
/** A decision presented under the guide: lead, comparison, one choice, one action, depth folded away. */
export function guided(live:Snapshot){
 return step(live,[create('fixture-trip'),comps('fixture-trip',[
  {id:'root',component:'Column',children:['title','sub','lean','compare','pick','go','packing']},
  {id:'title',component:'Text',variant:'h1',text:'Weekend trip: pick one'},
  {id:'sub',component:'Text',variant:'caption',text:'Fictional example. Saturday morning to Sunday evening.'},
  {id:'lean',component:'Callout',tone:'decision',title:'My lean: the lake cabin',text:"Closest drive and the only option with a **rain plan**. Short on time? The city museum day still works."},
  {id:'compare',component:'Table',columns:['','Lake cabin','Mountain hike','City museums'],highlightColumn:1,rows:[
   {cells:['Drive','1 h','2.5 h','30 min']},
   {cells:['If it rains','Board games by the fire','Cancelled','Unaffected']},
   {cells:['Cost','Cabin rental','Fuel and parking','Tickets']},
   {cells:['Risk','Books up fast','Trail closures','Crowds'],tone:'caution'}]},
  {id:'pick',component:'ChoicePicker',label:'Which one?',options:[{label:'Lake cabin',value:'lake'},{label:'Mountain hike',value:'hike'},{label:'City museums',value:'city'}],value:{path:'/pick'},variant:'mutuallyExclusive',displayStyle:'chips'},
  {id:'go',component:'Button',variant:'primary',child:'goT',action:{event:{name:'plan_trip',context:{pick:{path:'/pick'}}}}},
  {id:'goT',component:'Text',text:'Plan this trip'},
  {id:'packing',component:'Disclosure',title:'Packing list',summary:'Three things not to forget',child:'packCol'},
  {id:'packCol',component:'Column',children:['p1','p2','p3']},
  {id:'p1',component:'CheckBox',label:'Rain jackets',value:{path:'/pack/rain'}},
  {id:'p2',component:'CheckBox',label:'Snacks for the drive',value:{path:'/pack/snacks'}},
  {id:'p3',component:'CheckBox',label:'Phone chargers',value:{path:'/pack/chargers'}}]),
  data('fixture-trip',{pick:[],pack:{rain:false,snacks:false,chargers:false}}),
  create('fixture-weekend'),comps('fixture-weekend',[{id:'root',component:'Column',children:['h','tl']},{id:'h',component:'Text',variant:'h3',text:'The weekend'},{id:'tl',component:'Timeline',items:[
   {label:'Pack the car',when:'Fri evening',state:'now'},{label:'Leave',when:'Sat 9:00',state:'next'},{label:'Day out',when:'Sat',state:'later',detail:'Depends on the pick'},{label:'Head home',when:'Sun 17:00',state:'later'}]}]),data('fixture-weekend',{})],{focus:'fixture-trip',beside:['fixture-weekend']});
}
/** Every Exo component with fictional sample values, for visual review. */
export function sampler(live:Snapshot){
 return step(live,[create('fixture-sampler'),comps('fixture-sampler',[
  {id:'root',component:'Column',children:['title','note','metrics','bars','line','flow','risk']},
  {id:'title',component:'Text',variant:'h1',text:'Visual vocabulary check'},
  {id:'note',component:'Callout',tone:'caution',title:'Illustrative data',text:'Fictional sample values for visual review only.'},
  {id:'metrics',component:'Row',children:['m1','m2','m3']},
  {id:'m1',component:'Metric',label:'Training hours',value:'6',detail:'Sample'},
  {id:'m2',component:'Metric',label:'Rest days',value:'0',tone:'risk',detail:'Sample'},
  {id:'m3',component:'Metric',label:'Toward the race',value:'2 of 3',progress:.66,tone:'good'},
  {id:'bars',component:'Chart',kind:'bar',caption:'Where sample hours went',unit:'h',points:[{label:'Running',value:18,tone:'caution'},{label:'Cycling',value:12},{label:'Strength',value:9,note:'gym'},{label:'Mobility',value:6},{label:'Rest',value:0,tone:'risk'}]},
  {id:'line',component:'Chart',kind:'line',caption:'Sample energy score by day',points:[{label:'Mon',value:62},{label:'Tue',value:55},{label:'Wed',value:48},{label:'Thu',value:71,note:'after rest',tone:'good'}]},
  {id:'flow',component:'Flow',caption:'Order fulfilment (sample)',nodes:[{id:'a',label:'Order placed',detail:'Customer'},{id:'b',label:'Packing',detail:'Warehouse',tone:'accent'},{id:'c',label:'Shipped'},{id:'d',label:'Delivered',detail:'Or returned'}],edges:[{from:'a',to:'b'},{from:'b',to:'c',label:'label printed'},{from:'c',to:'d'},{from:'d',to:'b',label:'return'}]},
  {id:'risk',component:'Disclosure',title:'Why these encodings',summary:'Length for comparison, line for trend',child:'why'},
  {id:'why',component:'Text',text:'Bars compare amounts by **length**; the line shows change over time. Colour only marks meaning, and each value is also written out.'}]),data('fixture-sampler',{})],{focus:'fixture-sampler'});
}
// Read-only replay of the native active branch under the current reducer (what the
// backend materializes): same entries, stage derived from them.
export function replayLive(sessionFile:string):Snapshot{
 const lines=readFileSync(sessionFile,'utf8').split('\n').filter(Boolean).map(l=>JSON.parse(l)).filter((e:any)=>e.id);
 const byId=new Map(lines.map((e:any)=>[e.id,e]));const branch:any[]=[];let e:any=lines.at(-1);while(e){branch.unshift(e);e=byId.get(e.parentId);}
 return latestSnapshot(branch)!;
}

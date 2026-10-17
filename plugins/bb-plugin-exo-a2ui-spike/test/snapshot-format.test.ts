import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotToA2ui,parseLines,surfaceSnapshot,changeMessages,formatLines} from '../src/snapshot-format.ts';import {applyDelta,moduleNodes,moduleData} from '../src/workspace.ts';
const SAMPLE=`- region "Weekend trip: three cabins" [ref=trip]:
  - note "Prices are from last week" [tone=caution]: Two listings may have changed: check before booking.
  - group [layout=row]:
    - meter "Cheapest" [tone=good]: $145/night
      - /detail: Forest lodge
    - meter "Drive" [progress=0.4]: 2 h
  - figure "Price per night" [chart=bar] [unit=$]:
    - row: Lake cabin | 180
    - row [tone=good]: Forest lodge | 145 | cheapest
  - table "Compare" [highlight=1]:
    - row [header]: Cabin | Price | Beds
    - row: Lake | 180 | 2
    - row [tone=risk]: Hill | 210 | 1
  - list [timeline]:
    - listitem "Book" [when=Fri] [state=next]: before prices move
    - listitem "Drive up" [when=Sat]
  - list [flow] [direction=right]:
    - listitem "Pick" [ref=p] [to=b]
    - listitem "Book" [ref=b]
  - group "Why not the hill cabin" [collapsible]:
    - /summary: one bed, highest price
    - text: It only sleeps one: "cosy" in the listing.
  - tablist:
    - tab "Notes":
      - text: Bring boots.
    - tab "Packing":
      - list:
        - listitem: Boots
        - listitem: Rain jacket
  - article "Your choice":
    - radiogroup "Cabin" [ref=pick] [chips]:
      - radio "Lake cabin" [checked]
      - radio "Forest lodge" [value=forest]
    - listbox "Extras" [ref=extras]:
      - option "Breakfast" [selected]
    - checkbox "Pets" [ref=pets]
    - slider "Nights" [ref=nights] [min=1] [max=4]: 2
    - textbox "Notes" [ref=note] [multiline]: Late check-in
    - separator
    - button "Book it" [ref=book] [action=book] [primary] [sends=pick,nights,note]
`;
test('Snapshot format: every role translates to valid, renderable A2UI',()=>{
 const messages=snapshotToA2ui(SAMPLE),s=applyDelta(null,{baseRevision:0,revision:1,messages});
 assert.equal(s.incomplete,false);const nodes=moduleNodes(s,'trip'),by=(c:string)=>nodes.filter(n=>n.component===c);
 assert.equal(nodes[0].id,'root');
 for(const c of ['Callout','Metric','Chart','Table','Timeline','Flow','Disclosure','Tabs','Card','ChoicePicker','CheckBox','Slider','TextField','Divider','Button','Row','List'])assert.ok(by(c).length,c);
 assert.equal(by('Callout')[0].text,'Two listings may have changed: check before booking.');
 assert.deepEqual(by('Chart')[0].points.map((p:any)=>p.value),[180,145]);assert.deepEqual(by('Table')[0].columns,['Cabin','Price','Beds']);
 assert.deepEqual(by('Flow')[0].edges,[{from:'p',to:'b'}]);
 assert.deepEqual(moduleData(s,'trip'),{pick:['lake_cabin'],extras:['breakfast'],pets:false,nights:2,note:'Late check-in'});
 assert.deepEqual(by('Button')[0].action.event,{name:'book',context:{pick:{path:'/pick'},nights:{path:'/nights'},note:{path:'/note'}}});
});
test('Snapshot format: clear line-numbered errors',()=>{
 assert.throws(()=>snapshotToA2ui('- region "x":\n  - text: a'),/ref=surface_id/);
 assert.throws(()=>snapshotToA2ui('- region "x" [ref=a]:\n  - blob: a'),/line 2: unknown role "blob"/);
 assert.throws(()=>snapshotToA2ui('- region "x" [ref=a]:\n  not a line'),/line 2/);
 assert.equal(parseLines('- text: a: b "c"')[0].text,'a: b "c"');
});

const draw=(text:string)=>applyDelta(null,{baseRevision:0,revision:1,messages:snapshotToA2ui(text)});
test('Round trip: snapshot → A2UI → snapshot → A2UI yields identical components and data',()=>{
 const a=draw(SAMPLE),text=surfaceSnapshot(a,'trip'),b=draw(text);
 assert.deepEqual(moduleNodes(b,'trip'),moduleNodes(a,'trip'));assert.deepEqual(moduleData(b,'trip'),moduleData(a,'trip'));
 assert.equal(surfaceSnapshot(b,'trip'),text);
 assert.match(text,/- button "Book it" \[ref=book\] \[primary\] \[sends=pick,nights,note\]/);
 assert.match(text,/- textbox "Notes" \[ref=note\] \[multiline\]: Late check-in/);
 assert.ok(!text.includes('__'),'helper ids never shown');
});
test('Edits by ref: replace, insertAfter, insertInto, remove; values and focus-safe ids preserved',()=>{
 const a=draw(SAMPLE);
 const {messages,edited}=changeMessages(a,{edits:[
  {surface:'trip',ref:'n1',op:'replace',lines:'- note "Prices checked today" [ref=stale] [tone=good]: All three listings confirmed.'},
  {surface:'trip',ref:'book',op:'insertAfter',lines:'- button "Ask the host" [ref=ask] [action=ask]'},
  {surface:'trip',ref:'pick',op:'insertInto',lines:'- radio "Hill cabin" [value=hill]'},
  {surface:'trip',ref:'pets',op:'remove'}]});
 assert.deepEqual(edited,['trip']);
 const b=applyDelta(a,{baseRevision:1,revision:2,messages}),nodes=moduleNodes(b,'trip');
 assert.equal(nodes.find((n:any)=>n.id==='stale').text,'All three listings confirmed.');
 assert.ok(nodes.find((n:any)=>n.id==='ask'));assert.ok(!nodes.find((n:any)=>n.id==='pets'));
 assert.equal(nodes.find((n:any)=>n.id==='pick').options.length,3);
 assert.deepEqual(moduleData(b,'trip').pick,['lake_cabin']);assert.equal(moduleData(b,'trip').note,'Late check-in');
 assert.throws(()=>changeMessages(a,{edits:[{surface:'trip',ref:'nope',op:'remove'}]}),/No ref nope/);
});
test('Redraw keeps the person\'s values by component id when the new line leaves them at default',()=>{
 const a=draw(SAMPLE),typed=applyDelta(a,{baseRevision:1,revision:2,messages:[{version:'v0.9.1',updateDataModel:{surfaceId:'trip',path:'/note',value:'Arriving 9pm'}}]});
 const {messages}=changeMessages(typed,{snapshot:'- region "Trip" [ref=trip]:\n  - textbox "Notes" [ref=note] [multiline]\n  - text: Redesigned.'});
 const b=applyDelta(typed,{baseRevision:2,revision:3,messages});assert.equal(moduleData(b,'trip').note,'Arriving 9pm');
});
test('Reads a surface drawn directly in A2UI (generic ids, bound text, plain card)',()=>{
 const s=applyDelta(null,{baseRevision:0,revision:1,messages:[{version:'v0.9.1',createSurface:{surfaceId:'old',catalogId:'urn:exosurface:catalog:exo-visual:v1'}},{version:'v0.9.1',updateComponents:{surfaceId:'old',components:[
  {id:'root',component:'Column',children:['title','card']},{id:'title',component:'Text',text:'Old surface',variant:'h2'},{id:'card',component:'Card',child:'inner'},{id:'inner',component:'Column',children:['q','go']},
  {id:'q',component:'TextField',label:'Question',value:{path:'/form/q'}},{id:'go',component:'Button',child:'golabel',action:{event:{name:'ask',context:{q:{path:'/form/q'}}}}},{id:'golabel',component:'Text',text:'Ask'}]}},
  {version:'v0.9.1',updateDataModel:{surfaceId:'old',path:'/',value:{form:{q:'Why?'}}}}]});
 const text=surfaceSnapshot(s,'old');
 assert.match(text,/- heading "Old surface" \[ref=title\]/);assert.match(text,/- textbox "Question" \[ref=q\]: Why\?/);assert.match(text,/- button "Ask" \[ref=go\] \[action=ask\] \[sends=q\]/);
 // editing it re-expresses it in the snapshot form, keeping the typed value
 const {messages}=changeMessages(s,{edits:[{surface:'old',ref:'title',op:'replace',lines:'- heading "Renamed" [ref=title]'}]});
 const b=applyDelta(s,{baseRevision:1,revision:2,messages});assert.equal(moduleData(b,'old').q,'Why?');assert.equal(moduleNodes(b,'old').find((n:any)=>n.id==='title').text,'Renamed');
});
test('Streaming: the snapshot string is decoded as it arrives and previewed line by line',async()=>{
 const {SnapshotStream}=await import('../src/stream-frames.ts');const p=new SnapshotStream(),json=JSON.stringify({baseRevision:0,snapshot:SAMPLE});const seen:number[]=[];let last:any;
 for(const c of json){const v=p.append(c);if(v){seen.push(v.snapshot.split('\n').filter((l:string)=>l.trim()).length);last=v;}}
 assert.equal(last.snapshot,SAMPLE);assert.ok(seen.length>30&&seen.every((n,i)=>i===0||n>seen[i-1]),'one more line at a time');
 // every complete-line prefix translates or is skipped; the prefixes that translate render progressively
 let ok=0;for(let k=1;k<=SAMPLE.split('\n').length;k++){try{applyDelta(null,{baseRevision:0,revision:1,messages:snapshotToA2ui(SAMPLE.split('\n').slice(0,k).join('\n'))});ok++;}catch{}}
 assert.ok(ok>25,`most prefixes preview (${ok})`);
});
test('The person\'s canvas edits become labelled snapshot-style lines with current values',async()=>{
 const {describeEdits}=await import('../src/canvas-memory.ts');const a=draw(SAMPLE);
 const d1={messages:[{version:'v0.9.1',updateDataModel:{surfaceId:'trip',path:'/note',value:'Arriving 9pm'}}]},d2={messages:[{version:'v0.9.1',updateDataModel:{surfaceId:'trip',path:'/pick',value:['forest']}}]};
 const b=applyDelta(applyDelta(a,{baseRevision:1,revision:2,...d1}),{baseRevision:2,revision:3,...d2});
 assert.deepEqual(describeEdits(b,[d1,d2]),['- trip · Notes [ref=note]: Arriving 9pm','- trip · Cabin [ref=pick]: Forest lodge']);
});

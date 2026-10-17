import test from 'node:test';import assert from 'node:assert/strict';
import {snapshotToA2ui,parseLines} from '../src/snapshot-format.ts';import {applyDelta,moduleNodes,moduleData} from '../src/workspace.ts';
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

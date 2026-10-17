import { CATALOG } from '../src/workspace.ts';
export function sampleMessages(token='SPIKE'){
 const module=(id:string,title:string,action:string,value:string)=>[
  {version:'v0.9',createSurface:{surfaceId:id,catalogId:CATALOG}},
  {version:'v0.9',updateComponents:{surfaceId:id,components:[
   {id:'root',component:'Column',children:['title','description','selection','choose']},
   {id:'title',component:'Text',text:title},
   {id:'description',component:'Text',text:{path:'/description'}},
   {id:'selection',component:'Text',text:{path:'/selected'}},
   {id:'choose',component:'Button',child:'label',action:{event:{name:action,context:{value}}}},
   {id:'label',component:'Text',text:`Choose ${value}`},
  ]}},
  {version:'v0.9',updateDataModel:{surfaceId:id,path:'/',value:{description:`Synthetic module ${token}`,selected:'Nothing selected'}}},
 ];
 return [...module('agenda','Today’s agenda','choose_focus','Prototype canvas'),...module('decision','Decision in progress','choose_option','Option B')];
}

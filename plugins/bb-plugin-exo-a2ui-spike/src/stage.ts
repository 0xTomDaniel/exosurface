// The canvas is a stage that follows the conversation: one focused surface,
// at most two supporting context surfaces beside it, everything else recedes
// (kept mounted, drafts intact, one click to bring back). Pure, shared by the
// native reducer and frontend.
export type Layout={columns?:number;wide?:string[];focus?:string;beside?:string[]};
export const MAX_BESIDE=2;
// Focus follows what the conversation just touched: an explicit layout.focus wins;
// otherwise the last surface created or structurally redesigned in this delta;
// otherwise the previous focus. Data-only updates (e.g. applying submitted values)
// do not move the stage.
export function nextLayout(previous:Layout|undefined,requested:Layout|undefined,messages:any[],ids:string[]):Layout|undefined{
 const exists=(id:string)=>ids.includes(id);
 if([...(requested?.focus?[requested.focus]:[]),...(requested?.beside??[])].some(id=>!exists(id)))throw Error('layout.focus/beside must name existing surfaces');
 const base={...(requested??previous??{})};
 let touched:string|undefined;
 for(const m of messages){const id=m?.createSurface?.surfaceId??m?.updateComponents?.surfaceId;if(id)touched=id;}
 // If the stage surface was deleted, fall back to supporting context, then the newest surface.
 const focus=[requested?.focus,touched,previous?.focus,...(requested?.beside??previous?.beside??[]),ids.at(-1)].find(id=>id&&exists(id));
 const beside=(requested?.beside??previous?.beside??[]).filter(id=>exists(id)&&id!==focus).slice(0,MAX_BESIDE);
 const wide=base.wide?.filter(exists);
 const result:Layout={...base,...(wide?{wide}:{}),...(beside.length?{beside}:{})};
 if(!beside.length)delete result.beside;
 if(focus)result.focus=focus;else delete result.focus;
 return Object.keys(result).length?result:undefined;
}
const plain=(s:string)=>s.replace(/[*_`#>\[\]]/g,'').replace(/\s+/g,' ').trim();
// Human title for the shelf: the surface's first heading, else its identifier.
export function surfaceTitle(nodes:any[],id:string):string{
 const heading=nodes.find(n=>n.component==='Text'&&['h1','h2','h3'].includes(n.variant)&&typeof n.text==='string'&&plain(n.text));
 const text=heading?plain(heading.text):id.replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
 return text.length>48?text.slice(0,47)+'…':text;
}
export type StagePlan={mode:'stage';focus:string;beside:string[];receded:string[]}|{mode:'grid';all:string[]};
// local: owner's temporary pick from the shelf; it lapses when Exo moves the stage.
export function stagePlan(ids:string[],layout:Layout|undefined,local:{id:string;nativeFocus:string|undefined}|null):StagePlan{
 const nativeFocus=layout?.focus&&ids.includes(layout.focus)?layout.focus:undefined;
 if(!nativeFocus)return{mode:'grid',all:ids};
 const focus=local&&local.nativeFocus===nativeFocus&&ids.includes(local.id)?local.id:nativeFocus;
 const beside=(layout?.beside??[]).filter(id=>ids.includes(id)&&id!==focus).slice(0,MAX_BESIDE);
 return{mode:'stage',focus,beside,receded:ids.filter(id=>id!==focus&&!beside.includes(id))};
}

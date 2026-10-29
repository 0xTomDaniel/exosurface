// React views for the Exo visual catalog. Presentational only: no actions,
// no URLs, no HTML from the model except through the official sanitized
// Markdown renderer. Meaning is always carried by words; tone colour only adds.
import {useEffect,useMemo,useState,type ReactNode} from 'react';
import {createComponentImplementation,useMarkdownRenderer} from '@a2ui/react/v0_9';
import {CalloutApi,MetricApi,TimelineApi,TableApi,ChartApi,FlowApi,DisclosureApi,exoCatalog} from './exo-catalog.ts';

function Md({text,inline}:{text:string;inline?:boolean}){
 const render=useMarkdownRenderer(),[html,setHtml]=useState<string|null>(null);
 useEffect(()=>{let live=true;if(!render){setHtml(null);return;}render(text,{renderMode:inline?'inline':'block'}).then(h=>{if(live)setHtml(h);}).catch(()=>{if(live)setHtml(null);});return()=>{live=false;};},[text,render,inline]);
 return html===null?<span className="exo-md">{text}</span>:<span className="exo-md" dangerouslySetInnerHTML={{__html:html}}/>;
}
const toneClass=(t?:string)=>t?` exo-tone-${t}`:'';
const calloutLabel={note:'Note',decision:'Decision',caution:'Watch out',good:'Settled'} as const;

const Callout=createComponentImplementation(CalloutApi,({props})=>{
 const tone=props.tone??'note';
 return <aside className={`exo-callout exo-callout-${tone}`} aria-label={props.title??calloutLabel[tone]}>
  {props.title&&<p className="exo-callout-title">{props.title}</p>}
  <div className="exo-callout-body"><Md text={String(props.text??'')}/></div>
 </aside>;
});

const Metric=createComponentImplementation(MetricApi,({props})=>
 <div className={`exo-metric${toneClass(props.tone)}`}>
  <span className="exo-metric-label">{props.label}</span>
  <span className="exo-metric-value">{props.value}</span>
  {props.progress!==undefined&&<span className="exo-meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(props.progress*100)} aria-label={`${props.label} progress`}><span style={{width:`${props.progress*100}%`}}/></span>}
  {props.detail&&<span className="exo-metric-detail">{props.detail}</span>}
 </div>);

const stateWord={done:'Done',now:'Now',next:'Next',later:'Later',blocked:'Blocked'} as const;
const Timeline=createComponentImplementation(TimelineApi,({props})=>
 <ol className="exo-timeline">{props.items.map((it,i)=>{const s=it.state??'later';return <li key={i} className={`exo-tl-${s}`} aria-current={s==='now'?'step':undefined}>
  <span className="exo-tl-when">{it.when??''}</span>
  <span className="exo-tl-mark" aria-hidden="true"/>
  <span className="exo-tl-body"><span className="exo-tl-label">{it.label}{it.state&&<span className="exo-tl-state">{stateWord[s]}</span>}</span>{it.detail&&<span className="exo-tl-detail">{it.detail}</span>}</span>
 </li>;})}</ol>);

const Table=createComponentImplementation(TableApi,({props})=>
 <div className="exo-table-wrap"><table className="exo-table">
  {props.caption&&<caption>{props.caption}</caption>}
  <thead><tr>{props.columns.map((c,i)=><th key={i} scope="col" className={i===props.highlightColumn?'exo-hl':undefined}>{String(c)}{i===props.highlightColumn&&<span className="exo-sr"> (recommended)</span>}</th>)}</tr></thead>
  <tbody>{props.rows.map((r,i)=><tr key={i} className={toneClass(r.tone).trim()||undefined}>{r.cells.map((c,j)=>j===0?<th key={j} scope="row" className={j===props.highlightColumn?'exo-hl':undefined}>{String(c)}</th>:<td key={j} className={j===props.highlightColumn?'exo-hl':undefined}>{String(c)}</td>)}</tr>)}</tbody>
 </table></div>);

const fmt=(v:number,unit?:string)=>`${Number.isInteger(v)?v.toLocaleString():v.toLocaleString(undefined,{maximumFractionDigits:2})}${unit?(/^[%$]/.test(unit)?'':' ')+unit:''}`.replace(/^(.*) \$$/,'$$$1');
const Chart=createComponentImplementation(ChartApi,({props})=>{
 const values=props.points.map(p=>p.value),max=props.max??Math.max(...values,0),min=Math.min(0,...values);
 const summary=`${props.caption??'Chart'}: `+props.points.map(p=>`${p.label} ${fmt(p.value,props.unit)}`).join(', ');
 if(props.kind==='bar')return <figure className="exo-chart exo-bars" aria-label={summary}>
  {props.caption&&<figcaption>{props.caption}</figcaption>}
  {props.points.map((p,i)=><div key={i} className={`exo-bar${toneClass(p.tone)}`}>
   <span className="exo-bar-label">{p.label}</span>
   <span className="exo-bar-track"><span style={{width:`${max>min?Math.max(0,(p.value-min)/(max-min))*100:0}%`}}/></span>
   <span className="exo-bar-value">{fmt(p.value,props.unit)}{p.note&&<span className="exo-bar-note">{p.note}</span>}</span>
  </div>)}
 </figure>;
 const W=720,H=170,pad={l:14,r:14,t:24,b:30},lo=Math.min(...values),hi=Math.max(...values,props.max??-Infinity),span=hi-lo||1;
 const x=(i:number)=>pad.l+(props.points.length===1?0.5:i/(props.points.length-1))*(W-pad.l-pad.r),y=(v:number)=>pad.t+(1-(v-lo)/span)*(H-pad.t-pad.b);
 const d=props.points.map((p,i)=>`${i?'L':'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
 return <figure className="exo-chart exo-line">
  {props.caption&&<figcaption>{props.caption}</figcaption>}
  <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={summary}>
   <line x1={pad.l} x2={W-pad.r} y1={H-pad.b} y2={H-pad.b} className="exo-axis"/>
   <path d={d} className="exo-line-path"/>
   {props.points.map((p,i)=><g key={i} className={toneClass(p.tone).trim()||undefined}>
    <circle cx={x(i)} cy={y(p.value)} r={i===props.points.length-1?4.5:3}/>
    {(props.points.length<=8||i===0||i===props.points.length-1||p.note||p.tone)&&<text x={x(i)} y={y(p.value)-9} textAnchor={i===0?'start':i===props.points.length-1?'end':'middle'} className="exo-line-value">{fmt(p.value,props.unit)}</text>}
    <text x={x(i)} y={H-10} textAnchor={i===0?'start':i===props.points.length-1?'end':'middle'} className="exo-line-label">{p.label}</text>
   </g>)}
  </svg>
 </figure>;
});

// Layered left→right (or top→down) flow; longest-path layering, bounded for cycles.
function layers(nodes:{id:string}[],edges:{from:string;to:string}[]){
 const depth=new Map(nodes.map(n=>[n.id,0]));
 for(let pass=0;pass<nodes.length;pass++){let changed=false;for(const e of edges){const next=depth.get(e.from)!+1;if(next>depth.get(e.to)!&&next<nodes.length){depth.set(e.to,next);changed=true;}}if(!changed)break;}
 return depth;
}
const Flow=createComponentImplementation(FlowApi,({props})=>{
 const depthCount=Math.max(...layers(props.nodes,props.edges).values())+1;
 // Wide chains read better top-down unless Exo asked otherwise.
 const down=props.direction?props.direction==='down':depthCount>4,NW=150,NH=60,GX=down?20:44,GY=down?44:18;
 const geo=useMemo(()=>{const depth=layers(props.nodes,props.edges),cols=new Map<number,string[]>();for(const n of props.nodes){const d=depth.get(n.id)!;cols.set(d,[...(cols.get(d)??[]),n.id]);}
  const pos=new Map<string,{x:number;y:number}>();for(const[d,ids]of cols)ids.forEach((id,i)=>pos.set(id,down?{x:i*(NW+GX),y:d*(NH+GY)}:{x:d*(NW+GX),y:i*(NH+GY)}));
  const back=props.edges.some(e=>down?depth.get(e.to)!<=depth.get(e.from)!:depth.get(e.to)!<=depth.get(e.from)!);
  const W=Math.max(...[...pos.values()].map(p=>p.x))+NW+(back&&down?56:0),H=Math.max(...[...pos.values()].map(p=>p.y))+NH+(back&&!down?44:0);return{pos,W,H};},[props.nodes,props.edges,down]);
 const byId=new Map(props.nodes.map(n=>[n.id,n]));
 const summary=(props.caption?props.caption+'. ':'')+props.edges.map(e=>`${byId.get(e.from)?.label} → ${byId.get(e.to)?.label}${e.label?` (${e.label})`:''}`).join('; ');
 return <figure className="exo-flow">
  {props.caption&&<figcaption>{props.caption}</figcaption>}
  <svg viewBox={`-6 -6 ${geo.W+12} ${geo.H+12}`} style={{maxWidth:geo.W+12}} role="img" aria-label={summary||props.nodes.map(n=>n.label).join(', ')}>
   <defs><marker id="exo-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L8,4 L0,8 z" className="exo-arrowhead"/></marker></defs>
   {props.edges.map((e,i)=>{const a=geo.pos.get(e.from)!,b=geo.pos.get(e.to)!;
    const[x1,y1,x2,y2]=down?[a.x+NW/2,a.y+NH,b.x+NW/2,b.y]:[a.x+NW,a.y+NH/2,b.x,b.y+NH/2];
    const back=down?y2<=y1:x2<=x1,c=down?Math.max(20,Math.abs(y2-y1)/2):Math.max(20,Math.abs(x2-x1)/2);
    if(back){// loop under (left→right) or beside (top→down) the chain, so it never crosses nodes
     const[sx,sy,ex,ey]=down?[a.x+NW,a.y+NH/2,b.x+NW,b.y+NH/2]:[a.x+NW/2,a.y+NH,b.x+NW/2,b.y+NH],off=down?Math.max(sx,ex)+40:Math.max(sy,ey)+34;
     const d=down?`M${sx},${sy} C${off},${sy} ${off},${ey} ${ex},${ey}`:`M${sx},${sy} C${sx},${off} ${ex},${off} ${ex},${ey}`;
     return <g key={i}><path d={d} className="exo-edge exo-edge-back" markerEnd="url(#exo-arrow)"/>{e.label&&<text x={down?off-8:(sx+ex)/2} y={down?(sy+ey)/2:off-4} textAnchor={down?'end':'middle'} className="exo-edge-label">{e.label}</text>}</g>;}
    const d=down?`M${x1},${y1} C${x1},${y1+c} ${x2},${y2-c} ${x2},${y2}`:`M${x1},${y1} C${x1+c},${y1} ${x2-c},${y2} ${x2},${y2}`;
    return <g key={i}><path d={d} className="exo-edge" markerEnd="url(#exo-arrow)"/>{e.label&&<text x={(x1+x2)/2} y={(y1+y2)/2-6} textAnchor="middle" className="exo-edge-label">{e.label}</text>}</g>;})}
   {props.nodes.map(n=>{const p=geo.pos.get(n.id)!;return <foreignObject key={n.id} x={p.x} y={p.y} width={NW} height={NH}>
    <div className={`exo-node${toneClass(n.tone)}`}><span className="exo-node-label">{n.label}</span>{n.detail&&<span className="exo-node-detail">{n.detail}</span>}</div>
   </foreignObject>;})}
  </svg>
 </figure>;
});

const Disclosure=createComponentImplementation(DisclosureApi,({props,buildChild})=>{
 const [open,setOpen]=useState(!!props.open),child:any=props.child,id=typeof child==='string'?child:child?.id;
 return <details className="exo-disclosure" open={open} onToggle={e=>setOpen((e.currentTarget as HTMLDetailsElement).open)}>
  <summary><span className="exo-disclosure-title">{props.title}</span>{props.summary&&<span className="exo-disclosure-summary">{props.summary}</span>}</summary>
  <div className="exo-disclosure-body">{open&&id?buildChild(id) as ReactNode:null}</div>
 </details>;
});

export const exoReactCatalog=exoCatalog([Callout,Metric,Timeline,Table,Chart,Flow,Disclosure] as any[]);

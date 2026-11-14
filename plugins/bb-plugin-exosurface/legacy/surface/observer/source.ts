const isFrame=(frame:unknown):frame is Record<string,unknown>&{sourceId:string}=>frame!==null&&typeof frame==='object'&&'sourceId'in frame&&typeof frame.sourceId==='string';
// Stable references into the actual response, not model-retyped quotations.
export function sourceSegments(response:string){const parts:string[]=[];for(const paragraph of response.split(/\n\s*\n/).filter(s=>s.trim())){let rest=paragraph;while(rest.length>800){const space=rest.lastIndexOf(' ',800),cut=space>=400?space:800;parts.push(rest.slice(0,cut));rest=rest.slice(cut);}if(rest)parts.push(rest);}return parts.map((text,i)=>({id:'p'+String(i),text}));}
export function bindSource(frame:unknown,segments:{id:string;text:string}[]){
 if(!isFrame(frame)||Object.hasOwn(frame,'evidence'))throw Error('Observer must cite a supplied source reference');
 const source=segments.find(s=>s.id===frame.sourceId);if(!source)throw Error('Observer cited unavailable source reference');
 const atom=Object.fromEntries(Object.entries(frame).filter(([key])=>key!=='sourceId'));return{...atom,evidence:source.text};
}

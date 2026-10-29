// Stable references into the actual response, not model-retyped quotations.
export function sourceSegments(response:string){const parts:string[]=[];for(const paragraph of response.split(/\n\s*\n/).filter(s=>s.trim())){let rest=paragraph;while(rest.length>800){const space=rest.lastIndexOf(' ',800),cut=space>=400?space:800;parts.push(rest.slice(0,cut));rest=rest.slice(cut);}if(rest)parts.push(rest);}return parts.map((text,i)=>({id:'p'+i,text}));}
export function bindSource(frame:any,segments:{id:string;text:string}[]){
 if(!frame||typeof frame!=='object'||typeof frame.sourceId!=='string'||Object.hasOwn(frame,'evidence'))throw Error('Observer must cite a supplied source reference');
 const source=segments.find(s=>s.id===frame.sourceId);if(!source)throw Error('Observer cited unavailable source reference');
 const{sourceId,...atom}=frame;return{...atom,evidence:source.text};
}

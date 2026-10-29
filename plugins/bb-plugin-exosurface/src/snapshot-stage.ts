// Extracted from bb-plugin-exo-a2ui-spike/src/stage.ts at 981941ade8f35ccc1a96628bbc2f317370e3692a.
// Pure title helper extracted from the local Exosurface spike; no A2UI imports.
const plain=(s:string)=>s.replace(/[*_`#>\[\]]/g,'').replace(/\s+/g,' ').trim();
// Human title for the shelf: the surface's first heading, else its identifier.
export function surfaceTitle(nodes:any[],id:string):string{
 const heading=nodes.find(n=>n.component==='Text'&&['h1','h2','h3'].includes(n.variant)&&typeof n.text==='string'&&plain(n.text));
 const text=heading?plain(heading.text):id.replace(/[_-]+/g,' ').replace(/^\w/,c=>c.toUpperCase());
 return text.length>48?text.slice(0,47)+'…':text;
}

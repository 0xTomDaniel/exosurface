// Which earlier surface version the canvas is showing (a "rewind"), shared by the chat cards,
// the canvas page and the composer banner. Module state: they live in the same plugin bundle.
import {useSyncExternalStore} from 'react';
export type VersionRef={surface:string;revision:number};
let rewind:VersionRef|null=null;const subs=new Set<()=>void>();
export const getRewind=()=>rewind;
export function setRewind(next:VersionRef|null){rewind=next;subs.forEach(f=>f());}
export function useRewind(){return useSyncExternalStore(f=>{subs.add(f);return()=>{subs.delete(f);};},getRewind,getRewind);}
export const when=(at:string)=>{const d=new Date(at),today=new Date().toDateString()===d.toDateString();return d.toLocaleString(undefined,today?{hour:'numeric',minute:'2-digit'}:{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'});};

import{randomUUID}from'node:crypto';import{moduleIds,MAX_SURFACES,type Snapshot}from'../src/workspace.ts';import type{Route}from'./stream.ts';
export function observerSurface(current:Snapshot|null,preferred:string){const ids=current?moduleIds(current):[];return !ids.includes(preferred)&&ids.length>=MAX_SURFACES?ids.at(-1)!:preferred;}
export const OBS_MODE='exosurface-observer-mode';
export type ObserverMode={id:string;route:Route;surfaceId:string};
// A selected clone-local route applies to ordinary turns until explicitly turned off.
// No prompt prefix, one-shot consumption or automatic replay of interrupted work.
export const nextObserver=(mode:ObserverMode|null)=>mode?{...mode,id:randomUUID()}:null;

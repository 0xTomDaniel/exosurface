// Current owner-approved route. Experiment code/history is retained, not active.
// This is an accident/routing guard, not independent authorization against this agent.
import{SURFACE_UPDATE_TOOL}from'./workspace.ts';
export const EXPERIMENTS_ENABLED:boolean=false;
// Snapshot-format tools since 2026-10-16; legacy apply_workspace/read_workspace stay registered for history only.
export const DIRECT_TOOLS=[SURFACE_UPDATE_TOOL,'read_exosurface'];
// OptChat's read-only memory tools stay available in the clone (zoom into originals, dates, opt-in search).
// Clone excludes file/shell/subagent tools (vault safety); on main, Exosurface only ADDS its tools.
export const OPTCHAT_MEMORY_TOOLS=['zoom','date','search'];
export const cloneTools=(registered:string[])=>[...DIRECT_TOOLS,...OPTCHAT_MEMORY_TOOLS.filter(n=>registered.includes(n))];
export function requirePresentationExperiment(){if(!EXPERIMENTS_ENABLED)throw Error('Presentation experiments archived by owner; direct Exo→A2UI is active. Explicit reauthorization and code change required.');}
export function restoredObserverMode<T>(mode:T):T|null{return EXPERIMENTS_ENABLED?mode:null;}

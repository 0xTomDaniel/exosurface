// The canvas as ONE typed, versioned document per conversation, shaped for a near 1:1 move to
// @earendil-works/pi-durable (`defineDoc`) when the Pi coding agent adopts the durable harness.
// Today it runs on pi-coding-agent primitives; every canvas change goes through `reduceCanvas`.
//
//  Concept                | Today (pi-coding-agent + this plugin)                         | pi-durable
//  -----------------------|---------------------------------------------------------------|------------------------------------------
//  Document definition    | CANVAS_DOC (kind/version/scope/history/fork/initial)          | defineDoc({kind,version,scope,history,fork,initial})
//  Value                  | Snapshot | null                                               | doc value
//  Change / commit        | CanvasChange → one native entry (tool-result details or       | conversation.commit(tx => tx.doc(Canvas,id) …) with
//                         | exosurface-composition-commit custom entry)                   | the agent's entries in the same commit
//  Read current value     | foldCanvas(branch) (replay on the active branch)              | harness.snapshot(Canvas, conversationId)
//  Fork                   | Pi branch replay = value at the fork point ("current")        | fork: 'current'
//  Model sees it          | canvasSection(value) appended per request                     | section('exosurface', ({docs}) => …)
//  UI sync                | revisioned deltas + epoch/cursor delivery                      | watchDoc() / watch() Chord ops
//  Person edits           | edit RPC → owner → /workspace-data (revision-checked)         | host endpoint → commit (base-revision check kept)
//
// Keep this module free of Pi APIs so the reducer, fold and section move unchanged.
import {applyDelta,latestSnapshot,type Snapshot,type Delta} from './workspace.ts';
import {snapshotOutline} from './canvas-memory.ts';
export const CANVAS_DOC={kind:'exosurface.canvas',version:1,scope:'conversation',history:'latest',fork:'current',initial:():CanvasValue=>null} as const;
export type CanvasValue=Snapshot|null;
/** Who changed the canvas and how. `agent` = an update_exosurface (or legacy apply_workspace) call; `edit` = the person typing (no turn);
 *  `press` = values a button submitted, committed by code before Exo's turn; `reset` = cleared. */
export type CanvasChange=
 |{source:'agent';delta:Delta;toolCallId?:string}
 |{source:'edit'|'press';delta:Delta;mutationId:string}
 |{source:'reset';value:Snapshot};
/** The only way the canvas changes: pure, deterministic, validates every result. */
export function reduceCanvas(value:CanvasValue,change:CanvasChange):Snapshot{
 if(change.source==='reset')return change.value;
 return applyDelta(value,change.delta);
}
/** Current value from the conversation's active branch (pi-durable: harness.snapshot). Decodes
 *  every historical encoding (legacy checkpoints, tool deltas, commit entries, resets). */
export const foldCanvas=(branch:readonly any[]):CanvasValue=>latestSnapshot(branch);
/** What the model sees of the canvas each request (pi-durable: a prompt section reading the doc). */
export const canvasSection=(value:CanvasValue)=>value?snapshotOutline(value):null;

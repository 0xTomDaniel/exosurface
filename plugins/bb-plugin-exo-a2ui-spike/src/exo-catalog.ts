// Exo visual catalog: the standard A2UI basic components PLUS a small, generic
// visual vocabulary (no scenario/page templates). Schema-only here so the native
// validator, renderer and model contract share one definition; React views live
// in exo-components.tsx (frontend only).
import {z} from 'zod';
import {Catalog,AccessibilityAttributesSchema,ComponentIdSchema,DynamicStringSchema} from '@a2ui/web_core/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
import {PAGE_BOUNDS as B,formPattern} from './page-bounds.ts';
export const EXO_CATALOG='urn:exosurface:catalog:exo-visual:v1';
const common={accessibility:AccessibilityAttributesSchema.optional(),weight:z.number().optional()};
// Every value below comes from the bounds definition (page-bounds.ts); the snapshot validator checks the
// same bounds first and names them in snapshot-format words, so these schemas are the A2UI-level backstop.
type Len={limit:{min:number;max:number}};type Count={limit:{min:number;max:number|null}};
const text=(b:Len)=>z.string().min(b.limit.min).max(b.limit.max);
const many=<T extends z.ZodTypeAny>(item:T,b:Count)=>{const a=z.array(item).min(b.limit.min);return b.limit.max===null?a:a.max(b.limit.max);};
const oneOf=<V extends readonly [string,...string[]]>(b:{limit:{values:V}})=>z.enum(b.limit.values as unknown as [V[number],...V[number][]]);
export const TONES=B.tone.limit.values;
const tone=oneOf(B.tone).optional();
export const CalloutApi={name:'Callout',schema:z.object({...common,tone:oneOf(B.noteTone).optional(),title:text(B.noteTitle).optional(),text:DynamicStringSchema}).strict()};
export const MetricApi={name:'Metric',schema:z.object({...common,label:text(B.meterLabel),value:text(B.meterValue),detail:text(B.meterDetail).optional(),tone,progress:z.number().min(B.meterProgress.limit.min).max(B.meterProgress.limit.max).optional()}).strict()};
export const TimelineApi={name:'Timeline',schema:z.object({...common,items:many(z.object({label:text(B.timelineLabel),when:text(B.timelineWhen).optional(),detail:text(B.timelineDetail).optional(),state:oneOf(B.timelineState).optional()}).strict(),B.timelineItems)}).strict()};
export const TableApi={name:'Table',schema:z.object({...common,caption:text(B.tableCaption).optional(),columns:many(text(B.tableHeaderCell),B.tableColumns),rows:many(z.object({cells:many(text(B.tableCell),B.tableColumns),tone}).strict(),B.tableRows),highlightColumn:z.number().int().min(B.tableHighlight.limit.min).max(B.tableHighlight.limit.max).optional()}).strict()};
export const ChartApi={name:'Chart',schema:z.object({...common,kind:oneOf(B.chartKind),caption:text(B.figureCaption).optional(),unit:text(B.figureUnit).optional(),max:z.number().finite().optional(),points:many(z.object({label:text(B.figureRowLabel),value:z.number().finite(),note:text(B.figureRowNote).optional(),tone}).strict(),B.figureRows)}).strict()};
const nodeId=z.string().regex(formPattern('flowRefForm'));
// Edge labels have no snapshot-format line (B2: the translation never writes one), so they are not a page bound.
export const FlowApi={name:'Flow',schema:z.object({...common,caption:text(B.flowCaption).optional(),direction:oneOf(B.flowDirection).optional(),nodes:many(z.object({id:nodeId,label:text(B.flowLabel),detail:text(B.flowDetail).optional(),tone}).strict(),B.flowNodes),edges:many(z.object({from:nodeId,to:nodeId,label:z.string().max(32).optional()}).strict(),B.flowLinks)}).strict()};
export const DisclosureApi={name:'Disclosure',schema:z.object({...common,title:text(B.groupTitle),summary:text(B.groupSummary).optional(),open:z.boolean().optional(),child:ComponentIdSchema}).strict()};
export const EXO_APIS=[CalloutApi,MetricApi,TimelineApi,TableApi,ChartApi,FlowApi,DisclosureApi];
export const EXO_COMPONENTS=EXO_APIS.map(a=>a.name);
const basicFunctions=[...basicCatalog.functions.values()];
export const exoCatalog=<T extends {name:string;schema:z.ZodTypeAny}>(implementations:T[])=>new Catalog(EXO_CATALOG,'0.9',[...basicCatalog.components.values(),...implementations] as any[],basicFunctions,basicCatalog.themeSchema);
// Server/validator catalog: identical schemas, no rendering code.
export const exoApiCatalog=exoCatalog(EXO_APIS);
// Semantic checks beyond per-prop schemas, applied to every committed surface.
export function checkExoComponent(raw:any){
 const {id:_id,component,...props}=raw,api=EXO_APIS.find(a=>a.name===component);if(!api)throw Error('Unknown Exo component');
 const parsed=api.schema.safeParse(props);if(!parsed.success)throw Error(`${component} ${raw.id}: ${parsed.error.issues.slice(0,3).map(i=>`${i.path.join('.')||'props'} ${i.message}`).join('; ')}`);
 const n:any=raw;
 if(n.component==='Table'){for(const r of n.rows)if(r.cells.length!==n.columns.length)throw Error('Table rows must match columns');if(n.highlightColumn!==undefined&&n.highlightColumn>=n.columns.length)throw Error('Table highlight outside columns');}
 if(n.component==='Flow'){const ids=new Set<string>();for(const x of n.nodes){if(ids.has(x.id))throw Error('Duplicate Flow node');ids.add(x.id);}for(const e of n.edges)if(!ids.has(e.from)||!ids.has(e.to)||e.from===e.to)throw Error('Flow edge must join two distinct declared nodes');}
 if(n.component==='Chart'&&n.max!==undefined&&n.points.some((p:any)=>p.value>n.max))throw Error('Chart value exceeds declared max');
}

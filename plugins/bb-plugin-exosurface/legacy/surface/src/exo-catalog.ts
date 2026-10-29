// Exo visual catalog: the standard A2UI basic components PLUS a small, generic
// visual vocabulary (no scenario/page templates). Schema-only here so the native
// validator, renderer and model contract share one definition; React views live
// in exo-components.tsx (frontend only).
import {z} from 'zod';
import {Catalog,AccessibilityAttributesSchema,ComponentIdSchema,DynamicStringSchema} from '@a2ui/web_core/v0_9';
import {basicCatalog} from '@a2ui/web_core/v0_9/basic_catalog';
export const EXO_CATALOG='urn:exosurface:catalog:exo-visual:v1';
const common={accessibility:AccessibilityAttributesSchema.optional(),weight:z.number().optional()};
const short=z.string().min(1).max(120),line=z.string().max(400);
export const TONES=['neutral','accent','good','caution','risk'] as const;
const tone=z.enum(TONES).optional();
export const CalloutApi={name:'Callout',schema:z.object({...common,tone:z.enum(['note','decision','caution','good']).optional(),title:short.optional(),text:DynamicStringSchema}).strict()};
export const MetricApi={name:'Metric',schema:z.object({...common,label:short,value:z.string().min(1).max(40),detail:line.optional(),tone,progress:z.number().min(0).max(1).optional()}).strict()};
export const TimelineApi={name:'Timeline',schema:z.object({...common,items:z.array(z.object({label:short,when:z.string().max(40).optional(),detail:line.optional(),state:z.enum(['done','now','next','later','blocked']).optional()}).strict()).min(1).max(12)}).strict()};
export const TableApi={name:'Table',schema:z.object({...common,caption:short.optional(),columns:z.array(z.string().max(60)).min(1).max(6),rows:z.array(z.object({cells:z.array(z.string().max(200)).min(1).max(6),tone}).strict()).min(1).max(14),highlightColumn:z.number().int().min(0).max(5).optional()}).strict()};
export const ChartApi={name:'Chart',schema:z.object({...common,kind:z.enum(['bar','line']),caption:short.optional(),unit:z.string().max(16).optional(),max:z.number().finite().optional(),points:z.array(z.object({label:z.string().min(1).max(40),value:z.number().finite(),note:z.string().max(80).optional(),tone}).strict()).min(1).max(16)}).strict()};
const nodeId=z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/);
export const FlowApi={name:'Flow',schema:z.object({...common,caption:short.optional(),direction:z.enum(['right','down']).optional(),nodes:z.array(z.object({id:nodeId,label:z.string().min(1).max(48),detail:z.string().max(90).optional(),tone}).strict()).min(1).max(12),edges:z.array(z.object({from:nodeId,to:nodeId,label:z.string().max(32).optional()}).strict()).max(20)}).strict()};
export const DisclosureApi={name:'Disclosure',schema:z.object({...common,title:short,summary:z.string().max(120).optional(),open:z.boolean().optional(),child:ComponentIdSchema}).strict()};
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

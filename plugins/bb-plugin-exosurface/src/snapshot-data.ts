// Extracted from bb-plugin-exo-a2ui-spike/src/workspace.ts at 981941ade8f35ccc1a96628bbc2f317370e3692a.
// Pure data helpers/types extracted from the local spike, without A2UI/Zod/legacy state.
export const EXO_CATALOG='urn:exosurface:catalog:exo-visual:v1';
export const MAX_SENDS=24;
// The A2UI v0.9.1 subset the snapshot format writes: one component per page node, data bound by JSON Pointer.
interface Binding {path:string}
export type DataModel=Record<string,unknown>;
interface Base {id:string}
export interface TextNode extends Base {component:'Text';text:string;variant?:`h${number}`|'caption'}
export interface StackNode extends Base {component:'Column'|'Row';children:string[]}
export interface ListNode extends Base {component:'List';children:string[]}
interface DividerNode extends Base {component:'Divider'}
export interface CardNode extends Base {component:'Card';child:string}
export interface DisclosureNode extends Base {component:'Disclosure';title:string;summary?:string;open:boolean;child:string}
export interface TabsNode extends Base {component:'Tabs';tabs:{title:string;child:string}[]}
interface CalloutNode extends Base {component:'Callout';title?:string;tone?:string;text:string}
interface MetricNode extends Base {component:'Metric';label:string;value:string;detail?:string;tone?:string;progress?:number}
interface TimelineNode extends Base {component:'Timeline';items:{label:string;when?:string;detail?:string;state?:string}[]}
interface FlowNode extends Base {component:'Flow';caption?:string;direction?:string;nodes:{id:string;label:string;detail?:string;tone?:string}[];edges:{from:string;to:string}[]}
interface TableNode extends Base {component:'Table';caption?:string;columns:string[];rows:{cells:string[];tone?:string}[];highlightColumn?:number}
interface ChartNode extends Base {component:'Chart';kind:'bar'|'line';caption?:string;unit?:string;max?:number;points:{label:string;value:number;note?:string;tone?:string}[]}
interface TextFieldNode extends Base {component:'TextField';label:string;value:Binding;variant:'longText'|'shortText'}
interface CheckBoxNode extends Base {component:'CheckBox';label:string;value:Binding}
interface SliderNode extends Base {component:'Slider';label:string;min:number;max:number;value:Binding}
interface ChoicePickerNode extends Base {component:'ChoicePicker';label:string;options:{label:string;value:string}[];value:Binding;variant:'mutuallyExclusive'|'multipleSelection';displayStyle:'chips'|'checkbox'}
export interface ButtonNode extends Base {component:'Button';child:string;variant:'primary'|'borderless'|'default';action:{event:{name:string;context:Record<string,Binding>}}}
export type InputNode=TextFieldNode|CheckBoxNode|SliderNode|ChoicePickerNode;
export const isInput=(n:Component):n is InputNode=>n.component==='TextField'||n.component==='CheckBox'||n.component==='Slider'||n.component==='ChoicePicker';
export type Component=TextNode|StackNode|ListNode|DividerNode|CardNode|DisclosureNode|TabsNode|CalloutNode|MetricNode|TimelineNode|FlowNode|TableNode|ChartNode|InputNode|ButtonNode;
// Each message carries exactly one operation; the others are absent, so a truthy check narrows the union.
interface Ops {createSurface?:never;updateComponents?:never;updateDataModel?:never;deleteSurface?:never}
type Op<K extends keyof Ops,V>=Omit<Ops,K>&{version:'v0.9.1'}&Record<K,V>;
export type CreateSurface=Op<'createSurface',{surfaceId:string;catalogId:string}>;
type UpdateComponents=Op<'updateComponents',{surfaceId:string;components:Component[]}>;
type UpdateDataModel=Op<'updateDataModel',{surfaceId:string;path:string;value:DataModel}>;
type DeleteSurface=Op<'deleteSurface',{surfaceId:string}>;
export type Message=CreateSurface|UpdateComponents|UpdateDataModel|DeleteSurface;
export interface Snapshot {revision:number;messages:Message[]}
export const moduleIds=(s:Snapshot):string[]=>s.messages.flatMap(m=>m.createSurface?[m.createSurface.surfaceId]:[]);
export const moduleNodes=(s:Snapshot,id:string):Component[]=>s.messages.find((m):m is UpdateComponents=>m.updateComponents?.surfaceId===id)?.updateComponents.components??[];
export const moduleData=(s:Snapshot,id:string):DataModel|undefined=>s.messages.find((m):m is UpdateDataModel=>m.updateDataModel?.surfaceId===id)?.updateDataModel.value;
export function checkPath(path:string){
 if(!/^\/(?:[^/~]+(?:~[01][^/~]*)*\/?)+$/.test(path)||path==='/'||path.length>160)throw Error('Only bounded absolute JSON Pointer leaf bindings');
 if(path.split('/').some(k=>['__proto__','constructor','prototype'].includes(k.replace(/~1/g,'/').replace(/~0/g,'~'))))throw Error('Forbidden path segment');
 return path;
}
export function atPath(data:unknown,path:string):unknown{return checkPath(path).split('/').slice(1).reduce<unknown>((v,k)=>v!==null&&typeof v==='object'?(v as Record<string,unknown>)[k.replace(/~1/g,'/').replace(/~0/g,'~')]:undefined,data);}

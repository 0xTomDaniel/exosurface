// Offline, non-shipping comparison. Applies the bounded-container mechanism from
// Zod upstream a0ebf970f2d752e5f58527cd2942ff48be4f46bd to a DISPOSABLE 3.25.76 copy.
// Neither this candidate nor passing these checks establishes release remediation.
// Inputs: pristine Zod3, pristine A2UI web_core, fresh scratch, optional pinned
// zod-to-json-schema directory and published Zod4 directory.
// Packages must first be verified against the committed review provenance.
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const [zod, core, scratch, converter, zod4] = process.argv.slice(2).map(p=>resolve(p));
if(!zod||!core||!scratch)throw Error('Provide verified pristine Zod3, web_core and a fresh scratch directory');
mkdirSync(scratch); // Refuse overwrite/reuse. Nothing in the installed runtime is patched.
const original=join(scratch,'original'), candidate=join(scratch,'candidate');
for(const dir of [original,candidate]){
 cpSync(zod,join(dir,'zod'),{recursive:true});cpSync(core,join(dir,'core'),{recursive:true});
 if(converter){cpSync(converter,join(dir,'converter'),{recursive:true});mkdirSync(join(dir,'converter','node_modules'),{recursive:true});symlinkSync(join(dir,'zod'),join(dir,'converter','node_modules','zod'));}
 mkdirSync(join(dir,'core','node_modules'),{recursive:true});symlinkSync(join(dir,'zod'),join(dir,'core','node_modules','zod'));
}
const file=join(candidate,'zod','v3','types.js'), source=readFileSync(file,'utf8');
let patched=source;
const replace=(before,after)=>{assert.equal(patched.split(before).length,2,'Unique pinned-source patch anchor');patched=patched.replace(before,after);};
replace('message: def.exactLength.message,\n                });\n                status.dirty();','message: def.exactLength.message,\n                });\n                if (tooBig) return INVALID;\n                status.dirty();');
for(const key of ['maxLength','maxSize'])replace(`message: def.${key}.message,\n                });\n                status.dirty();`,`message: def.${key}.message,\n                });\n                return INVALID;`);
writeFileSync(file,patched);
const issueCount=e=>e.issues.reduce((n,i)=>n+1+(i.unionErrors??[]).reduce((m,x)=>m+issueCount(x),0),0);
const results={},conversions={};
for(const [label,dir]of [['pristine',original],['candidate',candidate],...(zod4?[['publishedZod4',null]]:[])]){
 const {z}=await import(pathToFileURL(dir?join(dir,'zod','v3','index.js'):join(zod4,'index.js')).href);
 const schemas=dir?await import(pathToFileURL(join(dir,'core','src','v0_9','schema','server-to-client.js')).href):null;
 let legacyChoice65Accepted=null;
 if(dir){const {ChoicePickerApi}=await import(pathToFileURL(join(dir,'core','src','v0_9','basic_catalog','components','basic_components.js')).href);legacyChoice65Accepted=ChoicePickerApi.schema.safeParse({options:Array.from({length:65},(_,i)=>({label:`Choice ${i}`,value:`choice-${i}`})),value:{path:'/selected'}}).success;assert.equal(legacyChoice65Accepted,true);}
 let visited=0,refined=0;
 const child=z.any().superRefine((_v,ctx)=>{visited++;ctx.addIssue({code:'custom',message:'invalid item'});});
 const bounded=z.array(child).max(2).superRefine(()=>refined++).safeParse(Array(2048).fill(0));assert.equal(bounded.success,false);
 const boundedVisits=visited,boundedRefinements=refined;
 visited=0;const unbounded=z.array(child).safeParse(Array(2048).fill(0));assert.equal(unbounded.success,false);const unboundedVisits=visited;
 let asyncVisits=0;const asyncResult=await z.array(z.string().superRefine(async(_v,ctx)=>{await Promise.resolve();asyncVisits++;ctx.addIssue({code:'custom',message:'invalid async item'});})).max(2).safeParseAsync(['a','b','c']);assert.equal(asyncResult.success,false);
 const raw={version:'v0.9.1',updateComponents:{surfaceId:'page',components:Array(2048).fill(0)}};
 const actual=(schemas?.A2uiMessageSchema??z.object({version:z.literal('v0.9.1'),updateComponents:z.object({surfaceId:z.string(),components:z.array(z.record(z.string(),z.any())).min(1)})})).safeParse(raw);assert.equal(actual.success,false);
 const leaf=z.object({x:z.string(),y:z.string()});
 const nested=z.array(z.array(leaf)).safeParse(Array.from({length:16},()=>Array.from({length:16},()=>({}))));assert.equal(nested.success,false);
 let tree;tree=z.object({children:z.array(z.lazy(()=>tree))});const make=n=>n?{children:Array.from({length:3},()=>make(n-1))}:0;
 const recursive=tree.safeParse(make(5));assert.equal(recursive.success,false);
 let gatedVisits=0;const gated=z.array(z.array(z.any().superRefine(()=>gatedVisits++)).max(2)).max(2).safeParse(Array.from({length:3},()=>[1,2,3]));assert.equal(gated.success,false);
 // Valid output and schema descriptors remain unchanged; invalid oversized issue
 // ordering/refinement execution deliberately differs, just as in the upstream fix.
 const valid=z.array(z.object({name:z.string(),tags:z.array(z.string()).max(4)})).max(2);
 const fixture=[{name:'Exosurface',tags:['one','two']}];assert.deepEqual(valid.parse(fixture),fixture);assert.deepEqual(await valid.parseAsync(fixture),fixture);
 if(dir&&converter){const {zodToJsonSchema}=await import(pathToFileURL(join(dir,'converter','dist','esm','index.js')).href);conversions[label]=JSON.stringify([zodToJsonSchema(valid,{target:'jsonSchema7'}),zodToJsonSchema(schemas.A2uiMessageSchema,{target:'jsonSchema7'})]);}
 const exact=z.array(z.string()).length(2).safeParse(['a','b','c']);assert.equal(exact.success,false);
 const set=z.set(child).max(2).safeParse(new Set([1,2,3]));assert.equal(set.success,false);
 results[label]={legacyChoice65Accepted,boundedVisits,boundedRefinements,boundedIssues:issueCount(bounded.error),unboundedVisits,unboundedIssues:issueCount(unbounded.error),asyncVisits,actualA2uiIssues:schemas?issueCount(actual.error):null,reconstructedMessageIssues:schemas?null:issueCount(actual.error),nestedIssues:issueCount(nested.error),recursiveIssues:issueCount(recursive.error),gatedVisits,exactIssues:issueCount(exact.error),setIssues:issueCount(set.error),validSyncAsyncFixture:true};
}
if(converter)assert.equal(conversions.pristine,conversions.candidate,'Pinned converter schema parity');
if(zod4){assert.equal(results.publishedZod4.boundedVisits,0);assert.equal(results.publishedZod4.asyncVisits,0);assert.equal(results.publishedZod4.unboundedIssues,results.pristine.unboundedIssues);}
assert.equal(results.candidate.boundedVisits,0);assert.equal(results.candidate.asyncVisits,0);assert.equal(results.candidate.gatedVisits,0);
assert.equal(results.pristine.boundedVisits,2048);assert.equal(results.pristine.asyncVisits,3);
for(const key of ['unboundedIssues','actualA2uiIssues','nestedIssues','recursiveIssues'])assert.equal(results.candidate[key],results.pristine[key]);
console.log(JSON.stringify({classification:'mechanism-comparison-only; advisory-remediation-undetermined',shippingPatch:false,source:'zod@3.25.76/v3/types.js',sourceSha256:createHash('sha256').update(source).digest('hex'),candidateSha256:createHash('sha256').update(patched).digest('hex'),converterParity:converter?{identical:true,sha256:createHash('sha256').update(conversions.pristine).digest('hex'),scope:'valid catalog-shaped fixture and actual v0.9 message schema only; not full catalog/UI parity'}:null,results,conclusion:'Constrained-container early rejection prevents child parsing and async child dispatch in these probes. Unbounded/nested/recursive probes retain their error reporting at one fixed input size. These counts do not establish an exploit, superlinear resource amplification, admitted-app vulnerability, or vulnerability of published Zod4. No production patch or complete UI/schema parity is established.'},null,2));

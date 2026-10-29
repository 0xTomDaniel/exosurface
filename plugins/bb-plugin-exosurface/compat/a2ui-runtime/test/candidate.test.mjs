import test,{after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,cpSync,mkdirSync,mkdtempSync,symlinkSync,rmSync,existsSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';
const root=fileURLToPath(new URL('../',import.meta.url)),req=createRequire(import.meta.url);
const patched=dirname(req.resolve('zod/package.json')),upstream=dirname(req.resolve('zod-upstream/package.json'));
const scratch=mkdtempSync(join(tmpdir(),'exo-zod3-shipping-'));
const hash=b=>createHash('sha256').update(b).digest('hex');
const load=p=>import(pathToFileURL(p).href);
const files=dir=>readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)).map(p=>`${e.name}/${p}`):[e.name]).sort();
after(()=>rmSync(scratch,{recursive:true,force:true}));
function packageRoot(specifier){let dir=dirname(req.resolve(specifier));for(;;){const p=join(dir,'package.json');if(existsSync(p)&&JSON.parse(readFileSync(p)).name===specifier)return dir;const parent=dirname(dir);if(parent===dir)throw Error(`Package root ${specifier}`);dir=parent;}}
function linkModules(destination,overrides={}){
 mkdirSync(destination,{recursive:true});
 for(const entry of readdirSync(join(root,'node_modules'))){
  if(entry.startsWith('.'))continue;
  if(entry.startsWith('@')){
   mkdirSync(join(destination,entry),{recursive:true});
   for(const child of readdirSync(join(root,'node_modules',entry))){const name=`${entry}/${child}`;symlinkSync(overrides[name]??join(root,'node_modules',name),join(destination,name));}
  }else symlinkSync(overrides[entry]??join(root,'node_modules',entry),join(destination,entry));
 }
}
const baseline=join(scratch,'baseline');mkdirSync(baseline);
for(const [name,source]of [['core',packageRoot('@a2ui/web_core')],['converter',packageRoot('zod-to-json-schema')]]){
 cpSync(source,join(scratch,name),{recursive:true,filter:p=>!p.slice(source.length).split('/').includes('node_modules')});
 // The published packages have no nested runtime dependencies in this lock.
 if(existsSync(join(scratch,name,'node_modules')))rmSync(join(scratch,name,'node_modules'),{recursive:true});
 symlinkSync(join(baseline,'node_modules'),join(scratch,name,'node_modules'));
}
linkModules(join(baseline,'node_modules'),{zod:upstream,'@a2ui/web_core':join(scratch,'core'),'zod-to-json-schema':join(scratch,'converter')});
const v3=(await load(join(patched,'index.js'))).z,base=(await load(join(upstream,'index.js'))).z;
const esmV3=(await load(join(patched,'v3/index.js'))).z;
const cjs=req('zod').z,cjsV3=req('zod/v3').z;
// Compile the actual shipped TS source with its .js specifiers, outside
// node_modules. This tests source semantics rather than another compiled entry.
const compiled=join(scratch,'source');mkdirSync(compiled);writeFileSync(join(compiled,'package.json'),'{"type":"module"}');
for(const relative of ['index.ts',...files(join(patched,'src/v3')).filter(p=>p.endsWith('.ts')&&!p.endsWith('.d.ts')&&!p.split('/').some(x=>['tests','benchmarks','__tests__','__benchmarks__'].includes(x))).map(p=>`v3/${p}`)]){
 const source=readFileSync(join(patched,'src',relative),'utf8'),output=join(compiled,relative.replace(/\.ts$/,'.js'));mkdirSync(dirname(output),{recursive:true});
 const result=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022},reportDiagnostics:true});
 assert.equal(result.diagnostics?.filter(d=>d.category===ts.DiagnosticCategory.Error).length??0,0);writeFileSync(output,result.outputText);
}
const sourceZ=(await load(join(compiled,'index.js'))).z,sourceV3=(await load(join(compiled,'v3/index.js'))).z;
for(const [entry,z]of [['ESM root',v3],['ESM /v3',esmV3],['CJS root',cjs],['CJS /v3',cjsV3],['TS source root',sourceZ],['TS source /v3',sourceV3]]){
 test(`${entry}: constrained rejection before child parsing, refinements and async dispatch`,async()=>{
  let visits=0,outer=0;
  const child=z.any().superRefine((_v,ctx)=>{visits++;ctx.addIssue({code:'custom',message:'invalid child'});});
  for(const schema of [z.array(child).max(2),z.array(child).length(2),z.set(child).max(2),z.set(child).size(2)]){
   const input=schema instanceof z.ZodSet?new Set([0,1,2]):Array(2048).fill(0);
   const result=schema.superRefine(()=>outer++).safeParse(input);assert.equal(result.success,false);assert.equal(result.error.issues.length,1);assert.equal(result.error.issues[0].code,'too_big');
  }
  const sparse=[];sparse[1_000_000]=0;assert.equal(z.array(child).max(2).safeParse(sparse).success,false);
  assert.equal(visits,0);assert.equal(outer,0);
  let asyncVisits=0;const asyncChild=z.string().superRefine(async()=>{asyncVisits++;await Promise.resolve();});
  assert.equal((await z.array(asyncChild).max(2).safeParseAsync(['a','b','c'])).success,false);
  assert.equal((await z.set(asyncChild).max(2).safeParseAsync(new Set(['a','b','c']))).success,false);assert.equal(asyncVisits,0);
  let nestedVisits=0;const nested=z.array(z.array(z.any().superRefine(()=>nestedVisits++)).max(2)).max(2);
  assert.equal(nested.safeParse([[1,2,3],[1,2,3]]).success,false);assert.equal(nestedVisits,0);
  let recursiveVisits=0,tree;tree=z.object({children:z.array(z.lazy(()=>{recursiveVisits++;return tree;})).max(2)});
  assert.equal(tree.safeParse({children:[0,0,0]}).success,false);assert.equal(recursiveVisits,0);
 });
 test(`${entry}: accepted output, below-bound issues and unconstrained behavior match upstream`,async()=>{
  const schema=lib=>lib.object({rows:lib.array(lib.object({name:lib.string().trim(),values:lib.array(lib.number().transform(n=>n+1)).max(3)})).max(2),map:lib.map(lib.string(),lib.number()),set:lib.set(lib.number()).max(3)});
  const input={rows:[{name:' Exo ',values:[1,2]}],map:new Map([['a',1]]),set:new Set([1,2])};
  assert.deepEqual(schema(z).parse(input),schema(base).parse(input));assert.deepEqual(await schema(z).parseAsync(input),await schema(base).parseAsync(input));
  const bad={...input,rows:[{name:0,values:['x']}]};assert.deepEqual(schema(z).safeParse(bad).error.issues,schema(base).safeParse(bad).error.issues);
  const asynchronous=lib=>lib.array(lib.string().transform(async s=>s.length)).max(3);assert.deepEqual(await asynchronous(z).parseAsync(['one','two']),await asynchronous(base).parseAsync(['one','two']));
  assert.deepEqual(z.array(z.string()).safeParse([0,0]).error.issues,base.array(base.string()).safeParse([0,0]).error.issues);
  assert.deepEqual(z.array(z.string()).min(2).safeParse([0]).error.issues,base.array(base.string()).min(2).safeParse([0]).error.issues);
  const before=lib=>lib.preprocess(v=>Array.isArray(v)?v.slice(0,2):v,lib.array(lib.string()).max(2));assert.deepEqual(before(z).parse(['a','b','c']),before(base).parse(['a','b','c']));
  const alternatives=lib=>lib.union([lib.array(lib.object({x:lib.string()})).max(2),lib.array(lib.number())]);assert.deepEqual(alternatives(z).parse([1,2,3]),alternatives(base).parse([1,2,3]));
  assert.equal(typeof z.map(z.string(),z.string()).max,'undefined','No invented Map size API');
 });
}
test('Finite upstream control demonstrates pre-child mechanism gap, not an application exploit',async()=>{
 let sync=0,async=0;const child=base.any().superRefine(()=>sync++);
 assert.equal(base.array(child).max(2).safeParse([0,1,2]).success,false);assert.equal(sync,3);
 assert.equal((await base.array(base.any().superRefine(async()=>{async++;await Promise.resolve();})).max(2).safeParseAsync([0,1,2])).success,false);assert.equal(async,3);
});
test('Artifact identity: only three implementations, version and notice differ; license/API/type files unchanged',()=>{
 const manifest=JSON.parse(readFileSync(new URL('../../zod3/artifact.json',import.meta.url))),up=files(upstream),local=files(patched);
 assert.deepEqual(local.filter(p=>p!=='EXOSURFACE_BACKPORT.md'),up);
 const changed=up.filter(p=>!readFileSync(join(patched,p)).equals(readFileSync(join(upstream,p))));assert.deepEqual(changed,['package.json','src/v3/types.ts','v3/types.cjs','v3/types.js']);
 for(const change of manifest.changes){const name=change.path.replace(/^package\//,'');assert.equal(hash(readFileSync(join(upstream,name))),change.upstreamSha256);assert.equal(hash(readFileSync(join(patched,name))),change.patchedSha256);}
 const tar=readFileSync(new URL(`../../zod3/${manifest.artifact}`,import.meta.url));assert.equal(hash(tar),manifest.sha256);assert.equal('sha512-'+createHash('sha512').update(tar).digest('base64'),manifest.integrity);
 const lock=JSON.parse(readFileSync(join(root,'package-lock.json')));assert.equal(lock.packages['node_modules/zod'].integrity,manifest.integrity);
 assert.equal(JSON.parse(readFileSync(join(patched,'package.json'))).version,'3.25.76+exosurface.1');
});
test('Actual renderer/core/converter resolve patched v3; SDK independently resolves pinned Zod4',async()=>{
 for(const specifier of ['@a2ui/react','@a2ui/web_core','zod-to-json-schema']){
  const directory=packageRoot(specifier),imports=new Set();
  for(const name of files(directory).filter(p=>/\.(?:cjs|mjs|js)$/.test(p)&&!p.split('/').includes('node_modules'))){
   const source=readFileSync(join(directory,name),'utf8');
   for(const match of source.matchAll(/(?:from\s*|import\s*\(\s*|require\s*\(\s*)['"](zod(?:\/[^'"]*)?)['"]/g))imports.add(match[1]);
  }
  if(specifier!=='@a2ui/react')assert.ok(imports.size>0,`${specifier} runtime Zod import inventory`); // React delegates validation to core.
  assert.ok([...imports].every(p=>p==='zod'||p==='zod/v3'),`${specifier} must not consume legacy bundled v4`);
  const consumer=createRequire(req.resolve(specifier));assert.equal(consumer.resolve('zod/package.json'),join(patched,'package.json'));assert.equal(consumer('zod/v3').z.ZodArray,cjsV3.ZodArray);
 }
 const sdk=createRequire(req.resolve('@get-bb/plugin-sdk'));assert.equal(JSON.parse(readFileSync(sdk.resolve('zod/package.json'))).version,'4.6.6');
 assert.notEqual(sdk.resolve('zod/package.json'),join(patched,'package.json'));const z4=sdk('zod').z;assert.deepEqual(z4.object({text:z4.string()}).parse({text:'SDK4'}),{text:'SDK4'});
 // Import the actual SDK rather than invoking any BB host/provider service.
 const sdkModule=await import('@get-bb/plugin-sdk');const contract=sdkModule.defineRpcContract({echo:{input:z4.object({text:z4.string()}),output:z4.string()}});assert.deepEqual(contract.echo.input.parse({text:'SDK contract'}),{text:'SDK contract'});
 // Browser React entry requires HTMLElement/DOM; dependency resolution and
 // schema types are covered here, not browser execution. No fake DOM is used.
});
const core=await import('@a2ui/web_core/v0_9'),basic=await import('@a2ui/web_core/v0_9/basic_catalog');
const baseCore=await load(join(scratch,'core/src/v0_9/index.js')),baseBasic=await load(join(scratch,'core/src/v0_9/basic_catalog/index.js'));
const converter=await import('zod-to-json-schema'),baseConverter=await load(join(scratch,'converter/dist/esm/index.js'));
function assertSchemaParity(a,b,label){const capture=fn=>{const warnings=[],previous=console.warn;console.warn=(...args)=>warnings.push(args.map(String).join(' '));try{return {output:fn(),warnings};}finally{console.warn=previous;}};assert.deepEqual(capture(a),capture(b),label);}
test('Unchanged official basic catalog schema, child refs, converter and >64 ChoicePicker options',()=>{
 assertSchemaParity(()=>basic.basicCatalog.catalogSchema,()=>baseBasic.basicCatalog.catalogSchema,'Basic catalog and converter diagnostics');assert.deepEqual(basic.basicCatalog.componentRefMap,baseBasic.basicCatalog.componentRefMap);
 const options=Array.from({length:65},(_,i)=>({label:`Option ${i}`,value:`value-${i}`})),props={options,value:{path:'/selection'}};
 for(const name of basic.basicCatalog.components.keys()){
  const a=basic.basicCatalog.components.get(name).schema,b=baseBasic.basicCatalog.components.get(name).schema;
  assertSchemaParity(()=>converter.zodToJsonSchema(a),()=>baseConverter.zodToJsonSchema(b),name);
 }
 assert.deepEqual(basic.basicCatalog.components.get('ChoicePicker').schema.parse(props),baseBasic.basicCatalog.components.get('ChoicePicker').schema.parse(props));
 const message={version:'v0.9.1',updateComponents:{surfaceId:'page',components:[{id:'pick',component:'ChoicePicker',...props}]}};
 assert.deepEqual(core.A2uiMessageSchema.parse(message),baseCore.A2uiMessageSchema.parse(message));
});
const legacy=resolve(process.env.EXO_LEGACY_SOURCE??fileURLToPath(new URL('../../../../bb-plugin-exo-a2ui-spike/',import.meta.url)));
const legacyPin=JSON.parse(readFileSync(new URL('../legacy-fixtures.json',import.meta.url)));
for(const [path,digest]of Object.entries(legacyPin.files))assert.equal(hash(readFileSync(join(legacy,path))),digest,`Pinned legacy fixture: ${path}`);
function legacyCopy(name){
 const dir=join(scratch,name);mkdirSync(dir);
 for(const path of ['src','test','lib','skills','app.tsx','host.ts','server.ts','package.json'])if(existsSync(join(legacy,path)))cpSync(join(legacy,path),join(dir,path),{recursive:true});
 if(name==='legacy-baseline')symlinkSync(join(baseline,'node_modules'),join(dir,'node_modules'));else symlinkSync(join(root,'node_modules'),join(dir,'node_modules'));
 return dir;
}
const legacyPatched=legacyCopy('legacy-patched'),legacyBaseline=legacyCopy('legacy-baseline');
test('Existing Exo catalog schema/refs and accepted workspace including 65 options preserve output',async()=>{
 const a=await load(join(legacyPatched,'src/workspace.ts')),b=await load(join(legacyBaseline,'src/workspace.ts'));
 const ac=await load(join(legacyPatched,'src/exo-catalog.ts')),bc=await load(join(legacyBaseline,'src/exo-catalog.ts'));
 assertSchemaParity(()=>ac.exoApiCatalog.catalogSchema,()=>bc.exoApiCatalog.catalogSchema,'Exo catalog and converter diagnostics');assert.deepEqual(ac.exoApiCatalog.componentRefMap,bc.exoApiCatalog.componentRefMap);
 const {sampleMessages}=await load(join(legacyPatched,'test/sample.ts'));const snapshot={revision:1,messages:sampleMessages()};assert.deepEqual(a.validateSnapshot(snapshot),b.validateSnapshot(structuredClone(snapshot)));
 const version='v0.9.1',surfaceId='choices',options=Array.from({length:65},(_,i)=>({label:`Option ${i}`,value:`value-${i}`}));
 const choices={revision:1,messages:[{version,createSurface:{surfaceId,catalogId:a.CATALOG}},{version,updateComponents:{surfaceId,components:[{id:'root',component:'Column',children:['pick']},{id:'pick',component:'ChoicePicker',options,value:{path:'/selection'}}]}},{version,updateDataModel:{surfaceId,path:'/',value:{selection:[]}}}]};
 assert.deepEqual(a.validateSnapshot(choices),b.validateSnapshot(structuredClone(choices)));
});
for(const [name,dir]of [['upstream',legacyBaseline],['patched',legacyPatched]])test(`Unmodified legacy ${name} snapshot/workspace/stage/incremental fixture suite`,()=>{
 const result=spawnSync(process.execPath,['--experimental-transform-types','--test','--test-reporter=tap',...legacyPin.tests.map(p=>join(dir,p))],{cwd:dir,env:{HOME:process.env.HOME,TMPDIR:process.env.TMPDIR,PATH:process.env.PATH},encoding:'utf8',timeout:45000,maxBuffer:4*1024*1024});
 assert.equal(result.error,undefined);assert.equal(result.status,0,result.stdout+'\n'+result.stderr);
 assert.ok(Number(result.stdout.match(/^# tests (\d+)/m)?.[1])>0,'Nested fixture runner must actually execute tests');
 const summary=result.stdout.split('\n').filter(line=>/^# (tests|pass|fail) /.test(line)).join('; ');console.log(`${name} unmodified legacy fixtures: ${summary}`);
});

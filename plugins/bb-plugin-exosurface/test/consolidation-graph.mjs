// Maintained pnpm/consumer graph diagnostics, not native-BB packaged-product acceptance.
import assert from 'node:assert/strict';
import {createRequire,isBuiltin} from 'node:module';
import {parse} from 'yaml';
import {readFileSync,existsSync} from 'node:fs';
import {dirname,resolve,join,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve(process.argv[2]??fileURLToPath(new URL('..',import.meta.url)));
const artifact=resolve(process.argv[3]??root);
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const packageOf=entry=>{for(let p=dirname(entry);;p=dirname(p)){if(existsSync(join(p,'package.json'))){const m=read(join(p,'package.json'));if(m.name&&m.version)return {dir:p,...m};}if(dirname(p)===p)throw Error('Missing package provenance: '+entry);}};
const pnpmCLI=process.argv[4]??'pnpm';
const pnpmLists=[],workspace=resolve(root,'../..'),lock=parse(readFileSync(join(workspace,'pnpm-lock.yaml'),'utf8'));
for(const project of ['.','legacy/surface','legacy/surface/composition']){
 const cwd=join(root,project),manifest=read(join(cwd,'package.json')),importer=relative(workspace,cwd).replaceAll('\\','/');
 assert.ok(lock.importers[importer],`Missing locked importer: ${importer}`);
 for(const field of ['dependencies','devDependencies','optionalDependencies'])for(const [name,specifier] of Object.entries(manifest[field]??{}))assert.equal(lock.importers[importer][field]?.[name]?.specifier,specifier);
 const result=spawnSync(pnpmCLI,['list','--depth','Infinity','--json'],{cwd,env:process.env,encoding:'utf8',timeout:20000,maxBuffer:16*1024*1024});
 assert.equal(result.status,0,result.stderr);const listing=readTree(result.stdout);assert.ok(Array.isArray(listing)&&listing.some(row=>row.path===cwd));
 assert.ok(!listing.some(row=>row.problems?.length));pnpmLists.push({project,exit:result.status});
}
function readTree(text){return JSON.parse(text);}
const primary=createRequire(join(root,'legacy/primary/server.ts'));
const surface=createRequire(join(root,'legacy/surface/server.ts'));
const consumers=new Map([['surface',surface.resolve('zod')]]);
const queue=['@a2ui/web_core/v0_9','@a2ui/react/v0_9','zod-to-json-schema','@a2ui/markdown-it'].map(name=>[name,surface.resolve(name)]);
// Follow actual A2UI/converter edges, not just root-level manifest assertions.
const seen=new Set();
while(queue.length){const [label,entry]=queue.shift();if(seen.has(entry))continue;seen.add(entry);
 const p=packageOf(entry),r=createRequire(entry);
 if(p.dependencies?.zod||p.peerDependencies?.zod)consumers.set(label,r.resolve('zod'));
 for(const name of Object.keys({...p.dependencies,...p.peerDependencies}).filter(n=>n.startsWith('@a2ui/')||n==='zod-to-json-schema'))queue.push([label+' -> '+name,r.resolve(name==='@a2ui/web_core'?name+'/v0_9':name==='@a2ui/react'?name+'/v0_9':name)]);
}
const rows=[];
for(const [consumer,entry] of consumers){const p=packageOf(entry);assert.equal(p.version,'3.25.76+exosurface.1');
 for(const [mode,namespace] of [['cjs',createRequire(entry)(entry)],['esm',await import(pathToFileURL(join(p.dir,'index.js')).href)]]){
  const z=namespace.z??namespace;let visits=0;const child=z.unknown().transform(x=>{visits++;return x;});
  for(const schema of [z.array(child).max(1),z.set(child).max(1)]){
   const values=schema instanceof z.ZodSet?new Set([1,2]):[1,2];
   assert.equal(schema.safeParse(values).success,false);assert.equal(visits,0);
   assert.equal((await schema.safeParseAsync(values)).success,false);assert.equal(visits,0);
  }
  rows.push({consumer,mode,entry,version:p.version,oversizeChildVisits:visits});
 }
}
for(const [consumer,r] of [['primary',primary],['primary SDK',createRequire(primary.resolve('@get-bb/plugin-sdk'))],['surface SDK',createRequire(surface.resolve('@get-bb/plugin-sdk'))]]){
 const entry=r.resolve('zod');assert.equal(packageOf(entry).version,'4.6.6');rows.push({consumer,entry,version:'4.6.6'});
}
const markdownEntry=surface.resolve('@a2ui/markdown-it'),markdown=packageOf(markdownEntry);
const sanitizerEntry=createRequire(markdownEntry).resolve('dompurify');
assert.equal(packageOf(sanitizerEntry).version,'3.4.17');
console.log(JSON.stringify({format:'exosurface-consumer-graph/0',consumers:rows,markdown:{entry:markdownEntry,declaredDOMPurify:markdown.dependencies.dompurify,resolvedDOMPurify:sanitizerEntry,version:packageOf(sanitizerEntry).version,workspaceScopedOverride:lock.overrides['@a2ui/markdown-it>dompurify']},pnpmLists},null,2));
const provenance=join(artifact,'resources/provenance/zod3'),meta=read(join(provenance,'artifact.json'));
assert.equal(createHash('sha256').update(readFileSync(join(provenance,meta.artifact))).digest('hex'),meta.sha256);
for(const change of meta.changes){const path=change.path.replace(/^package\//,'');assert.equal(createHash('sha256').update(readFileSync(join(packageOf(surface.resolve('zod')).dir,path))).digest('hex'),change.patchedSha256);}
const graph=read(join(artifact,'dist/runtime-graph.json'));assert.equal(graph.releaseReady,false);
for(const [name,g] of Object.entries(graph.entries)){
 assert.ok(!g.inputs.some(p=>p.includes('@json-render/core')||p.endsWith('composition/engine.ts')));
 for(const out of Object.values(g.outputs))for(const imp of out.imports)if(imp.external)assert.ok(isBuiltin(imp.path),imp.path);
 if(name.startsWith('workspace-'))assert.ok(g.inputs.includes(relative(root,join(packageOf(surface.resolve('zod')).dir,'v3/types.js')).replaceAll('\\','/')));
}
// These are assertions against the actual BB-emitted app bundle, not a parallel renderer bundle.
const server=readFileSync(join(artifact,'dist/server.js'),'utf8');
// BB emits build-only maps; do not expand shipped debug/source allowlists.
assert.deepEqual(readFileSync(join(artifact,'dist/server.js')),readFileSync(join(root,'dist/server.js')));
const serverMap=read(join(root,'dist/server.js.map'));
// BB0.48 emits under dist/.stage-*/server.js then copies the map unchanged to
// dist (plugin-O362IKMI.js:2608-2610). Resolve its original staging coordinates.
const serverMapBase=join(root,'dist','.stage-');
assert.ok(serverMap.sources.some(p=>resolve(serverMapBase,p)===join(packageOf(primary.resolve('zod')).dir,'v4/core/versions.js')));
assert.ok(serverMap.sources.some(p=>resolve(serverMapBase,p)===join(packageOf(surface.resolve('zod')).dir,'v3/types.js')));
assert.match(server,/major:4,minor:6,patch:6/);
const app=readFileSync(join(artifact,'dist/app.js'),'utf8');assert.ok(app.includes('3.4.17'));assert.ok(!app.includes('3.4.11'));
assert.match(app,/\.maxLength!==null&&\w+\.data\.length>\w+\.maxLength\.value\)return/);
assert.match(app,/\.maxSize!==null&&\w+\.data\.size>\w+\.maxSize\.value\)return/);
console.log(JSON.stringify({format:'exosurface-artifact-graph/0',artifact,provenanceSHA256:meta.sha256,runtimeEntries:Object.keys(graph.entries),staticImportsBuiltinOnly:true,dynamicRequireResolutionNotCovered:true,relocatedImports:'separate required test/consolidation-relocated.mjs',archivedEngineAbsent:true,actualBBServerZod4:'4.6.6',actualBBServerZod3:'patched3.25.76; mapped input and installed file hashes',actualBBAppDOMPurify:'3.4.17',actualBBAppArraySetEarlyReturnPresent:true,releaseReady:false,nativeProductAcceptance:'NOT RUN; graph/static assertions are not UI behavior proof'}));

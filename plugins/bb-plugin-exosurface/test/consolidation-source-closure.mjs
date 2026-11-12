// Static build-input checks. Does not execute plugin modules or prove native behavior.
import assert from 'node:assert/strict';
import {parse} from 'yaml';
import {createRequire} from 'node:module';
import {readFileSync,existsSync,lstatSync,readdirSync} from 'node:fs';
import {resolve,join,dirname,relative} from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=resolve(process.argv[2]??fileURLToPath(new URL('..',import.meta.url)));
const artifact=resolve(process.argv[3]??root),require=createRequire(join(root,'package.json')),ts=require('typescript');
const json=p=>JSON.parse(readFileSync(p,'utf8')),sha=b=>createHash('sha256').update(b).digest('hex');
const contract=json(join(artifact,'release.json'));
const entries=['app.tsx','host.ts','server.ts'];
const inputs=['legacy/surface/package.json','legacy/surface/vendor/zod3/zod-3.25.76-exosurface.1.tgz','legacy/primary/src/canonical-initialization.ts'];
const todo=[...entries],seen=new Set(),bare=new Map();
function add(spec,from){
 if(!spec.startsWith('.')){if(!spec.startsWith('node:')){if(!bare.has(spec))bare.set(spec,new Set());bare.get(spec).add(from);}return;}
 const base=resolve(artifact,dirname(from),spec),p=[base,...['.ts','.tsx','.js','.mjs','.css','.json','/index.ts','/index.tsx'].map(x=>base+x)].find(x=>existsSync(x)&&lstatSync(x).isFile());
 assert.ok(p,`${from}: unresolved ${spec}`);const rel=relative(artifact,p);assert.ok(!rel.startsWith('..'),`Outside plugin: ${p}`);todo.push(rel);
}
while(todo.length){const file=todo.pop();if(seen.has(file))continue;seen.add(file);assert.ok(!lstatSync(join(artifact,file)).isSymbolicLink());
 if(!/\.[cm]?[jt]sx?$/.test(file))continue;
 const code=ts.transpileModule(readFileSync(join(artifact,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const ast=ts.createSourceFile(file+'.js',code,ts.ScriptTarget.Latest,true);
 function visit(n){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier){assert.ok(ts.isStringLiteral(n.moduleSpecifier));add(n.moduleSpecifier.text,file);}
 if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require'))){assert.ok(n.arguments[0]&&ts.isStringLiteral(n.arguments[0]),`Computed import requires explicit review: ${file}`);add(n.arguments[0].text,file);}ts.forEachChild(n,visit);}visit(ast);
}
const legacy=[...seen].filter(x=>x.startsWith('legacy/')).sort();
function checkAllow(files){const shipped=files.filter(x=>x.startsWith('legacy/'));assert.ok(shipped.every(x=>!/[?*\[\]{}]/.test(x)),'Legacy allowlist must be literal');assert.deepEqual([...shipped].sort(),[...legacy,...inputs].sort());}
// Original literal shipping list: 38 minus four explicit inputs = 34 runtime
// legacy sources; six primary + seven surface imports now give 47 (see migration
// record). Seven nonlegacy runtime sources give 54; three disjoint explicit
// inputs make 50 literal shipped legacy files. Exact equality stays independent.
checkAllow(contract.files);assert.equal(legacy.length,47);assert.equal(seen.size,54);
assert.ok(readFileSync(join(root,'build-runtime.mjs'),'utf8').includes("'canonical-initialization':'legacy/primary/src/canonical-initialization.ts'"));
assert.throws(()=>checkAllow([...contract.files,'legacy/**']));assert.throws(()=>checkAllow(contract.files.filter(x=>x!==legacy[0])));
assert.ok(![...seen].some(x=>x.includes('composition/engine')||x.includes('archived-')||x.includes('/test/')));
assert.deepEqual(contract.bbSource,{dependencyDirectories:['.','legacy/surface']});
assert.equal(contract.releaseReady,false);
const pkg=json(join(artifact,'package.json'));assert.deepEqual([pkg.bb.app,pkg.bb.host,pkg.bb.server],['./app.tsx','./host.ts','./server.ts']);
for(const file of [...seen,...inputs,'package.json'])assert.deepEqual(readFileSync(join(artifact,file)),readFileSync(join(root,file)),`Source bytes changed: ${file}`);
const sourceRoot=resolve(root,'../..'),snapshot='resources/provenance/workspace',lock=parse(readFileSync(join(artifact,snapshot,'pnpm-lock.yaml'),'utf8'));
const expectedImporters=['.','plugins/bb-plugin-exosurface','plugins/bb-plugin-exosurface/legacy/surface','plugins/bb-plugin-exosurface/legacy/surface/composition'];
assert.deepEqual(contract.dependencyProjects.map(p=>p.importer),expectedImporters);
for(const project of contract.dependencyProjects){
 assert.equal(project.sourceRoot,'repository');assert.equal(project.pluginRoot,'plugins/bb-plugin-exosurface');
 const sourcePackage=project.importer==='.'?'package.json':project.importer+'/package.json';
 assert.equal(project.sourcePackage,sourcePackage);assert.equal(project.sourceLock,'pnpm-lock.yaml');
 assert.equal(project.package,snapshot+'/'+sourcePackage);assert.equal(project.lock,snapshot+'/pnpm-lock.yaml');
 assert.deepEqual(readFileSync(join(artifact,project.package)),readFileSync(join(sourceRoot,project.sourcePackage)));
 assert.deepEqual(readFileSync(join(artifact,project.lock)),readFileSync(join(sourceRoot,project.sourceLock)));
 const p=json(join(artifact,project.package)),l=lock.importers[project.importer];assert.ok(l);
 for(const field of ['dependencies','devDependencies','optionalDependencies']){
  assert.deepEqual(Object.keys(p[field]??{}).sort(),Object.keys(l[field]??{}).sort());
  for(const [name,specifier] of Object.entries(p[field]??{}))assert.equal(l[field][name].specifier,specifier);
 }
}
for(const file of ['pnpm-workspace.yaml','.npmrc','mise.toml','mise.lock','mise-version'])assert.deepEqual(readFileSync(join(artifact,snapshot,file)),readFileSync(join(sourceRoot,file)));
// The actual root pnpm map owns every patch input, including declaration-only SDK repairs.
for(const [name,file] of Object.entries(json(join(sourceRoot,'package.json')).pnpm?.patchedDependencies??{})){
 assert.equal(typeof file,'string');assert.equal(lock.patchedDependencies[name].path,file);
 const resource=relative(artifact,join(artifact,snapshot,file)).replaceAll('\\','/');
 const bytes=readFileSync(join(sourceRoot,file));assert.deepEqual(readFileSync(join(artifact,resource)),bytes);
 assert.equal(contract.resources.find((/** @type {typeof import('../release.json').resources[number]} */ entry)=>entry.path===resource)?.sha256,sha(bytes));
}
const tar=readFileSync(join(artifact,inputs[1]));assert.equal(sha(tar),'df2fe07a78ee5288ac917a1b453aa6bf6cc2a437536c7208697e95dc14ce9fe5');
assert.deepEqual(tar,readFileSync(join(artifact,'resources/provenance/zod3/zod-3.25.76-exosurface.1.tgz')));
const tarPath='plugins/bb-plugin-exosurface/legacy/surface/vendor/zod3/zod-3.25.76-exosurface.1.tgz';
assert.deepEqual(tar,readFileSync(join(artifact,snapshot,tarPath)));
let patched=0;
for(const [path,entry] of Object.entries(lock.packages))if(entry.resolution?.tarball==='file:'+tarPath){assert.equal(entry.resolution.integrity,'sha512-'+createHash('sha512').update(tar).digest('base64'));assert.ok(path.startsWith('zod@file:'));patched++;}
assert.ok(patched>0);
assert.equal(lock.overrides['@a2ui/markdown-it>dompurify'],'3.4.17');
const markdown=Object.entries(lock.snapshots).filter(([name])=>name.startsWith('@a2ui/markdown-it@'));assert.ok(markdown.length>0);
for(const [,entry] of markdown)assert.equal(entry.dependencies.dompurify,'3.4.17');
for(const file of ['resources/provenance/zod3/LICENSE.upstream','resources/provenance/zod3/NOTICE.md'])assert.ok(readFileSync(join(artifact,file)).length>0);
// SDK tarball has no license field/file: preserve identity, report unresolved rights, never invent terms.
assert.deepEqual(json(join(artifact,'resources/licenses/@get-bb_plugin-sdk-0.6.15/package.json')),{name:'@get-bb/plugin-sdk',version:'0.6.15'});
for(const prefix of ['@a2ui_markdown-it-','@a2ui_react-','@a2ui_web_core-','dompurify-']){
 const licenses=readdirSync(join(artifact,'resources/licenses')).filter(x=>x.startsWith(prefix));assert.ok(licenses.length,`No notice provenance for ${prefix}`);
 for(const dir of licenses)assert.ok(readdirSync(join(artifact,'resources/licenses',dir)).some(x=>/license|notice|copying/i.test(x)),`No license/notice: ${dir}`);
}
for(const resource of contract.resources)assert.equal(sha(readFileSync(join(artifact,resource.path))),resource.sha256);
console.log(JSON.stringify({format:'exosurface-source-closure/0',entries,files:[...seen].sort(),addedLegacySources:legacy,dependencyInputs:inputs,dependencyDirectories:contract.bbSource.dependencyDirectories,bareImports:Object.fromEntries([...bare].sort().map(([k,v])=>[k,[...v].sort()])),patchedTarSHA256:sha(tar),patchedLockEntries:patched,resources:contract.resources.length,negativeAllowlistChecks:2,sdkLicense:'0.6.15 upstream package has no license metadata/file; rights acceptance unresolved',nativeAcceptance:'NOT PROVEN BY THIS STATIC TEST',releaseReady:false},null,2));

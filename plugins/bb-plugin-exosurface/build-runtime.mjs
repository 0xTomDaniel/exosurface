// Package the existing owner and actual extensions; no checkout-relative runtime imports.
import {build} from 'esbuild';
import {isBuiltin} from 'node:module';
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync,lstatSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative} from 'node:path';
import {createHash} from 'node:crypto';
const root=dirname(fileURLToPath(import.meta.url));
const entries={
 'owner-service':'legacy/primary/release-owner.ts',
 live:'legacy/primary/src/live.ts',
 'canonical-initialization':'legacy/primary/src/canonical-initialization.ts',
 'workspace-extension':'legacy/surface/src/workspace-extension.ts',
 'workspace-frame':'legacy/surface/src/workspace-frame.ts',
};
mkdirSync(join(root,'dist'),{recursive:true});
const graphs={};
for(const [name,entry] of Object.entries(entries)){
 const result=await build({absWorkingDir:root,entryPoints:[entry],outfile:`dist/${name}.js`,bundle:true,format:'esm',platform:'node',target:'node22.19',sourcemap:false,metafile:true,legalComments:'eof',banner:{js:"import {createRequire as __releaseCreateRequire} from 'node:module';const require=__releaseCreateRequire(import.meta.url);"}});
 for(const output of Object.values(result.metafile.outputs))for(const imp of output.imports)if(imp.external&&!isBuiltin(imp.path))throw Error('Unbundled runtime dependency: '+imp.path);
 const inputs=Object.keys(result.metafile.inputs);
 if(inputs.some(input=>input.includes('@json-render/core')||input.endsWith('composition/engine.ts')))throw Error('Archived composition entered active runtime');
 graphs[name]={entry,inputs,outputs:result.metafile.outputs};
}
// Resources are generated, never a checkout dependency or evidence directory.
if(existsSync(join(root,'resources')))rmSync(join(root,'resources'),{recursive:true});
mkdirSync(join(root,'resources'),{recursive:true});
cpSync(join(root,'legacy/surface/skills'),join(root,'resources/skills'),{recursive:true});
cpSync(join(root,'legacy/surface/vendor/zod3'),join(root,'resources/provenance/zod3'),{recursive:true});
mkdirSync(join(root,'resources/provenance/surface'),{recursive:true});
for(const file of ['package.json','package-lock.json'])cpSync(join(root,'legacy/surface',file),join(root,'resources/provenance/surface',file));
// Preserve dependency license/notice files from every package that actually entered these bundles.
const packages=new Map();
for(const graph of Object.values(graphs))for(const input of graph.inputs){
 if(!input.includes('node_modules/'))continue;
 let dir=dirname(join(root,input)),pkg;
 for(;;){
  if(existsSync(join(dir,'package.json'))){const candidate=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));if(candidate.name&&candidate.version){pkg=candidate;break;}}
  const parent=dirname(dir);if(parent===dir)throw Error('Package provenance missing: '+input);dir=parent;
 }
 packages.set(dir,{name:pkg.name,version:pkg.version,license:pkg.license});
}
// BB's frontend build does not expose an esbuild input manifest. Conservatively retain
// notices for the entire locked installed graph too (a superset, not proof of loading).
// Only what a production install puts there on every platform: lock entries neither dev nor os/cpu-specific, so the
// tracked release.json is the same bytes after any full `npm ci` on Linux or macOS (#139).
const shipped=project=>{const lock=JSON.parse(readFileSync(join(project,'package-lock.json'),'utf8')).packages;return dir=>{const entry=lock[relative(project,dir).replaceAll('\\','/')];return !!entry&&!entry.dev&&!entry.os&&!entry.cpu;};};
function installedPackages(modules,ships){
 if(!existsSync(modules))return;
 for(const ent of readdirSync(modules,{withFileTypes:true})){
  if(!ent.isDirectory())continue; // workspace links are handled by their explicit source tree below.
  const dir=join(modules,ent.name);
  if(ent.name.startsWith('@')){installedPackages(dir,ships);continue;}
  if(existsSync(join(dir,'package.json'))&&ships(dir)){const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));if(pkg.name&&pkg.version)packages.set(dir,{name:pkg.name,version:pkg.version,license:pkg.license});}
  installedPackages(join(dir,'node_modules'),ships);
 }
}
installedPackages(join(root,'node_modules'),shipped(root));
installedPackages(join(root,'legacy/surface/node_modules'),shipped(join(root,'legacy/surface')));
for(const [dir,pkg] of packages){
 const dest=join(root,'resources/licenses',pkg.name.replaceAll('/','_')+'-'+pkg.version);mkdirSync(dest,{recursive:true});
 writeFileSync(join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 for(const name of readdirSync(dir))if(/^(license|notice|copying)(\.|$)/i.test(name))cpSync(join(dir,name),join(dest,name),{recursive:true});
}
writeFileSync(join(root,'dist/runtime-graph.json'),JSON.stringify({format:'exosurface-runtime-graph/0',releaseReady:false,entries:graphs},null,2)+'\n');

// Coordinated additive exosurface-package/0 producer contract. No self hashing.
const releasePath=join(root,'release.json'),release=JSON.parse(readFileSync(releasePath,'utf8'));
if(release.releaseReady!==false)throw Error('Publication provenance guard must remain false');
release.files=[...new Set([...release.files,'resources/**'])];
release.dependencyProjects=[{id:'surface',package:'resources/provenance/surface/package.json',lock:'resources/provenance/surface/package-lock.json',sourcePackage:'legacy/surface/package.json',sourceLock:'legacy/surface/package-lock.json'}];
const resources=[];
function inventory(dir){
 for(const name of readdirSync(dir).sort()){
  const path=join(dir,name),stat=lstatSync(path);
  if(stat.isSymbolicLink())throw Error('Resource symlink forbidden: '+path);
  if(stat.isDirectory())inventory(path);
  else if(stat.isFile())resources.push({path:relative(root,path).replaceAll('\\','/'),sha256:createHash('sha256').update(readFileSync(path)).digest('hex')});
  else throw Error('Unsupported resource: '+path);
 }
}
inventory(join(root,'resources'));release.resources=resources;
writeFileSync(releasePath,JSON.stringify(release,null,2)+'\n');

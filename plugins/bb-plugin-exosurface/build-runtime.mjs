// Package the existing owner and actual extensions; no checkout-relative runtime imports.
import {build} from 'esbuild';
import {isBuiltin,createRequire} from 'node:module';
import {cpSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync,lstatSync,realpathSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join,relative,resolve} from 'node:path';
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
// Native BB source packaging follows the compiler's local import closure, not
// a historical hand-maintained list. Dependencies remain the frozen graph.
const sourceGraph=await build({absWorkingDir:root,entryPoints:['app.tsx','host.ts','server.ts'],outdir:'dist/source-closure',bundle:true,packages:'external',write:false,metafile:true,format:'esm',platform:'node',target:'node22.19',jsx:'automatic',loader:{'.css':'text'},logLevel:'error'});
const sourceInputs=Object.keys(sourceGraph.metafile.inputs).sort();
const dependencyInputs=['legacy/surface/package.json','legacy/surface/vendor/zod3/zod-3.25.76-exosurface.1.tgz','legacy/primary/src/canonical-initialization.ts'];
// Resources are generated, never a checkout dependency or evidence directory.
if(existsSync(join(root,'resources')))rmSync(join(root,'resources'),{recursive:true});
mkdirSync(join(root,'resources'),{recursive:true});
cpSync(join(root,'legacy/surface/skills'),join(root,'resources/skills'),{recursive:true});
cpSync(join(root,'legacy/surface/vendor/zod3'),join(root,'resources/provenance/zod3'),{recursive:true});
// Locate the workspace owning the installed graph, including when source is
// built in another directory with the original node_modules linked into it.
let workspace=realpathSync(join(root,'node_modules'));
while(!existsSync(join(workspace,'pnpm-workspace.yaml'))){
 const parent=dirname(workspace);if(parent===workspace)throw Error('Installed pnpm workspace not found');workspace=parent;
}
const pluginRoot=relative(workspace,dirname(realpathSync(join(root,'node_modules')))).replaceAll('\\','/');
const dependencyProjects=[
 {id:'tooling',importer:'.'},
 {id:'plugin',importer:pluginRoot},
 {id:'surface',importer:pluginRoot+'/legacy/surface'},
 {id:'composition',importer:pluginRoot+'/legacy/surface/composition'},
];
const snapshot='resources/provenance/workspace';
// pnpm's root patch declarations are installed-graph inputs, not an independent patch allowlist.
const workspaceManifest=JSON.parse(readFileSync(join(workspace,'package.json'),'utf8'));
const patchFiles=Object.values(workspaceManifest.pnpm?.patchedDependencies??{}).map(file=>{
 if(typeof file!=='string')throw Error('pnpm patchedDependencies must name patch files');
 const local=relative(workspace,resolve(workspace,file)).replaceAll('\\','/');
 if(local==='..'||local.startsWith('../'))throw Error('pnpm patch escapes workspace: '+file);
 return local;
});
const graphFiles=[...new Set(['pnpm-lock.yaml','pnpm-workspace.yaml','.npmrc','mise.toml','mise.lock','mise-version',...dependencyProjects.map(({importer})=>importer==='.'?'package.json':importer+'/package.json'),pluginRoot+'/legacy/surface/vendor/zod3/zod-3.25.76-exosurface.1.tgz',...patchFiles])];
for(const file of graphFiles){
 const dest=join(root,snapshot,file);mkdirSync(dirname(dest),{recursive:true});
 cpSync(join(workspace,file),dest);
}
// Preserve dependency license/notice files from every package that actually entered these bundles.
const packages=new Map();
for(const graph of Object.values(graphs))for(const input of graph.inputs){
 if(!input.includes('node_modules/'))continue;
 let dir=dirname(resolve(root,input)),pkg;
 for(;;){
  if(existsSync(join(dir,'package.json'))){const candidate=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));if(candidate.name&&candidate.version){pkg=candidate;break;}}
  const parent=dirname(dir);if(parent===dir)throw Error('Package provenance missing: '+input);dir=parent;
 }
 packages.set(dir,{name:pkg.name,version:pkg.version,license:pkg.license});
}
// BB's frontend build does not expose an esbuild input manifest. Conservatively retain
// notices for all active production importer graphs (a superset, not proof of loading).
// Root tooling is build-only, not part of this product notice traversal.
// Follow production dependency edges using Node's lookup paths and real directories.
// pnpm's links are not directories to Dirent, and transitive packages live beside
// their dependent in the virtual store, not inside its node_modules.
const visited=new Set();
function installedPackages(project){
 const dir=realpathSync(project);
 if(visited.has(dir))return;
 visited.add(dir);
 const pkg=JSON.parse(readFileSync(join(dir,'package.json'),'utf8'));
 if(pkg.os||pkg.cpu)return; // platform-only packages are not portable release provenance.
 if(pkg.name&&pkg.version)packages.set(dir,{name:pkg.name,version:pkg.version,license:pkg.license});
 const req=createRequire(join(dir,'package.json'));
 for(const name of Object.keys({...pkg.dependencies,...pkg.optionalDependencies,...pkg.peerDependencies})){
  const found=(req.resolve.paths(name)||[]).map(base=>join(base,name)).find(base=>existsSync(join(base,'package.json')));
  if(found)installedPackages(found);
  else if(pkg.dependencies?.[name]&&!pkg.optionalDependencies?.[name])throw Error('Missing installed production dependency: '+name+' from '+dir);
 }
}
for(const {importer} of dependencyProjects.filter(project=>project.id!=='tooling')){
 const project=relative(pluginRoot,importer);
 const pkg=JSON.parse(readFileSync(join(root,project,'package.json'),'utf8'));
 const req=createRequire(join(root,project,'package.json'));
 for(const name of Object.keys(pkg.dependencies||{})){
  const found=(req.resolve.paths(name)||[]).map(base=>join(base,name)).find(base=>existsSync(join(base,'package.json')));
  if(!found)throw Error('Missing installed production dependency: '+name);
  installedPackages(found);
 }
}
for(const [dir,pkg] of packages){
 const dest=join(root,'resources/licenses',pkg.name.replaceAll('/','_')+'-'+pkg.version);mkdirSync(dest,{recursive:true});
 writeFileSync(join(dest,'package.json'),JSON.stringify(pkg,null,2)+'\n');
 for(const name of readdirSync(dir))if(/^(license|notice|copying)(\.|$)/i.test(name))cpSync(join(dir,name),join(dest,name),{recursive:true});
}
writeFileSync(join(root,'dist/runtime-graph.json'),JSON.stringify({format:'exosurface-runtime-graph/0',releaseReady:false,entries:graphs,sourceClosure:{entries:['app.tsx','host.ts','server.ts'],inputs:sourceInputs}},null,2)+'\n');

// Coordinated additive exosurface-package/0 producer contract. No self hashing.
const releasePath=join(root,'release.json'),release=JSON.parse(readFileSync(releasePath,'utf8'));
if(release.releaseReady!==false)throw Error('Publication provenance guard must remain false');
release.files=[...new Set([...release.files.filter(file=>!file.startsWith('legacy/')&&file!=='package-lock.json'),'resources/**',...[...new Set([...sourceInputs.filter(file=>file.startsWith('legacy/')),...dependencyInputs])].sort()])];
release.dependencyProjects=dependencyProjects.map(({id,importer})=>({
 id,sourceRoot:'repository',pluginRoot,importer,
 sourcePackage:importer==='.'?'package.json':importer+'/package.json',sourceLock:'pnpm-lock.yaml',
 package:snapshot+'/'+(importer==='.'?'package.json':importer+'/package.json'),lock:snapshot+'/pnpm-lock.yaml',
}));
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

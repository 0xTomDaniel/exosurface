// Import every actual shipped extension without registration, provider calls or native startup.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,lstatSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const artifact=resolve(process.argv[2]);
function walk(dir){for(const name of readdirSync(dir)){assert.notEqual(name,'node_modules');const p=join(dir,name),s=lstatSync(p);assert.ok(!s.isSymbolicLink(),p);if(s.isDirectory())walk(p);}}
walk(artifact);
const graph=JSON.parse(readFileSync(join(artifact,'dist/runtime-graph.json'),'utf8'));
const results=[];
for(const name of Object.keys(graph.entries)){
 const owner=name==='owner-service',url=pathToFileURL(join(artifact,'dist',name+'.js')).href;
 const code=`const m=await import(${JSON.stringify(url)});${owner?'':"if(typeof m.default!=='function')throw Error('Missing extension default export');"}console.log(JSON.stringify({entry:${JSON.stringify(name)},imported:true,registered:false,providerCalled:false}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code,...(owner?['--','--release-selftest']:[])],{cwd:artifact,env:{...process.env,NODE_PATH:''},encoding:'utf8',timeout:10000});
 assert.equal(result.status,0,`${name}: ${result.stderr}`);assert.equal(result.signal,null);results.push({entry:name,exit:result.status,stdout:result.stdout.trim()});
}
console.log(JSON.stringify({format:'exosurface-relocated-imports/0',artifact,results,nativeAcceptance:'NOT RUN',releaseReady:false},null,2));

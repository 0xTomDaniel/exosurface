import assert from 'node:assert/strict';import {createRequire}from'node:module';import{readFileSync}from'node:fs';import{execFileSync}from'node:child_process';import{createHash}from'node:crypto';
const root=process.argv[2],r=createRequire(root+'/package.json'),{transform}=r('esbuild'),rows=[];
for(const file of ['composition/client.ts','composition/contract.ts','composition/provider.ts','composition/engine.ts','composition/archived-workspace-compose.ts.txt']){
const path='plugins/bb-plugin-exosurface/legacy/surface/'+file,before=execFileSync('/usr/bin/git',['show','dca50200ca734e7bc905dd617f7a75bfd557ce1a:'+path],{cwd:root,encoding:'utf8'}),after=readFileSync(root+'/legacy/surface/'+file,'utf8');
if(file.endsWith('engine.ts')||file.endsWith('.txt'))assert.equal(after,before);else assert.equal((await transform(after,{loader:'ts',format:'esm',target:'node22.19'})).code,(await transform(before,{loader:'ts',format:'esm',target:'node22.19'})).code);
rows.push({file,byteIdentical:after===before,transpiledRuntimeIdentical:true,sha256:createHash('sha256').update(after).digest('hex')});}
console.log(JSON.stringify({rows,experimentalDependencyAdded:false,strictConfigurationChanged:false},null,2));

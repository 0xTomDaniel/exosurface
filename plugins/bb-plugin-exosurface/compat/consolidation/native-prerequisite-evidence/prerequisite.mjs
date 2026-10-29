import {statSync,readFileSync} from 'node:fs';import {createHash} from 'node:crypto';
const base='/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app';
console.log(JSON.stringify({kind:'installed-BB-prerequisite',version:JSON.parse(readFileSync(base+'/package.json')).version,node:process.version,artifactManifestSHA256:'ea25fb27a999f91ab1f5006e748260e8e51e6669833ac1720943be09492b0036',nativeStarted:false}));
const m=await import(base+'/server/dist/start-server.js');console.log(JSON.stringify({installedServerImported:true,exports:Object.keys(m),nativeStarted:false}));

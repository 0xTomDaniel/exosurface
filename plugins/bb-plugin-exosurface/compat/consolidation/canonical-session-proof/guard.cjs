const fs=require('node:fs'),net=require('node:net'),http=require('node:http'),https=require('node:https'),cp=require('node:child_process');
const deny=()=>{throw Error('SETUP PROOF: network or subprocess forbidden')};
net.connect=net.createConnection=net.Socket.prototype.connect=http.request=http.get=https.request=https.get=deny;
global.fetch=deny; for(const k of ['spawn','spawnSync','exec','execSync','execFile','execFileSync','fork'])cp[k]=deny;
const path=require('node:path'),root=process.env.PROOF_ROOT;
for(const k of ['writeFileSync','appendFileSync','mkdirSync','renameSync','unlinkSync','rmSync','openSync']){const orig=fs[k];fs[k]=function(p,...a){if(k==='openSync' && (a[0]==='r'||a[0]===0))return orig.call(this,p,...a);if(typeof p!=='number'&&!path.resolve(String(p)).startsWith(root+'/'))throw Error('PROOF write outside private root: '+p);return orig.call(this,p,...a)}}
require('node:module').syncBuiltinESMExports();

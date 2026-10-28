import './isolation.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const read=(path:string)=>JSON.parse(readFileSync(new URL(path,import.meta.url),'utf8'));
test('#27 patched lock versions and explicit compatible overrides stay in sync',()=>{
 const pkg=read('../package.json'),lock=read('../package-lock.json').packages;
 assert.equal(pkg.overrides['@earendil-works/pi-coding-agent'].undici,'8.12.2');
 assert.equal(lock['node_modules/undici'].version,'8.12.2');
 assert.equal(lock['node_modules/undici'].dev,true,'Pi remains dev-only in this lock, not proof about an external runtime');
});

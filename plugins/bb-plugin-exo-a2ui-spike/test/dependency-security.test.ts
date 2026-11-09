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
 assert.equal(pkg.overrides['@a2ui/markdown-it'].dompurify,'3.4.17');
 assert.equal(lock['node_modules/dompurify'].version,'3.4.17');
 assert.equal(lock['node_modules/markdown-it'].version,'14.3.3');
 assert.equal(lock['node_modules/hono'].version,'4.13.14');
 assert.equal(read('../composition/package-lock.json').packages['node_modules/zod'].version,'4.6.7');
});

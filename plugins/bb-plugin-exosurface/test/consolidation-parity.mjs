// Frozen pre-repair parser versus production static import; no provider or native startup.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]),out=resolve(process.argv[3]);
const r=createRequire(join(root,'package.json')),surface=createRequire(join(root,'legacy/surface/server.ts'));
const renderer=createRequire(surface.resolve('@a2ui/react/v0_9')),old=renderer('markdown-it');
const direct=surface.resolve('markdown-it/package.json'),pkg=JSON.parse(readFileSync(direct,'utf8'));
const esm=(await import(pathToFileURL(join(direct,'../index.mjs')).href)).default;
assert.equal(pkg.version,'14.3.3');assert.equal(pkg.license,'MIT');
const before=JSON.parse(readFileSync(join(root,'compat/consolidation/evidence/nested-final-package-lock.json'),'utf8'));
const oldIntegrities=new Set(Object.entries(before.packages).filter(([p])=>p.endsWith('/node_modules/markdown-it')||p==='node_modules/markdown-it').map(([,v])=>v.integrity));
assert.equal(oldIntegrities.size,1);
const lock=JSON.parse(readFileSync(join(root,'legacy/surface/package-lock.json'),'utf8'));
for(const [p,v] of Object.entries(lock.packages))if(p.endsWith('/node_modules/markdown-it')||p==='node_modules/markdown-it'){
 assert.equal(v.version,'14.3.3');assert.ok(oldIntegrities.has(v.integrity),p);
}
const samples=['# Heading\n\nHello α 🧪 e\u0301\n','First\r\n\r\nSecond\r\n','# A\n## B\n### C\nBody\n','- one\n- **two**\n  - nested\n','1. first\n2. second\n','> quotation\n\n---\n','```js\nconst x = "<unsafe>";\n```\n','[link](https://example.invalid) and https://example.invalid\n','<script>not executable</script>\n','| A | B |\n|---|---|\n| 1 | 2 |\n','**Strong** _emphasis_ `code`\n','Meet at 10:30 am.\n\nWhat next?\n','Line 1  \nLine 2\n','Literal &amp; \\*star\\*\n','Unicode list\n\n- 日本語\n- مرحبا\n'];
const opts={html:false,linkify:false,typographer:false},a=new old(opts),b=new esm(opts);
for(const method of ['parse','parseInline','render','renderInline'])for(const text of samples)assert.deepEqual(JSON.parse(JSON.stringify(a[method](text,{}))),JSON.parse(JSON.stringify(b[method](text,{}))),method);
mkdirSync(out,{recursive:true});
const frozen=readFileSync(join(root,'compat/consolidation/repro/markdown/document-before.ts'),'utf8');
// Keep baseline resolution anchored to its original consuming package when relocated as a test module.
const anchored=frozen.replace('createRequire(import.meta.url)',`createRequire(${JSON.stringify(pathToFileURL(join(root,'legacy/surface/observer/document.ts')).href)})`);
assert.notEqual(anchored,frozen);
await r('esbuild').build({stdin:{contents:anchored,sourcefile:'document-before.ts',loader:'ts',resolveDir:root},outfile:join(out,'baseline.mjs'),platform:'node',format:'esm',bundle:true,target:'node22.19',legalComments:'eof'});
const baseline=await import(pathToFileURL(join(out,'baseline.mjs')).href),production=await import(pathToFileURL(join(root,'legacy/surface/observer/document.ts')).href);
for(const text of samples){assert.deepEqual(production.parseDocument(text),baseline.parseDocument(text));assert.equal(production.reconstruct(production.parseDocument(text).root),text);}
for(const text of ['', 'x'.repeat(18001),Array.from({length:45},(_,i)=>`Paragraph ${i}.\n\n`).join('')]){
 let error;try{baseline.parseDocument(text);}catch(e){error=e.message;}assert.ok(error);assert.throws(()=>production.parseDocument(text),{message:error});
}
assert.deepEqual(readFileSync(join(root,'resources/licenses/markdown-it-14.3.3/LICENSE')),readFileSync(join(direct,'../LICENSE')));
// Preservation boundary: same wire declaration, archived source stays unchanged in git review.
const engine=readFileSync(join(root,'legacy/surface/composition/engine.ts'),'utf8'),client=readFileSync(join(root,'legacy/surface/composition/client.ts'),'utf8');
const request=/export type CompositionRequest=([^;]*(?:;[^}]*)?\})/;
assert.equal(client.match(request)?.[1],engine.match(request)?.[1]);
console.log(JSON.stringify({format:'exosurface-production-parser-parity/0',version:pkg.version,types:'14.1.2',integrity:[...oldIntegrities][0],APIComparisons:60,documentRoundtrips:15,matchingRejections:3,license:'MIT; exact license bytes retained',wireTypePreserved:true,nativeAcceptance:'NOT RUN',releaseReady:false}));

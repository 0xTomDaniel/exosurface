import assert from 'node:assert/strict';
import {createRequire,isBuiltin} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const root=resolve(process.argv[2]),probe=resolve(process.argv[3]),relocated=resolve(process.argv[4]);
const require=createRequire(join(root,'package.json')),esbuild=require('esbuild');
const rendererRequire=createRequire(createRequire(join(root,'legacy/surface/server.ts')).resolve('@a2ui/react/v0_9'));
const legacy=rendererRequire('markdown-it');
const explicit=(await import(pathToFileURL(join(probe,'node_modules/markdown-it/index.mjs')).href)).default;
assert.equal(rendererRequire('markdown-it/package.json').version,'14.3.3');
const samples=['# Heading\n\nHello α 🧪 e\u0301\n','First\r\n\r\nSecond\r\n','# A\n## B\n### C\nBody\n','- one\n- **two**\n  - nested\n','1. first\n2. second\n','> quotation\n\n---\n','```js\nconst x = "<unsafe>";\n```\n','[link](https://example.invalid) and https://example.invalid\n','<script>not executable</script>\n','| A | B |\n|---|---|\n| 1 | 2 |\n','**Strong** _emphasis_ `code`\n','Meet at 10:30 am.\n\nWhat next?\n','Line 1  \nLine 2\n','Literal &amp; \\*star\\*\n','Unicode list\n\n- 日本語\n- مرحبا\n'];
const opts={html:false,linkify:false,typographer:false};
const a=new legacy(opts),b=new explicit(opts);
for(const method of ['parse','parseInline','render','renderInline'])for(const s of samples)assert.deepEqual(JSON.parse(JSON.stringify(a[method](s,{}))),JSON.parse(JSON.stringify(b[method](s,{}))),method);
const build=await esbuild.build({absWorkingDir:probe,entryPoints:['document.ts'],outfile:'dist/document.js',bundle:true,platform:'node',format:'esm',target:'node22.19',metafile:true,legalComments:'eof'});
for(const output of Object.values(build.metafile.outputs))for(const imp of output.imports)if(imp.external)assert.ok(isBuiltin(imp.path),imp.path);
mkdirSync(join(relocated,'dist'),{recursive:true});writeFileSync(join(relocated,'package.json'),'{"type":"module","private":true}\n');copyFileSync(join(probe,'dist/document.js'),join(relocated,'dist/document.js'));
const original=await import(pathToFileURL(join(root,'legacy/surface/observer/document.ts')).href),bundled=await import(pathToFileURL(join(relocated,'dist/document.js')).href);
for(const s of samples){assert.deepEqual(bundled.parseDocument(s),original.parseDocument(s));const d=bundled.parseDocument(s);assert.equal(bundled.reconstruct(d.root),s);}
for(const s of ['', 'x'.repeat(18001),Array.from({length:45},(_,i)=>`Paragraph ${i}.\n\n`).join('')]){let expected;try{original.parseDocument(s);}catch(e){expected=e.message;}assert.ok(expected);assert.throws(()=>bundled.parseDocument(s),{message:expected});}
const pkg=JSON.parse(readFileSync(join(probe,'node_modules/markdown-it/package.json'),'utf8'));assert.equal(pkg.license,'MIT');assert.ok(readFileSync(join(probe,'node_modules/markdown-it/LICENSE'),'utf8').includes('MIT'));
writeFileSync(join(probe,'build-metafile.json'),JSON.stringify(build.metafile,null,2)+'\n');
console.log(JSON.stringify({format:'exosurface-markdown-static-option/0',productionSourceChanged:false,routeAdopted:false,parserVersion:pkg.version,declaredReactRange:rendererRequire('../package.json').dependencies['markdown-it'],comparison:'existing renderer CJS vs exact-version explicit ESM',APIcomparisons:samples.length*4,documentRoundtrips:samples.length,matchingRejections:3,relocatedWithoutNodeModules:relocated,externalImports:'node builtins only',license:pkg.license,security:'see separate raw npm audit; not a security clearance'}));

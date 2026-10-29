import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {browserFixture} from './browser/chromium.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),req=createRequire(import.meta.url);
const md=req.resolve('@a2ui/markdown-it');
assert.equal(md,resolve(root,'node_modules/@a2ui/markdown-it/src/markdown.js'),'Existing app direct import resolves explicitly at root');
const fromMarkdown=createRequire(md);
assert.equal(fromMarkdown('dompurify').version,'3.4.17');assert.equal(req('dompurify').version,'3.4.17');
const lock=JSON.parse(readFileSync(new URL('../package-lock.json',import.meta.url)));
assert.equal(lock.packages['node_modules/@a2ui/markdown-it'].version,'0.2.1');
assert.equal(lock.packages['node_modules/@a2ui/web_core'].version,'0.13.0');
assert.ok(!lock.packages['node_modules/@a2ui/react/node_modules/@a2ui/markdown-it']);
const npm=process.env.EXO_REVIEW_NPM_CLI;if(!npm)throw Error('Set EXO_REVIEW_NPM_CLI for npm bundled semver checks');
const semver=createRequire(npm)('semver');
const advisories=JSON.parse(readFileSync(new URL('../evidence/dompurify-triage.json',import.meta.url))).advisories;
for(const a of advisories){assert.equal(semver.satisfies('3.4.11',a.range.replaceAll(',',' ')),true,a.id);assert.equal(semver.satisfies('3.4.17',a.range.replaceAll(',',' ')),false,a.id);}
const baseline=process.env.EXO_REVIEW_BASELINE_DOMPURIFY;if(!baseline||!baseline.startsWith('/'))throw Error('Set EXO_REVIEW_BASELINE_DOMPURIFY to preserved c22ba24e DOMPurify3.4.11 package');
assert.equal(JSON.parse(readFileSync(resolve(baseline,'package.json'))).version,'3.4.11');
const {rawMarkdownRenderer}=await import(pathToFileURL(resolve(dirname(md),'raw-markdown.js')));
const samples=['# Heading\n\n**bold** *emphasis* and `code`.','- first\n- second\n\n[Safe](https://example.invalid/path)','Unicode 🧪 and full\nmultiline\n\n> quoted','<img src=x onerror="0">\n\n[javascript](javascript:0)'].map(value=>({value,options:{tagClassMap:{strong:'fixture-strong'}},raw:rawMarkdownRenderer.render(value,{strong:'fixture-strong'})}));
const report=await browserFixture({roots:{'/runtime':resolve(root,'node_modules'),'/test':resolve(root,'test/browser')},routes:{
 '/':{type:'text/html',content:'<!doctype html><meta charset="utf-8"><script src="/runtime/markdown-it/dist/markdown-it.js"></script><script type="importmap">{"imports":{"dompurify":"/runtime/dompurify/dist/purify.es.mjs","markdown-it":"/markdown-it-adapter.mjs"}}</script><script type="module" src="/test/markdown-runtime.mjs"></script>'},
 '/markdown-it-adapter.mjs':{content:'export default window.markdownit;'},
 '/baseline.js':{content:readFileSync(resolve(baseline,'dist/purify.es.mjs'))},
 '/samples.json':{type:'application/json',content:JSON.stringify(samples)}
}});
console.log(JSON.stringify({applicationDirectMarkdownImport:true,actualMarkdownDependencyDOMPurify:'3.4.17',advisoryRangeChecks:advisories.map(a=>({id:a.id,range:a.range,fixedVersionExcluded:true})),...report},null,2));
assert.equal(report.tests.length,9);assert.ok(report.tests.every(t=>t.pass),'Every browser regression must pass');

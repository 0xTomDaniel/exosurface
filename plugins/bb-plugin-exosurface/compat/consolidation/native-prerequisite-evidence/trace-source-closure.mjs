// Read-only source analysis: transpile for import discovery, never execute plugin code.
import ts from '/tmp/exo-packaging-repair.GLh4R1/committed/plugins/bb-plugin-exosurface/node_modules/typescript/lib/typescript.js';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
const root=resolve(process.argv[2]);const todo=['app.tsx','host.ts','server.ts'];const seen=new Set(),bare={},unresolved=[],nonliteral=[];
function enqueue(spec,from){
 if(!spec.startsWith('.')){if(!spec.startsWith('node:'))(bare[spec]??=[]).push(from);return;}
 const base=resolve(root,dirname(from),spec);const dest=[base,...['.ts','.tsx','.js','.mjs','.css','.json','/index.ts','/index.tsx'].map(x=>base+x)].find(x=>existsSync(x)&&statSync(x).isFile());
 if(!dest){unresolved.push({from,spec});return;}const rel=relative(root,dest);if(rel.startsWith('..'))throw Error('Outside root '+dest);todo.push(rel);
}
while(todo.length){const file=todo.pop();if(seen.has(file))continue;seen.add(file);if(!/\.[cm]?[jt]sx?$/.test(file))continue;
 const output=ts.transpileModule(readFileSync(resolve(root,file),'utf8'),{fileName:file,compilerOptions:{target:ts.ScriptTarget.ESNext,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 const ast=ts.createSourceFile(file+'.js',output,ts.ScriptTarget.Latest,true);
 function visit(n){if((ts.isImportDeclaration(n)||ts.isExportDeclaration(n))&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))enqueue(n.moduleSpecifier.text,file);
 if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||(ts.isIdentifier(n.expression)&&n.expression.text==='require'))){const a=n.arguments[0];if(a&&ts.isStringLiteral(a))enqueue(a.text,file);else nonliteral.push({file,expression:n.getText(ast)});}
 ts.forEachChild(n,visit);}visit(ast);
}
console.log(JSON.stringify({method:'TypeScript transpile-only (erases types); AST static/literal runtime imports; no execution or bundling; computed resource paths need separate review',entries:['app.tsx','host.ts','server.ts'],files:[...seen].sort(),bare:Object.fromEntries(Object.entries(bare).sort().map(([k,v])=>[k,[...new Set(v)].sort()])),unresolved,nonliteral},null,2));

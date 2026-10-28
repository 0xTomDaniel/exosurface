// Source modules contain erasable TS only. Node's builtin stripper produces relocatable JS.
import { stripTypeScriptTypes } from 'node:module';
import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
mkdirSync(new URL('dist/', import.meta.url), { recursive: true });
for (const name of readdirSync(new URL('src/', import.meta.url)).filter(n => n.endsWith('.ts'))) {
  const source = readFileSync(new URL(`src/${name}`, import.meta.url), 'utf8');
  writeFileSync(new URL(`dist/${name.replace(/\.ts$/, '.js')}`, import.meta.url), stripTypeScriptTypes(source, { mode: 'transform' }).replace(/(['"])(\.\/[^'"\n]+)\.ts\1/g, '$1$2.js$1'));
}

// The package check and its ratchet (docs/specs/quality-gate.spec.html), run for real on a throwaway
// package in a temp dir: the same tools, the package's own lint and strictest configs, its own baseline.
import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';

const PKG = fileURLToPath(new URL('..', import.meta.url));
const pinned = (JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8')) as {devDependencies: Record<string, string>}).devDependencies;
const tools = Object.fromEntries(['@tsconfig/strictest', 'eslint', 'typescript', 'typescript-eslint'].map(n => [n, pinned[n]]));

// lib.ts has two strictest-only errors (index-signature property access) and nothing else.
const LIB = `export function pick(r: Record<string, string>): (string | undefined)[] {\n  return [r.first, r.second];\n}\n`;
const FILES = {
  'package.json': JSON.stringify({name: 'fixture', private: true, type: 'module', scripts: {test: 'node --test test/*.test.mjs'}, devDependencies: tools}, null, 2),
  'tsconfig.json': JSON.stringify({compilerOptions: {strict: true, target: 'ES2022', module: 'ESNext', moduleResolution: 'bundler', allowImportingTsExtensions: true, noEmit: true, types: []}, include: ['src']}),
  'knip.json': JSON.stringify({entry: ['src/index.ts', 'test/*.test.mjs'], project: ['src/**/*.ts', 'test/**/*.mjs']}),
  'src/index.ts': `import {pick} from './lib.ts';\nexport const picked = pick({first: 'a', second: 'b'});\n`,
  'src/lib.ts': LIB,
  'test/ok.test.mjs': `import test from 'node:test';\ntest('fixture passes', () => {});\n`,
};

function fixture(t: {after: (fn: () => void) => void}): string {
  const dir = mkdtempSync(join(tmpdir(), 'exo-quality-'));
  t.after(() => { rmSync(dir, {recursive: true, force: true}); });
  for (const [file, text] of Object.entries(FILES)) { mkdirSync(dirname(join(dir, file)), {recursive: true}); writeFileSync(join(dir, file), text); }
  for (const file of ['eslint.config.js', 'tsconfig.lint.json', 'tsconfig.strictest.json']) copyFileSync(join(PKG, file), join(dir, file));
  symlinkSync(join(PKG, 'node_modules'), join(dir, 'node_modules'), 'dir');
  return dir;
}
function step(script: 'check' | 'record', dir: string) {
  const env = {...process.env};
  delete env['NODE_TEST_CONTEXT'];
  const r = spawnSync(process.execPath, ['--experimental-transform-types', '--disable-warning=ExperimentalWarning', join(PKG, 'quality', `${script}.ts`), dir], {env, encoding: 'utf8'});
  return {code: r.status, out: r.stdout + r.stderr};
}
interface Baseline {'strictest-typecheck': number; lint: number; 'unused-files': number; 'unused-exports': number; 'unused-types': number}
const baseline = (dir: string) => JSON.parse(readFileSync(join(dir, 'quality-baseline.json'), 'utf8')) as Baseline;
const line = (out: string, gate: string) => out.split('\n').find(l => l.includes(` ${gate}: `)) ?? '';
function recorded(dir: string) {
  const r = step('record', dir);
  assert.equal(r.code, 0, r.out);
  const c = step('check', dir);
  assert.equal(c.code, 0, c.out);
  return baseline(dir);
}

void test('a clean package with its recorded baseline passes the check', t => {
  const dir = fixture(t), b = recorded(dir);
  assert.deepEqual(b, {'strictest-typecheck': 2, lint: 0, 'unused-files': 0, 'unused-exports': 0, 'unused-types': 0});
});

void test('an import of an unlisted package fails the check, naming the dependency gate and the package', t => {
  const dir = fixture(t);
  recorded(dir);
  writeFileSync(join(dir, 'src/index.ts'), `import {z} from 'zod';\nimport {pick} from './lib.ts';\nexport const picked = pick({first: 'a', second: z.string().parse('b')});\n`);
  const r = step('check', dir);
  assert.equal(r.code, 1, r.out);
  assert.match(line(r.out, 'dependencies'), /^FAIL dependencies: .*unlisted zod \(src\/index\.ts\)/);
  assert.match(line(r.out, 'typecheck'), /^ok /, 'only the dependency gate is at fault');
});

void test('one added unused export fails the check, naming the unused-exports gate with count and baseline', t => {
  const dir = fixture(t);
  recorded(dir);
  writeFileSync(join(dir, 'src/lib.ts'), `${LIB}export const unused = 1;\n`);
  const r = step('check', dir);
  assert.equal(r.code, 1, r.out);
  assert.equal(line(r.out, 'unused-exports'), 'FAIL unused-exports: unused exports (knip): count 1 above baseline 0');
  assert.deepEqual(r.out.split('\n').filter(l => l.startsWith('FAIL')), [line(r.out, 'unused-exports')], 'no other gate fails');
});

void test('removing one strictest error, then recording, lowers that count by exactly one and nothing else', t => {
  const dir = fixture(t), before = recorded(dir);
  writeFileSync(join(dir, 'src/lib.ts'), LIB.replace('r.second', "r['second']"));
  const c = step('check', dir);
  assert.equal(c.code, 0, c.out);
  assert.match(line(c.out, 'strictest-typecheck'), /count 1 below baseline 2, ready to record/);
  const r = step('record', dir);
  assert.equal(r.code, 0, r.out);
  assert.deepEqual(baseline(dir), {...before, 'strictest-typecheck': before['strictest-typecheck'] - 1});
});

void test('one added lint finding makes recording refuse, naming the lint gate, baseline byte-identical', t => {
  const dir = fixture(t);
  recorded(dir);
  const bytes = readFileSync(join(dir, 'quality-baseline.json'));
  // One lint-only finding (no-unnecessary-template-expression); nothing else changes.
  writeFileSync(join(dir, 'src/index.ts'), FILES['src/index.ts'].replace("first: 'a'", "first: `${'a'}`"));
  const c = step('check', dir);
  assert.equal(line(c.out, 'lint'), 'FAIL lint: lint (typescript-eslint strictTypeChecked): count 1 above baseline 0', c.out);
  const r = step('record', dir);
  assert.equal(r.code, 1, r.out);
  assert.deepEqual(r.out.trim().split('\n'), ['REFUSED lint: lint (typescript-eslint strictTypeChecked): count 1 above baseline 0; recording never raises a count', 'record: refused, quality-baseline.json unchanged']);
  assert.deepEqual(readFileSync(join(dir, 'quality-baseline.json')), bytes);
});

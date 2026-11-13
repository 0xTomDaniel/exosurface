// The root standards gate as its callers use it (owner decisions #216: counted no-raise ratchet 6829935664, Python
// deferred 6828772822, three source trees deferred 6830616474). Each test runs the real commands scripts/lint.ts and
// scripts/check-languages.ts in a disposable git repository (test/gate-fixture.ts) and asserts exit status, the printed
// gate lines and the exact baseline bytes. Expected values are literals, never recomputed by the code under test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cleanEnv, gateFixture, gateLines, git, languagesCommand, lintCommand, run, withPackageTools } from './gate-fixture.ts';

const TREES = 'https://github.com/0xTomDaniel/exosurface/issues/216#issuecomment-6830616474';
const deferred = [
  `plugins/bb-plugin-exo-spike/: DEFERRED BY OWNER ${TREES}; 0 files not assessed, not compliant, waived or exempt`,
  `spikes/a2a-pi/: DEFERRED BY OWNER ${TREES}; 0 files not assessed, not compliant, waived or exempt`,
  `spikes/ag-ui-pi/: DEFERRED BY OWNER ${TREES}; 0 files not assessed, not compliant, waived or exempt`,
];
const covers = `owner deferral ${TREES} covers exactly plugins/bb-plugin-exo-spike/ spikes/a2a-pi/ spikes/ag-ui-pi/`;
const STRING_TO_NUMBER = "Type 'string' is not assignable to type 'number'.";
const keyA = `["src/a.ts","TS2322","${STRING_TO_NUMBER}"]`;
const eslintKey = '["src/z.ts","@typescript-eslint/no-explicit-any","Unexpected any. Specify a different type."]';
const baselineFile = (root: string) => join(root, 'scripts/standards-baseline.json');
const compiler = (root: string, ...flags: string[]) => run(root, lintCommand, ['--compiler', ...flags, '--project=tsconfig.json']);

void test('gate-ratchet: one added compiler finding fails, naming the gate, its count, its baseline and the raised key', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a: number = "x";\n');
  f.write('scripts/standards-baseline.json', `{\n  "version": 1,\n  "gates": {\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(keyA)}: 1\n    }\n  }\n}\n`);
  f.write('src/b.ts', 'export const b: number = "y";\n');
  git(f.root, 'add', '-A');
  const result = compiler(f.root);
  assert.equal(result.status, 1);
  assert.deepEqual(gateLines(result.stderr), [...deferred,
    'tsc:tsconfig.json: 2 findings, baseline 1; FAILED: 1 finding keys above the baseline',
    `  src/b.ts TS2322 (1 > baseline 0): ${STRING_TO_NUMBER}`]);
});

void test('gate-ratchet: covered debt passes and still prints its count against the baseline', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a: number = "x";\n');
  f.write('scripts/standards-baseline.json', `{"version":1,"gates":{"tsc:tsconfig.json":{${JSON.stringify(keyA)}:2}}}\n`);
  git(f.root, 'add', '-A');
  const result = compiler(f.root);
  assert.equal(result.status, 0);
  assert.deepEqual(gateLines(result.stderr), [...deferred, 'tsc:tsconfig.json: 1 findings, baseline 2; no finding above the baseline (lower: record it)']);
});

void test('gate-record: one removed finding records a baseline lower by exactly one, the other gate byte-identical', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a: number = "x";\n');
  f.write('scripts/standards-baseline.json', `{"version":1,"gates":{"eslint":{${JSON.stringify(eslintKey)}:3},"tsc:tsconfig.json":{${JSON.stringify(keyA)}:2}}}\n`);
  git(f.root, 'add', '-A');
  const result = compiler(f.root, '--record-baseline');
  assert.equal(result.status, 0);
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'),
    `{\n  "version": 1,\n  "gates": {\n    "eslint": {\n      ${JSON.stringify(eslintKey)}: 3\n    },\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(keyA)}: 1\n    }\n  }\n}\n`);
});

void test('gate-record: a rise under record refuses, naming the gate, and leaves the baseline bytes unchanged', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a: number = "x";\nexport const c: number = "z";\n');
  const before = `{"version":1,"gates":{"tsc:tsconfig.json":{${JSON.stringify(keyA)}:1}}}\n`;
  f.write('scripts/standards-baseline.json', before);
  git(f.root, 'add', '-A');
  const result = compiler(f.root, '--record-baseline');
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('standards baseline: refused for tsc:tsconfig.json: tsc:tsconfig.json: 2 findings, baseline 1; FAILED: 1 finding keys above the baseline\n'));
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), before);
});

void test('gate-record: a gate absent from the baseline is refused by the normal record and added only by the initial record', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a: number = "x";\n');
  const before = `{"version":1,"gates":{"eslint":{${JSON.stringify(eslintKey)}:1}}}\n`;
  f.write('scripts/standards-baseline.json', before);
  git(f.root, 'add', '-A');
  const normal = compiler(f.root, '--record-baseline');
  assert.equal(normal.status, 1);
  assert.ok(normal.stderr.includes('standards baseline: refused for tsc:tsconfig.json: the gate has no baseline; add it with the initial record step\n'));
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), before);
  const initial = compiler(f.root, '--record-initial');
  assert.equal(initial.status, 0);
  assert.ok(initial.stderr.includes('standards baseline: initial record added tsc:tsconfig.json: 1 findings\n'));
  const added = `{\n  "version": 1,\n  "gates": {\n    "eslint": {\n      ${JSON.stringify(eslintKey)}: 1\n    },\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(keyA)}: 1\n    }\n  }\n}\n`;
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), added);
  const again = compiler(f.root, '--record-initial');
  assert.equal(again.status, 1);
  assert.ok(again.stderr.includes('standards baseline: initial record refused for tsc:tsconfig.json: the gate already has a baseline; use the normal record step\n'));
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), added);
});

void test('gate-integrity: a file pinned in the integrity registry is never baselined', t => {
  const pinned = 'export const p: number = "pinned";\n';
  const sha = createHash('sha256').update(pinned).digest('hex');
  const f = gateFixture({ version: 1, integrity: { 'src/pinned.ts': { classification: 'capture-integrity', pin: 'PINS.sha256', format: 'sha256sum', key: 'src/pinned.ts' } } });
  t.after(f.remove);
  f.write('src/pinned.ts', pinned);
  f.write('PINS.sha256', `${sha}  src/pinned.ts\n`);
  f.write('src/a.ts', 'export const a: number = "x";\n');
  git(f.root, 'add', '-A');
  const result = compiler(f.root, '--record-initial');
  assert.equal(result.status, 0);
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), `{\n  "version": 1,\n  "gates": {\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(keyA)}: 1\n    }\n  }\n}\n`);
});

void test('gate-eslint: a fatal ESLint result (file outside every project) is unanswered: exit 1, never counted or recorded', t => {
  const f = gateFixture(); t.after(f.remove);
  withPackageTools(f);
  f.write('.gitignore', 'node_modules\neslint.config.js\n');
  f.write('src/a.ts', 'export const a = 1;\n');
  f.write('outside.ts', 'export const o = 1;\n');
  git(f.root, 'add', '-A');
  const result = run(f.root, lintCommand, ['--files', '--record-initial']);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('ESLint unanswered: outside.ts: Parsing error: outside.ts was not found by the project service.'));
  assert.equal(existsSync(baselineFile(f.root)), false);
});

void test('gate-eslint: a fully linted repository records its ESLint gate', t => {
  const f = gateFixture(); t.after(f.remove);
  withPackageTools(f);
  f.write('.gitignore', 'node_modules\neslint.config.js\n');
  f.write('src/a.ts', 'export const a = 1;\n');
  git(f.root, 'add', '-A');
  const result = run(f.root, lintCommand, ['--files', '--record-initial']);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(baselineFile(f.root), 'utf8'), '{\n  "version": 1,\n  "gates": {\n    "eslint": {}\n  }\n}\n');
});

void test('gate-knip: one added unused export fails the knip gate, naming the gate, its count and its baseline', t => {
  const f = gateFixture(); t.after(f.remove);
  withPackageTools(f);
  f.write('.gitignore', 'node_modules\neslint.config.js\n');
  f.write('knip.json', '{"entry":["src/index.ts"],"project":["src/**/*.ts"]}\n');
  f.write('src/index.ts', "import { used } from './lib.ts';\nexport const value = used;\n");
  f.write('src/lib.ts', 'export const used = 1;\nexport const spare = 2;\nexport const added = 3;\n');
  f.write('scripts/standards-baseline.json', '{"version":1,"gates":{"knip":{"[\\"src/lib.ts\\",\\"exports\\",\\"spare\\"]":1}}}\n');
  git(f.root, 'add', '-A');
  const result = run(f.root, lintCommand, ['--knip']);
  assert.equal(result.status, 1);
  assert.deepEqual(gateLines(result.stderr), [...deferred,
    'knip: 2 findings, baseline 1; FAILED: 1 finding keys above the baseline',
    '  src/lib.ts exports (1 > baseline 0): added']);
});

// TypeScript prints union members in an order that differs between runs; a key must not depend on it.
const UNION_TSC = (members: string) => `["src/a.ts","TS2322","Type '${members}' is not assignable to type 'number'.\\nType 'string' is not assignable to type 'number'."]`;
for (const members of ['string | boolean', 'boolean | string']) {
  void test(`gate-key: a compiler finding passes against a baseline that printed its union as '${members}', and records it canonically`, t => {
    const f = gateFixture(); t.after(f.remove);
    f.write('src/a.ts', 'declare const u: string | boolean;\nexport const n: number = u;\n');
    f.write('scripts/standards-baseline.json', `{"version":1,"gates":{"tsc:tsconfig.json":{${JSON.stringify(UNION_TSC(members))}:1}}}\n`);
    git(f.root, 'add', '-A');
    const result = compiler(f.root);
    assert.equal(result.status, 0);
    assert.deepEqual(gateLines(result.stderr), [...deferred, 'tsc:tsconfig.json: 1 findings, baseline 1; no finding above the baseline']);
    assert.equal(compiler(f.root, '--record-baseline').status, 0);
    assert.equal(readFileSync(baselineFile(f.root), 'utf8'),
      `{\n  "version": 1,\n  "gates": {\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(UNION_TSC('boolean | string'))}: 1\n    }\n  }\n}\n`);
  });
}

for (const members of ['string | number', 'number | string']) {
  void test(`gate-key: an ESLint finding passes against a baseline that printed its union as \`${members}\``, t => {
    const f = gateFixture(); t.after(f.remove);
    withPackageTools(f);
    f.write('.gitignore', 'node_modules\neslint.config.js\n');
    f.write('src/a.ts', 'export function take(x: string | number): string {\n  return String(x);\n}\ndeclare const loose: any;\nexport const out = take(loose);\n');
    const keyAny = '["src/a.ts","@typescript-eslint/no-explicit-any","Unexpected any. Specify a different type."]';
    const keyArgument = `["src/a.ts","@typescript-eslint/no-unsafe-argument","Unsafe argument of type \`any\` assigned to a parameter of type \`${members}\`."]`;
    f.write('scripts/standards-baseline.json', `{"version":1,"gates":{"eslint":{${JSON.stringify(keyAny)}:1,${JSON.stringify(keyArgument)}:1}}}\n`);
    git(f.root, 'add', '-A');
    const result = run(f.root, lintCommand, ['--files']);
    assert.equal(result.status, 0);
    assert.deepEqual(gateLines(result.stderr), [...deferred, 'eslint: 2 findings, baseline 2; no finding above the baseline']);
  });
}

void test('gate-knip: a malformed tool report is unanswered: exit 1, nothing recorded', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a = 1;\n');
  // A stand-in `pnpm` whose `exec knip` prints JSON that is not a knip report (issues is not a list).
  f.write('bin/pnpm', '#!/bin/sh\necho \'{"issues":"not-a-list"}\'\nexit 1\n');
  chmodSync(join(f.root, 'bin/pnpm'), 0o755);
  git(f.root, 'add', '-A');
  const result = run(f.root, lintCommand, ['--knip', '--record-initial'], cleanEnv({ PATH: `${join(f.root, 'bin')}:${process.env['PATH'] ?? ''}` }));
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('knip report unanswered: ✖ Invalid input: expected array, received string\n  → at issues'));
  assert.equal(existsSync(baselineFile(f.root)), false);
});

void test('gate-deferral: a missing deferred tree or a gated project inside one refuses, naming it (lint.ts)', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a = 1;\n');
  git(f.root, 'add', '-A');
  const inside = run(f.root, lintCommand, ['--compiler', '--project=spikes/a2a-pi/tsconfig.json']);
  assert.equal(inside.status, 1);
  assert.ok(inside.stderr.includes(`owner deferral drift: gated compiler project spikes/a2a-pi/tsconfig.json is inside a deferred tree; remove it from ts_projects or end the deferral (${covers})`));
  rmSync(join(f.root, 'spikes/ag-ui-pi'), { recursive: true });
  const missing = compiler(f.root);
  assert.equal(missing.status, 1);
  assert.ok(missing.stderr.includes(`owner deferral drift: deferred tree spikes/ag-ui-pi/ does not exist as a directory; ${covers}`));
});

void test('gate-deferral: check-languages refuses a gated project inside a deferred tree before any coverage query', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('justfile', [
    'GATE_RECIPES := "check-languages"',
    'check_languages := "Python:ruff:check-python:python-lint-files Python:basedpyright:check-python:python-type-files"',
    'ts_projects := "tsconfig.json spikes/a2a-pi/tsconfig.json"',
    'check:', '    true', 'check-languages:', '    true', ''].join('\n'));
  git(f.root, 'add', '-A');
  const result = run(f.root, languagesCommand, []);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, `check-languages: gated compiler project spikes/a2a-pi/tsconfig.json is inside a deferred tree; remove it from ts_projects or end the deferral (${covers})\n`);
});

void test('gate-hook: in a linked worktree under a commit hook env, the gate sees the worktree root and its staged-only files', t => {
  const f = gateFixture(); t.after(f.remove);
  f.write('src/a.ts', 'export const a = 1;\n');
  git(f.root, 'add', '-A'); git(f.root, 'commit', '-q', '-m', 'fixture');
  const home = mkdtempSync(join(tmpdir(), 'gate-linked-')); t.after(() => { rmSync(home, { recursive: true, force: true }); });
  const linked = join(home, 'linked');
  git(f.root, 'worktree', 'add', '-q', '-b', 'linked', linked, 'HEAD');
  // Empty deferred trees are not tracked; the worktree recreates them as the main checkout has them.
  for (const tree of ['plugins/bb-plugin-exo-spike', 'spikes/a2a-pi', 'spikes/ag-ui-pi']) mkdirSync(join(linked, tree), { recursive: true });
  writeStaged(linked, 'src/staged.ts', 'export const s: number = "staged";\n');
  // The env git exports to a pre-commit hook in a linked worktree: absolute GIT_DIR and GIT_INDEX_FILE, cwd = root.
  const gitDir = git(linked, 'rev-parse', '--absolute-git-dir').trim();
  const hook = cleanEnv({ GIT_DIR: gitDir, GIT_INDEX_FILE: join(gitDir, 'index'), GIT_PREFIX: '' });
  const result = run(linked, lintCommand, ['--compiler', '--record-initial', '--project=tsconfig.json'], hook);
  assert.equal(result.status, 0);
  assert.equal(readFileSync(baselineFile(linked), 'utf8'),
    `{\n  "version": 1,\n  "gates": {\n    "tsc:tsconfig.json": {\n      ${JSON.stringify(`["src/staged.ts","TS2322","${STRING_TO_NUMBER}"]`)}: 1\n    }\n  }\n}\n`);
});

function writeStaged(root: string, file: string, text: string): void {
  writeFileSync(join(root, file), text);
  git(root, 'add', '--', file);
}

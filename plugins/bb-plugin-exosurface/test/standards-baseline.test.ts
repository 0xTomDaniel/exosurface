// Owner decision #216 comment 6829935664: each TS gate is a counted no-raise ratchet against a committed baseline.
// These tests drive the ratchet module the root gate driver (scripts/lint.ts) uses, through its public functions.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check, counts, describeResult, knipFindings, record, recordInitial, type Finding } from '../../../scripts/standards-baseline.ts';

const a: Finding = { file: 'src/a.ts', code: 'TS7006', message: "Parameter 'x' implicitly has an 'any' type." };
const b: Finding = { file: 'src/b.ts', code: '@typescript-eslint/no-explicit-any', message: 'Unexpected any. Specify a different type.' };

function baselineFile(gates: Record<string, Finding[]>): string {
  const file = join(mkdtempSync(join(tmpdir(), 'standards-baseline-')), 'standards-baseline.json');
  writeFileSync(file, JSON.stringify({ version: 1, gates: Object.fromEntries(Object.entries(gates).map(([gate, list]) => [gate, counts(list)])) }));
  return file;
}

void test('ratchet-raise: one added finding fails, naming the gate, its count and its baseline', () => {
  const file = baselineFile({ 'tsc:tsconfig.json': [a, b] });
  const result = check('tsc:tsconfig.json', counts([a, a, b]), file);
  assert.equal(result.ok, false);
  const text = describeResult(result).join('\n');
  assert.match(text, /tsc:tsconfig\.json/u);
  assert.match(text, /3 findings/u);
  assert.match(text, /baseline 2/u);
  assert.match(text, /src\/a\.ts/u);
});

void test('ratchet-raise: a finding with a key the baseline does not list fails', () => {
  const file = baselineFile({ eslint: [b] });
  const result = check('eslint', counts([a, b]), file);
  assert.equal(result.ok, false);
  assert.match(describeResult(result).join('\n'), /TS7006/u);
});

void test('ratchet-pass: covered debt passes and still prints the count against the baseline', () => {
  const file = baselineFile({ eslint: [a, b, b] });
  const result = check('eslint', counts([a, b]), file);
  assert.equal(result.ok, true);
  const text = describeResult(result).join('\n');
  assert.match(text, /eslint: 2 findings, baseline 3/u);
  assert.doesNotMatch(text, /\bok\b/u);
});

void test('ratchet-record: one removed finding records a baseline lower by exactly one, every other count unchanged', () => {
  const file = baselineFile({ 'tsc:tsconfig.json': [a, a, b], eslint: [b] });
  record(file, { 'tsc:tsconfig.json': counts([a, b]) }, new Set());
  const after = JSON.parse(readFileSync(file, 'utf8')) as { gates: Record<string, Record<string, number>> };
  assert.deepEqual(after.gates['tsc:tsconfig.json'], counts([a, b]));
  assert.deepEqual(after.gates['eslint'], counts([b]));
});

void test('ratchet-no-raise: recording a rise refuses, naming the gate, and leaves the baseline file unchanged', () => {
  const file = baselineFile({ eslint: [b] });
  const before = readFileSync(file);
  assert.throws(() => { record(file, { eslint: counts([a, b]) }, new Set()); }, /eslint/u);
  assert.deepEqual(readFileSync(file), before);
});

void test('ratchet-record: a gate absent from the baseline is refused by the normal record, naming it', () => {
  const file = baselineFile({ eslint: [b] });
  const before = readFileSync(file);
  assert.throws(() => { record(file, { 'tsc:new/tsconfig.json': counts([a]) }, new Set()); }, /tsc:new\/tsconfig\.json/u);
  assert.deepEqual(readFileSync(file), before);
});

void test('ratchet-initial: the initial record adds only gates absent from the baseline and never touches existing ones', () => {
  const file = baselineFile({ eslint: [b] });
  assert.deepEqual(recordInitial(file, { 'tsc:new/tsconfig.json': counts([a, a]) }, new Set()), ['tsc:new/tsconfig.json']);
  const after = JSON.parse(readFileSync(file, 'utf8')) as { gates: Record<string, Record<string, number>> };
  assert.deepEqual(after.gates['tsc:new/tsconfig.json'], counts([a, a]));
  assert.deepEqual(after.gates['eslint'], counts([b]));
  const before = readFileSync(file);
  assert.throws(() => { recordInitial(file, { eslint: counts([a, b]) }, new Set()); }, /eslint/u);
  assert.deepEqual(readFileSync(file), before);
});

void test('ratchet-initial: the initial record creates a missing baseline file', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'standards-baseline-')), 'standards-baseline.json');
  assert.deepEqual(recordInitial(file, { eslint: counts([b]) }, new Set()), ['eslint']);
  assert.equal(check('eslint', counts([b]), file).ok, true);
});

// Shape of `knip --reporter json` (knip 6.42): one issue row per file, one array per issue type.
function knipReport(exports: string[]): unknown {
  return { issues: [{ file: 'src/c.ts', exports: exports.map((name, line) => ({ name, line, col: 1, pos: 0 })), files: [], types: [], dependencies: [], duplicates: [] }] };
}

void test('ratchet-knip: one added unused export fails the knip gate, naming the gate, its count and its baseline', () => {
  const file = baselineFile({ knip: knipFindings(knipReport(['used']), new Set()) });
  const result = check('knip', counts(knipFindings(knipReport(['used', 'added']), new Set())), file);
  assert.equal(result.ok, false);
  const text = describeResult(result).join('\n');
  assert.match(text, /knip: 2 findings, baseline 1/u);
  assert.match(text, /src\/c\.ts exports \(1 > baseline 0\): added/u);
});

void test('ratchet-knip: findings are position-free and drop integrity-pinned files; an unknown report shape is unanswered', () => {
  const moved = { issues: [{ file: 'src/c.ts', exports: [{ name: 'used', line: 99, col: 9, pos: 999 }] }] };
  assert.deepEqual(knipFindings(moved, new Set()), knipFindings(knipReport(['used']), new Set()));
  assert.deepEqual(knipFindings(knipReport(['used']), new Set(['src/c.ts'])), []);
  assert.throws(() => knipFindings({ issues: [{ file: 'src/c.ts', exports: [42] }] }, new Set()), /knip/u);
  assert.throws(() => knipFindings({ files: [] }, new Set()), /knip/u);
});

void test('ratchet-integrity: a baseline never lists an integrity-pinned file', () => {
  const file = baselineFile({ eslint: [a] });
  const before = readFileSync(file);
  assert.throws(() => { record(file, { eslint: counts([a]) }, new Set(['src/a.ts'])); }, /integrity/u);
  assert.deepEqual(readFileSync(file), before);
});

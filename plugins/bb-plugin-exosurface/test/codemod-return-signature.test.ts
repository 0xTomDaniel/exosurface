import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';

void test('return-signature CLI annotates only untyped exported functions and reports skips', () => {
  const dir = mkdtempSync(join(tmpdir(), 'return-signature-'));
  try {
    const file = join(dir, 'fixture.ts');
    writeFileSync(file, 'export async function load() { return []; }\nfunction hidden() { return []; }\nexport function typed(): string { return "ok"; }\n');
    const run = (...args: string[]) => spawnSync(process.execPath, [resolve(import.meta.dirname, '../../../scripts/codemods/return-signature.ts'), ...args], { encoding: 'utf8' });
    const args = ['load', 'Promise<string[]>', file];
    const first = run(...args);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(first.stdout.trim(), '{"changed":1,"skipped":2}');
    const expected = 'export async function load(): Promise<string[]> { return []; }\nfunction hidden() { return []; }\nexport function typed(): string { return "ok"; }\n';
    assert.equal(readFileSync(file, 'utf8'), expected);
    assert.equal(run(...args).status, 0);
    assert.equal(readFileSync(file, 'utf8'), expected);
    assert.notEqual(run('load', '???', file).status, 0);
    assert.equal(readFileSync(file, 'utf8'), expected);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

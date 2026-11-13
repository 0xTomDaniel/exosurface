import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

void test('explicit-string CLI preserves primitive output, skips uncertain types and is idempotent', () => {
  const dir = mkdtempSync(join(tmpdir(), 'explicit-string-'));
  try {
    const file = join(dir, 'fixture.ts');
    const prefix = 'const n: number = -0; const b: boolean = false; const big: bigint = 42n;\n';
    writeFileSync(file, prefix + 'console.log(`${n}/${b}/${big}`, "x" + n, b + "y", 1 + 2);\n');
    const run = () => spawnSync(process.execPath, [resolve(import.meta.dirname, '../../../scripts/codemods/explicit-string.ts'), file], { encoding: 'utf8' });
    const first = run();
    assert.equal(first.status, 0, first.stderr);
    const expected = prefix + 'console.log(`${String(n)}/${String(b)}/${String(big)}`, "x" + String(n), String(b) + "y", 1 + 2);\n';
    assert.equal(readFileSync(file, 'utf8'), expected);
    assert.equal(spawnSync(process.execPath, [file], { encoding: 'utf8' }).stdout, '0/false/42 x0 falsey 3\n');
    assert.equal(run().status, 0);
    assert.equal(readFileSync(file, 'utf8'), expected);
    const skipped = 'const n = 2; const heading: `h${number}` = `h${n}`;\n' + 'function f(x: unknown, o: object, n: number | undefined) { return `${x}/${o}/${n}`; }\nfunction g(String: (x: number) => string, n: number) { return `${n}`; }\n';
    writeFileSync(file, skipped);
    const conservative = run();
    assert.equal(conservative.status, 0, conservative.stderr);
    assert.equal(readFileSync(file, 'utf8'), skipped);
    assert.match(conservative.stdout, /"skipped":5/);
    mkdirSync(join(dir, 'vendor'));
    const vendor = join(dir, 'vendor', 'example.ts');
    const untouched = 'console.log(`value ${123}`);\n';
    writeFileSync(vendor, untouched);
    const vendorRun = spawnSync(process.execPath, [resolve(import.meta.dirname, '../../../scripts/codemods/explicit-string.ts'), vendor], { encoding: 'utf8' });
    assert.equal(vendorRun.status, 0, vendorRun.stderr);
    assert.equal(readFileSync(vendor, 'utf8'), untouched);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

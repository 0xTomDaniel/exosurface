import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '../../..');

await test('CLI rewrites public fixtures and a second run changes nothing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'test-hygiene-'));
  try {
    const file = join(dir, 'example.ts');
    writeFileSync(file, "import { test } from 'node:test';\nconst x = value!;\nconst y = ({ title: 'ok' })['title'];\nconst n: number = 1; const z = n as number;\ntest('works', async () => { console.log(x); });\n");
    const run = () => execFileSync(process.execPath, [resolve(root, 'scripts/codemods/test-hygiene.ts'), file], { encoding: 'utf8', cwd: root });
    run();
    const expected = "import { required } from './required.ts';\nimport { test } from 'node:test';\nconst x = required(value, \"Expected value to be non-null\");\nconst y = ({ title: 'ok' }).title;\nconst n: number = 1; const z = n;\nvoid test('works', () => { console.log(x); });\n";
    assert.equal(readFileSync(file, 'utf8'), expected);
    run();
    assert.equal(readFileSync(file, 'utf8'), expected);
    writeFileSync(join(dir, 'required.ts'), readFileSync(resolve(root, 'plugins/bb-plugin-exosurface/test/required.ts')));
    writeFileSync(file, "const value: string | null = JSON.parse('null');\nconsole.log(value!);\n");
    run();
    const failed = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    assert.notEqual(failed.status, 0);
    assert.match(failed.stderr, /Expected value to be non-null/);
    writeFileSync(file, "import { test, after } from 'node:test';\nimport assert from 'node:assert/strict';\nlet closed = false;\nafter(() => { closed = true; });\ntest('first', () => { assert.equal(closed, false); });\ntest('second', () => { assert.equal(closed, false); });\n");
    run();
    const env = { ...process.env };
    delete env['NODE_TEST_CONTEXT'];
    const lifecycle = spawnSync(process.execPath, ['--test', '--test-reporter=tap', file], { encoding: 'utf8', env });
    assert.equal(lifecycle.status, 0, lifecycle.stdout + lifecycle.stderr);
    assert.match(lifecycle.stdout, /# pass 2/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

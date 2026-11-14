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
    const unsafe = "import { test, describe } from 'node:test';\nlet m: string|null='a'; const o:{f?:()=>number}={f:()=>1}; console.log(m!.length, o.f!());\nconst target: {value?: string} = {}; target.value! = 'b';\ndescribe('s',()=>{test('inner',async()=>{});}); test('c',{concurrency:2},async()=>{}); test('w',async()=>{await 0;});\n";
    writeFileSync(file, unsafe);
    assert.deepEqual(JSON.parse(run()), { nonNull: 0, dot: 0, floating: 1, async: 0, assertion: 0, leftNonNull: 3, leftAsync: 3, leftAssertion: 0, leftDot: 0, leftRegistration: 3 });
    assert.equal(readFileSync(file, 'utf8'), unsafe.replace("test('w'", "void test('w'"));
    writeFileSync(file, '/** required header */\nconst value = other!;\n');
    run();
    assert.equal(readFileSync(file, 'utf8'), '/** required header */\nimport { required } from \'./required.ts\';\nconst value = required(other, "Expected other to be non-null");\n');
    const narrowing = "/** required header */\nimport assert from 'node:assert/strict';\nconst value: string | null = JSON.parse('null');\nconst drawn = value!;\nassert.ok(drawn, 'authored failure');\n";
    writeFileSync(file, narrowing);
    run();
    assert.equal(readFileSync(file, 'utf8'), narrowing.replace('value!', 'value'));
    const authored = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    assert.match(authored.stderr, /authored failure/);
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

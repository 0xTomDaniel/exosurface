// Build and run separately. Actual retained host + public SDK schemas; only the
// bridge I/O is captured and entry counters inserted, no runtime/model substitute.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
const root = resolve(process.argv[2]), out = resolve(process.argv[3]);
if (process.argv[4] === '--build') {
  const { build } = await import(pathToFileURL(join(root, 'node_modules/esbuild/lib/main.js')));
  mkdirSync(out, { recursive: true });
  await build({ entryPoints: [join(root, 'legacy/primary/host.ts')], outfile: join(out, 'host.mjs'), platform: 'node', format: 'esm', bundle: true, banner: { js: "import {createRequire as __r} from 'node:module';const require=__r(import.meta.url);" }, plugins: [{ name: 'capture-only', setup(b) { b.onLoad({ filter: /legacy\/primary\/host\.ts$/ }, args => { let contents = readFileSync(args.path, 'utf8'); assert.ok(contents.includes('const io = createBridgeIo<any>();')); contents = contents.replace('const io = createBridgeIo<any>();', 'const io = (globalThis as any).__canonicalIo;').replace(/(async function construct\([^\n]+\{)/, '$1\n(globalThis as any).__canonicalMetrics.owner++;').replace(/(async function selectedPrompt\([^\n]+\{)/, '$1\n(globalThis as any).__canonicalMetrics.model++;'); return { contents, loader: 'ts', resolveDir: join(root, 'legacy/primary') }; }); } }] });
  console.log(JSON.stringify({ built: true, actualHostAndPublicSchemas: true, substitutions: ['bridge IO capture', 'entry counters only'], nativeDispatch: false }));
} else {
  assert.ok(process.env["EXO_CONFIG"]?.startsWith(process.env["PROOF_ROOT"] + '/'));
  const cfg = JSON.parse(readFileSync(process.env["EXO_CONFIG"])), home = cfg.primaryStateDir;
  assert.ok(!existsSync(home), 'Control proof requires fresh isolated state, not a prior resume audit');
  mkdirSync(home, { recursive: true });
  const operationId = 'host-control-operation', journal = { schema: 'exosurface-canonical-setup/0', request: { operationId, projectId: 'host-project', profile: 'fresh' }, stage: 'spawning' };
  writeFileSync(join(home, 'canonical-setup.json'), JSON.stringify(journal));
  const responses = [], pending = new Map();
  globalThis.__canonicalMetrics = { owner: 0, model: 0 };
  globalThis.__canonicalIo = { send(value) { responses.push(value); }, sendResult(id, value) { responses.push({ id, result: value }); pending.get(id)?.({ result: value }); }, sendError(id, code, message) { responses.push({ id, error: { code, message } }); pending.get(id)?.({ error: { code, message } }); } };
  const { handleLine } = await import(pathToFileURL(join(out, 'host.mjs')));
  let id = 0;
  const request = (method, params) => new Promise((resolve, reject) => { const current = ++id, timeout = setTimeout(() => reject(Error('host test timeout')), 2000); pending.set(current, value => { clearTimeout(timeout); resolve(value); }); handleLine(JSON.stringify({ jsonrpc: '2.0', id: current, method, params })); });
  const options = { model: 'exo-opus-5-5', permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null, providerOptions: {} };
  const start = { threadId: 'host-thread', cwd: cfg.vault, options, instructionMode: 'append' };
  const input = [{ type: 'text', text: `/exosurface-initialize ${operationId}` }];
  assert.ok((await request('thread/start', { ...start, input })).result, 'thread/start consumes control without owner');
  assert.ok((await request('thread/start', { ...start, options: { ...options, providerOptions: { ...options.providerOptions, canonicalSetupOperation: operationId } } })).result, 'absent input requires exact admission candidate');
  const turn = { threadId: 'host-thread', providerThreadId: 'exo:fresh:main', clientRequestId: 'creq_23456789ab', options };
  assert.ok((await request('turn/start', { ...turn, input })).result, 'turn/start consumes control without model');
  for (const method of ['thread/start', 'turn/start']) {
    const value = await request(method, { ...(method === 'thread/start' ? start : turn), input: [{ type: 'text', text: '/exosurface-initialize sensitive-state-must-not-escape' }] });
    assert.match(value.error?.message ?? '', /Invalid or stale canonical initialization/);
    for (const malformed of [[{ type: 'text', text: '  ' + input[0].text }], [{ type: 'text', text: 'ordinary prefix' }, ...input]]) {
      assert.match((await request(method, { ...(method === 'thread/start' ? start : turn), input: malformed })).error?.message ?? '', /Invalid or stale canonical initialization/);
    }
  }
  assert.match((await request('thread/start', { ...start, threadId: 'unadmitted-thread', options: { ...options, providerOptions: { canonicalSetupOperation: operationId } } })).error?.message ?? '', /not admitted/);
  assert.match((await request('turn/start', { ...turn, input: [...input, { type: 'text', text: 'mixed ordinary prompt' }] })).error?.message ?? '', /Invalid or stale/);
  assert.deepEqual(globalThis.__canonicalMetrics, { owner: 0, model: 0 });
  assert.ok(!existsSync(join(home, 'audit')) && !existsSync(join(home, 'runtime-info')));
  assert.ok(!JSON.stringify(responses).includes('sensitive-state-must-not-escape'));
  const controlMetrics = { ...globalThis.__canonicalMetrics };
  // Existing canonical resume still fails closed without an active generation.
  const resumed = await request('thread/resume', { ...start, threadId: 'legacy-resume', providerThreadId: 'exo:fresh:main' });
  assert.match(resumed.error?.message ?? '', /Existing canonical profile\/generation required/);
  assert.equal(globalThis.__canonicalMetrics.model, 0);
  // BB may start the setup-created thread after setup is already bound (no provider identity yet). Only that exact
  // thread with its committed canonical binding gets the identity; owner attachment waits for the first turn.
  writeFileSync(join(home, 'canonical-setup.json'), JSON.stringify({ ...journal, stage: 'bound', threadId: 'host-thread' }));
  mkdirSync(join(home, 'bindings'), { recursive: true });
  writeFileSync(join(home, 'bindings', 'host-thread.json'), JSON.stringify({ providerThreadId: 'exo:fresh:main', profile: 'fresh', runtimeKind: 'canonical', sessionFile: join(home, 'session.jsonl'), cursor: 0 }));
  writeFileSync(join(home, 'bindings', 'other-thread.json'), JSON.stringify({ providerThreadId: 'exo:fresh:main', profile: 'fresh', runtimeKind: 'canonical', sessionFile: join(home, 'session.jsonl'), cursor: 0 }));
  const before = { ...globalThis.__canonicalMetrics };
  const late = await request('thread/start', start);
  assert.equal(late.result?.providerThreadId, 'exo:fresh:main'); assert.deepEqual(globalThis.__canonicalMetrics, before);
  assert.match((await request('thread/start', { ...start, threadId: 'other-thread' })).error?.message ?? '', /must resume its provider identity/);
  writeFileSync(join(home, 'bindings', 'host-thread.json'), JSON.stringify({ providerThreadId: 'exo:fresh:main', profile: 'fresh', runtimeKind: 'offline', sessionFile: join(home, 'session.jsonl'), cursor: 0 }));
  assert.ok((await request('thread/start', start)).error, 'non-canonical binding is not adopted');
  assert.equal(globalThis.__canonicalMetrics.model, 0);
  console.log(JSON.stringify({ passed: true, controls: 11, lateBoundStart: { exactThreadOnly: true, ownerDeferred: true }, methods: ['thread/start', 'turn/start'], absentInputAdmission: true, controlMetrics, sensitiveControlNotInOutput: true, unchangedResumeFailClosed: true, providerDispatch: false, releaseReady: false }, null, 2));
}

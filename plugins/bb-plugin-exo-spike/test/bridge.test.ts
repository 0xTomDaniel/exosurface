import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { experimental_captureBridgeJsonRpcOutput, experimental_runBridgeConformance, experimental_formatConformanceReport } from '@get-bb/plugin-sdk/provider-bridge/testing';
import { handleLine, experimental_providerBridge } from '../host.ts';
import { runtimeLaunch, assertNativeOwner } from '../src/runtime.ts';
import { HOME, OPTCHAT, CANONICAL_HOME, CANONICAL_PROFILE } from '../src/state.ts';

test('public bridge conformance against real Pi 1.1 + isolated OptChat', { timeout: 180_000 }, async () => {
  const capture = experimental_captureBridgeJsonRpcOutput();
  let report;
  // The kit reuses fixed thread IDs; isolate each run from durable prior evidence.
  const prefix = `test_${randomUUID().replaceAll('-', '').slice(0, 8)}_`;
  const send = (line: string) => { let m; try { m = JSON.parse(line); } catch { handleLine(line); return; } if (m?.params?.threadId) m.params.threadId = prefix + m.params.threadId; handleLine(JSON.stringify(m)); };
  const takeMessages = () => capture.takeMessages().map((m: any) => { if (m.params?.threadId?.startsWith(prefix)) m.params.threadId = m.params.threadId.slice(prefix.length); return m; });
  try {
    report = await experimental_runBridgeConformance({
      providerId: 'exo-spike', timeoutMs: 30_000,
      transport: { send, takeMessages, close: () => experimental_providerBridge.onClose?.() },
      session: { cwd: process.cwd(), promptInput: [{ type: 'text', text: 'EXO_CONFORMANCE', mentions: [] }], zeroWorkPromptInput: [{ type: 'text', text: '/exo-noop', mentions: [] }], interruptiblePromptInput: [{ type: 'text', text: 'EXO_SLOW', mentions: [] }] },
    });
  } finally { await experimental_providerBridge.onClose?.(); capture.restore(); }
  writeFileSync('evidence/conformance.json', JSON.stringify(report, null, 2) + '\n');
  console.log(experimental_formatConformanceReport(report!));
  assert.equal(report?.passed, true);
});

test('live trial restores normal resources without claiming the personal profile or loading the fixture', () => {
  const profile = `live-test-${randomUUID().slice(0, 8)}`;
  const launch = runtimeLaunch(profile, 'live', 'test-live-resources');
  assert.equal(launch.env.OPTCHAT_HOME, HOME);
  assert.notEqual(launch.env.OPTCHAT_HOME, `${process.env.HOME}/.optchat-exocortex-test`);
  assert.ok(launch.args.includes(OPTCHAT));
  assert.ok(launch.args.includes('claude-opus-5-5'));
  assert.ok(launch.args.includes('--approve'));
  for (const flag of ['--offline', '--no-context-files', '--no-skills', '--no-extensions', '--no-mcp']) assert.ok(!launch.args.includes(flag));
  assert.ok(!launch.args.some(a => a.includes('fixture.ts')));
  assert.equal(launch.args[launch.args.indexOf('--optchat-profile') + 1], profile);
});

test('canonical launch reuses existing configuration without initializing/rebinding it', () => {
  const paths = ['config.json', 'AGENTS.md', 'active-memory.json', 'DO-NOT-DELETE.md'].map(p => `${CANONICAL_HOME}/profiles/${CANONICAL_PROFILE}/${p}`);
  const before = paths.map(p => readFileSync(p, 'utf8'));
  const launch = runtimeLaunch(CANONICAL_PROFILE, 'canonical', 'test-canonical-options');
  assert.equal(launch.env.OPTCHAT_HOME, CANONICAL_HOME);
  assert.equal(launch.env.EXO_BB_RUNTIME_KIND, 'canonical');
  assert.equal(launch.args[launch.args.indexOf('--session-dir') + 1], `${CANONICAL_HOME}/pi-sessions`);
  assert.deepEqual(paths.map(p => readFileSync(p, 'utf8')), before);
  assert.throws(() => runtimeLaunch('wrong-profile', 'canonical', 'test-no-rebind'));
});

test('persisted profile name is not sufficient evidence of current native ownership', async () => {
  // Read-only check: this test process is not the canonical profile's Pi owner.
  await assert.rejects(assertNativeOwner(CANONICAL_PROFILE, 'canonical', process.pid));
});

test('source uses public BB imports and leaves provider bundles alone', () => {
  for (const file of ['host.ts', 'server.ts', 'app.tsx', 'src/pi-rpc.ts', 'src/state.ts', 'src/runtime.ts', 'src/live.ts']) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /from\s+['"]@bb\//);
    assert.doesNotMatch(source, /provider-pi\/dist|host\.meta\.json|plugin-host-artifacts/);
  }
});

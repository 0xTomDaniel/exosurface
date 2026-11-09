import test from 'node:test';
import assert from 'node:assert/strict';
import { experimental_captureBridgeJsonRpcOutput, experimental_runBridgeConformance, experimental_formatConformanceReport } from '@get-bb/plugin-sdk/provider-bridge/testing';
import { handleLine, experimental_providerBridge } from '../host.ts';
import { LAYOUT, pagesFor, reply, pressText, assertStagingUrl, PRESS_PREFIX } from '../src/fixture.ts';

test('layout: one Home, surfaces are visible children of Home, worker is hidden', () => {
  assert.equal(LAYOUT.filter(t => t.role === 'home').length, 1);
  for (const t of LAYOUT.filter(t => t.role === 'surface')) { assert.equal(t.parentKey, 'home'); assert.ok(!t.hidden); }
  for (const t of LAYOUT.filter(t => t.role === 'worker')) assert.equal(t.hidden, true);
});

test('every visible thread has pages and every button round-trips to a press reply', () => {
  for (const t of LAYOUT.filter(t => !t.hidden)) {
    const pages = pagesFor(t.key); assert.ok(pages.length > 0, t.key);
    for (const p of pages) for (const b of p.buttons) {
      const text = pressText(p.id, b.id, b.label);
      assert.ok(text.startsWith(PRESS_PREFIX));
      assert.match(reply(text).text, new RegExp(`${p.id}/${b.id}`));
    }
  }
});

test('staging guard refuses live BB ports and non-loopback hosts', () => {
  assert.throws(() => assertStagingUrl('http://127.0.0.1:38886'));
  assert.throws(() => assertStagingUrl('http://127.0.0.1:38887'));
  assert.throws(() => assertStagingUrl('http://example.com:39886'));
  assert.equal(assertStagingUrl('http://127.0.0.1:39886').port, '39886');
});

test('fixture provider passes the public BB provider-bridge conformance kit (no LLM, no network)', { timeout: 120_000 }, async () => {
  const capture = experimental_captureBridgeJsonRpcOutput();
  let report;
  try {
    report = await experimental_runBridgeConformance({
      providerId: 'nls-fixture', timeoutMs: 30_000,
      transport: { send: handleLine, takeMessages: () => capture.takeMessages(), close: () => experimental_providerBridge.onClose?.() },
      session: { cwd: process.cwd(), promptInput: [{ type: 'text', text: 'hello', mentions: [] }], zeroWorkPromptInput: [{ type: 'text', text: '', mentions: [] }], interruptiblePromptInput: [{ type: 'text', text: 'SLOW', mentions: [] }] },
    });
  } finally { await experimental_providerBridge.onClose?.(); capture.restore(); }
  if (!report?.passed) console.log(experimental_formatConformanceReport(report!));
  assert.equal(report?.passed, true);
});

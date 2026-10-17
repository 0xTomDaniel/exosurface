import { test, expect } from '@playwright/test';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, request as proxyRequest } from 'node:http';
import { startHost } from '../src/host.js';
import { connectClient, discover } from '../src/client.js';

test('real Lit/A2UI: visual turn, two clients, idle edit, detach, recovery and isolated history', async ({ browser }) => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-browser-'));
  const host = await startHost({ stateDir: dir, port: 0, bootWorkMs: 80 });
  const context = await browser.newContext();
  const first = await context.newPage(), second = await context.newPage();
  const errors: string[] = []; first.on('pageerror', error => errors.push(error.message));
  try {
    await new Promise(resolve => setTimeout(resolve, 180)); // Work starts and finishes before any browser exists.
    const address = `http://127.0.0.1:61011/?host=${encodeURIComponent(host.url)}`;
    await first.goto(address); await second.goto(address);
    await expect(first.getByText('Research review · 45 min', { exact: true })).toBeVisible();
    await expect(first.getByText('completed', { exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'After lunch', exact: true }).nth(1).click();
    await expect(first.getByRole('button', { name: 'Use this version', exact: true })).toBeVisible();
    await expect(second.getByRole('button', { name: 'Use this version', exact: true })).toBeVisible();
    await Promise.all([first.getByRole('button', { name: 'Use this version', exact: true }).click(), second.getByRole('button', { name: 'Use this version', exact: true }).click()]);
    await expect(first.getByText('13:00', { exact: true })).toBeVisible();
    await expect(second.getByText('13:00', { exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'Turn on', exact: true }).click();
    await expect(second.getByText('On · simulated', { exact: true })).toBeVisible();
    await first.getByRole('button', { name: 'Select', exact: true }).nth(1).click();
    await expect(first.getByText('Selected:', { exact: false })).toContainText('research-review');
    const client = await connectClient(host.url);
    const before = await discover(client);
    await first.getByRole('button', { name: 'Detach observer' }).click();
    await second.close();
    const id = await host.startWork(700);
    writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace('Research brief', 'Revised source brief'));
    await first.getByRole('button', { name: 'Reconnect observer' }).click();
    await expect(first.getByText('Revised source brief · 90 min', { exact: true })).toBeVisible();
    await expect(first.getByText('Selected:', { exact: false })).toContainText('research-review');
    await expect.poll(async () => (await discover(client)).work.find(w => w.id === id)?.state).toBe('completed');
    await first.reload();
    await expect(first.getByText('Revised source brief · 90 min', { exact: true })).toBeVisible();
    const revision = await first.getByTestId('revision').textContent();
    await first.locator('.thread-panel button').filter({ hasText: 'acceptance applied' }).click();
    await expect(first.getByRole('region', { name: 'Historical surface' })).toBeVisible();
    await expect(first.getByTestId('revision')).toHaveText(revision!);
    expect((await discover(client)).revision).toBeGreaterThan(before.revision);
    expect(errors).toEqual([]);
    mkdirSync('evidence/generated', { recursive: true });
    await first.screenshot({ path: 'evidence/generated/agenda-history.png', fullPage: true });
    await first.setViewportSize({ width: 390, height: 844 });
    await first.screenshot({ path: 'evidence/generated/mobile.png', fullPage: true });
    expect(await first.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); await host.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('browser renews finite observation, preserves input focus, and recovers across host restart with truthful stop', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-browser-restart-'));
  let host = await startHost({ stateDir: dir, port: 0, leaseMs: 600 });
  try {
    const port = Number(new URL(host.url).port);
    const address = `http://127.0.0.1:61011/?host=${encodeURIComponent(host.url)}`;
    await page.goto(address);
    await expect(page.getByText('Research brief · 90 min', { exact: true })).toBeVisible();
    await page.getByText('Add words to this turn', { exact: true }).click();
    await page.getByLabel('Optional utterance').fill('A draft thought survives background updates');
    await page.getByLabel('Optional utterance').focus();
    const work = await host.startWork(60000);
    await new Promise(resolve => setTimeout(resolve, 1500)); // More than two lease renewals.
    writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace('Research brief', 'Idle browser source update'));
    await expect(page.getByText('Idle browser source update · 90 min', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Optional utterance')).toBeFocused();
    await expect(page.getByLabel('Optional utterance')).toHaveValue('A draft thought survives background updates');
    await host.close();
    await expect(page.getByRole('button', { name: 'Detach observer' })).toContainText('Reconnecting');
    host = await startHost({ stateDir: dir, port, leaseMs: 600 });
    await expect(page.getByRole('button', { name: 'Detach observer' })).toContainText('Live');
    await expect(page.getByText('interrupted', { exact: true })).toBeVisible();
    const client = await connectClient(host.url);
    expect((await discover(client)).work.find(w => w.id === work)?.state).toBe('interrupted');
    await host.startWork(60000);
    await page.getByRole('button', { name: 'Stop work', exact: true }).click();
    await expect(page.getByText('canceled', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Detach observer' }).click();
    await new Promise(resolve => setTimeout(resolve, 300));
    const measured = await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json();
    expect(measured.activeStreams).toBe(0);
    expect(measured.observerRecords).toBeLessThanOrEqual(3);
    mkdirSync('evidence/generated', { recursive: true });
    writeFileSync('evidence/generated/browser-restart.json', JSON.stringify(measured, null, 2));
  } finally { await host.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('browser recovers from a silent observation stall through the real A2A transport', async ({ page }) => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-browser-stall-'));
  const host = await startHost({ stateDir: dir, port: 0 });
  let stall = false, streams = 0, proxyUrl = '';
  // A network fault injector forwards real SDK responses. It drops bytes from
  // the first observation after initial rendering, without closing its socket.
  const proxy = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/.well-known/agent-card.json') {
      void fetch(`${host.url}${request.url}`).then(async upstream => {
        response.setHeader('Access-Control-Allow-Origin', 'http://127.0.0.1:61011');
        response.setHeader('Content-Type', 'application/json');
        response.end((await upstream.text()).replaceAll(host.url, proxyUrl));
      });
      return;
    }
    const upstream = proxyRequest(`${host.url}${request.url ?? '/'}`, { method: request.method, headers: request.headers }, incoming => {
      response.writeHead(incoming.statusCode ?? 502, incoming.headers);
      const stream = incoming.headers['content-type'] === 'text/event-stream' ? ++streams : 0;
      incoming.on('data', (chunk: Buffer) => { if (!(stall && stream === 1)) response.write(chunk); });
      incoming.on('end', () => response.end());
    });
    upstream.on('error', () => response.destroy());
    response.on('close', () => upstream.destroy());
    request.pipe(upstream);
  });
  await new Promise<void>(resolve => proxy.listen(0, '127.0.0.1', resolve));
  const address = proxy.address(); if (!address || typeof address === 'string') throw new Error('Proxy not listening');
  proxyUrl = `http://127.0.0.1:${address.port}`;
  try {
    await page.goto(`http://127.0.0.1:61011/?host=${encodeURIComponent(proxyUrl)}`);
    await expect(page.getByText('Research brief · 90 min', { exact: true })).toBeVisible();
    stall = true;
    writeFileSync(join(host.vault, 'Agenda.md'), readFileSync(join(host.vault, 'Agenda.md'), 'utf8').replace('Research brief', 'Recovered after silent stall'));
    await expect(page.getByText('Recovered after silent stall · 90 min', { exact: true })).toBeVisible();
    expect(streams).toBeGreaterThanOrEqual(2);
    await page.getByRole('button', { name: 'Detach observer' }).click();
    await expect.poll(async () => (await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json()).activeStreams).toBe(0);
    mkdirSync('evidence/generated', { recursive: true });
    writeFileSync('evidence/generated/browser-stall.json', JSON.stringify({ status: 'PASS', streams, watchdogMs: 1600, retryMs: 200, activeStreamsAfterDetach: 0 }, null, 2));
  } finally {
    proxy.closeAllConnections(); await new Promise<void>(resolve => proxy.close(() => resolve()));
    await host.close(); rmSync(dir, { recursive: true, force: true });
  }
});

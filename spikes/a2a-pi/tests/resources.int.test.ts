import { test, expect } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { request as httpRequest, createServer } from 'node:http';
import { stringify } from 'yaml';
import { parseSseStream } from '@a2a-js/sdk';
import { startHost } from '../src/host.js';
import { connectClient, discover } from '../src/client.js';
import { limits } from '../src/schema.js';

test('a paused HTTP reader is disconnected within the writer deadline while a healthy SDK client keeps working', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-slow-'));
  const host = await startHost({ stateDir: dir, port: 0, leaseMs: 15000 });
  let slow: ReturnType<typeof httpRequest> | undefined;
  try {
    const client = await connectClient(host.url);
    const state = await discover(client);
    const body = JSON.stringify({ jsonrpc: '2.0', id: 'slow', method: 'SubscribeToTask', params: { id: state.observerTaskId } });
    await new Promise<void>((resolve, reject) => {
      slow = httpRequest(`${host.url}/rpc`, { method: 'POST', headers: { Authorization: 'Bearer demo-owner',
        'Content-Type': 'application/json', 'A2A-Version': '1.0', 'Content-Length': Buffer.byteLength(body) } }, response => { response.pause(); resolve(); });
      slow.on('error', reject); slow.end(body);
    });
    let samples = 0;
    for (; samples < 60; samples++) {
      const data = { date: '2026-09-13', timezone: 'America/New_York', tasks: Array.from({ length: 28 }, (_, i) => ({ id: `load-${i}`, title: `${samples}-${'x'.repeat(2000)}`, time: '09:00', minutes: 30, area: 'Fixture stress' })) };
      writeFileSync(join(host.vault, 'Agenda.md'), `---\n${stringify(data)}---\n`);
      await new Promise(resolve => setTimeout(resolve, 110));
      const m = await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json();
      if (m.slowDrops > 0) break;
    }
    const final = await discover(client);
    const measured = await (await fetch(`${host.url}/metrics`, { headers: { Authorization: 'Bearer demo-owner' } })).json();
    expect(final.tasks[0]?.id).toBe('load-0');
    expect(measured.slowDrops).toBeGreaterThan(0);
    expect(measured.maxDrainMs).toBeLessThan(limits.drainMs + 100);
    expect(measured.maxFrameBytes).toBeLessThan(limits.checkpointBytes);
    expect(measured.maxWritableBytes).toBeLessThan(limits.checkpointBytes + limits.writerBytes);
    expect(measured.activeStreams).toBe(0);
    expect(measured.busListeners).toBeLessThanOrEqual(4);
    mkdirSync('evidence/generated', { recursive: true });
    writeFileSync('evidence/generated/resource-slow.json', JSON.stringify({ updates: samples + 1, pausedReaders: 1, titleLength: 2000, tasks: 28, ...measured }, null, 2));
  } finally { slow?.destroy(); await host.close(); rmSync(dir, { recursive: true, force: true }); }
});

test('stock SSE parser rejects a 4 MiB ASCII frame and host rejects an oversized command', async () => {
  const server = createServer((_req, res) => { res.writeHead(200, { 'Content-Type': 'text/event-stream' }); res.end(`data: ${'x'.repeat(4 * 1024 * 1024 + 1)}\n\n`); });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); if (!address || typeof address === 'string') throw new Error('No server');
  try {
    const stream = parseSseStream(await fetch(`http://127.0.0.1:${address.port}`));
    await expect(stream.next()).rejects.toThrow('maximum allowed size');
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
  const dir = mkdtempSync(join(tmpdir(), 'exo-a2a-limit-'));
  const host = await startHost({ stateDir: dir, port: 0 });
  try {
    const response = await fetch(`${host.url}/rpc`, { method: 'POST', headers: { Authorization: 'Bearer demo-owner' }, body: 'x'.repeat(limits.requestBytes + 1) });
    expect(response.status).toBe(413);
  } finally { await host.close(); rmSync(dir, { recursive: true, force: true }); }
});

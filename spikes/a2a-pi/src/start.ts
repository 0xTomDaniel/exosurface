import { createServer } from 'vite';
import { startHost } from './host.js';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { parseArgs } from 'node:util';
const { values } = parseArgs({ options: { state: { type: 'string' }, 'boot-work-ms': { type: 'string' }, port: { type: 'string' }, 'host-only': { type: 'boolean' }, 'crash-after-plan-write': { type: 'boolean' } } });
const stateDir = values.state ? resolve(values.state) : resolve(tmpdir(), 'exosurface-a2a-pi-demo');
const host = await startHost({ stateDir, port: Number(values.port ?? 61001), bootWorkMs: Number(values['boot-work-ms'] ?? 1000), crashAfterPlanWrite: values['crash-after-plan-write'] });
const browser = values['host-only'] ? undefined : await createServer();
await browser?.listen();
console.log(JSON.stringify({ host: host.url, browser: browser ? 'http://127.0.0.1:61011' : undefined, stateDir }));
let closing = false;
async function close() { if (closing) return; closing = true; await browser?.close(); await host.close(); process.exit(0); }
process.on('SIGINT', () => void close()); process.on('SIGTERM', () => void close());

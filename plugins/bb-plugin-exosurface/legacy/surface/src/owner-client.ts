import { createConnection, type Socket } from 'node:net';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { join } from 'node:path';
import { existsSync, unlinkSync } from 'node:fs';
import { HOME } from './state.ts';
export const OWNER_DIR = join(HOME, 'owner');
export const OWNER_SOCKET = join(OWNER_DIR, 'rpc.sock');
let launching: Promise<void> | undefined;
async function probe() {
  return new Promise<boolean>(resolve => {
    const socket = createConnection(OWNER_SOCKET); socket.setTimeout(500);
    socket.once('connect', () => { socket.destroy(); resolve(true); });
    socket.once('error', () => resolve(false)); socket.once('timeout', () => { socket.destroy(); resolve(false); });
  });
}
async function ensureOwner() {
  if (await probe()) return;
  if (!launching) launching = (async () => {
    // Only our dead gateway socket may be removed. Never touch OptChat's lock.
    if (existsSync(OWNER_SOCKET) && !await probe()) unlinkSync(OWNER_SOCKET);
    // launchd, not BB's process tree, is the supervisor. Installation is an
    // explicit local setup step; a client never provisions it automatically.
    const uid = process.getuid?.();
    if (uid === undefined) throw new Error('Approved owner supervisor unavailable on this runtime');
    const launcher = spawn('/bin/launchctl', ['kickstart', `gui/${uid}/local.exocortex.a2ui-owner`], { stdio: 'ignore' });
    await new Promise<void>((resolve, reject) => { launcher.once('error', reject); launcher.once('exit', code => code === 0 ? resolve() : reject(new Error('Exo launchd owner is not provisioned; no fallback owner spawned by BB'))); });
    const until = Date.now() + 30_000;
    while (Date.now() < until) { if (await probe()) return; await new Promise(r => setTimeout(r, 200)); }
    throw new Error('Independent Exo owner did not start; inspect owner/state.json. No lock takeover attempted.');
  })().finally(() => { launching = undefined; });
  return launching;
}

/** BB owns this connection, never the Pi process. Closing means detach. */
export class OwnerClient {
  private socket!: Socket; private next = 0; private closing = false;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private writes = Promise.resolve(); private nativePid?: number;
  static async open(threadId: string, event: (e: any) => void, lost: (e: Error) => void) {
    await ensureOwner(); const client = new OwnerClient(event, lost);
    client.socket = createConnection(OWNER_SOCKET); await once(client.socket, 'connect');
    let buffer = ''; client.socket.setEncoding('utf8');
    client.socket.on('data', chunk => {
      buffer += chunk;
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at); buffer = buffer.slice(at + 1);
        try {
          const m = JSON.parse(line);
          if (m.kind === 'event') { client.event(m.event); if (m.checkpoint) client.notify('ack', { checkpoint: m.checkpoint }); }
          else if (m.kind === 'response') {
            const p = client.pending.get(m.id); if (!p) continue;
            clearTimeout(p.timer); client.pending.delete(m.id); m.ok ? p.resolve(m.data) : p.reject(new Error(m.error));
          }
        } catch { client.fail(new Error('Exo view transport/translation failed; native owner left running')); client.socket.destroy(); }
      }
      if (buffer.length > 64 * 1024 * 1024) { client.fail(new Error('Exo view frame exceeds bound')); client.socket.destroy(); }
    });
    client.socket.on('error', e => client.fail(e));
    client.socket.on('close', () => client.fail(new Error('Exo owner connection closed')));
    const hello = await client.send('hello', { threadId }); client.nativePid = hello.piPid;
    if (hello.journalReplay !== 2) { await client.close(); throw new Error('Owner read-side upgrade required after active jobs finish; refusing an incompatible view'); }
    return client;
  }
  constructor(private event: (e: any) => void, private lost: (e: Error) => void) {}
  get pid() { return this.nativePid; }
  private fail(error: Error) {
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); } this.pending.clear();
    if (!this.closing) { this.closing = true; this.lost(error); }
  }
  send(type: string, fields: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    if (this.closing) return Promise.reject(new Error('Exo view is detached'));
    const id = `view-${++this.next}`;
    const response = new Promise((resolve, reject) => { const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Exo ${type} timed out`)); }, timeoutMs); this.pending.set(id, { resolve, reject, timer }); });
    this.write({ id, type, ...fields }); return response;
  }
  private write(value: any) {
    this.writes = this.writes.then(async () => { if (!this.socket.write(JSON.stringify(value) + '\n')) await once(this.socket, 'drain'); });
    void this.writes.catch(e => this.fail(e));
  }
  notify(type: string, fields: Record<string, unknown>) { if (!this.closing) this.write({ type, ...fields }); }
  async close() { this.closing = true; for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('View detached')); } this.pending.clear(); this.socket.end(); }
}

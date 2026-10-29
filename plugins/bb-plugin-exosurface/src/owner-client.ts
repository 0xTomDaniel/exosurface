import { createConnection } from 'node:net';
import { layout, type Config } from './config.ts';
export function ownerConnection(config: Config, event: (e: any) => void) {
  const socket = createConnection(layout(config.stateDir).ownerSocket);
  socket.setEncoding('utf8');
  let n = 0, buffer = '';
  const pending = new Map<number, { resolve: (value: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  const fail = (error: Error) => { for (const p of pending.values()) { clearTimeout(p.timer); p.reject(error); } pending.clear(); };
  socket.on('error', fail); socket.on('close', () => { fail(new Error('Owner disconnected')); event({ type: 'owner_error', message: 'Owner disconnected' }); });
  socket.on('data', chunk => {
    buffer += chunk;
    if (Buffer.byteLength(buffer) > 8 * 1024 * 1024) { socket.destroy(new Error('Owner frame too large')); return; }
    let end: number;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      try { const v = JSON.parse(line); if (v.event) event(v.event); else { const p = pending.get(v.id); if (p) { clearTimeout(p.timer); pending.delete(v.id); v.ok ? p.resolve(v.result) : p.reject(new Error(v.error)); } } }
      catch (e) { socket.destroy(e as Error); }
    }
  });
  return {
    get alive() { return !socket.destroyed; },
    send(threadId: string, method: 'prompt' | 'abort' | 'page.edit' | 'page.press', message?: string | object) { return new Promise<any>((resolve, reject) => {
      if (socket.destroyed) { reject(new Error('Owner disconnected')); return; }
      const id = ++n; const timer = setTimeout(() => { pending.delete(id); reject(new Error('Owner request timed out')); }, 30000);
      const frame = JSON.stringify({ id, threadId, method, ...(method.startsWith('page.') ? { input: message } : { message }) }) + '\n';
      if (Buffer.byteLength(frame) > 900 * 1024) { clearTimeout(timer); reject(new Error('Encoded request exceeds 900KiB. Nothing was sent.')); return; }
      pending.set(id, { resolve, reject, timer }); socket.write(frame);
    }); },
    close() { socket.destroy(); },
  };
}

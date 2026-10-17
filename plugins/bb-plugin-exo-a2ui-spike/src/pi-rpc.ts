import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { once } from 'node:events';

/** Pi 1.1 public JSONL protocol. No private Pi or BB imports. */
export class PiRpc {
  private child: ChildProcessWithoutNullStreams;
  private pending = new Map<string, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  private next = 0;
  private failure?: Error;
  private writes = Promise.resolve();
  private exit: Promise<void>;
  constructor(cli: string, args: string[], cwd: string, env: NodeJS.ProcessEnv,
    private event: (event: any) => void, private lost: (error: Error) => void) {
    this.child = spawn(process.execPath, [cli, '--mode', 'rpc', ...args], { cwd, env, stdio: 'pipe' });
    let buffer = '';
    this.child.stdout.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      buffer += chunk;
      if (buffer.length > 8_000_000) { this.fail(new Error('Pi RPC frame exceeded spike bound')); this.child.kill(); return; }
      let at: number;
      while ((at = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, at).replace(/\r$/, ''); buffer = buffer.slice(at + 1);
        try {
          const message = JSON.parse(line);
          if (message.type === 'response') {
            const request = this.pending.get(message.id);
            if (request) {
              clearTimeout(request.timer); this.pending.delete(message.id);
              message.success ? request.resolve(message.data) : request.reject(new Error(message.error || 'Pi command rejected'));
            }
          } else this.event(message);
        } catch { this.fail(new Error('Invalid Pi RPC record or event translation')); this.child.kill(); return; }
      }
    });
    // Drain diagnostics without retaining or printing provider output/credentials.
    this.child.stderr.on('data', () => {});
    this.child.on('error', e => this.fail(e));
    this.exit = new Promise(resolve => this.child.once('close', (code, signal) => {
      this.fail(new Error(`Pi exited (${code}, ${signal})`)); resolve();
    }));
  }
  get pid() { return this.child.pid; }
  private fail(error: Error) {
    if (this.failure) return;
    this.failure = error;
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(error); }
    this.pending.clear(); this.lost(error);
  }
  async send(type: string, fields: Record<string, unknown> = {}, timeoutMs = 30_000): Promise<any> {
    if (this.failure) throw this.failure;
    const id = `exo-${++this.next}`;
    const response = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Pi ${type} timed out`)); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
    });
    this.writes = this.writes.then(async () => {
      if (!this.child.stdin.write(JSON.stringify({ id, type, ...fields }) + '\n')) await once(this.child.stdin, 'drain');
    });
    void this.writes.catch(error => this.fail(error));
    return response;
  }
  notify(type: string, fields: Record<string, unknown>) {
    if (this.failure) throw this.failure;
    this.writes = this.writes.then(async () => {
      if (!this.child.stdin.write(JSON.stringify({ type, ...fields }) + '\n')) await once(this.child.stdin, 'drain');
    });
    void this.writes.catch(error => this.fail(error));
  }
  async close() {
    if (this.failure) return this.exit;
    this.child.stdin.end();
    const timer = setTimeout(() => this.child.kill('SIGTERM'), 8_000);
    const hard = setTimeout(() => this.child.kill('SIGKILL'), 12_000);
    try { await this.exit; } finally { clearTimeout(timer); clearTimeout(hard); }
  }
}

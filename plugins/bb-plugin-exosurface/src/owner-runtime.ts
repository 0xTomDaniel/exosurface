// Minimal independent Pi owner; adapted PiRpc transport from the original spike, without its state/config paths.
import { createServer, createConnection, type Socket } from 'node:net';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { layout, type Config } from './config.ts';
import { childEnv } from './env.ts';
import { validatePrompt } from './input.ts';
import { PiRpc } from './pi-rpc.ts';
import { fileURLToPath } from 'node:url';
import { editPages, pressPages, markPress, readPages } from './pages.ts';
import { save, loadIf } from './store.ts';

export async function startOwner(config: Config) {
  const l = layout(config.stateDir), binding = loadIf(l.primary);
  if (!binding?.threadId) throw new Error('Complete BB first-run before owner startup');
  // Require a fresh-owner login artifact in the isolated agent home. Existence is NOT proof of valid inference.
  if (!existsSync(join(config.agentDir, 'auth.json'))) throw new Error('Fresh-owner Pi login required in configured agentDir (no inherited credentials)');
  mkdirSync(l.ownerDir, { recursive: true, mode: 0o700 });
  if (existsSync(l.ownerSocket)) throw new Error('Owner socket exists; refusing takeover (verify stopped owner before removing stale socket)');
  readPages(config.stateDir); // Refuse unsupported/corrupt persisted pages before starting Pi.
  const clients = new Set<Socket>(); let busy = false; let reply = ''; let closing = false;
  const state = (error?: string) => save(l.ownerState, { ready: !error, status: error ? 'failed' : 'owner-running', busy, ...(error ? { error } : {}) });
  const sessionFile = join(l.sessions, 'main.jsonl');
  mkdirSync(l.sessions, { recursive: true, mode: 0o700 });
  const pi = new PiRpc(config.piCli, ['--no-extensions', '-e', config.optchat, '-e', fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './page-tools.ts' : './page-tools.js', import.meta.url)), '--optchat-profile', config.profile,
    '--provider', config.models.main.provider, '--model', config.models.main.model, '--thinking', config.models.main.thinking,
    '--session', sessionFile], config.vault,
    childEnv({ OPTCHAT_HOME: l.optchatHome, PI_CODING_AGENT_DIR: config.agentDir, PI_TELEMETRY: '0', EXO_PAGE_STATE: config.stateDir }),
    e => {
      if (e.type === 'message_end' && e.message?.role === 'assistant') {
        reply = (e.message.content || []).filter((p: any) => p.type === 'text').map((p: any) => p.text).join('\n');
        save(join(l.stateDir, 'response-page.json'), { title: 'Exo', body: reply });
      }
      for (const socket of clients) {
        if (socket.writableLength > 1024 * 1024) socket.destroy();
        else socket.write(JSON.stringify({ event: e }) + '\n');
      }
      if (e.type === 'agent_end') { busy = false; state(); }
    }, error => { if (!closing) { state(error.message); for (const socket of clients) socket.write(JSON.stringify({ event: { type: 'owner_error', message: 'Pi owner stopped' } }) + '\n'); } });
  const server = createServer(socket => {
    socket.setEncoding('utf8');
    clients.add(socket); socket.on('close', () => clients.delete(socket)); socket.on('error', () => socket.destroy());
    let buffer = '';
    socket.on('data', chunk => {
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 1024 * 1024) { socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        void (async () => {
          let request: any; let admitted = false, keepBusy = false;
          try {
            request = JSON.parse(line);
            if (request.threadId !== binding.threadId) throw new Error('Not the primary Exo thread');
            if (request.method === 'page.edit' || request.method === 'page.press') {
              if (busy) throw new Error('Owner is busy; page mutation not admitted');
              const result = request.method === 'page.edit' ? editPages(config.stateDir, request.input) : pressPages(config.stateDir, request.input);
              if (request.method === 'page.press' && !result.duplicate) {
                busy = true; admitted = true; reply = ''; state();
                try { await pi.send('prompt', { message: result.message }); markPress(config.stateDir, request.input.mutationId, 'sent'); }
                catch (e) { keepBusy = true; markPress(config.stateDir, request.input.mutationId, 'unknown'); state('Page press command outcome unknown; do not retry'); throw e; }
              }
              socket.write(JSON.stringify({ id: request.id, ok: true, result: { revision: result.revision, duplicate: result.duplicate } }) + '\n');
              return;
            }
            if (request.method !== 'prompt' && request.method !== 'abort') throw new Error('Unsupported owner method');
            if (request.method === 'prompt') {
              if (typeof request.message !== 'string') throw new Error('Prompt must be text. Nothing was sent.');
              validatePrompt(request.message);
              if (busy) throw new Error('Owner is busy; retry after current turn');
              busy = true; admitted = true; reply = ''; state();
            }
            await pi.send(request.method, request.method === 'prompt' ? { message: request.message } : {});
            socket.write(JSON.stringify({ id: request.id, ok: true }) + '\n');
          } catch (e) { if (admitted && !keepBusy) { busy = false; state(); } socket.write(JSON.stringify({ id: request?.id, ok: false, error: e instanceof Error ? e.message : String(e) }) + '\n'); }
        })();
      }
    });
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(l.ownerSocket, resolve); });
    chmodSync(l.ownerSocket, 0o600);
    // Pi RPC readiness alone does not prove OptChat profile ownership or provider connectivity.
    await pi.send('get_state');
    const lockOwner = await new Promise<string>((resolve, reject) => {
      const lock = createConnection(join(l.optchatHome, 'profiles', config.profile, 'lock.sock')); let text = '';
      lock.setTimeout(2000, () => lock.destroy(new Error('OptChat profile ownership timeout')));
      lock.on('data', chunk => { text += chunk; }); lock.on('end', () => resolve(text)); lock.on('error', reject);
    });
    if (!lockOwner.startsWith(`${config.profile} · PID ${pi.pid} ·`)) throw new Error('Pi did not acquire configured OptChat profile');
    state();
  } catch (e) { server.close(); await pi.close(); throw e; }
  return { async close() { closing = true; for (const c of clients) c.destroy(); await new Promise<void>(r => server.close(() => r())); await pi.close(); state('stopped'); } };
}

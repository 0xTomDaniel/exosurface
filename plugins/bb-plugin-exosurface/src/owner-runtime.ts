// Minimal independent Pi owner; adapted PiRpc transport from the original spike, without its state/config paths.
import { createServer, createConnection, type Socket } from 'node:net';
import { mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { layout, type Config } from './config.ts';
import { childEnv } from './env.ts';
import { validatePrompt } from './input.ts';
import { PiRpc, type PiEvent } from './pi-rpc.ts';
import { fileURLToPath } from 'node:url';
import { editPages, pressPages, markPress, readPages, type InputValue, type PageEdit, type PagePress } from './pages.ts';
import { save, loadIf, isRecord } from './store.ts';

// Owner socket and Pi event records are untyped JSON: narrowed here, at the boundary. pages.ts still validates content.
const isInputValue = (v: unknown): v is InputValue => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
  || (Array.isArray(v) && v.every(x => typeof x === 'string'));
const isMutation = (v: unknown): v is Readonly<Record<string, unknown>> & Omit<PageEdit, 'value'> => isRecord(v)
  && typeof v['baseRevision'] === 'number' && typeof v['mutationId'] === 'string' && typeof v['surfaceId'] === 'string' && typeof v['ref'] === 'string';
const isPageEdit = (v: unknown): v is PageEdit => isMutation(v) && isInputValue(v['value']);
const isPagePress = (v: unknown): v is PagePress => isMutation(v) && isRecord(v['values']) && Object.values(v['values']).every(isInputValue);
function pageInput<T>(v: unknown, is: (v: unknown) => v is T): T {
  if (!is(v)) throw new Error('Invalid page mutation envelope');
  return v;
}
/** The text of an assistant message_end event, else undefined. Corrupt assistant content throws (a refused record). */
function assistantText(e: PiEvent): string | undefined {
  const message = e['message'];
  if (e['type'] !== 'message_end' || !isRecord(message) || message['role'] !== 'assistant') return undefined;
  const content = message['content'];
  if (!content) return '';
  if (!Array.isArray(content)) throw new Error('Assistant content is not a list');
  const parts: readonly unknown[] = content, texts: string[] = [];
  for (const p of parts) {
    if (!isRecord(p)) throw new Error('Assistant content part is not an object');
    const text = p['text'];
    if (p['type'] !== 'text') continue;
    if (typeof text !== 'string') throw new Error('Assistant text part has no text');
    texts.push(text);
  }
  return texts.join('\n');
}

export async function startOwner(config: Config) {
  const l = layout(config.stateDir), binding: unknown = loadIf(l.primary);
  const primaryThread = isRecord(binding) ? binding['threadId'] : undefined;
  if (!primaryThread) throw new Error('Complete BB first-run before owner startup');
  // Require a fresh-owner login artifact in the isolated agent home. Existence is NOT proof of valid inference.
  if (!existsSync(join(config.agentDir, 'auth.json'))) throw new Error('Fresh-owner Pi login required in configured agentDir (no inherited credentials)');
  mkdirSync(l.ownerDir, { recursive: true, mode: 0o700 });
  if (existsSync(l.ownerSocket)) throw new Error('Owner socket exists; refusing takeover (verify stopped owner before removing stale socket)');
  readPages(config.stateDir); // Refuse unsupported/corrupt persisted pages before starting Pi.
  const clients = new Set<Socket>(); let busy = false; let reply = ''; let closing = false;
  const state = (error?: string) => { save(l.ownerState, { ready: !error, status: error ? 'failed' : 'owner-running', busy, ...(error ? { error } : {}) }); };
  const sessionFile = join(l.sessions, 'main.jsonl');
  mkdirSync(l.sessions, { recursive: true, mode: 0o700 });
  const pi = new PiRpc(config.piCli, ['--no-extensions', '-e', config.optchat, '-e', fileURLToPath(new URL(import.meta.url.endsWith('.ts') ? './page-tools.ts' : './page-tools.js', import.meta.url)), '--optchat-profile', config.profile,
    '--provider', config.models.main.provider, '--model', config.models.main.model, '--thinking', config.models.main.thinking,
    '--session', sessionFile], config.vault,
    childEnv({ OPTCHAT_HOME: l.optchatHome, PI_CODING_AGENT_DIR: config.agentDir, PI_TELEMETRY: '0', EXO_PAGE_STATE: config.stateDir }),
    e => {
      const text = assistantText(e);
      if (text !== undefined) {
        reply = text;
        save(join(l.stateDir, 'response-page.json'), { title: 'Exo', body: reply });
      }
      for (const socket of clients) {
        if (socket.writableLength > 1024 * 1024) socket.destroy();
        else socket.write(JSON.stringify({ event: e }) + '\n');
      }
      if (e['type'] === 'agent_end') { busy = false; state(); }
    }, error => { if (!closing) { state(error.message); for (const socket of clients) socket.write(JSON.stringify({ event: { type: 'owner_error', message: 'Pi owner stopped' } }) + '\n'); } });
  const server = createServer(socket => {
    socket.setEncoding('utf8');
    clients.add(socket); socket.on('close', () => clients.delete(socket)); socket.on('error', () => socket.destroy());
    let buffer = '';
    socket.on('data', chunk => {
      buffer += String(chunk);
      if (Buffer.byteLength(buffer) > 1024 * 1024) { socket.destroy(); return; }
      let end: number;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
        void (async () => {
          let id: unknown; let admitted = false, keepBusy = false;
          try {
            const request: unknown = JSON.parse(line);
            if (!isRecord(request)) throw new Error('Not the primary Exo thread');
            id = request['id'];
            const method = request['method'], input = request['input'];
            if (request['threadId'] !== primaryThread) throw new Error('Not the primary Exo thread');
            if (method === 'page.edit' || method === 'page.press') {
              if (busy) throw new Error('Owner is busy; page mutation not admitted');
              const result = method === 'page.edit' ? editPages(config.stateDir, pageInput(input, isPageEdit)) : pressPages(config.stateDir, pageInput(input, isPagePress));
              if (method === 'page.press' && !result.duplicate) {
                const { mutationId } = pageInput(input, isPagePress);
                busy = true; admitted = true; reply = ''; state();
                try { await pi.send('prompt', { message: result.message }); markPress(config.stateDir, mutationId, 'sent'); }
                catch (e) { keepBusy = true; markPress(config.stateDir, mutationId, 'unknown'); state('Page press command outcome unknown; do not retry'); throw e; }
              }
              socket.write(JSON.stringify({ id, ok: true, result: { revision: result.revision, duplicate: result.duplicate } }) + '\n');
              return;
            }
            if (method !== 'prompt' && method !== 'abort') throw new Error('Unsupported owner method');
            let fields = {};
            if (method === 'prompt') {
              const message = request['message'];
              if (typeof message !== 'string') throw new Error('Prompt must be text. Nothing was sent.');
              validatePrompt(message);
              if (busy) throw new Error('Owner is busy; retry after current turn');
              busy = true; admitted = true; reply = ''; state();
              fields = { message };
            }
            await pi.send(method, fields);
            socket.write(JSON.stringify({ id, ok: true }) + '\n');
          } catch (e) { if (admitted && !keepBusy) { busy = false; state(); } socket.write(JSON.stringify({ id, ok: false, error: e instanceof Error ? e.message : String(e) }) + '\n'); }
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
      lock.on('data', chunk => { text += String(chunk); }); lock.on('end', () => { resolve(text); }); lock.on('error', reject);
    });
    if (!lockOwner.startsWith(`${config.profile} · PID ${String(pi.pid)} ·`)) throw new Error('Pi did not acquire configured OptChat profile');
    state();
  } catch (e) { server.close(); await pi.close(); throw e; }
  return { async close() { closing = true; for (const c of clients) c.destroy(); await new Promise<void>(r => server.close(() => { r(); })); await pi.close(); state('stopped'); } };
}

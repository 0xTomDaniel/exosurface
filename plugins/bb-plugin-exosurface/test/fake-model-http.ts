// A fake model at the network boundary, for Pi calls that load no extension (the surface namer): an HTTP server speaking
// the two wire formats Pi's built-in `openai` (Responses API) and `anthropic` (Messages API) providers use. A Pi agent
// folder's models.json points those providers' baseUrl here (agentDir()). Every request is recorded; the answer is the
// test's `reply` (a string), or the HTTP status of `fail`. While `hold` is set, a request is recorded but answered only
// on release(), so a test acts while the call is in flight without a timed wait.
import { createServer, type Server } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export type ModelRequest = { path: string; body: any };
export async function fakeModelHttp() {
  const requests: ModelRequest[] = [];
  const state: { reply: string; fail?: number; hold?: boolean } = { reply: 'Fake name' };
  const held: (() => void)[] = [];
  const server: Server = createServer((req, res) => {
    let raw = '';
    req.on('data', c => { raw += c; });
    req.on('end', () => {
      const body = raw ? JSON.parse(raw) : null;
      requests.push({ path: req.url ?? '', body });
      const answer = () => {
      if (state.fail) { res.writeHead(state.fail, { 'content-type': 'application/json' }); res.end(JSON.stringify({ error: { message: 'fake model refused' } })); return; }
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const text = state.reply;
      const sse = (event: string, data: object) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
      if ((req.url ?? '').includes('/messages')) {
        sse('message_start', { message: { id: 'msg_fake', type: 'message', role: 'assistant', model: body.model, content: [], stop_reason: null, usage: { input_tokens: 10, output_tokens: 0 } } });
        sse('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
        sse('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
        sse('content_block_stop', { index: 0 });
        sse('message_delta', { delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 3 } });
        sse('message_stop', {});
      } else {
        const item = { id: 'msg_fake', type: 'message', role: 'assistant', status: 'completed', content: [{ type: 'output_text', text, annotations: [] }] };
        sse('response.created', { response: { id: 'resp_fake', status: 'in_progress', model: body.model, output: [] } });
        sse('response.output_item.added', { output_index: 0, item: { ...item, status: 'in_progress', content: [] } });
        sse('response.content_part.added', { output_index: 0, item_id: 'msg_fake', content_index: 0, part: { type: 'output_text', text: '', annotations: [] } });
        sse('response.output_text.delta', { output_index: 0, item_id: 'msg_fake', content_index: 0, delta: text });
        sse('response.output_text.done', { output_index: 0, item_id: 'msg_fake', content_index: 0, text });
        sse('response.content_part.done', { output_index: 0, item_id: 'msg_fake', content_index: 0, part: item.content[0] });
        sse('response.output_item.done', { output_index: 0, item });
        sse('response.completed', { response: { id: 'resp_fake', status: 'completed', model: body.model, output: [item], usage: { input_tokens: 10, output_tokens: 3, total_tokens: 13, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
      }
      res.end();
      };
      if (state.hold) held.push(answer); else answer();
    });
  });
  await new Promise<void>(ok => server.listen(0, '127.0.0.1', ok));
  server.unref(); // never what keeps a test process alive
  const port = (server.address() as { port: number }).port;
  return {
    requests, state,
    /** Answers every held request with the current `reply` or `fail`, and stops holding. */
    release() { state.hold = false; for (const answer of held.splice(0)) answer(); },
    /** Writes models.json in a Pi agent folder so Pi's built-in openai and anthropic providers reach this server. */
    agentDir(dir: string) {
      mkdirSync(dir, { recursive: true });
      // The key by command, as an installed agent folder references its credentials (Pi runs `!` values in a shell).
      const at = { apiKey: '!printf fixture-not-a-secret' };
      writeFileSync(join(dir, 'models.json'), JSON.stringify({ providers: { openai: { baseUrl: `http://127.0.0.1:${port}/v1`, ...at }, anthropic: { baseUrl: `http://127.0.0.1:${port}`, ...at } } }));
    },
    close: () => new Promise<void>(ok => { server.closeAllConnections(); server.close(() => ok()); }),
  };
}

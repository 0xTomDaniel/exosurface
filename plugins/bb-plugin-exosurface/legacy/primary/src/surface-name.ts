// Surface auto-name (#82; spec pages-and-activity N7, N5): a new surface is "New surface" until its first turn ends; then a
// small, fast model names it once from the person's first message and Exo's reply when it has arrived. The naming model is
// "namer" in the Exosurface local config (EXO_CONFIG exosurface.json, local-config.ts), with compactor's {provider, model,
// thinking} shape and validation; absent, it is openai/gpt-6-luna with thinking off. It lives there, not in the OptChat
// profile config, because OptChat's own config writers keep only the keys OptChat knows and would drop it (director ruling,
// #82 review). The file is read at each naming, so a change applies to the next surface named. It is called through Pi (the
// same CLI and JSONL RPC client the runtime uses, pi-rpc.ts) with no tools, extensions, context files or session, and must
// run on exactly that model and thinking: anything else is a failure, never a substitute.
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { modelChoice, type ModelChoice } from '../../../src/config.ts';
import { childEnv } from '../../../src/env.ts';
import { PiRpc } from './pi-rpc.ts';

export const NEW_SURFACE = 'New surface';
export const DEFAULT_NAMER: ModelChoice = { provider: 'openai', model: 'gpt-6-luna', thinking: 'off' };
/** The durable record on the BB thread (plugin metadata key): one per surface. Any record, Exo's or the person's rename
 * (#83), means Exo never names that surface again. */
export const NAME_RECORD = 'surfaceName';
export type NameRecord = { by: 'exo'; state: 'named'; name: string; model: string; thinking: string; at: string; usage?: { input: number; output: number } }
  | { by: 'exo'; state: 'failed'; reason: string; model?: string; thinking?: string; at: string }
  | { by: 'person'; state: 'named'; name: string; at: string };

/** The longest name the person may give a surface. */
export const MAX_NAME = 80;
/** The person's name for a surface: trimmed, inner whitespace one space; empty or longer than MAX_NAME throws. */
export function personName(name: string) {
  const clean = name.trim().replace(/\s+/g, ' ');
  if (!clean) throw new Error('A surface name cannot be empty');
  if (clean.length > MAX_NAME) throw new Error(`A surface name is at most ${MAX_NAME} characters`);
  return clean;
}

/** The naming model from the Exosurface local config file: its "namer", or the default when absent. An invalid one throws. */
export function namerChoice(configFile: string): { choice: ModelChoice; from: 'config' | 'default' } {
  const config = existsSync(configFile) ? JSON.parse(readFileSync(configFile, 'utf8')) : {};
  if (config.namer === undefined) return { choice: DEFAULT_NAMER, from: 'default' };
  if (!modelChoice(config.namer)) throw new Error(`Invalid "namer" in ${configFile}: needs {"provider","model","thinking"} like "compactor"`);
  const { provider, model, thinking } = config.namer;
  return { choice: { provider, model, thinking }, from: 'config' };
}

const said = (message: any) => typeof message?.content === 'string' ? message.content
  : (Array.isArray(message?.content) ? message.content : []).filter((p: any) => p?.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('');

/** The first turn in a Pi session journal: the person's first message and Exo's words after it. Reads forward, stops at the next. */
export async function firstTurn(sessionFile: string | undefined): Promise<{ message: string; reply: string } | undefined> {
  if (!sessionFile || !existsSync(sessionFile)) return undefined;
  const lines = createInterface({ input: createReadStream(sessionFile, 'utf8'), crlfDelay: Infinity });
  let message: string | undefined; const reply: string[] = [];
  try {
    for await (const line of lines) {
      let entry: any; try { entry = JSON.parse(line); } catch { continue; } // a line still being written
      if (entry?.type !== 'message') continue;
      if (entry.message?.role === 'user') { if (message !== undefined) break; message = said(entry.message); }
      else if (entry.message?.role === 'assistant' && message !== undefined) reply.push(said(entry.message));
    }
  } finally { lines.close(); }
  return message?.trim() ? { message, reply: reply.filter(Boolean).join('\n\n') } : undefined;
}

const SYSTEM = 'You name a conversation for a sidebar. Answer with only the name: 2 to 5 words, no quotes, no trailing punctuation.';
const cut = (text: string, max: number) => text.length > max ? `${text.slice(0, max)}…` : text;
export const namePrompt = (message: string, reply: string) =>
  `The person's first message:\n${cut(message.trim(), 1500)}\n${reply.trim() ? `\nThe reply:\n${cut(reply.trim(), 1500)}\n` : ''}\nName this conversation in 2 to 5 words.`;

/** The model's answer as a sidebar name: its first line, unquoted, at most 5 words and 60 characters. Empty throws. */
export function cleanName(answer: string) {
  const line = answer.trim().split('\n')[0].trim().replace(/^["'“‘`*#\s]+|["'”’`*.!?\s]+$/g, '').replace(/\s+/g, ' ');
  const name = line.split(' ').slice(0, 5).join(' ').slice(0, 60).trim();
  if (!name) throw new Error('The naming model gave no name');
  return name;
}

/** One namer call through Pi's RPC mode. Rejects unless Pi runs the configured model and thinking, or on any model error. */
export async function callNamer(choice: ModelChoice, prompt: string, at: { piCli: string; agentDir: string; cwd: string }, timeoutMs = 60_000) {
  const args = ['--no-session', '--no-tools', '--no-extensions', '--no-skills', '--no-prompt-templates', '--no-context-files', '--no-mcp', '--no-themes', '--no-approve',
    '--system-prompt', SYSTEM, '--provider', choice.provider, '--model', choice.model, '--thinking', choice.thinking];
  let finish: (v: { text: string; usage?: { input: number; output: number } } | Error) => void = () => {};
  const done = new Promise<{ text: string; usage?: { input: number; output: number } } | Error>(r => { finish = r; });
  let last: any;
  const rpc = new PiRpc(at.piCli, args, at.cwd, childEnv({ PI_CODING_AGENT_DIR: at.agentDir, PI_TELEMETRY: '0' }), e => {
    if (e.type === 'message_end' && e.message?.role === 'assistant') last = e.message;
    if (e.type === 'agent_end') {
      if (!last) finish(new Error('The naming model gave no answer'));
      else if (last.stopReason === 'error' || last.stopReason === 'aborted') finish(new Error(`The naming model failed: ${String(last.errorMessage ?? last.stopReason).slice(0, 300)}`));
      else finish({ text: said(last), usage: last.usage ? { input: last.usage.input ?? 0, output: last.usage.output ?? 0 } : undefined });
    }
  }, error => finish(error));
  const timer = setTimeout(() => finish(new Error('The naming model timed out')), timeoutMs);
  try {
    const state = await rpc.send('get_state');
    if (state.model?.provider !== choice.provider || state.model?.id !== choice.model || state.thinkingLevel !== choice.thinking)
      throw new Error(`Pi would run ${state.model?.provider}/${state.model?.id} thinking ${state.thinkingLevel}, not the configured ${choice.provider}/${choice.model} thinking ${choice.thinking}`);
    await rpc.send('prompt', { message: prompt });
    const answer = await done;
    if (answer instanceof Error) throw answer;
    return { name: cleanName(answer.text), usage: answer.usage };
  } finally { clearTimeout(timer); await rpc.close(); }
}

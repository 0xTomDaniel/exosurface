// The one line of what Exo is doing right now (spec pages-and-activity E9), from the Pi events the owner sees: the headline of
// the model's streamed reasoning summary, else the step (tool call) it takes, in plain words. Never raw arguments or JSON.
import { basename, extname } from 'node:path';

const MAX = 80;
const clip = (s: string) => { const t = s.replace(/\s+/g, ' ').trim(); return t.length > MAX ? t.slice(0, MAX - 1).trimEnd() + '…' : t; };

/** A reasoning summary's headline: its latest bold **Title**, else its first sentence (all of it once the block has ended). */
export function headline(thinking: string, ended: boolean): string | undefined {
  if (thinking.trim() === '[Reasoning redacted]') return undefined;
  const titles = [...thinking.matchAll(/\*\*([^*\n]+)\*\*/g)];
  const title = titles.at(-1)?.[1];
  if (title !== undefined) return clip(title);
  const sentence = /^\s*([^\n]*?[.!?])(\s|$)/.exec(thinking);
  if (sentence?.[1] !== undefined && (sentence[2] || ended)) return clip(sentence[1]);
  const first = thinking.split('\n').find(l => l.trim());
  return ended && first !== undefined ? clip(first) : undefined;
}

const str = (v: unknown) => typeof v === 'string' && v.trim() ? v.trim() : undefined;
/** A file named for a person: a note by its name ("the garden note"), any other file by its file name. A name that already
 *  ends in the noun ("notes", "meeting note") is not given it twice ("the notes", not "the notes note"). */
const file = (path: string) => {
  const name = basename(path), title = name.slice(0, -extname(name).length);
  if (extname(name).toLowerCase() !== '.md') return name;
  return /(^|[^a-z])notes?$/i.test(title) ? `the ${title}` : `the ${title} note`;
};

/** A tool step in plain words, such as "Reading the garden note" or "Searching the web for garden layouts". */
export function step(toolName: string, args: unknown): string {
  const a = (args && typeof args === 'object' ? args : {}) as Record<string, unknown>;
  const path = str(a['path']) ?? str(a['file_path']), query = str(a['query']) ?? str(a['pattern']);
  const name = toolName.toLowerCase();
  if (name === 'read') return clip(path ? `Reading ${file(path)}` : 'Reading a file');
  if (name === 'write') return clip(path ? `Writing ${file(path)}` : 'Writing a file');
  if (name === 'edit') return clip(path ? `Editing ${file(path)}` : 'Editing a file');
  if (name === 'ls') return 'Looking through a folder';
  if (name === 'grep' || name === 'find') return clip(query ? `Searching files for ${query}` : 'Searching files');
  if (name === 'bash') return 'Running a command';
  if (/web_?search|search_web/.test(name)) return clip(query ? `Searching the web for ${query}` : 'Searching the web');
  if (/web_?fetch|fetch/.test(name)) return 'Reading a web page';
  if (name === 'update_exosurface') return 'Drawing the page';
  if (name === 'spawn') return 'Starting a helper';
  return clip(`Using ${toolName.replace(/[_-]+/g, ' ').trim() || 'a tool'}`);
}

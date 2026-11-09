// A surface's last activity (spec pages-and-activity N9 owns what counts), from what BB and Pi record: when it was made is
// BB's thread createdAt; the rest is the thread's own Pi session journal, by entry timestamp: a user message, the pages
// extension's press entry, an assistant message that closes a turn (not a tool step). A child surface is its own thread
// with its own journal.
import { closeSync, existsSync, openSync, readSync, statSync } from 'node:fs';
import { PRESS_ENTRY } from '../../surface/src/press-line.ts';

const activity = (entry: any) =>
  entry?.type === 'message' ? entry.message?.role === 'user' || (entry.message?.role === 'assistant' && entry.message.stopReason !== 'toolUse')
    : entry?.type === 'custom' && entry.customType === PRESS_ENTRY;

/** Milliseconds: `made`, or the journal's latest activity entry when later. Reads backwards from the journal's end. */
export function lastActivity(made: number, sessionFile: string | undefined): number {
  if (!sessionFile || !existsSync(sessionFile)) return made;
  const fd = openSync(sessionFile, 'r');
  try {
    // Pi appends whole lines; a last line without its newline is a write in progress and is skipped.
    let at = statSync(sessionFile).size, carry = Buffer.alloc(0), tail = true;
    while (at > 0) {
      const size = Math.min(65536, at), chunk = Buffer.alloc(size);
      readSync(fd, chunk, 0, size, at - size); at -= size;
      // Split on newline bytes, so a character cut at a chunk's edge is whole again once its line is.
      const lines: Buffer[] = [];
      let buffer = Buffer.concat([chunk, carry]), newline: number;
      while ((newline = buffer.indexOf(0x0a)) >= 0) { lines.push(buffer.subarray(0, newline)); buffer = buffer.subarray(newline + 1); }
      if (!tail) lines.push(buffer); else if (lines.length) tail = false; // the unterminated last line is skipped
      // Until the file's start, the first line may begin in the previous chunk.
      carry = at > 0 ? Buffer.from(lines.shift() ?? Buffer.alloc(0)) : Buffer.alloc(0);
      for (const line of lines.reverse()) {
        if (!line.length) continue;
        let entry: any;
        try { entry = JSON.parse(line.toString('utf8')); } catch { continue; }
        if (!activity(entry)) continue;
        const when = Date.parse(entry.timestamp);
        return Number.isFinite(when) ? Math.max(made, when) : made;
      }
    }
    return made;
  } finally { closeSync(fd); }
}

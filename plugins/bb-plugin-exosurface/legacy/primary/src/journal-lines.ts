// A Pi session journal read from its end (the Exo block's latest turn, exo-turn.ts; a surface's last activity,
// last-activity.ts): one JSON line per entry, newest first, without reading the whole file.
import { closeSync, openSync, readSync, statSync } from 'node:fs';

/** The journal's lines, last first, each whole (not parsed). Pi appends whole lines; a last line without its newline is a
 *  write in progress and is skipped. Empty lines are skipped. Stopping early closes the file. */
export function* linesBackward(file: string): Generator<string> {
  const fd = openSync(file, 'r');
  try {
    let at = statSync(file).size, carry = Buffer.alloc(0), tail = true;
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
      for (const line of lines.reverse()) if (line.length) yield line.toString('utf8');
    }
  } finally { closeSync(fd); }
}

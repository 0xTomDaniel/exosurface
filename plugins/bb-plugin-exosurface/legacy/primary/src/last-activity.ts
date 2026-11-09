// A surface's last activity (spec pages-and-activity N9 owns what counts), from what BB and Pi record: when it was made is
// BB's thread createdAt; the rest is the thread's own Pi session journal, by entry timestamp: a user message, the pages
// extension's press entry, an assistant message that closes a turn (not a tool step). A child surface is its own thread
// with its own journal.
import { existsSync } from 'node:fs';
import { PRESS_ENTRY } from '../../surface/src/press-line.ts';
import { linesBackward } from './journal-lines.ts';

const activity = (entry: any) =>
  entry?.type === 'message' ? entry.message?.role === 'user' || (entry.message?.role === 'assistant' && entry.message.stopReason !== 'toolUse')
    : entry?.type === 'custom' && entry.customType === PRESS_ENTRY;

/** Milliseconds: `made`, or the journal's latest activity entry when later. Reads backwards from the journal's end. */
export function lastActivity(made: number, sessionFile: string | undefined): number {
  if (!sessionFile || !existsSync(sessionFile)) return made;
  for (const line of linesBackward(sessionFile)) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (!activity(entry)) continue;
    const when = Date.parse(entry.timestamp);
    return Number.isFinite(when) ? Math.max(made, when) : made;
  }
  return made;
}

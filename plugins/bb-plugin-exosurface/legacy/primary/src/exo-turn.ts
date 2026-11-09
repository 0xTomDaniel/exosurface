// What a surface's Exo block shows (spec pages-and-activity E1-E4, E8), for any Exo thread: the person's latest message and
// Exo's words from that turn,
// read from the thread's own Pi session (the authoritative journal the owner projects to BB), and whether Exo is working.
// Earlier turns stay in that journal and in BB's thread; nothing here keeps or shows them.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { HOME, binding, load } from './state.ts';
import { PRESS_ENTRY } from '../../surface/src/press-line.ts';
import { linesBackward } from './journal-lines.ts';

/** ended: Exo's latest message after the person's closes a reply (not a tool step), as the journal holds it. */
export type LatestTurn = { userEntry: string | null; said: string; words: string; ended: boolean };
const text = (message: any) => (Array.isArray(message?.content) ? message.content : []).filter((p: any) => p?.type === 'text' && typeof p.text === 'string').map((p: any) => p.text).join('');

/** The pages a page change names: those it drew or edited (its cards), and the page on stage after it: the stage the
 *  change recorded as applied (withdrawal fallback included; null, no page), else, in a journal written before it recorded
 *  that, layout focus or the last page it created or redesigned (undefined when it moved nothing). A bring-back puts its
 *  page on stage and draws no page of the turn's. */
const changed = (entry: any) => {
  if (entry.type === 'custom' && entry.customType === 'exosurface-composition-commit' && entry.data?.source === 'canvas-restore')
    return { pages: undefined, focus: entry.data.delta?.layout?.focus as string | undefined };
  const message = entry.message, details = message?.role === 'toolResult' && message.toolName === 'update_exosurface' && !message.isError ? message.details : undefined;
  const ids = (details?.delta?.messages ?? []).map((m: any) => m?.createSurface?.surfaceId ?? m?.updateComponents?.surfaceId).filter(Boolean);
  return details?.delta ? { pages: (details.cards ?? []).map((c: any) => c.surface) as string[], focus: (details.stage !== undefined ? details.stage : details.delta.layout?.focus ?? ids.at(-1)) as string | null | undefined } : undefined;
};

/** The latest turn in a Pi session journal: the last person's message entry, its text, and Exo's words after it. Reads backwards.
 *  With `page`, the latest turn on that page (spec E1, E8, E10): one that drew or edited it, or that changed no page and was
 *  sent or pressed from it (the press entry journaled before its message names the page), or, in a journal without that
 *  page, that changed no page while it was on stage; none when no turn is on it. A button press shows as the button's
 *  label (spec pages-and-activity F6): the press entry's label. */
export function latestTurn(sessionFile: string | undefined, page?: string): LatestTurn {
  if (!sessionFile || !existsSync(sessionFile)) return { userEntry: null, said: '', words: '', ended: false };
  let said: string[] = [], pages: string[] | undefined, focus: string | null | undefined, quiet: LatestTurn | undefined;
  // found: the turn to show, held until the entry before its message says whether it was a press, and while a later turn
  // read by the stage (quiet) may still be on the page; last: the turn just read; undecided: last changed no page, and the
  // entry before its message may name the page it came from.
  let found: LatestTurn | undefined, last: LatestTurn | undefined, undecided = false;
  let replied: boolean | undefined;
  const byStage = () => { if (undecided) { quiet ??= last; undecided = false; } };
  for (const line of linesBackward(sessionFile)) {
    const entry = JSON.parse(line);
    if (last && entry.type === 'custom' && entry.customType === PRESS_ENTRY) {
      if (entry.data?.line === last.said) {
        if (typeof entry.data.label === 'string') last.said = entry.data.label;
        if (undecided && typeof entry.data.page === 'string') { undecided = false; if (entry.data.page === page) found = last; }
      }
      byStage(); last = undefined;
      if (found && !quiet) return found;
      continue;
    }
    const change = changed(entry);
    if (change) { byStage(); if (focus === undefined) focus = change.focus; if (change.pages) pages = [...(pages ?? []), ...change.pages]; }
    // System prompt updates can sit between a send's origin and its user message; they are not a turn boundary.
    if (entry.type !== 'message' || entry.message?.role === 'system') continue;
    if (found && !quiet) return found;
    byStage(); last = undefined;
    if (entry.message?.role === 'user') {
      const turn = { userEntry: String(entry.id), said: typeof entry.message.content === 'string' ? entry.message.content : text(entry.message), words: said.reverse().filter(Boolean).join('\n\n'), ended: replied ?? false };
      last = turn;
      if (page === undefined) { found = turn; continue; }
      // A turn that changed no page and whose message has no page it came from beside it is on the page on stage when
      // it ran: the next earlier change says which.
      if (quiet && focus !== undefined) { if (focus === page) return quiet; quiet = undefined; if (found) return found; }
      if (!found && pages?.includes(page)) found = turn;
      else if (!found && !pages) undecided = true;
      said = []; pages = undefined; focus = undefined; replied = undefined;
      continue;
    }
    if (entry.message?.role === 'assistant') { said.push(text(entry.message)); replied ??= entry.message.stopReason !== 'toolUse'; }
  }
  if (found) return found;
  if (page !== undefined) return { userEntry: null, said: '', words: '', ended: false };
  return { userEntry: null, said: '', words: said.reverse().filter(Boolean).join('\n\n'), ended: replied ?? false };
}

/** Whether the owner reports a turn running on this thread (the primary's lane, or a bound thread's own). */
export function ownerWorking(threadId: string) {
  const file = join(HOME, 'owner', 'state.json');
  if (!existsSync(file)) return false;
  const state = load(file);
  return state.threadId === threadId ? !!state.streaming : !!state.threads?.[threadId]?.streaming;
}

/** The owner's one line of what Exo is doing right now on this thread (spec pages-and-activity E9), if any. */
export function ownerActivity(threadId: string): string | undefined {
  const file = join(HOME, 'owner', 'state.json');
  if (!existsSync(file)) return undefined;
  const state = load(file), activity = state.threadId === threadId ? state.activity : state.threads?.[threadId]?.activity;
  return typeof activity === 'string' && activity ? activity : undefined;
}

/** The thread's own Pi session journal, as its binding names it (the host records it once the thread's Pi starts). */
export const sessionOf = (threadId: string): string | undefined => binding(threadId)?.sessionFile;

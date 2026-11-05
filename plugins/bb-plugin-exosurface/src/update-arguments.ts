// update_exosurface argument format (#108), checked at the top of execute on both registrations. Pi validates a call
// against the tool's schema before execute and answers a failure with its raw schema text and every argument echoed back;
// an error thrown in execute reaches Exo as its message only. So the schema keeps the types and these checks live here.
import type { Edit } from './snapshot-format.ts';
const EDIT_OPS: readonly Edit['op'][] = ['replace', 'insertAfter', 'insertInto', 'remove'];
export const OP_WORDS = 'replace, insertAfter, insertInto or remove';
const REVISION_WORDS = "a whole number 0 or more, the surface's current revision (0 if the surface is empty; read_exosurface shows it)";
const shown = (value: unknown) => { const s = JSON.stringify(value) ?? String(value); return s.length > 40 ? s.slice(0, 39) + '…' : s; };

/**
 * Throws the call's format problems as one plain sentence each (at most three): which argument, or which edit by position,
 * ref and page, and what it accepts. `page` is the name of an edit's page argument on this registration.
 */
export function checkUpdateArguments(args: { baseRevision?: unknown; edits?: unknown }, page: 'page' | 'surface'): asserts args is { baseRevision: number } {
  const problems: string[] = [], revision = args.baseRevision;
  if (revision === undefined) problems.push(`baseRevision is missing; baseRevision accepts ${REVISION_WORDS}.`);
  else if (typeof revision !== 'number' || !Number.isSafeInteger(revision) || revision < 0) problems.push(`baseRevision ${shown(revision)} is not a revision; baseRevision accepts ${REVISION_WORDS}.`);
  (Array.isArray(args.edits) ? args.edits : []).forEach((edit: Record<string, unknown>, i) => {
    const at = [edit.ref !== undefined && `ref ${shown(edit.ref).replace(/^"(.*)"$/, '$1')}`, edit[page] !== undefined && `on page ${shown(edit[page]).replace(/^"(.*)"$/, '$1')}`].filter(Boolean).join(' ');
    const name = `edit ${i + 1}${at ? ` (${at})` : ''}`;
    if (edit[page] === undefined) problems.push(`${name}: ${page} is missing; ${page} accepts the ref of the page the edit changes.`);
    if (edit.ref === undefined) problems.push(`${name}: ref is missing; ref accepts the ref of the line the edit changes, as the page shows it.`);
    if (edit.op === undefined) problems.push(`${name}: op is missing; op accepts ${OP_WORDS}.`);
    else if (!(EDIT_OPS as readonly unknown[]).includes(edit.op)) problems.push(`${name}: op ${shown(edit.op)} is not an edit operation; op accepts ${OP_WORDS}.`);
  });
  if (problems.length) throw Error(`update_exosurface not applied: ${problems.slice(0, 3).join(' ')}${problems.length > 3 ? ` (${problems.length - 3} more)` : ''}`);
}

// Fixture children die with the test process that spawned them. Two layers: this process's exit (a normal end, a failure,
// a test runner timeout) and SIGINT/SIGTERM send them SIGTERM, so the release owner stops its own Pi children first; and
// each child, spawned with PARENT_WATCH, ends itself once that process is gone, even after a SIGKILL no handler sees.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import type { ChildProcess } from 'node:child_process';

/** node arguments that preload the parent watch (test/parent-watch.mjs) into a spawned child. */
export const PARENT_WATCH = ['--import', pathToFileURL(join(import.meta.dirname, 'parent-watch.mjs')).href];

const live = new Set<ChildProcess>();
/** Registers a fixture child to be sent SIGTERM when this test process exits or is interrupted. */
export function reaped<C extends ChildProcess>(child: C): C {
  live.add(child); child.once('exit', () => live.delete(child));
  return child;
}
process.once('exit', () => { for (const child of live) child.kill('SIGTERM'); });
for (const signal of ['SIGINT', 'SIGTERM'] as const)
  process.once(signal, () => { for (const child of live) child.kill('SIGTERM'); process.exit(signal === 'SIGINT' ? 130 : 143); });

// Fixture children die with the test process that spawned them. Two layers: this process's exit (a normal end, a failure,
// a test runner timeout) and SIGINT/SIGTERM send them SIGTERM, so the release owner stops its own Pi children first; and
// each child, spawned with PARENT_WATCH, ends itself once that process is gone, even after a SIGKILL no handler sees.
// A process the test does not spawn itself (the Pi a product owner starts in-process) is registered with reapOnExit.
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';

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

// One detached sidecar per test process, in its own session so a sweep of the test's process group spares it. It reads
// registered pids from a pipe held only by this process; at that pipe's end (this process is gone, however it ended) it
// sends each registered process still running SIGTERM, then SIGKILL 2 s later. A pid is identified by its start time
// (/proc/<pid>/stat), so a pid reused by an unrelated process is left alone.
const SIDECAR = `const{readFileSync}=require('node:fs');const started=p=>{try{return readFileSync('/proc/'+p+'/stat','utf8').split(') ').at(-1).split(' ')[19];}catch{return null;}};
const pids=new Map();let buffer='';process.stdin.setEncoding('utf8');
process.stdin.on('data',c=>{buffer+=c;let end;while((end=buffer.indexOf('\\n'))>=0){const p=Number(buffer.slice(0,end));buffer=buffer.slice(end+1);if(p>0)pids.set(p,started(p));}});
process.stdin.on('end',()=>{const mine=[...pids].filter(([p,s])=>started(p)===s).map(([p])=>p);
 for(const p of mine)try{process.kill(p,'SIGTERM');}catch{}
 setTimeout(()=>{for(const p of mine)if(started(p)===pids.get(p))try{process.kill(p,'SIGKILL');}catch{}process.exit(0);},2000);});`;
let sidecar: ChildProcess | undefined;
/** Registers a running process to be killed once this test process is gone, even when it was SIGKILLed. */
export function reapOnExit(pid: number) {
  if (!sidecar) {
    sidecar = spawn(process.execPath, ['-e', SIDECAR], { detached: true, stdio: ['pipe', 'ignore', 'ignore'] });
    sidecar.unref(); (sidecar.stdin as unknown as { unref(): void }).unref();
  }
  sidecar.stdin!.write(`${pid}\n`);
}

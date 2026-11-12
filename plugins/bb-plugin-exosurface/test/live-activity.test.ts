// #84: a surface's exo_block RPC carries the live activity line of spec pages-and-activity E9.
// Through the mock-BB harness (test/mock-bb.ts): server.ts RPC, host.ts and the release owner on the real Pi CLI. Fake: BB,
// OptChat, the model ("steps: <topic>", stepsTurn in test/mock-bb.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge, stepsTurn } from './mock-bb.ts';
import { settled } from './wait.ts';
import { reapOnExit } from './reap.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
// The bridge, the owner and the Pis the owner started (pids from the fake OptChat's record), each seen gone by a wall-clock
// deadline before the fixture is removed; else the fixture stays for diagnosis.
after(async () => {
  const pis = f.piRuns().map(r => r.pid); for (const pid of pis) reapOnExit(pid);
  const ended = (c: typeof ownerProcess) => c.exitCode !== null || c.signalCode !== null;
  const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch (e: any) { return e.code !== 'ESRCH'; } };
  for (const child of [host.child, ownerProcess]) child.kill('SIGTERM');
  if (await settled(() => ended(host.child) && ended(ownerProcess) && !pis.some(alive), 15000)) rmSync(f.root, { recursive: true, force: true });
  else throw new Error(`fixture processes still running; fixture kept at ${f.root}`);
});
for (const topic of ['garden', 'cabin']) writeFileSync(join(f.vault, `${topic}.md`), `# The ${topic}\n`);

const lines = (seen: any[]) => seen.map(b => b.activity).filter(Boolean);

test('a send Exo answers in several steps: exo_block names each step in turn while Exo works, then reports the reply and no line', async () => {
  assert.equal((await host.start('primary')).error, undefined);
  const seen = await stepsTurn(f, 'primary', 'garden');
  assert.deepEqual(lines(seen), ['Reading your message', 'Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  assert.ok(seen.filter(b => b.activity).every(b => b.working && b.words === ''), JSON.stringify(seen));
  assert.deepEqual(seen.at(-1), { working: false, said: 'steps: garden', words: 'Exo (exo-optchat): steps: garden' });
});

test('exo_block as BB serves it: its output passes the contract, an input the contract refuses never reaches it', async () => {
  await assert.rejects(f.rpc["exo_block"]({ threadId: 'primary', limit: 500 } as any), /exo_block input invalid/);
  assert.deepEqual(await f.rpc["exo_block"]({ threadId: 'primary' }), { working: false, said: 'steps: garden', words: 'Exo (exo-optchat): steps: garden' });
});

test('two surfaces working at once: each exo_block reports its own line, never the other\'s', async () => {
  await f.rpc["thread_bind"]({ threadId: 'second' });
  assert.equal((await host.start('second')).error, undefined);
  const profile = f.piRuns().at(-1).profile;
  const [home, second] = await Promise.all([stepsTurn(f, 'primary', 'garden'), stepsTurn(f, 'second', 'cabin')]);
  assert.deepEqual(lines(home), ['Reading your message', 'Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  assert.deepEqual(lines(second), ['Reading your message', 'Planning the cabin', 'Reading the cabin note', 'Now I can answer about the cabin.']);
  assert.deepEqual([home.at(-1), second.at(-1)], [{ working: false, said: 'steps: garden', words: 'Exo (exo-optchat): steps: garden' }, { working: false, said: 'steps: cabin', words: `Exo (${profile}): steps: cabin` }]);
});

test('a note whose name already ends in "note" or "notes" is named once, not with the noun doubled', async () => {
  for (const topic of ['notes', 'week note', 'Garden-Notes']) {
    writeFileSync(join(f.vault, `${topic}.md`), `# ${topic}\n`);
    const seen = await stepsTurn(f, 'primary', topic);
    assert.equal(lines(seen)[2], `Reading the ${topic}`);
  }
});

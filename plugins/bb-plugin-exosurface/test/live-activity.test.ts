// #84: a surface's exo_block RPC carries the live activity line of spec pages-and-activity E9.
// Through the mock-BB harness (test/mock-bb.ts): server.ts RPC, host.ts and the release owner on the real Pi CLI. Fake: BB,
// OptChat, the model ("steps: <topic>", stepsTurn in test/mock-bb.ts).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { liveFixture, owner, bridge, stepsTurn } from './mock-bb.ts';

const f = await liveFixture();
const ownerProcess = await owner(f);
const host = bridge(f);
f.provider.deliver = (threadId, text) => { host.send(threadId, text); };
after(async () => {
  for (const child of [host.child, ownerProcess]) { child.kill('SIGTERM'); if (child.exitCode === null) await new Promise(r => child.once('close', r)); }
  await new Promise(r => setTimeout(r, 1000));
  rmSync(f.root, { recursive: true, force: true });
});
for (const topic of ['garden', 'cabin']) writeFileSync(join(f.vault, `${topic}.md`), `# The ${topic}\n`);

const lines = (seen: any[]) => seen.map(b => b.activity).filter(Boolean);

test('a send Exo answers in several steps: exo_block names each step in turn while Exo works, then reports the reply and no line', async () => {
  assert.equal((await host.start('primary')).error, undefined);
  const seen = await stepsTurn(f, 'primary', 'garden');
  assert.deepEqual(lines(seen), ['Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  assert.ok(seen.filter(b => b.activity).every(b => b.working && b.words === ''), JSON.stringify(seen));
  assert.deepEqual(seen.at(-1), { working: false, words: 'Exo (exo-optchat): steps: garden' });
});

test('two surfaces working at once: each exo_block reports its own line, never the other\'s', async () => {
  await f.rpc.thread_bind({ threadId: 'second' });
  assert.equal((await host.start('second')).error, undefined);
  const profile = f.piRuns().at(-1).profile;
  const [home, second] = await Promise.all([stepsTurn(f, 'primary', 'garden'), stepsTurn(f, 'second', 'cabin')]);
  assert.deepEqual(lines(home), ['Planning the garden', 'Reading the garden note', 'Now I can answer about the garden.']);
  assert.deepEqual(lines(second), ['Planning the cabin', 'Reading the cabin note', 'Now I can answer about the cabin.']);
  assert.deepEqual([home.at(-1), second.at(-1)], [{ working: false, words: 'Exo (exo-optchat): steps: garden' }, { working: false, words: `Exo (${profile}): steps: cabin` }]);
});

// Test-only post-suite verification. Supply the dedicated fixture TMPDIR, never a live directory.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
const [log, tmp] = process.argv.slice(2);
assert.ok(log && tmp && isAbsolute(tmp), 'Usage: node verify-unit-cleanup.mjs LOG ABSOLUTE_DEDICATED_TMPDIR');
const receipts = readFileSync(log, 'utf8').split('\n').filter(line => line.includes('{"fixtureCleanup":')).map(line => JSON.parse(line.slice(line.indexOf('{'))));
assert.ok(receipts.length >= 2, 'Full cleanup receipts required');
const pids = new Set();
for (const receipt of receipts) {
  assert.equal(receipt.fixtureCleanup, basename(receipt.fixtureCleanup));
  assert.equal(receipt.rootAbsentAfterShutdown, true);
  assert.equal(existsSync(join(tmp, receipt.fixtureCleanup)), false, `Root reappeared: ${receipt.fixtureCleanup}`);
  for (const pid of receipt.ownedPidsGone) {
    assert.ok(Number.isInteger(pid) && pid > 0);
    assert.throws(() => process.kill(pid, 0), {code: 'ESRCH'}, `Owned PID ${pid} survived test-worker shutdown`);
    pids.add(pid);
  }
}
assert.ok(pids.size >= 5, 'Full suite must account for two mock Pi, two host and one cleanup-regression child');
assert.deepEqual(readdirSync(tmp), [], 'Dedicated fixture TMPDIR must remain empty after the test process exits');
console.log(JSON.stringify({passed:true,rootReceipts:receipts.length,ownedPidsGone:[...pids],dedicatedTmpdirEmpty:true,scope:'test fixtures only; not production lifecycle or sanitizer-runner clearance'},null,2));

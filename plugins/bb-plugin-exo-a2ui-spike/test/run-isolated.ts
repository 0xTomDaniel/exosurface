// `npm test`: run the suite with a disposable HOME/TMPDIR/EXO_CONFIG (see isolation.ts), then delete it.
// Usage: node --experimental-transform-types test/run-isolated.ts [extra node --test args] <test files>
import { TEST_ROOT } from './isolation.ts';
import { spawnSync } from 'node:child_process';
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => process.exit(130));
const args = process.argv.slice(2);
console.error(`isolated test root: ${TEST_ROOT}${process.env.EXO_TEST_KEEP ? ' (kept)' : ' (removed after run)'}`);
const r = spawnSync(process.execPath, ['--experimental-transform-types', '--test', ...args], { stdio: 'inherit', env: process.env });
process.exitCode = r.status ?? 1;

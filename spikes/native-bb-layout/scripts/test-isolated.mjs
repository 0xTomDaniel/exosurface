#!/usr/bin/env node
// Run the spike's tests with an allowlisted env (no inherited EXO_/OPTCHAT_/PI_ selectors) and a disposable HOME.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { stageEnv, assertClean } from './stage-env.mjs';

const stage = mkdtempSync('/tmp/nls-test-');
const env = assertClean(stageEnv({ stage, serverPort: 39996, daemonPort: 39997 }), stage);
for (const d of [env.HOME, env.TMPDIR]) mkdirSync(d, { recursive: true });
const files = readdirSync('test').filter(f => f.endsWith('.test.ts')).map(f => join('test', f));
const r = spawnSync(process.execPath, ['--experimental-transform-types', '--no-warnings', '--test', '--test-isolation=none', '--test-reporter=spec', '--test-reporter-destination=stderr', ...files], { env, stdio: 'inherit' });
const leftovers = readdirSync(env.HOME);
rmSync(stage, { recursive: true, force: true });
if (leftovers.length) console.error(`note: tests wrote into disposable HOME: ${leftovers.join(', ')}`);
process.exit(r.status ?? 1);

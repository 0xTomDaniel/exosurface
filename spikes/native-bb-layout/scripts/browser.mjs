// Staging browser only: unique session, disposable profile, no CDP attachment to existing browsers.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { stageEnv, assertClean } from './stage-env.mjs';
const stage = '/tmp/nls-stage';
const env = assertClean(stageEnv({ stage }), stage);
for (const dir of [env.HOME, env.TMPDIR]) mkdirSync(dir, { recursive: true });
// Explicit machine-local tool paths, outside the committed spike; never attach to a personal browser.
const { binary, chromium } = JSON.parse(readFileSync(stage + '/browser-tooling.json', 'utf8'));
if (!binary?.startsWith('/') || !chromium?.startsWith('/')) throw new Error('Provide absolute existing browser tool paths');
const args = process.argv.slice(2);
if (args.some(a => /3888[67]|--(?:connect|cdp|auto-connect|session|profile)|^connect$/.test(a))) throw new Error('Refusing live browser/session override');
process.stdout.write(execFileSync(binary, ['--session', 'nls-staging', '--profile', stage + '/browser', '--executable-path', chromium, ...args], { env, encoding:'utf8', timeout:45000 }));

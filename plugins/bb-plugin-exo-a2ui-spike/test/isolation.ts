// Test isolation: every test runs against a disposable HOME, never the person's real runtime state.
// Import this FIRST in every test file (before anything from ../src or ../host.ts): plugin state paths
// are computed from os.homedir() ($HOME) and from runtime selector variables when those modules load.
// - Under test/run-isolated.ts the runner has already created EXO_TEST_ROOT and removes it afterwards.
// - Run directly (`node --test test/x.test.ts`), this module creates its own root and removes it on exit.
// Either way it refuses to continue if HOME, the local config or any runtime selector points outside the root.
// A temp HOME alone is NOT enough: a shell started by the live Exo inherits its runtime selectors
// (EXOSURFACE_MODE=main, EXOSURFACE_HOME, OPTCHAT_HOME, PI_SESSION_FILE, PI_CODING_AGENT_DIR, EXO_BB_INFO_FILE, …),
// which name the real state directly. They are removed before the root is made; with a given root they must be absent
// or point inside it.
// Optional real binaries for the offline bridge proof (no network, no paid model):
//   EXO_TEST_PI_CLI, EXO_TEST_OPTCHAT, EXO_TEST_PI_FAST. Without them that proof is skipped, not faked;
//   launch-argument tests then get an empty stub folder as their OptChat path (never executed).
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, realpathSync } from 'node:fs';
import { userInfo } from 'node:os';
import { join, resolve, relative, isAbsolute, basename, dirname } from 'node:path';

const REAL_HOME = realpathSync(userInfo().homedir); // from the account database, not $HOME
/** Runtime selectors: anything Exo/OptChat/Pi/BB-plugin code reads to find state (EXO_TEST_* are test inputs, kept). */
export const LIVE_ENV = /^(EXOSURFACE_|EXO_(?!TEST_)|OPTCHAT_|PI_|PLAYWRIGHT_MODULE$)/;
const ALLOWED = new Set(['PI_TELEMETRY']);
export function scrubLiveEnv(env: NodeJS.ProcessEnv = process.env) { for (const k of Object.keys(env)) if (LIVE_ENV.test(k)) delete env[k]; return env; }
/** Subprocess/test environment is allowlisted, not a denylist of today's known live selectors.
 * No provider keys, proxy settings, NODE_OPTIONS, BB profile paths or future selectors survive.
 * PATH uses the actual Node executable (never a mise shim under temporary HOME).
 * This is an accident guard, not an OS sandbox; arbitrary test code still has account access. */
export function isolatedEnvironment(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const out: NodeJS.ProcessEnv = { PATH: `${dirname(process.execPath)}:/usr/bin:/bin:/usr/sbin:/sbin`, LANG: 'en_US.UTF-8', PI_TELEMETRY: '0' };
  for (const k of ['HOME','TMPDIR','XDG_CONFIG_HOME','XDG_DATA_HOME','XDG_STATE_HOME','XDG_CACHE_HOME','EXO_CONFIG',
    'EXO_TEST_ROOT','EXO_TEST_KEEP','EXO_TEST_PI_CLI','EXO_TEST_OPTCHAT','EXO_TEST_PI_FAST']) if (env[k]) out[k] = env[k];
  return out;
}
function replaceEnvironment(env: NodeJS.ProcessEnv) {
  for (const k of Object.keys(process.env)) delete process.env[k];
  Object.assign(process.env, env);
}


// /tmp, not $TMPDIR: macOS's per-user TMPDIR is long enough to push owner sockets past the 104-byte limit.
export function createIsolatedRoot(base = process.env.EXO_TEST_BASE ?? '/tmp') {
  const root = realpathSync(mkdtempSync(join(base, 'exo-test-')));
  const home = join(root, 'home'), tmp = join(root, 'tmp'), config = join(home, '.config', 'exo', 'exosurface.json');
  const stub = join(root, 'stub', 'optchat');
  for (const d of [home, tmp, stub, join(root, 'vault'), join(root, 'evidence'), join(home, '.exo-bb-spike', 'primary-agent'), join(home, '.config', 'exo')]) mkdirSync(d, { recursive: true, mode: 0o700 });
  const value = (k: string) => process.env[k] ?? '';
  writeFileSync(config, JSON.stringify({
    vault: join(root, 'vault'), piCli: value('EXO_TEST_PI_CLI'), optchat: value('EXO_TEST_OPTCHAT') || stub, optchatCanvas: value('EXO_TEST_OPTCHAT') || stub, piFast: value('EXO_TEST_PI_FAST'),
    playwright: '', surfaceMain: 'off', exosurfacePlugin: '', primaryAgentDir: join(home, '.exo-bb-spike', 'primary-agent'), primarySolProvider: '',
  }, null, 2) + '\n', { mode: 0o600 });
  return { root, env: { EXO_TEST_ROOT: root, HOME: home, TMPDIR: tmp, EXO_CONFIG: config, XDG_CONFIG_HOME: join(home, '.config'), XDG_DATA_HOME: join(home, '.local', 'share'), XDG_STATE_HOME: join(home, '.local', 'state'), XDG_CACHE_HOME: join(home, '.cache'), PI_TELEMETRY: '0' } };
}

const inside = (path: string, root: string) => { const r = relative(resolve(root), resolve(path)); return r === '' || (!r.startsWith('..') && !isAbsolute(r)); };

/** Throws unless the root is a fresh exo-test-* folder outside the real home, HOME/TMPDIR/EXO_CONFIG are inside it,
 *  and every runtime selector is absent or an absolute path inside it. Error messages name variables, never values. */
export function assertIsolated(env: NodeJS.ProcessEnv = process.env) {
  const root = env.EXO_TEST_ROOT, home = env.HOME;
  if (!root || !home) throw new Error('Refusing to run tests: EXO_TEST_ROOT/HOME not isolated (use npm test)');
  // HOME may not be the real home or any folder above it; the root may not be inside or above the real home.
  if (inside(REAL_HOME, resolve(home)) || inside(REAL_HOME, resolve(root))) throw new Error('Refusing to run tests against the real home (HOME/EXO_TEST_ROOT)');
  if (inside(resolve(root), REAL_HOME) || !basename(root).startsWith('exo-test-')) throw new Error('Refusing to run tests: EXO_TEST_ROOT must be a fresh exo-test-* folder outside the real home');
  for (const k of ['HOME', 'TMPDIR', 'EXO_CONFIG'] as const) if (!env[k] || !inside(env[k]!, resolve(root))) throw new Error(`Refusing to run tests: ${k} is outside the isolated test root`);
  for (const [k, v] of Object.entries(env)) if (LIVE_ENV.test(k) && !ALLOWED.has(k) && !(v && isAbsolute(v) && inside(v, resolve(root))))
    throw new Error(`Refusing to run tests: ${k} points outside the isolated test root (inherited from a live session?)`);
  return root;
}

if (!process.env.EXO_TEST_ROOT) {
  replaceEnvironment(isolatedEnvironment(process.env));
  scrubLiveEnv();
  const { root, env } = createIsolatedRoot();
  Object.assign(process.env, env);
  process.on('exit', () => { if (!process.env.EXO_TEST_KEEP) rmSync(root, { recursive: true, force: true }); });
}
export const TEST_ROOT = assertIsolated();
replaceEnvironment(isolatedEnvironment(process.env));
export const EVIDENCE_DIR = join(TEST_ROOT, 'evidence');

/** Stand-in for a person's canonical OptChat profile, inside the isolated HOME. */
export function canonicalFixture(canonicalHome: string, profile: string) {
  if (!canonicalHome || !inside(canonicalHome, TEST_ROOT)) throw new Error('Canonical fixture must live in the isolated test root');
  const dir = join(canonicalHome, 'profiles', profile); mkdirSync(dir, { recursive: true });
  for (const [f, v] of [['config.json', '{"fixture":true}\n'], ['AGENTS.md', '# fixture\n'], ['active-memory.json', '{}\n'], ['DO-NOT-DELETE.md', 'fixture\n']]) writeFileSync(join(dir, f), v);
  return dir;
}
export const realBinaries = () => ['EXO_TEST_PI_CLI', 'EXO_TEST_OPTCHAT', 'EXO_TEST_PI_FAST'].every(k => process.env[k]);

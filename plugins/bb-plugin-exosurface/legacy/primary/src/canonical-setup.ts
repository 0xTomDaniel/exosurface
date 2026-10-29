import { existsSync, mkdirSync, openSync, closeSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import { save, loadIf } from '../../../src/store.ts';
import { commitFreshCanonicalBinding, freshCanonicalReceipt, validateFreshCanonicalSession, canonicalRuntimeDirectories } from './canonical-fresh.ts';
export interface SetupTarget { home: string; optchatHome: string; profile: string; vault: string; piCli: string; optchat: string; projectId: string; }
export interface SetupRequest extends SetupTarget { operationId: string; authorizeInitialization: true; }
export interface SetupJournal { schema: 'exosurface-canonical-setup/0'; request: SetupRequest; stage: 'claimed' | 'profile-intent' | 'profile-ready' | 'session-intent' | 'session-ready' | 'spawning' | 'thread-ready' | 'bound'; session?: { id: string; file: string }; threadId?: string; }
export interface CanonicalSetupPorts {
  nativeDispatchAllowed: boolean;
  configureLocal(request: SetupRequest): Promise<void>;
  createProfile(request: SetupRequest): Promise<void>;
  validateProfile(request: SetupRequest): Promise<void>;
  initializeSession(request: SetupRequest): Promise<{ id: string; file: string }>;
  spawnThread(request: SetupRequest): Promise<{ id: string }>;
  verifyThread(request: SetupRequest, threadId: string): Promise<void>;
}
export const setupJournalPath = (home: string) => join(home, 'canonical-setup.json');
export function setupStatus(home: string): SetupJournal | undefined {
  const file = setupJournalPath(home), info = lstatSync(file, { throwIfNoEntry: false });
  if (info && !info.isFile()) throw Error('Canonical setup journal must be a regular file; refusing foreign state');
  return loadIf(file);
}
function validate(request: SetupRequest) {
  if (request.authorizeInitialization !== true || !/^[a-zA-Z0-9_-]{8,80}$/.test(request.operationId) || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(request.profile) || !request.projectId) throw Error('Explicit initialization authorization and valid operation required');
  for (const path of [request.home, request.optchatHome, request.vault, request.piCli, request.optchat]) {
    if (!isAbsolute(path) || resolve(path) !== path) throw Error('Canonical setup requires explicit normalized absolute paths');
    for (let p = path;;) { if (existsSync(p) && lstatSync(p).isSymbolicLink()) throw Error('Canonical setup refuses symlink paths'); const parent = resolve(p, '..'); if (parent === p) break; p = parent; }
  }
  canonicalRuntimeDirectories(request.home);
  const socketLimit = process.platform === 'darwin' ? 103 : 107;
  if ([join(request.optchatHome, 'profiles', request.profile, 'lock.sock'), join(request.optchatHome, 'profiles', request.profile, 'windows.sock'), join(request.home, 'owner', 'rpc.sock')].some(path => Buffer.byteLength(path) > socketLimit)) throw Error('Canonical setup socket paths exceed this platform limit; choose shorter isolated state paths');
  if (realpathSync(request.vault) !== request.vault) throw Error('Workspace must have an exact local identity');
  if (request.home === request.optchatHome || request.home.startsWith(request.optchatHome + '/') || request.optchatHome.startsWith(request.home + '/')) throw Error('Canonical state and OptChat homes must be isolated siblings');
}
/** No implicit lock stealing. Explicit recovery accepts only this exact durable
 * operation and an OS-confirmed dead PID; native/Pi uncertainty remains refused. */
export function recoverSetupLock(request: SetupRequest) {
  validate(request);
  const file = join(request.home, 'canonical-setup.lock'), lock = loadIf(file), journal = setupStatus(request.home);
  if (!lock) return;
  if (!journal || JSON.stringify(journal.request) !== JSON.stringify(request) || lock.operationId !== request.operationId || !Number.isSafeInteger(lock.pid) || lock.pid < 1) throw Error('Foreign canonical setup lock');
  const recovery = join(request.home, 'canonical-setup-recovery.lock'), fd = openSync(recovery, 'wx', 0o600); closeSync(fd);
  try {
    const before = lstatSync(file);
    try { process.kill(lock.pid, 0); throw Error('Canonical setup is still running'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; }
    const after = lstatSync(file);
    if (!after.isFile() || after.ino !== before.ino) throw Error('Canonical setup lock changed');
    unlinkSync(file);
  } finally { unlinkSync(recovery); }
}
/** Same canonical provider/owner only. Every external operation has an intent
 * checkpoint. Unknown native spawn is never repeated or adopted by title. */
export async function canonicalSetup(request: SetupRequest, ports: CanonicalSetupPorts) {
  validate(request);
  // The shipped adapter is deliberately gated. Merely opening UI/status must not
  // mutate the profile, native state or initialization user history.
  if (!ports.nativeDispatchAllowed) throw Error('Canonical native dispatch is separately gated; no setup changes made');
  mkdirSync(request.home, { recursive: true, mode: 0o700 });
  const file = setupJournalPath(request.home), lock = join(request.home, 'canonical-setup.lock');
  if (existsSync(join(request.home, 'canonical-setup-recovery.lock'))) throw Error('Canonical setup lock recovery is active or interrupted; refusing takeover');
  const fd = openSync(lock, 'wx', 0o600);
  try {
    // fsync the lock identity before any await or external side effect.
    closeSync(fd); save(lock, { operationId: request.operationId, pid: process.pid });
    let j = setupStatus(request.home);
    if (j && (j.schema !== 'exosurface-canonical-setup/0' || !['claimed', 'profile-intent', 'profile-ready', 'session-intent', 'session-ready', 'spawning', 'thread-ready', 'bound'].includes(j.stage) || JSON.stringify(j.request) !== JSON.stringify(request))) throw Error('Canonical setup exact-operation conflict; refusing rebind');
    const profile = join(request.optchatHome, 'profiles', request.profile);
    if (!j) {
      if (existsSync(request.optchatHome) || existsSync(profile) || existsSync(join(request.home, 'canonical-thread.json')) || existsSync(join(request.home, 'canonical-fresh.json')) || existsSync(join(request.home, 'canonical-fresh-committed.json')) || existsSync(join(request.home, 'bindings'))) throw Error('Foreign canonical profile/binding state; refusing adoption');
      j = { schema: 'exosurface-canonical-setup/0', request, stage: 'claimed' }; save(file, j);
    }
    await ports.configureLocal(request);
    const checkpoint = (stage: SetupJournal['stage']) => { j!.stage = stage; save(file, j); };
    if (j.stage === 'claimed') checkpoint('profile-intent');
    if (j.stage === 'profile-intent') {
      if (!existsSync(profile)) await ports.createProfile(request);
      await ports.validateProfile(request); checkpoint('profile-ready');
    } else await ports.validateProfile(request);
    if (j.stage === 'profile-ready') checkpoint('session-intent');
    if (j.stage === 'session-intent') {
      // The real initializer journals the public session identity before append,
      // and resumes only that identity. It never selects another recent session.
      j.session = await ports.initializeSession(request); checkpoint('session-ready');
    }
    if (j.stage === 'spawning') throw Error('Interrupted BB creation outcome unknown; explicit reconciliation required; action was not retried');
    if (j.stage === 'session-ready') {
      if (!j.session) throw Error('Incomplete canonical session identity');
      validateFreshCanonicalSession({ operationId: request.operationId, home: request.home, optchatHome: request.optchatHome, profile: request.profile, sessionFile: j.session.file, sessionId: j.session.id });
      checkpoint('spawning');
      const thread = await ports.spawnThread(request);
      if (!thread?.id) throw Error('BB creation outcome unknown; explicit reconciliation required');
      j.threadId = thread.id; checkpoint('thread-ready');
    }
    if (!j.threadId || !j.session) throw Error('Incomplete canonical setup journal');
    await ports.verifyThread(request, j.threadId);
    if (j.stage === 'thread-ready') {
      if (existsSync(join(request.home, 'canonical-fresh-committed.json'))) {
        const committed = freshCanonicalReceipt(request.home, request.optchatHome, request.profile);
        if (!committed || committed.operationId !== request.operationId || committed.threadId !== j.threadId || committed.sessionFile !== j.session.file || committed.sessionId !== j.session.id) throw Error('Foreign canonical commit; refusing reconciliation');
      } else commitFreshCanonicalBinding({ operationId: request.operationId, home: request.home, optchatHome: request.optchatHome, profile: request.profile, threadId: j.threadId, sessionFile: j.session.file, sessionId: j.session.id });
      checkpoint('bound');
    }
    const receipt = freshCanonicalReceipt(request.home, request.optchatHome, request.profile);
    if (!receipt || receipt.threadId !== j.threadId || receipt.sessionId !== j.session.id) throw Error('Canonical setup committed receipt mismatch');
    return { threadId: j.threadId, profile: request.profile, stage: j.stage, ownerReady: false as const, releaseReady: false as const };
  } finally { if (existsSync(lock)) unlinkSync(lock); }
}

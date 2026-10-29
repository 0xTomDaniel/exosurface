// Real supported profile API + CLI persistence + retained RPC/host. The sole
// external adapter substitute is BB's native thread API. Explicit private env.
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const plugin = resolve(process.argv[2]), root = process.env.PROOF_ROOT;
assert.ok(root && process.env.HOME.startsWith(root + '/') && process.env.EXO_CONFIG.startsWith(root + '/'));
const { default: register } = await import(pathToFileURL(join(plugin, 'server.ts')));
const { canonicalSystemPorts, canonicalBBNativeAdapter } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-system.ts')));
const { HOME, CANONICAL_HOME, CANONICAL_PROFILE } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/state.ts')));
const { setupStatus } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-setup.ts')));
const { freshCanonicalReceipt } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-fresh.ts')));
const input = { operationId: 'real-local-journal-proof', projectId: 'mock-native-project', vault: root + '/vault', piCli: process.env.PROOF_PI_CLI, optchat: root + '/optchat', authorizeInitialization: true, recoverDeadLock: false };
function transport(threads) { const capture = {}; const bb = { providers: { register: p => { capture.provider = p; } }, rpc: { register: (_contract, handlers) => { capture.handlers = handlers; } }, sdk: { threads, projects: { async list() { return [{ id: input.projectId, name: 'Mock native project' }]; } } }, background: { service() {} }, realtime: { publish() {} }, ui: { registerMentionProvider() {} }, log: { warn() {} }, experimental_hooks: { on(name, handler) { assert.equal(name, 'message.dispatch'); assert.equal(capture.dispatch, undefined); capture.dispatch = handler; } } }; return { bb, capture }; }
let spawns = 0, nativeThread, real, bridge;
const replies = [], waiters = new Map(); globalThis.__canonicalMetrics = { owner: 0, model: 0 };
globalThis.__canonicalIo = { send(value) { replies.push(value); }, sendResult(id, result) { replies.push({ id, result }); waiters.get(id)?.({ result }); }, sendError(id, code, message) { replies.push({ id, error: { code, message } }); waiters.get(id)?.({ error: { code, message } }); } };
let sequence = 0;
const host = (method, params) => new Promise((resolve, reject) => { const id = ++sequence, timer = setTimeout(() => reject(Error('host control timeout')), 2000); waiters.set(id, value => { clearTimeout(timer); resolve(value); }); bridge.handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params })); });
const threads = {
  async spawn(args) {
    spawns++; assert.equal(args.providerId, 'exo-spike'); assert.equal(args.model, 'exo-opus-5-5'); assert.equal(args.reasoningLevel, 'high'); assert.equal(args.permissionMode, 'full'); assert.equal(args.environment.workspace.path, input.vault);
    nativeThread = { id: 'journal-mock-native-thread', providerId: args.providerId, projectId: args.projectId };
    assert.deepEqual(await real.capture.dispatch({ attempt: 'start-turn', thread: { ...nativeThread, parentThreadId: null }, input: { text: args.prompt } }), { action: 'proceed' });
    const derived = real.capture.provider.deriveProviderOptions({ threadId: nativeThread.id, projectId: nativeThread.projectId, model: args.model, permissionMode: 'full', settings: {} });
    assert.equal(derived.canonicalSetupOperation, input.operationId);
    bridge = await import(pathToFileURL(root + '/control-host-build/host.mjs'));
    const options = { model: args.model, permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null, providerOptions: derived };
    assert.ok((await host('thread/start', { threadId: nativeThread.id, cwd: input.vault, options, instructionMode: 'append' })).result);
    assert.ok((await host('turn/start', { threadId: nativeThread.id, providerThreadId: `exo:${CANONICAL_PROFILE}:main`, clientRequestId: 'creq_23456789ab', options, input: [{ type: 'text', text: args.prompt }] })).result);
    assert.deepEqual(globalThis.__canonicalMetrics, { owner: 0, model: 0 });
    return nativeThread;
  },
  async get({ threadId }) { assert.equal(threadId, nativeThread.id); return nativeThread; },
};
const beforeGate = [existsSync(HOME), existsSync(CANONICAL_HOME), existsSync(process.env.EXO_CONFIG)];
const gated = transport({ async spawn() { throw Error('Production native adapter must not dispatch'); }, async get() { throw Error('Production native adapter must not read'); } }); register(gated.bb);
assert.equal((await gated.capture.handlers.canonical_setup_status()).nativeDispatchAllowed, false);
assert.equal((await gated.capture.handlers.canonical_setup_status()).initializationAvailable, true);
for (const authorizeInitialization of [false, undefined, 'true']) await assert.rejects(gated.capture.handlers.canonical_setup({ ...input, authorizeInitialization, recoverDeadLock: true }));
assert.deepEqual([existsSync(HOME), existsSync(CANONICAL_HOME), existsSync(process.env.EXO_CONFIG)], beforeGate);
const ports = canonicalSystemPorts({ localConfig: process.env.EXO_CONFIG, runtimeRoot: plugin, node: process.execPath, native: canonicalBBNativeAdapter(threads, true), instrumentEnvironment: env => ({ ...env, NODE_OPTIONS: process.env.NODE_OPTIONS, PROOF_ROOT: root, PROOF_ALLOW_PI: '1', PROOF_PI_CLI: process.env.PROOF_PI_CLI, PROOF_PROFILE_DIR: join(CANONICAL_HOME, 'profiles', CANONICAL_PROFILE) }) });
real = transport(threads); register(real.bb, ports);
assert.deepEqual(await real.capture.handlers.canonical_setup_projects(), [{ id: input.projectId, name: 'Mock native project' }]);
const first = await real.capture.handlers.canonical_setup(input), second = await real.capture.handlers.canonical_setup(input);
assert.deepEqual(first, second); assert.equal(spawns, 1); assert.equal(first.ownerReady, false);
const journal = setupStatus(HOME), reopened = await ports.initializeSession(journal.request);
assert.equal(reopened.id, journal.session.id); assert.equal(reopened.file, journal.session.file);
const entries = readFileSync(reopened.file, 'utf8').trim().split('\n').map(JSON.parse), messages = entries.filter(e => e.type === 'message');
assert.equal(messages.length, 1); assert.equal(messages[0].message.role, 'user');
assert.ok(entries.some(e => e.customType === 'optchat.profile' && e.data.name === CANONICAL_PROFILE));
assert.ok(!existsSync(join(CANONICAL_HOME, 'profiles', CANONICAL_PROFILE, 'active-memory.json')));
assert.equal(freshCanonicalReceipt(HOME, CANONICAL_HOME, CANONICAL_PROFILE).sessionId, reopened.id);
assert.equal((await real.capture.handlers.canonical_setup_status()).stage, 'bound');
const socketPathBytes = Buffer.byteLength(join(CANONICAL_HOME, 'profiles', CANONICAL_PROFILE, 'windows.sock'));
if (process.env.PROOF_EXPECT_SOCKET_BYTES) assert.equal(socketPathBytes, Number(process.env.PROOF_EXPECT_SOCKET_BYTES));
console.log(JSON.stringify({ passed: true, socketPathBytes, retainedRPC: true, realOptchatProfileAPI: true, supportedPiCLI: true, actualHostControls: ['thread/start absent input + admitted provider options', 'turn/start'], controlMetrics: globalThis.__canonicalMetrics, nativeMockOnly: true, spawns, userRecords: messages.length, sessionId: reopened.id, sessionFile: reopened.file, profile: CANONICAL_PROFILE, home: HOME, optchatHome: CANONICAL_HOME, threadId: nativeThread.id, ownerReady: false, providerDispatch: false, releaseReady: false }, null, 2));

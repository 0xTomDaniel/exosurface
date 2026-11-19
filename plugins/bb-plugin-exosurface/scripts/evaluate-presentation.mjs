#!/usr/bin/env -S node --experimental-transform-types
// One installed retained-owner case per invocation. Not a canonical gate or a
// quality judge. Reuses the existing CDP/public-RPC proof and test wait/reap tools.
// Provision the disposable BB/owner/Chrome and fixture-only presentation-capture
// extension first. No servers, auth, profile creation or model fallback here.
// Example (from plugin):
// node --experimental-transform-types scripts/evaluate-presentation.mjs \
//   --root /tmp/PRIVATE --origin http://127.0.0.1:PORT --cdp http://127.0.0.1:CDP \
//   --bb-cli /absolute/bb.js --thread THREAD --case status --phase before \
//   --out /absolute/artifacts --send
// Omit --send for a capture-only artifact smoke. Never use a shared/production root.
import assert from 'node:assert/strict';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync, realpathSync, lstatSync, readdirSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import CDP from 'chrome-remote-interface';
import { z } from 'zod';
import { PARENT_WATCH } from '../test/reap.ts';
import { settled } from '../test/wait.ts';

const { values } = parseArgs({ options: {
  root: { type: 'string' }, origin: { type: 'string' }, cdp: { type: 'string' }, 'bb-cli': { type: 'string' }, thread: { type: 'string' },
  case: { type: 'string' }, phase: { type: 'string' }, out: { type: 'string' }, 'expected-session': { type: 'string' },
  'turn-timeout-ms': { type: 'string' }, 'installed-plugin-root': { type: 'string' },
  send: { type: 'boolean', default: false },
  'capture-existing': { type: 'boolean', default: false },
} });
/** @param {'root' | 'origin' | 'cdp' | 'bb-cli' | 'thread' | 'case' | 'phase' | 'out'} key */
const required = key => { const value = values[key]; assert.ok(value, `--${key} required`); return value; };
const rootArg = required('root'), origin = required('origin'), cdp = required('cdp'), bbCli = required('bb-cli'), threadId = required('thread');
const caseId = required('case'), phase = required('phase'), outDir = required('out');
const send = values.send, captureExisting = values['capture-existing'], expectedSession = values['expected-session'];
assert.ok(['before', 'after'].includes(phase), '--phase before|after');
assert.ok(!(send && captureExisting), 'capture-existing never sends');
const capturesResponse = send || captureExisting;
const turnTimeout = Number(values['turn-timeout-ms'] ?? 120000);
assert.ok(Number.isInteger(turnTimeout) && turnTimeout > 0 && turnTimeout <= 240000, '--turn-timeout-ms must be 1..240000');
const root = realpathSync(rootArg), driverPlugin = resolve(import.meta.dirname, '..');
const plugin = values['installed-plugin-root'] ?? driverPlugin;
assert.equal(plugin, realpathSync(plugin), 'installed plugin root must be canonical');
assert.equal(lstatSync(plugin).uid, process.getuid?.(), 'installed plugin root must be owned by this user');
for (const endpoint of [origin, cdp]) assert.equal(new URL(endpoint).hostname, '127.0.0.1', 'private loopback only');
const cases = z.array(z.object({ id: z.string(), prompt: z.string(), review: z.string() })).parse(JSON.parse(readFileSync(join(driverPlugin, 'test/presentation-cases.json'), 'utf8')));
const fixture = cases.find(c => c.id === caseId); assert.ok(fixture, 'unknown case');
const run = `${new Date().toISOString().replaceAll(/[:.]/g, '')}-${phase}-${fixture.id}-${randomUUID().slice(0, 8)}`;
mkdirSync(outDir, { recursive: true });
const output = join(outDir, run); mkdirSync(output);
/** @param {string} name @param {unknown} data */
const save = (name, data) => { writeFileSync(join(output, name), typeof data === 'string' ? data : JSON.stringify(data, null, 2), { flag: 'wx' }); };
/** @param {string} file */
const hash = file => createHash('sha256').update(readFileSync(file)).digest('hex');
/** @param {string} file */
const readJson = file => z.unknown().parse(JSON.parse(readFileSync(file, 'utf8')));
const env = { HOME: join(root, 'h'), TMPDIR: join(root, 't'), PATH: process.env['PATH'], BB_DATA_DIR: join(root, 'bb'), BB_SERVER_URL: origin, GOMAXPROCS: '2', NODE_OPTIONS: '--max-old-space-size=1536' };
/** @param {string[]} args @returns {unknown} */
function bb(args) {
  const r = spawnSync(process.execPath, [...PARENT_WATCH, bbCli, ...args, '--json'], { env, encoding: 'utf8', timeout: 15000, maxBuffer: 4_000_000 });
  if (r.status !== 0) throw Error(`BB ${args.slice(0, 3).join(' ')} failed (${String(r.status ?? r.signal)}): ${r.stderr.slice(0, 400)}`);
  return z.unknown().parse(JSON.parse(r.stdout));
}
/** @param {string} method @param {unknown} [input] @returns {unknown} */
function rpc(method, input = null) {
  const file = join(output, `rpc-${randomUUID()}.json`);
  writeFileSync(file, JSON.stringify(input), { flag: 'wx' });
  return bb(['plugin', 'rpc', 'call', 'exosurface', method, '--input-file', file]);
}
// Parse only complete newline-terminated records while a writer may append a tail.
// Malformed complete records still throw; no record is silently discarded.
/** @template {z.ZodType} S @param {string} file @param {S} schema @returns {z.infer<S>[]} */
const jsonl = (file, schema) => readFileSync(file, 'utf8').split('\n').slice(0, -1).map(line => schema.parse(JSON.parse(line)));
/** @param {unknown} error */
const missing = error => error instanceof Error && 'code' in error && error.code === 'ENOENT';
/** @template T @param {T[]} items @param {(item: T) => boolean} test */
const lastIndex = (items, test) => { for (let i = items.length - 1; i >= 0; i--) { const item = items[i]; if (item !== undefined && test(item)) return i; } return -1; };
/** @template T @param {T[]} items @param {(item: T) => boolean} test @returns {T | undefined} */
const findLast = (items, test) => items[lastIndex(items, test)];
const eventSchema = z.object({ seq: z.number(), type: z.string(), scope: z.object({ turnId: z.string().optional() }).optional(), data: z.object({ status: z.string().optional(), input: z.array(z.object({ type: z.string(), text: z.string().optional() })).optional() }).optional() });
/** @param {unknown} value */
const events = value => z.array(eventSchema).parse(value);
const textPart = z.object({ type: z.string(), text: z.string().optional() });
const entrySchema = z.object({ type: z.string().optional(), id: z.string().optional(), timestamp: z.string().optional(), message: z.object({ role: z.string().optional(), content: z.union([z.string(), z.array(textPart)]).optional(), provider: z.string().optional(), model: z.string().optional(), api: z.string().optional(), stopReason: z.string().optional(), timestamp: z.number().optional(), usage: z.unknown().optional() }).optional() });
const ownerStateSchema = z.object({ threadId: z.string().optional(), ownerPid: z.number(), updatedAt: z.string().optional(), ready: z.boolean().optional(), streaming: z.boolean().optional(), piPid: z.number().optional(), threads: z.record(z.string(), z.object({ ready: z.boolean().optional(), streaming: z.boolean().optional(), piPid: z.number().optional() })).optional() });
// Passive observations only. An owner hello is an exclusive BB view attachment,
// not a diagnostic read: using it here would detach the host being evaluated.
function passiveState() {
  const info = z.object({ model: z.object({ provider: z.string(), id: z.string(), api: z.string() }), thinking: z.string(), sessionId: z.string(), sessionFile: z.string() }).parse(readJson(join(root, 's/runtime-info', threadId + '.json')));
  const sessionParent = join(root, 'o/pi-sessions');
  assert.equal(dirname(info.sessionFile), sessionParent, 'private journal parent only');
  assert.equal(realpathSync(sessionParent), sessionParent, 'canonical journal parent');
  assert.ok(basename(info.sessionFile).endsWith(`_${info.sessionId}.jsonl`), 'native session filename');
  if (lstatSync(info.sessionFile, { throwIfNoEntry: false })) assert.equal(realpathSync(info.sessionFile), info.sessionFile, 'canonical journal only');
  const all = ownerStateSchema.parse(readJson(join(root, 's/owner/state.json')));
  const lane = all.threadId === threadId ? all : all.threads?.[threadId];
  assert.ok(lane?.ready, 'retained lane must be ready');
  assert.ok(lane.piPid, 'retained lane must name its Pi process');
  process.kill(all.ownerPid, 0); process.kill(lane.piPid, 0);
  const configured = z.object({ providers: z.object({ openai: z.object({ baseUrl: z.string().optional() }).optional() }).optional() }).parse(readJson(join(root, 's/pi-config/models.json')));
  let journalMessageCount = 0;
  try { journalMessageCount = jsonl(info.sessionFile, entrySchema).filter(e => e.type === 'message').length; }
  catch (error) { if (!missing(error)) throw error; }
  return { model: info.model, configuredBaseUrl: configured.providers?.openai?.baseUrl,
    thinkingLevel: info.thinking, sessionId: info.sessionId, sessionFile: info.sessionFile,
    ready: lane.ready, streaming: lane.streaming, journalMessageCount, ownerUpdatedAt: all.updatedAt,
    observation: 'Passive runtime-info + owner state + journal metadata. NOT native get_state. Native pending queue is not exposed or claimed.' };
}
const passiveSchema = z.object({ model: z.object({ provider: z.literal('openai'), id: z.literal('gpt-6.1-sol'), api: z.literal('openai-responses') }), configuredBaseUrl: z.literal('https://tom-cliproxy.exe.xyz/v1'), thinkingLevel: z.literal('high'), sessionId: z.string(), sessionFile: z.string(), ready: z.boolean(), streaming: z.boolean(), journalMessageCount: z.number(), ownerUpdatedAt: z.string(), observation: z.string() });
const threadSchema = z.object({ thread: z.object({ id: z.string(), status: z.string(), queuedMessageCount: z.number() }) });
const blockSchema = z.object({ working: z.boolean(), said: z.string(), words: z.string() });
/** @typedef {z.infer<typeof passiveSchema>} Passive @typedef {z.infer<typeof threadSchema>} Thread @typedef {z.infer<typeof eventSchema>} BBEvent */
/** @param {Passive} passive @param {Thread} thread */
const idle = (passive, thread) => passive.ready && !passive.streaming && thread.thread.status === 'idle' && thread.thread.queuedMessageCount === 0;
/** @param {Passive} passive @param {Thread} thread @param {BBEvent[]} log */
function readiness(passive, thread, log) {
  const active = new Set();
  for (const event of log) {
    if (event.type === 'turn/started') active.add(event.scope?.turnId);
    if (event.type === 'turn/completed') active.delete(event.scope?.turnId);
  }
  const last = findLast(log, e => e.type === 'turn/completed');
  const terminalError = thread.thread.status === 'error' && thread.thread.queuedMessageCount === 0 && last?.data?.status === 'failed' && active.size === 0 && passive.ready && !passive.streaming;
  return { allowed: active.size === 0 && (idle(passive, thread) || terminalError), path: terminalError ? 'normal-follow-up-from-terminal-error' : 'idle', bbStatus: thread.thread.status, bbQueue: thread.thread.queuedMessageCount, activeTurnIds: [...active], lastTurnStatus: last?.data?.status, limits: 'PID0 proves process existence only. Passive timestamp is not liveness or age proof. Native pending queue is unobserved; terminal error is NOT relabeled idle.' };
}
/** @type {CDP.Client | undefined} */
let client;
/** @type {((expression: string) => Promise<unknown>) | undefined} */
let evaluate;
// chrome-remote-interface has no per-command deadline; bound each command as the driver did.
/** @template T @param {Promise<T>} command @param {string} what @returns {Promise<T>} */
const bounded = (command, what) => Promise.race([command, sleep(5000, undefined, { ref: false }).then(() => { throw Error(`CDP ${what} timeout`); })]);
const manifest = { run, phase, case: fixture, send, started: new Date().toISOString(), plugin, root, origin, thread: threadId, review: 'Pending independent GPT qualitative judgment. Counts and instruction checks are not semantic quality verdicts.', boundary: 'Installed private BB in Chrome, not native Electron, not full-wire or independently built dist equivalence. Fixture-only observational extension.' };
try {
  save('input.json', fixture);
  /** @param {string[]} args @param {string} [cwd] */
  const git = (args, cwd = plugin) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8', timeout: 5000 });
    assert.equal(r.status, 0, 'git provenance read failed'); return r.stdout;
  };
  Object.assign(manifest, { sourceHead: git(['rev-parse', 'HEAD']).trim() });
  Object.assign(manifest, { driver: { path: realpathSync(import.meta.filename), sha256: hash(import.meta.filename), sourceHead: git(['rev-parse', 'HEAD'], driverPlugin).trim(), dirtyStatus: git(['status', '--short', '--', 'scripts/evaluate-presentation.mjs'], driverPlugin) } });
  // Runtime build identity is separate from the executing driver's source HEAD.
  // The stage's frozen build record maps these bytes/inputs to its compiled HEAD.
  const runtimeFiles = readdirSync(join(plugin, 'dist'), { recursive: true, encoding: 'utf8' }).filter(p => lstatSync(join(plugin, 'dist', p)).isFile()).map(p => 'dist/' + p);
  Object.assign(manifest, { runtimeIdentity: Object.fromEntries([...runtimeFiles, 'legacy/surface/src/presentation-guide.ts', 'legacy/surface/src/tool-contract.ts'].map(p => [p, hash(join(plugin, p))])) });
  const sourceScope = ['legacy/surface/src/presentation-guide.ts', 'legacy/surface/src/tool-contract.ts', 'test/context-loading-real.mjs', 'test/context-probe-extension.ts', 'test/presentation-capture.ts', 'test/presentation-cases.json', 'scripts/evaluate-presentation.mjs'];
  const dirtyStatus = git(['status', '--short', '--', ...sourceScope]);
  Object.assign(manifest, { sourceScope, generatedCandidateExcluded: '.scratch-gh214-candidate', dirtyStatus, clean: dirtyStatus === '' });
  save('source-diff.patch', git(['diff', '--binary', 'HEAD', '--', ...sourceScope]));
  const untracked = git(['ls-files', '--others', '--exclude-standard', '--', ...sourceScope]).trim().split('\n').filter(Boolean);
  save('untracked-source.json', Object.fromEntries(untracked.map(path => [path, readFileSync(join(plugin, path), 'utf8')])));
  /** @type {Record<string, string>} */
  const hashes = Object.fromEntries(['legacy/surface/src/presentation-guide.ts', 'legacy/surface/src/tool-contract.ts', 'test/presentation-capture.ts', 'test/presentation-cases.json', 'scripts/evaluate-presentation.mjs', 'dist/owner-service.js', 'dist/workspace-extension.js', 'dist/server.js', 'dist/app.js', 'dist/app.css'].map(p => [p, hash(join(plugin, p))]));
  Object.assign(manifest, { hashes });
  const installed = z.object({ resolved: z.string() }).parse(bb(['plugin', 'source', 'exosurface']));
  assert.equal(installed.resolved, `path:${plugin}`, 'installed source must match selected canonical root');
  save('installed-source.json', installed);
  const loadedObserver = { path: join(root, 'v/.pi/extensions/presentation-capture.ts'), sha256: hash(join(root, 'v/.pi/extensions/presentation-capture.ts')), repoSourceSha256: hash(join(driverPlugin, 'test/presentation-capture.ts')) };
  Object.assign(manifest, { loadedObserver });
  assert.equal(loadedObserver.sha256, loadedObserver.repoSourceSha256, 'loaded fixture source must match recorded observer');
  // Select only through the ordinary sidebar. Navigation is not proof of owner
  // readiness; all passive/model/load/BB guards below remain unchanged.
  const navigationBefore = events(bb(['thread', 'log', threadId]));
  const navigationCursor = Math.max(0, ...navigationBefore.map(e => e.seq));
  const endpoint = { host: new URL(cdp).hostname, port: Number(new URL(cdp).port) };
  const pages = await bounded(CDP.List(endpoint), 'target list');
  const page = pages.find(p => p.type === 'page' && p.url.startsWith(origin + '/plugins/exosurface/surface'));
  assert.ok(page, 'open the installed Exo tab in the private browser first');
  const cdpClient = await bounded(CDP({ ...endpoint, target: page }), 'open'); client = cdpClient;
  /** @param {string} expression */
  const evaluateIn = async expression => { const r = await bounded(cdpClient.Runtime.evaluate({ expression, returnByValue: true, awaitPromise: true }), 'Runtime.evaluate'); assert.ok(!r.exceptionDetails, JSON.stringify(r.exceptionDetails)); return z.unknown().parse(r.result.value); };
  evaluate = evaluateIn;
  /** @param {string} expression */
  const isTrue = async expression => z.boolean().parse(await evaluateIn(expression));
  await bounded(cdpClient.Emulation.setDeviceMetricsOverride({ width: 1288, height: 1000, deviceScaleFactor: 1, mobile: false }), 'Emulation.setDeviceMetricsOverride');
  const surfaces = z.object({ threads: z.array(z.object({ threadId: z.string(), title: z.string() })) }).parse(rpc('thread_list')).threads, target = surfaces.find(t => t.threadId === threadId); assert.ok(target);
  /** @param {string} expression */
  async function click(expression) {
    const point = z.object({ x: z.number(), y: z.number() }).parse(await evaluateIn(`(()=>{const e=${expression};if(!e)throw Error('Missing UI target');const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`));
    await bounded(cdpClient.Input.dispatchMouseEvent({ type: 'mousePressed', button: 'left', clickCount: 1, ...point }), 'Input.dispatchMouseEvent');
    await bounded(cdpClient.Input.dispatchMouseEvent({ type: 'mouseReleased', button: 'left', clickCount: 1, ...point }), 'Input.dispatchMouseEvent');
  }
  await click(`[...document.querySelectorAll('nav[aria-label="Surfaces"] button')].find(e=>e.textContent.trim()===${JSON.stringify(target.title)})`);
  assert.ok(await settled(() => isTrue(`document.querySelector('nav[aria-label="Surfaces"] button[aria-current="page"]')?.textContent.trim()===${JSON.stringify(target.title)} && !!document.querySelector('form[aria-label="Message Exo"] textarea:not(:disabled)')`), 10000, 100), 'intended surface must be current and ready');
  const navigationEvents = events(bb(['thread', 'log', threadId])).filter(e => e.seq > navigationCursor);
  save('navigation-events.json', { cursor: navigationCursor, events: navigationEvents });
  assert.ok(!navigationEvents.some(e => ['client/turn/requested', 'turn/started', 'turn/input/accepted'].includes(e.type)), 'surface selection must not request or accept a turn');
  const choice = z.object({ provider: z.literal('openai'), model: z.literal('gpt-6.1-sol'), thinking: z.literal('high') });
  const config = z.object({ namer: choice }).parse(readJson(join(root, 'h/.config/exo/exosurface.json')));
  // Overview caches the thread list for60s and can omit a newly created target.
  // Require the exact target's existing public workspace readiness instead.
  const workspaceBefore = z.object({ threadId: z.string(), ready: z.boolean() }).parse(rpc('workspace', { deployment: 'main', threadId, cursor: null }));
  assert.equal(workspaceBefore.threadId, threadId, 'workspace must identify the intended target');
  assert.ok(workspaceBefore.ready, 'target retained owner must be ready');
  const targetBinding = z.object({ runtimeKind: z.literal('canonical'), profile: z.string().regex(/^[a-z0-9_-]+$/), sessionFile: z.string() }).parse(readJson(join(root, 's/bindings', threadId + '.json')));
  const profile = targetBinding.profile;
  save('target-ready-source.json', { source: 'exact public workspace plus canonical binding, not cached overview membership', threadId: workspaceBefore.threadId, ready: workspaceBefore.ready, ...targetBinding });
  const roles = z.object({ compactor: choice, subagent: choice }).parse(readJson(join(root, 'o/profiles', profile, 'config.json')));
  save('model-role-metadata.json', { profile, namer: config.namer, ...roles });
  const authResult = spawnSync(process.execPath, [...PARENT_WATCH, join(plugin, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js'), 'auth', 'check', '--provider', 'openai', '--json', '--no-refresh'], { env: { ...env, PI_CODING_AGENT_DIR: join(root, 's/pi-config') }, encoding: 'utf8', timeout: 10000 });
  assert.equal(authResult.status, 0, 'supported no-refresh auth readiness failed');
  const ready = z.object({ status: z.literal('ready'), provider: z.literal('openai'), authType: z.string() }).parse(JSON.parse(authResult.stdout));
  save('auth-readiness-metadata.json', ready);
  const before = passiveSchema.parse(passiveState());
  assert.equal(targetBinding.sessionFile, before.sessionFile, 'binding and passive runtime must identify the same journal');
  assert.equal(z.object({ boundProfile: z.string() }).parse(readJson(join(root, 's/runtime-info', threadId + '.json'))).boundProfile, profile, 'binding and native runtime must identify the same profile');
  if (expectedSession) assert.equal(before.sessionId, expectedSession, 'expected original session');
  const threadBefore = threadSchema.parse(bb(['thread', 'show', threadId]));
  const eventsBefore = events(bb(['thread', 'log', threadId]));
  const readyBefore = readiness(before, threadBefore, eventsBefore);
  save('readiness-before.json', readyBefore);
  assert.ok(readyBefore.allowed, 'BB must be idle or terminal-failed/queue0/no-active-turn with passive ready/nonstreaming');
  const sessionParent = join(root, 'o/pi-sessions');
  assert.equal(dirname(before.sessionFile), sessionParent, 'private native journal parent only');
  assert.equal(realpathSync(sessionParent), sessionParent, 'journal parent must not traverse a symlink');
  assert.ok(basename(before.sessionFile).endsWith(`_${before.sessionId}.jsonl`), 'journal filename must identify the native session');
  const journalBefore = lstatSync(before.sessionFile, { throwIfNoEntry: false });
  const freshUnpersisted = !journalBefore && before.journalMessageCount === 0;
  if (journalBefore) assert.equal(realpathSync(before.sessionFile), before.sessionFile, 'journal must not traverse a symlink');
  else assert.ok(freshUnpersisted, 'only an exact fresh journalMessageCount0 native session may lack a journal');
  const loadRecords = jsonl(join(root, 'v/presentation-capture-loaded.jsonl'), z.object({ sessionId: z.string() }));
  assert.ok(loadRecords.some(r => r.sessionId === before.sessionId), 'fixture request observer must actually be loaded');
  save('passive-before.json', before); save('thread-before.json', threadBefore); save('observer-load.json', loadRecords.filter(r => r.sessionId === before.sessionId));
  Object.assign(manifest, { context: { sessionId: before.sessionId, journalMessageCountBefore: before.journalMessageCount, profile,
    profileInstructionsSha256: hash(join(root, 'o/profiles', profile, 'AGENTS.md')),
    journalPersistedBefore: !freshUnpersisted,
    scope: 'Full actual retained-owner context preserved; no truncation, reset or replacement. Separate named surfaces have distinct sessions; reused surfaces retain their earlier turns. Compare native-before counts, public workspace and profile instruction hashes between phases; no identical-context claim.' } });
  save('workspace-before.json', workspaceBefore);
  const originalRequest = captureExisting ? findLast(eventsBefore, e => e.type === 'client/turn/requested' && (e.data?.input?.some(i => i.type === 'text' && i.text === fixture.prompt) ?? false)) : undefined;
  if (captureExisting) assert.ok(originalRequest, 'existing original public case request required');
  const lastSequence = originalRequest ? originalRequest.seq - 1 : Math.max(0, ...eventsBefore.map(e => e.seq));
  save('event-cursor-before.json', { lastSequence });
  const beforeEntries = freshUnpersisted ? [] : jsonl(before.sessionFile, entrySchema);
  /** @param {z.infer<typeof entrySchema>} r */
  const userText = r => { const content = r.message?.content; return typeof content === 'string' ? content : content?.filter(p => p.type === 'text').map(p => p.text).join('\n'); };
  const originalUserIndex = captureExisting ? lastIndex(beforeEntries, r => r.message?.role === 'user' && (userText(r)?.includes(fixture.prompt) ?? false)) : -1;
  if (captureExisting) assert.ok(originalUserIndex >= 0, 'existing original native user entry required');
  const captureSince = originalUserIndex >= 0 ? beforeEntries[originalUserIndex]?.message?.timestamp ?? 0 : 0;
  const prior = originalUserIndex >= 0 ? originalUserIndex : beforeEntries.length;
  const hookFile = join(root, 'v/presentation-requests.jsonl');
  // Strict: every observer field is kept, so delivered-presentation.json carries the delivered instructions.
  const requestSchema = z.strictObject({ at: z.string(), provider: z.string().optional(), model: z.string().optional(), api: z.string().optional(), thinking: z.string().optional(), sessionId: z.string(),
    presentation: z.array(z.strictObject({ header: z.string().nullable(), guide: z.string() })), reminders: z.array(z.string()),
    tools: z.array(z.strictObject({ name: z.string(), description: z.string().optional() })) });
  let hookBefore = 0; try { hookBefore = jsonl(hookFile, requestSchema).length; } catch (e) { if (!missing(e)) throw e; }
  const urls = z.array(z.string()).parse(await evaluateIn('performance.getEntriesByType("resource").map(e=>e.name).filter(x=>x.includes("/plugin-app-assets/"))'));
  /** @type {Record<string, unknown>} */
  const served = {};
  /** @type {unknown[]} */
  const observed = [];
  for (const name of ['app.js', 'app.css']) {
    for (const url of [...new Set(urls)].filter(u => new URL(u).pathname.endsWith('/' + name))) {
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) }); assert.ok(response.ok);
      const bytes = Buffer.from(await response.arrayBuffer()), digest = createHash('sha256').update(bytes).digest('hex');
      // BB serves a host-tailwind transformed stylesheet to the browser. Compare
      // the canonical plugin asset with dist, and retain BOTH response identities;
      // never label the transformed browser CSS byte-equal to raw plugin CSS.
      const canonical = new URL(url); canonical.searchParams.delete('host-tailwind');
      assert.equal(canonical.search, '', 'unrecognized asset query transformation');
      const rawResponse = await fetch(canonical, { signal: AbortSignal.timeout(5000) }); assert.ok(rawResponse.ok);
      const raw = Buffer.from(await rawResponse.arrayBuffer()), rawDigest = createHash('sha256').update(raw).digest('hex');
      const identity = { canonical: { url: canonical.href, bytes: raw.length, sha256: rawDigest }, browser: { url, bytes: bytes.length, sha256: digest }, browserByteEqualDist: digest === hashes['dist/' + name] };
      observed.push(identity);
      if (rawDigest === hashes['dist/' + name]) served[name] = identity;
    }
    if (!served[name]) { save('observed-assets-failed.json', observed); throw Error(`no canonical served ${name} matches this worktree`); }
  }
  save('served-assets.json', served);
  if (send) {
    await click('document.querySelector(\'form[aria-label="Message Exo"] textarea:not(:disabled)\')');
    assert.equal(await evaluateIn('document.querySelector(\'form[aria-label="Message Exo"] textarea\').value'), '', 'do not overwrite a draft');
    await bounded(cdpClient.Input.insertText({ text: fixture.prompt }), 'Input.insertText');
    await click('[...document.querySelectorAll("button")].find(e=>e.textContent.trim()==="Send"&&!e.disabled)');
    const complete = await settled(() => {
      const native = passiveSchema.parse(passiveState()), thread = threadSchema.parse(bb(['thread', 'show', threadId])), block = blockSchema.parse(rpc('exo_block', { threadId }));
      if (thread.thread.status === 'error') { save('failed-public-events.json', events(bb(['thread', 'log', threadId])).filter(e => e.seq > lastSequence)); throw Error('BB reported failed turn; see failed-public-events.json'); }
      return native.sessionId === before.sessionId && native.journalMessageCount > before.journalMessageCount && idle(native, thread) && !block.working && block.said === fixture.prompt;
    }, turnTimeout, 500);
    assert.ok(complete, 'current turn did not settle in passive owner and BB/public Exo block');
  }
  const block = blockSchema.parse(rpc('exo_block', { threadId })); save('public-block.json', block);
  if (capturesResponse) {
    assert.equal(block.said, fixture.prompt, 'captured response must be the original case prompt');
    assert.ok(!block.working, 'never label a working screenshot settled');
    // HTML paragraph layout changes whitespace in textContent. Compare the
    // browser's visible text with whitespace normalized, not Markdown source bytes.
    /** @param {string} text */
    const visibleWords = text => text.trim().split(/\s+/).join(' ');
    assert.ok(await settled(async () => visibleWords(z.string().parse(await evaluateIn('document.querySelector("[data-exo-reply]")?.innerText ?? ""'))) === visibleWords(block.words), 10000, 100), 'rendered reply must match settled public reply');
  }
  const after = passiveSchema.parse(passiveState()), threadAfter = threadSchema.parse(bb(['thread', 'show', threadId]));
  if (capturesResponse) assert.ok(idle(after, threadAfter), 'successful submitted turn must finish idle');
  else {
    assert.equal(threadAfter.thread.status, threadBefore.thread.status, 'no-send preflight must not change the BB state');
    assert.ok(readiness(after, threadAfter, events(bb(['thread', 'log', threadId]))).allowed, 'stable passive BB readiness');
  }
  save('passive-after.json', after);
  assert.equal(after.sessionId, before.sessionId, 'same native session after capture');
  assert.equal(after.sessionFile, before.sessionFile, 'same native journal path after capture');
  const stillUnpersisted = !send && freshUnpersisted && !lstatSync(after.sessionFile, { throwIfNoEntry: false });
  if (!stillUnpersisted) assert.equal(realpathSync(after.sessionFile), after.sessionFile, 'persisted journal must remain canonical');
  const entries = stillUnpersisted ? [] : jsonl(after.sessionFile, entrySchema).slice(prior);
  const metadata = entries.flatMap(r => r.message?.role === 'assistant' ? [{ id: r.id, provider: r.message.provider, model: r.message.model, api: r.message.api, stopReason: r.message.stopReason, timestamp: r.message.timestamp, recordedAt: r.timestamp, usage: r.message.usage }] : []);
  if (capturesResponse) { assert.ok(metadata.length && metadata.at(-1)?.stopReason === 'stop', 'completed actual assistant required'); for (const m of metadata) assert.ok(m.provider === 'openai' && m.model === 'gpt-6.1-sol' && m.api === 'openai-responses', 'actual assistant metadata must be GPT-only'); }
  save('assistant-metadata.json', metadata);
  const eventsAfter = events(bb(['thread', 'log', threadId])).filter(e => e.seq > lastSequence);
  save('accepted-turn-events.json', eventsAfter);
  if (!capturesResponse) assert.ok(!eventsAfter.some(e => ['client/turn/requested', 'turn/started', 'turn/input/accepted'].includes(e.type)), 'no-send preflight must not initiate or accept a turn');
  if (capturesResponse) {
    const completed = findLast(eventsAfter, e => e.type === 'turn/completed');
    assert.ok(completed?.data?.status === 'completed', 'current public BB turn must complete');
    assert.ok(eventsAfter.some(e => e.type === 'turn/input/accepted' && e.scope?.turnId === completed.scope?.turnId), 'current public BB turn must accept input');
  }
  const requests = jsonl(hookFile, requestSchema).slice(captureExisting ? 0 : hookBefore).filter(r => r.sessionId === after.sessionId && (!captureSince || Date.parse(r.at) >= captureSince));
  if (capturesResponse) assert.ok(requests.length && requests.every(r => r.sessionId === after.sessionId && r.provider === 'openai' && r.model === 'gpt-6.1-sol' && r.thinking === 'high' && r.presentation.length > 0 && r.tools.length > 0), 'matching actual observational request required');
  save('delivered-presentation.json', requests);
  save('visible.txt', await evaluateIn('document.body.innerText'));
  const dimensions = z.object({ height: z.number(), total: z.number() }).parse(await evaluateIn('(()=>{const e=document.querySelector("main.exo-canvas");return {height:e.clientHeight,total:e.scrollHeight}})()'));
  /** @type {number[]} */
  const captured = [];
  Object.assign(manifest, { scroll: { ...dimensions, captured } });
  for (let top = 0, index = 0; top < dimensions.total && index < 5; top += Math.max(100, dimensions.height - 100), index++) {
    await evaluateIn(`document.querySelector("main.exo-canvas").scrollTo({top:${String(top)},behavior:"instant"})`);
    const shot = await bounded(cdpClient.Page.captureScreenshot({ format: 'png', captureBeyondViewport: false }), 'Page.captureScreenshot');
    writeFileSync(join(output, `${capturesResponse ? 'settled' : 'preflight'}-${String(index)}.png`), Buffer.from(shot.data, 'base64'), { flag: 'wx' }); captured.push(top);
  }
  await evaluateIn('document.querySelector("main.exo-canvas").scrollTo({top:0,behavior:"instant"})');
  Object.assign(manifest, { captureKind: captureExisting ? 'existing-original-completed-turn-no-send' : send ? 'completed-current-turn' : 'no-send-preflight-not-response-evidence' });
  if (captureExisting) Object.assign(manifest, { captureNote: 'Original accepted turn retained after earlier evaluator failure. No resend. Read recordedAt/request timestamps for deadline overrun; this run is capture time, not model duration.' });
  Object.assign(manifest, { completed: new Date().toISOString() }); save('manifest.json', manifest);
  console.log(JSON.stringify({ run, output, case: fixture.id, phase, send, result: 'captured; independent qualitative review pending' }));
} catch (error) {
  save('failure.json', { at: new Date().toISOString(), error: String(error), manifest });
  if (evaluate && client) try { save('attempt-visible.txt', await evaluate('document.body.innerText')); const shot = await bounded(client.Page.captureScreenshot({ format: 'png' }), 'Page.captureScreenshot'); writeFileSync(join(output, 'attempt.png'), Buffer.from(shot.data, 'base64'), { flag: 'wx' }); } catch { /* best-effort attempt capture */ }
  throw error;
} finally { await client?.close(); }

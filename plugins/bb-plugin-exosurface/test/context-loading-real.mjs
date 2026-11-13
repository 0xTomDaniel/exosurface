// Real retained-owner context-loading proof in a disposable fixture.
// Real: setup journal/profile API (OptChat 0.8.6), Pi 1.1.0 CLI, dist/owner-service.js launch.
// Substituted: BB native thread API (mock), and in phase 2 only the model provider
// (a local test provider that records marker offsets; no network, no inference).
// Usage (from the plugin dir, after build.mjs + build-runtime.mjs):
//   env -i HOME=$ROOT/h EXO_CONFIG=$ROOT/c.json PATH=$(dirname $(command -v node)):/usr/bin:/bin \
//     node --experimental-transform-types test/context-loading-real.mjs <root> <real pi cli.js> <real optchat dir> [shadow|ancestor]
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { createConnection } from 'node:net';
import { join, resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const plugin = resolve('.');
const [rootArg, piCli, optchat, variant] = process.argv.slice(2);
const root = realpathSync(rootArg), shadow = variant === 'shadow', ancestor = variant === 'ancestor';
assert.equal(process.env["HOME"], join(root, 'h')); assert.equal(process.env["EXO_CONFIG"], join(root, 'c.json'));
assert.ok(!Object.keys(process.env).some(k => /KEY|TOKEN|SECRET/i.test(k)), 'fixture env must carry no credentials');
const M = { vaultAgents: 'CTXFX_VAULT_AGENTS_MD_41', vaultSkill: 'CTXFX_VAULT_SKILL_DESC_41', homeSkill: 'CTXFX_HOME_SKILL_DESC_41', shadowSkill: 'CTXFX_SHADOW_EXOSURFACE_41', ancestorAgents: 'CTXFX_ANCESTOR_AGENTS_MD_41', ancestorSkill: 'CTXFX_ANCESTOR_SKILL_DESC_41', exosurfaceSkill: 'Reference for composing Exosurface pages', profile: 'This is the exo-optchat profile.', vaultHeading: 'Exocortex Agent Instructions', optchatMaster: 'You are OptChat', exosurfaceGuide: 'Exosurface: the surface beside this chat', optchatImport: 'Entries marked Historical are imported records' };
const vault = join(root, 'v'), home = join(root, 's'), optchatHome = join(root, 'o');
const skill = (dir, name, desc) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: ${desc}\n---\n\n# ${name}\n\nGeneric fixture skill. Do nothing.\n`); };
mkdirSync(vault, { recursive: true });
writeFileSync(join(vault, 'AGENTS.md'), `# ${M.vaultHeading} (generic fixture)\n\nFixture workspace instructions ${M.vaultAgents}. Generic test text only.\n`);
skill(join(vault, '.agents/skills/ctxfx-vault-skill'), 'ctxfx-vault-skill', `Fixture vault skill ${M.vaultSkill}.`);
skill(join(root, 'h/.agents/skills/ctxfx-home-skill'), 'ctxfx-home-skill', `Fixture user-home skill ${M.homeSkill}.`);
if (ancestor) { writeFileSync(join(root, 'AGENTS.md'), `Fixture parent-directory instructions ${M.ancestorAgents}.\n`); skill(join(root, '.agents/skills/ctxfx-ancestor-skill'), 'ctxfx-ancestor-skill', `Fixture parent-directory skill ${M.ancestorSkill}.`); }
if (shadow) skill(join(vault, '.agents/skills/exosurface'), 'exosurface', `Fixture workspace copy named exosurface ${M.shadowSkill}.`);

// ---- Phase 0: real setup journal with mocked BB thread API only.
const { canonicalSystemPorts, canonicalBBNativeAdapter } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-system.ts')));
const { canonicalSetup } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/canonical-setup.ts')));
const threadId = 'ctxfx-native-thread', projectId = 'ctxfx-project';
const threads = { async spawn(args) { assert.equal(args.environment.workspace.path, vault); return { id: threadId }; }, async get() { return { id: threadId, providerId: 'exo-spike', projectId }; } };
const ports = canonicalSystemPorts({ localConfig: process.env["EXO_CONFIG"], runtimeRoot: plugin, node: process.execPath, native: canonicalBBNativeAdapter(threads, true), ownerLabel: 'app.exosurface.owner.ctxfx' });
const request = { operationId: 'ctxfx-operation-1', projectId, home, optchatHome, profile: 'exo-optchat', vault, piCli, optchat, authorizeInitialization: true };
const setup = await canonicalSetup(request, ports);
assert.equal(setup.stage, 'bound');
const profileAgents = readFileSync(join(optchatHome, 'profiles/exo-optchat/AGENTS.md'), 'utf8');

// ---- Phase 1: the unmodified retained owner, launched as documented.
const env = { HOME: join(root, 'h'), TMPDIR: join(root, 't'), PATH: process.env["PATH"], EXO_CONFIG: process.env["EXO_CONFIG"] };
mkdirSync(env.TMPDIR, { recursive: true });
const record = join(root, 'spawns.jsonl');
const owner = spawn(process.execPath, ['--import', pathToFileURL(join(plugin, 'test/spawn-recorder.mjs')).href, join(plugin, 'dist/owner-service.js')], { env: { ...env, EXO_SPAWN_RECORD: record }, stdio: ['ignore', 'ignore', 'pipe'] });
let ownerErr = ''; owner.stderr.on('data', d => { ownerErr += d; });
const stateFile = join(home, 'owner/state.json');
let state;
for (const end = Date.now() + 30000; Date.now() < end;) { await sleep(500); if (existsSync(stateFile)) { state = JSON.parse(readFileSync(stateFile, 'utf8')); if (state.ready || state.error) break; } }
assert.ok(state?.ready, 'owner not ready: ' + (state?.error ?? 'no state') + ' ' + ownerErr.slice(0, 400));
const spawned = readFileSync(record, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.args?.[0] === piCli);
assert.equal(spawned.length, 1, 'exactly one Pi launch by the owner');
const piArgv = [spawned[0].command, ...spawned[0].args], piCwd = spawned[0].cwd, piEnvObj = spawned[0].env;
const envKeys = Object.keys(piEnvObj);
const envVal = k => piEnvObj[k];
const rpc = (type, fields = {}) => new Promise((ok, fail) => {
  const s = createConnection(join(home, 'owner/rpc.sock')); let buf = ''; const timer = setTimeout(() => { s.destroy(); fail(Error('owner rpc timeout')); }, 5000);
  s.on('data', d => { buf += d; for (const line of buf.split('\n').slice(0, -1)) { const m = JSON.parse(line); if (m.id === 'probe-2') { clearTimeout(timer); s.destroy(); m.ok ? ok(m.data) : fail(Error(m.error)); } } });
  s.on('connect', () => { s.write(JSON.stringify({ id: 'probe-1', type: 'hello', threadId }) + '\n'); s.write(JSON.stringify({ id: 'probe-2', type, ...fields }) + '\n'); });
  s.on('error', fail);
});
const commands = (await rpc('get_commands')).commands.filter(c => c.source === 'skill').map(c => ({ name: c.name, path: c.sourceInfo?.path, scope: c.sourceInfo?.scope }));
const info = JSON.parse(readFileSync(join(home, 'runtime-info', `${threadId}.json`), 'utf8'));
owner.kill('SIGTERM'); await new Promise(r => owner.once('close', r));

// ---- Phase 2: the owner's exact Pi argv/env/cwd (read back from the process); only the provider swapped to a local recorder.
assert.equal(piArgv[1], piCli); assert.deepEqual(piArgv.slice(2, 4), ['--mode', 'rpc']);
assert.equal(piCwd, vault);
const launch = { args: piArgv.slice(4), env: piEnvObj };
const args = [...launch.args];
args[args.indexOf('--provider') + 1] = 'exo-context-probe'; args[args.indexOf('--model') + 1] = 'probe'; args[args.indexOf('--thinking') + 1] = 'off';
args.unshift('-e', join(plugin, 'test/context-probe-extension.ts'));
const out = join(root, 'probe.json');
const { PiRpc } = await import(pathToFileURL(join(plugin, 'legacy/primary/src/pi-rpc.ts')));
let settled; const done = new Promise(r => { settled = r; });
const pi = new PiRpc(piCli, args, vault, { ...launch.env, EXO_CONTEXT_PROBE_OUT: out, EXO_CONTEXT_PROBE_AUTH: 'local-probe-placeholder', EXO_CONTEXT_PROBE_MARKERS: Object.values(M).join(',') }, e => { if (e.type === 'agent_settled' || e.type === 'agent_end') settled(); }, () => {});
await pi.send('get_state');
await pi.send('prompt', { message: 'CONTEXT_PROBE fixture turn' });
await Promise.race([done, sleep(20000)]);
await pi.close();
const probe = JSON.parse(readFileSync(out, 'utf8'));

const result = {
  variant: variant ?? 'plain', ownerReady: state.ready,
  ownerPiArgv: piArgv.slice(2).map(a => a.startsWith(root) ? '$ROOT' + a.slice(root.length) : a.startsWith(plugin) ? '$PLUGIN' + a.slice(plugin.length) : a.startsWith(optchat) ? '$OPTCHAT' + a.slice(optchat.length) : a),
  ownerLaunch: { spawnCwd: piCwd, cwd: info.cwd, projectTrusted: info.projectTrusted, boundProfile: info.boundProfile, hasVaultInstructionsDiagnostic: info.hasVaultInstructions, model: info.model,
    skills: info.skills, envKeys: envKeys.sort(), TMPDIR: envVal('TMPDIR'), EXOSURFACE_HOME: envVal('EXOSURFACE_HOME'), HOME: envVal('HOME'), PI_CODING_AGENT_DIR: envVal('PI_CODING_AGENT_DIR'), OPTCHAT_HOME: envVal('OPTCHAT_HOME'), credentialKeys: envKeys.filter(k => /KEY|TOKEN|SECRET/i.test(k)) },
  ownerGetCommandsSkills: commands,
  profileAgentsIsGeneric: profileAgents.includes(M.profile), profileAgentsBytes: profileAgents.length,
  basePrompt: probe.base, modelRequestPrompt: probe.request,
};
console.log(JSON.stringify(result, null, 2));

// Regression expectations (documented in docs/release/first-run.md#what-the-retained-owner-loads).
const req = probe.request.offsets, has = k => req[M[k]] >= 0;
assert.equal(piCwd, vault); assert.equal(info.projectTrusted, true); assert.equal(info.boundProfile, 'exo-optchat');
assert.deepEqual(result.ownerLaunch.credentialKeys, []);
for (const k of ['HOME', 'TMPDIR', 'PI_CODING_AGENT_DIR', 'OPTCHAT_HOME', 'EXOSURFACE_HOME']) assert.ok(envVal(k).startsWith(root + '/'), `${k} must stay inside the fixture`);
assert.ok(!envKeys.some(k => /^(NODE_OPTIONS|EXO_CONFIG|EXO_SPAWN_RECORD)$/.test(k)), 'owner-only variables must not reach Pi');
for (const k of ['optchatMaster', 'vaultAgents', 'vaultSkill', 'homeSkill', 'exosurfaceGuide', 'profile', 'optchatImport']) assert.ok(has(k), `${k} missing from model request`);
assert.ok(req[M.optchatMaster] < req[M.vaultAgents] && req[M.vaultAgents] < req[M.profile], 'order: OptChat preamble, workspace AGENTS.md, profile AGENTS.md');
assert.equal(has('exosurfaceSkill'), !shadow, 'packaged exosurface skill present unless shadowed');
assert.equal(has('shadowSkill'), shadow);
assert.equal(has('ancestorAgents') && has('ancestorSkill'), ancestor);
const exo = commands.filter(c => c.name === 'skill:exosurface');
assert.equal(exo.length, 1); assert.equal(exo[0].scope, shadow ? 'project' : 'temporary');
console.log('CONTEXT_LOADING_OK', variant ?? 'plain');

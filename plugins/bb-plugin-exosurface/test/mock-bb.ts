// Mock-BB harness on the LIVE entry points (#67), shared by test/parallel-threads.test.ts and demo/surfaces.
// Real: package.json bb.server (server.ts) RPC handlers, bb.host (host.ts) provider bridge as a child process on JSON-RPC
// stdio, the release owner (legacy/primary/release-owner.ts) as its own process, and a fresh canonical install made by the
// real canonicalSetup. Fake only at the boundaries: BB (sdk + JSON-RPC peer), Pi (JSONL RPC, OptChat lock socket and the
// live.js runtime-info file), OptChat's profile API module, and setup's native ports (as test/canonical-setup.test.ts).
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';

export const PLUGIN = resolve(import.meta.dirname, '..');
export const INSTRUCTIONS = '# Exo\n\nThe one Exo instructions source.\n';
const PROFILE = 'exo-optchat';

// OptChat 0.8.6 profile API surface used by src/optchat-init.ts (profilePath, createProfile, loadConfig, saveConfig, instructions).
const FAKE_PROFILES = `import{existsSync,mkdirSync,readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
export const profilePath=n=>{if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(n))throw Error('bad profile name');return join(process.env.OPTCHAT_HOME,'profiles',n);};
export function createProfile(n){const d=profilePath(n);if(existsSync(d))throw Error('Profile already exists: '+n);mkdirSync(d,{recursive:true});saveConfig(d,{compactor:{provider:'x',model:'default',thinking:'low'},subagent:{provider:'x',model:'default',thinking:'low'}});writeFileSync(join(d,'AGENTS.md'),'# '+n+' default\\n');}
export const loadConfig=d=>JSON.parse(readFileSync(join(d,'config.json'),'utf8'));
export const saveConfig=(d,c)=>writeFileSync(join(d,'config.json'),JSON.stringify(c));
export const instructions=d=>readFileSync(join(d,'AGENTS.md'),'utf8');`;

// Pi 1.1 RPC shape with OptChat's one-Pi-per-profile lock and live.js's runtime-info file. A prompt containing "together"
// is answered only once another profile's turn is running too: a refused or queued second turn leaves the first unanswered.
const FAKE_PI = `import{createInterface}from'node:readline';import{createServer}from'node:net';import{appendFileSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';import{randomUUID}from'node:crypto';
const arg=f=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:undefined,profile=arg('--optchat-profile'),home=process.env.OPTCHAT_HOME,dir=join(home,'profiles',profile),turns=join(home,'turns');
const sessionId=randomUUID(),sessionFile=arg('--session')??join(arg('--session-dir'),sessionId+'.jsonl');
if(!existsSync(sessionFile)){mkdirSync(arg('--session-dir'),{recursive:true});writeFileSync(sessionFile,JSON.stringify({type:'session',id:sessionId})+'\\n');}
let model={provider:arg('--provider'),id:arg('--model')},thinkingLevel=arg('--thinking'),streaming=false;mkdirSync(turns,{recursive:true});
writeFileSync(process.env.EXO_BB_INFO_FILE,JSON.stringify({boundProfile:profile,sessionFile}));
appendFileSync(join(home,'pi-runs.jsonl'),JSON.stringify({pid:process.pid,profile,cwd:process.cwd(),model:model.provider+'/'+model.id+'/'+thinkingLevel,instructions:readFileSync(join(dir,'AGENTS.md'),'utf8'),pageExtensions:process.argv.some(a=>a.endsWith('workspace-extension.js')),sessionFile})+'\\n');
const lock=createServer(s=>s.end(profile+' · PID '+process.pid+' · fixture'));await new Promise(r=>lock.listen(join(dir,'lock.sock'),r));
const out=x=>console.log(JSON.stringify(x)),ok=(r,data={})=>out({type:'response',id:r.id,command:r.type,success:true,data});
for await(const line of createInterface({input:process.stdin})){const r=JSON.parse(line);
 if(r.type==='get_state'){ok(r,{sessionFile,sessionId,isStreaming:streaming,isCompacting:false,pendingMessageCount:0,model,thinkingLevel});continue;}
 if(r.type==='get_commands'){ok(r,{commands:[]});continue;}
 if(r.type==='set_model'){model={provider:r.provider,id:r.modelId};ok(r);continue;}
 if(r.type==='set_thinking_level'){thinkingLevel=r.level;ok(r);continue;}
 if(r.type!=='prompt'){ok(r);continue;}
 ok(r,{disposition:'started'});streaming=true;out({type:'agent_start'});
 if(r.message.includes('together')){writeFileSync(join(turns,profile),'');for(let i=0;i<100&&readdirSync(turns).length<2;i++)await new Promise(z=>setTimeout(z,50));}
 const text=(r.message.includes('together')&&readdirSync(turns).length<2?'ALONE: ':'Exo ('+profile+'): ')+r.message;
 out({type:'message_start',message:{role:'assistant',content:[]}});out({type:'message_update',assistantMessageEvent:{type:'text_delta',delta:text}});
 const message={role:'assistant',content:[{type:'text',text}],stopReason:'stop'};appendFileSync(sessionFile,JSON.stringify({type:'message',message})+'\\n');
 out({type:'message_end',message});out({type:'agent_end'});streaming=false;out({type:'agent_settled'});}
lock.close();`;

/** A fresh canonical install (primary thread `primary`), made by the real canonicalSetup, plus local config. Sets EXO_CONFIG. */
export async function liveFixture({ surfaceMain = existsSync(join(PLUGIN, 'dist', 'workspace-extension.js')) } = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'exo-live-')));
  const home = join(root, 's'), optchatHome = join(root, 'o'), vault = join(root, 'v'), optchat = join(root, 'optchat'), piCli = join(root, 'pi.mjs');
  mkdirSync(vault); writeFileSync(join(vault, 'AGENTS.md'), '# Vault\n');
  mkdirSync(join(optchat, 'src'), { recursive: true }); writeFileSync(join(optchat, 'src', 'profiles.ts'), FAKE_PROFILES); writeFileSync(piCli, FAKE_PI);
  const config = join(root, 'exosurface.json');
  writeFileSync(config, JSON.stringify({ ownerLabel: 'fixture.owner', primaryStateDir: home, primaryOptchatHome: optchatHome, primaryProfile: PROFILE, primaryAgentDir: join(home, 'pi-config'), vault, optchat, piCli, ...(surfaceMain ? {} : { surfaceMain: 'off' }) }));
  process.env.EXO_CONFIG = config; // legacy/primary reads its local config once, at import.
  const { canonicalSetup } = await import(pathToFileURL(join(PLUGIN, 'legacy/primary/src/canonical-setup.ts')).href);
  const { INITIALIZATION } = await import(pathToFileURL(join(PLUGIN, 'legacy/primary/src/canonical-fresh.ts')).href);
  const { consumeCanonicalInitialization, initializationControl } = await import(pathToFileURL(join(PLUGIN, 'legacy/primary/src/canonical-control.ts')).href);
  const request = { operationId: 'fixture-operation', authorizeInitialization: true, home, optchatHome, profile: PROFILE, vault, piCli, optchat, projectId: 'project' };
  await canonicalSetup(request, {
    nativeDispatchAllowed: true,
    async configureLocal() { for (const d of ['pi-config', 'setup-home', 'setup-tmp']) mkdirSync(join(home, d), { recursive: true }); },
    async createProfile() { const d = join(optchatHome, 'profiles', PROFILE); mkdirSync(d, { recursive: true }); writeFileSync(join(d, 'config.json'), JSON.stringify({ compactor: { provider: 'fixture', model: 'compactor', thinking: 'low' }, subagent: { provider: 'fixture', model: 'subagent', thinking: 'high' } })); writeFileSync(join(d, 'AGENTS.md'), INSTRUCTIONS); },
    async validateProfile() {},
    async initializeSession() { const id = 'primary-session', file = join(optchatHome, 'pi-sessions', `${id}.jsonl`); mkdirSync(join(optchatHome, 'pi-sessions'), { recursive: true }); if (!existsSync(file)) writeFileSync(file, [{ type: 'session', id }, { type: 'message', message: { role: 'user', content: [{ type: 'text', text: INITIALIZATION }] } }, { type: 'custom', customType: 'optchat.profile', data: { name: PROFILE } }].map(e => JSON.stringify(e)).join('\n') + '\n'); return { id, file }; },
    async spawnThread(r: { home: string; operationId: string }) { consumeCanonicalInitialization(r.home, 'primary', [{ type: 'text', text: initializationControl(r.operationId) }]); return { id: 'primary' }; },
    async verifyThread() {},
  });
  return { root, home, optchatHome, vault, config, piRuns: () => existsSync(join(optchatHome, 'pi-runs.jsonl')) ? readFileSync(join(optchatHome, 'pi-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] };
}
type Fixture = Awaited<ReturnType<typeof liveFixture>>;

const childEnv = (f: Fixture) => ({ EXO_CONFIG: f.config, HOME: f.root, TMPDIR: f.root, PATH: process.env.PATH ?? '/usr/bin:/bin' });

/** The release owner as launchd runs it, from source. Resolves once its socket answers. */
export async function owner(f: Fixture) {
  const child = spawn(process.execPath, ['--experimental-transform-types', '--no-warnings', join(PLUGIN, 'legacy/primary/release-owner.ts')], { cwd: f.vault, env: childEnv(f), stdio: ['ignore', 'pipe', 'pipe'] });
  let errors = ''; child.stderr!.on('data', b => { errors += b; });
  const state = join(f.home, 'owner', 'state.json');
  for (let i = 0; i < 200; i++) {
    if (existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).ready) return child;
    if (child.exitCode !== null) break;
    await new Promise(r => setTimeout(r, 25));
  }
  child.kill(); throw new Error(`Owner did not become ready: ${existsSync(state) ? readFileSync(state, 'utf8') : 'no state'}\n${errors}`);
}

/** server.ts (package.json bb.server) registered against a mock BB; returns its RPC handlers. */
export async function serverRpc() {
  const handlers: Record<string, (input: unknown) => Promise<any>> = {};
  const thread = (threadId: string) => ({ id: threadId, providerId: 'exo-spike', projectId: 'project', parentThreadId: null, environmentId: 'env' });
  const bb: any = { providers: { register() {} }, experimental_hooks: { on() {} }, background: { service() {} }, realtime: { publish() {} }, ui: { registerMentionProvider() {} }, rpc: { register(_c: unknown, h: typeof handlers) { Object.assign(handlers, h); } },
    sdk: { threads: { async get({ threadId }: { threadId: string }) { return thread(threadId); }, async list() { return []; }, async spawn() { throw new Error('mock BB: no spawn'); } }, projects: { async list() { return []; }, async get() { return {}; } } } };
  (await import(pathToFileURL(join(PLUGIN, 'server.ts')).href)).default(bb);
  return handlers;
}

export type BridgeLine = { at: number; value: any };
/** host.ts (package.json bb.host) as BB runs it: a child process speaking JSON-RPC lines on stdio. */
export function bridge(f: Fixture) {
  const shim = `import{createInterface}from'node:readline';const{handleLine}=await import(${JSON.stringify(pathToFileURL(join(PLUGIN, 'host.ts')).href)});for await(const line of createInterface({input:process.stdin}))handleLine(line);`;
  const child: ChildProcess = spawn(process.execPath, ['--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', shim], { cwd: f.vault, env: childEnv(f), stdio: ['pipe', 'pipe', 'pipe'] });
  const t0 = Date.now(), lines: BridgeLine[] = [], providers = new Map<string, string>(); let buffer = '', errors = '', id = 0;
  child.stdout!.setEncoding('utf8'); child.stderr!.on('data', b => { errors += b; });
  child.stdout!.on('data', chunk => { buffer += chunk; let end: number; while ((end = buffer.indexOf('\n')) >= 0) { const l = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (l.trim()) lines.push({ at: Date.now() - t0, value: JSON.parse(l) }); } });
  const options = { model: 'exo-opus-5-5', reasoningLevel: 'high', permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null, providerOptions: { runtimeKind: 'canonical' } };
  const request = (method: string, params: object) => { const n = ++id; child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); return n; };
  const response = async (n: number, ms = 8000) => {
    for (let waited = 0; waited <= ms; waited += 20) { const hit = lines.find(l => l.value.id === n); if (hit) return hit.value; await new Promise(r => setTimeout(r, 20)); }
    throw new Error(`No response to request ${n}: ${errors}`);
  };
  const deltas = (threadId: string) => lines.filter(l => l.value.method === 'thread/delta' && l.value.params.threadId === threadId).flatMap(l => l.value.params.deltas.map((d: any) => ({ at: l.at, ...d })));
  /** The turn this bridge started: from its turn.open to the boundary after Exo's reply. */
  const turn = (threadId: string) => {
    const d = deltas(threadId), reply = d.findIndex(x => x.kind === 'item.textClose'), open = d.slice(0, reply + 1).findLast(x => x.kind === 'turn.open');
    const end = reply < 0 ? undefined : d.slice(reply).find(x => x.kind === 'turn.boundary');
    return { open, end, replies: d.filter(x => x.kind === 'item.textClose').map(x => x.text) };
  };
  return {
    child, lines, errors: () => errors, deltas, turn,
    async start(threadId: string) {
      const answer = await response(request('thread/start', { threadId, cwd: f.vault, instructionMode: 'append', options }));
      if (answer.result) providers.set(threadId, answer.result.providerThreadId);
      return answer;
    },
    send: (threadId: string, text: string) => request('turn/start', { threadId, providerThreadId: providers.get(threadId), clientRequestId: `creq_abcdefghi${'23456789'[id % 8]}`, options, input: [{ type: 'text', text }] }),
    async settled(threadIds: string[], ms = 8000) {
      for (let waited = 0; !threadIds.every(t => turn(t).end); waited += 20) {
        if (waited > ms) throw new Error(`Turns did not settle: ${JSON.stringify(lines.map(l => l.value))}\n${errors}`);
        await new Promise(r => setTimeout(r, 20));
      }
    },
  };
}

/** A raw owner view socket, as OwnerClient speaks it: one request, one response. */
export function ownerRequest(f: Fixture, value: object) {
  return new Promise<any>((resolve, reject) => {
    import('node:net').then(({ createConnection }) => {
      const socket = createConnection(join(f.home, 'owner', 'rpc.sock')); let buffer = '';
      socket.setEncoding('utf8'); socket.on('error', reject);
      socket.on('data', c => { buffer += c; const at = buffer.indexOf('\n'); if (at >= 0) { socket.destroy(); resolve(JSON.parse(buffer.slice(0, at))); } });
      socket.write(JSON.stringify({ id: 'probe', ...value }) + '\n');
    });
  });
}

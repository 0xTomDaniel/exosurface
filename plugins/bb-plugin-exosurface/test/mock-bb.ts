// Mock-BB harness on the LIVE entry points (#67), shared by test/parallel-threads.test.ts and demo/surfaces.
// Real: package.json bb.server (server.ts: canonical_setup and thread_bind RPCs, its message.dispatch hook), bb.host
// (host.ts) as a child process on JSON-RPC stdio, the release owner (legacy/primary/release-owner.ts) as its own process,
// the packaged runtime (dist/, so build:owner and build:runtime first), and the real Pi 1.1 CLI.
// Fake only at the boundaries: BB (sdk + JSON-RPC peer; spawn runs the registered dispatch hook as BB does), OptChat (a
// Pi extension holding the profile lock and binding entry, plus its profile API module) and the model (Pi's `anthropic`
// provider replaced by an offline stream; a Pi that loads no extension, as the surface namer, reaches the fake model over
// HTTP, test/fake-model-http.ts, through the agent folder's models.json).
import { fakeModelHttp } from './fake-model-http.ts';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, realpathSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { reaped, PARENT_WATCH } from './reap.ts';
import { settled } from './wait.ts';

export const PLUGIN = resolve(import.meta.dirname, '..');
const PI_CLI = join(PLUGIN, 'node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js');
const PI_AI = pathToFileURL(join(PLUGIN, 'node_modules/@earendil-works/pi-ai/dist/index.js')).href;
export const INSTRUCTIONS = '# Exo\n\nThe one Exo instructions source.\n';

// OptChat 0.8.6 profile API surface used by src/optchat-init.ts (profilePath, createProfile, loadConfig, saveConfig, instructions).
const FAKE_PROFILES = `import{existsSync,mkdirSync,readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
export const profilePath=n=>{if(!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(n))throw Error('bad profile name');return join(process.env.OPTCHAT_HOME,'profiles',n);};
export function createProfile(n){const d=profilePath(n);if(existsSync(d))throw Error('Profile already exists: '+n);mkdirSync(d,{recursive:true});saveConfig(d,{compactor:{provider:'fixture',model:'compactor',thinking:'low'},subagent:{provider:'fixture',model:'subagent',thinking:'high'}});writeFileSync(join(d,'AGENTS.md'),'# '+n+'\\n\\nThis is the '+n+' profile.\\n');}
export const loadConfig=d=>JSON.parse(readFileSync(join(d,'config.json'),'utf8'));
export const saveConfig=(d,c)=>writeFileSync(join(d,'config.json'),JSON.stringify(c));
export const instructions=d=>readFileSync(join(d,'AGENTS.md'),'utf8');`;

// OptChat as Pi sees it: --optchat-profile, one Pi per profile (lock.sock answering "<profile> · PID <pid> · ..."), the
// optchat.profile session entry. The model: a "call: <JSON>" prompt makes that one update_exosurface call; a "together" prompt is answered only once another profile's turn is running
// too, so a refused or queued second turn leaves the first unanswered ("ALONE"); a "quiet:" prompt gets a turn with no words;
// a "hold:" prompt is answered only once the test releases that profile's turn (release()), so another surface opens while it
// runs however long that takes ("hold: quiet: ..." is a held turn with no words).
const FAKE_OPTCHAT = `import{createServer}from'node:net';import{appendFileSync,existsSync,mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';import{join}from'node:path';
import{createAssistantMessageEventStream}from${JSON.stringify(PI_AI)};
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),arg=f=>process.argv.includes(f)?process.argv[process.argv.indexOf(f)+1]:undefined;
export default function optchat(pi){
 pi.registerFlag('optchat-profile',{description:'OptChat profile',type:'string'});
 let lock,recorded=false;
 pi.on('session_start',async(_e,ctx)=>{
  const name=pi.getFlag('optchat-profile');if(typeof name!=='string')return;const dir=join(process.env.OPTCHAT_HOME,'profiles',name);
  if(!lock){lock=createServer(s=>s.end(name+' · PID '+process.pid+' · fixture'));await new Promise((ok,no)=>{lock.once('error',no);lock.listen(join(dir,'lock.sock'),ok);});}
  if(!ctx.sessionManager.getEntries().some(e=>e.type==='custom'&&e.customType==='optchat.profile'))pi.appendEntry('optchat.profile',{name});
  if(process.env.EXO_BB_INFO_FILE&&!recorded){recorded=true;appendFileSync(join(process.env.OPTCHAT_HOME,'pi-runs.jsonl'),JSON.stringify({pid:process.pid,profile:name,cwd:process.cwd(),model:arg('--provider')+'/'+arg('--model')+'/'+arg('--thinking'),instructions:readFileSync(join(dir,'AGENTS.md'),'utf8'),pageExtensions:process.argv.some(a=>a.endsWith('workspace-extension.js')),sessionFile:ctx.sessionManager.getSessionFile()})+'\\n');}
 });
 pi.on('session_shutdown',()=>{lock?.close();});
 pi.registerProvider('anthropic',{baseUrl:'http://fixture.invalid',apiKey:'fixture-not-a-secret',api:'exo-fixture-anthropic',
  models:[{id:'claude-opus-5-5',name:'fixture',reasoning:true,input:['text'],cost:{input:0,output:0,cacheRead:0,cacheWrite:0},contextWindow:200000,maxTokens:8192}],
  streamSimple:(model,context)=>{const stream=createAssistantMessageEventStream();
   const message={role:'assistant',api:model.api,provider:model.provider,model:model.id,content:[],timestamp:Date.now(),stopReason:'stop',usage:{input:0,output:0,cacheRead:0,cacheWrite:0,totalTokens:0,cost:{input:0,output:0,cacheRead:0,cacheWrite:0,total:0}}};
   void(async()=>{// The person's messages, without the per-request page-state context the pages extension adds as a user message.
    const textOf=m=>typeof m.content==='string'?m.content:(m.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('');
    const messages=context.messages.filter(m=>!(m.role==='user'&&textOf(m).startsWith('Machine state of the surface')));
    const last=messages.findLast(m=>m.role==='user'),said=typeof last?.content==='string'?last.content:(last?.content??[]).filter(p=>p.type==='text').map(p=>p.text).join('');
    const name=pi.getFlag('optchat-profile'),turns=join(process.env.OPTCHAT_HOME,'turns');stream.push({type:'start',partial:message});
    // "draw: <title>" draws a page with one input and one button on the thread's own pages, then answers once drawn.
    if(said.startsWith('draw: ')&&messages.at(-1)?.role==='user'){const title=said.slice(6).trim();
     const toolCall={type:'toolCall',id:'draw_'+Date.now(),name:'update_exosurface',arguments:{baseRevision:0,snapshot:'- region '+JSON.stringify(title)+' [ref=trip]:\\n  - textbox "Who" [ref=who]: Ada\\n  - button "Book" [ref=book] [action=book] [sends=who]'}};
     message.content.push(toolCall);message.stopReason='toolUse';stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall,partial:message});
     stream.push({type:'done',reason:'toolUse',message});stream.end();return;}
    // "draw <ref>: <title>" draws a page about that topic as page <ref>; "draw <ref>: <title> beside <other>" also asks for
    // page <other> beside it. It tries revision 0 and, told the surface is further on, draws again on that revision.
    const page=/^draw ([a-z]+): (.+?)(?: beside ([a-z]+))?$/.exec(said),stale=messages.at(-1)?.role==='toolResult'?/the surface is at revision (\\d+)/.exec(textOf(messages.at(-1))):null;
    if(page&&(messages.at(-1)?.role==='user'||stale)){const[,ref,title,beside]=page,revision=Number(stale?.[1]??0);
     const toolCall={type:'toolCall',id:'draw_'+Date.now(),name:'update_exosurface',arguments:{baseRevision:revision,snapshot:'- region '+JSON.stringify(title)+' [ref='+ref+']:\\n  - heading '+JSON.stringify(title)+' [ref=title]',...(beside?{focus:ref,beside:[beside]}:{})}};
     message.content.push(toolCall);message.stopReason='toolUse';stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall,partial:message});
     stream.push({type:'done',reason:'toolUse',message});stream.end();return;}
    // "call: <JSON>" makes one update_exosurface call with exactly those arguments, well-formed or not, then answers.
    if(said.startsWith('call: ')&&messages.at(-1)?.role==='user'){
     const toolCall={type:'toolCall',id:'call_'+Date.now(),name:'update_exosurface',arguments:JSON.parse(said.slice(6))};
     message.content.push(toolCall);message.stopReason='toolUse';stream.push({type:'toolcall_start',contentIndex:0,partial:message});stream.push({type:'toolcall_end',contentIndex:0,toolCall,partial:message});
     stream.push({type:'done',reason:'toolUse',message});stream.end();return;}
    if(said.startsWith('hold:'))for(const end=Date.now()+60000;!existsSync(join(process.env.OPTCHAT_HOME,'release',name))&&Date.now()<end;)await sleep(25);
    if(said.includes('together')){mkdirSync(turns,{recursive:true});writeFileSync(join(turns,name),'');for(const end=Date.now()+5000;readdirSync(turns).length<2&&Date.now()<end;)await sleep(50);}
    const text=(said.includes('together')&&readdirSync(turns).length<2?'ALONE: ':'Exo ('+name+'): ')+said;
    if(!said.replace(/^hold: /,'').startsWith('quiet:')){message.content.push({type:'text',text});stream.push({type:'text_start',contentIndex:0,partial:message});stream.push({type:'text_delta',contentIndex:0,delta:text,partial:message});
    stream.push({type:'text_end',contentIndex:0,content:text,partial:message});}stream.push({type:'done',reason:'stop',message});stream.end();})();
   return stream;}});
}`;

type Hook = (context: unknown) => Promise<{ action: string; message?: string }>;
/** server.ts (package.json bb.server) registered against a mock BB; its RPC handlers and its message.dispatch hook. */
async function serverRpc(vault: string) {
  const handlers: Record<string, (input: unknown) => Promise<any>> = {}, hooks: Hook[] = [];
  // BB's threads: the ones spawned here (setup's is 'primary'), and any other id read as an existing Exo thread.
  const threads = new Map<string, any>(), spawns: any[] = [], sends: any[] = [];
  // The thread's provider as BB reaches it on a send (a test sets deliver to its host.ts bridge); unset, sends are only recorded.
  const provider: { deliver?: (threadId: string, text: string) => void } = {};
  // Threads read but not spawned here keep their updates (title) beside, so spawned ids stay as they were.
  const others = new Map<string, any>(), metadata = new Map<string, Record<string, unknown>>();
  // BB's thread event log, the client/turn/requested rows only: one per admitted message, with its author as BB resolves it
  // (dispatch-author.ts, resolveDispatchAuthor: a retry is "system", a message from another thread "agent" with its
  // senderThreadId, a system notice "system", anything else, a person's send or a plugin's sdk send, "user").
  const requested = new Map<string, any[]>();
  const logRequest = (threadId: string, text: string, initiator: string, senderThreadId: string | null, source: 'spawn' | 'tell') => {
    const rows = requested.get(threadId) ?? []; requested.set(threadId, rows);
    rows.push({ id: `event-${threadId}-${rows.length + 1}`, threadId, seq: rows.length + 1, createdAt: Date.now(), scope: { kind: 'thread' }, type: 'client/turn/requested', data: { direction: 'outbound', initiator, senderThreadId, source, input: [{ type: 'text', text, mentions: [] }] } });
  };
  /** BB's dispatch of a message to an existing thread by its author: the dispatch pass (its context carrying that author),
   *  then the request row in the thread's event log, then the turn goes to the thread's provider. */
  const dispatch = async (threadId: string, text: string, initiator: 'user' | 'agent' | 'system', senderThreadId: string | null) => {
    for (const hook of hooks) {
      const decision = await hook({ thread: thread(threadId), project: { id: 'project' }, environment: null, input: { text, blocks: [{ type: 'text', text }] }, attempt: 'start-turn', attemptKind: 'start-turn', initiator, senderThreadId, queuedMessages: [] });
      if (decision.action === 'reject') throw new Error(`mock BB: dispatch rejected: ${decision.message}`);
    }
    logRequest(threadId, text, initiator, senderThreadId, 'tell');
    provider.deliver!(threadId, text);
  };
  const thread = (threadId: string) => threads.get(threadId) ?? others.get(threadId) ?? ({ id: threadId, providerId: 'exo-spike', projectId: 'project', parentThreadId: null, environmentId: 'env', title: null, createdAt: 0 });
  // BB's thread lifecycle events (bb.events) and the plugin's log lines.
  const listeners: Record<string, ((payload: any) => unknown)[]> = {}, logs: string[] = [];
  /** BB fires thread.idle when a thread's turn ends; resolves once every listener has returned. */
  const idle = async (threadId: string) => { await Promise.all((listeners['thread.idle'] ?? []).map(h => h({ thread: thread(threadId), lastAssistantText: null }))); };
  // BB's realtime: what the plugin publishes goes to a test's app view (deliver); unset, it is dropped. Background services
  // are registered here and run only once a test starts them (streams()).
  const realtime: { deliver?: (channel: string, payload: unknown) => void } = {}, services: { name: string; start: (signal: AbortSignal) => Promise<void> }[] = [];
  const bb: any = { providers: { register() {} }, background: { service(name: string, s: { start: (signal: AbortSignal) => Promise<void> }) { services.push({ name, start: s.start }); } }, realtime: { publish(channel: string, payload: unknown) { realtime.deliver?.(channel, payload); } }, ui: { registerMentionProvider() {} },
    events: { on(name: string, handler: (payload: any) => unknown) { (listeners[name] ??= []).push(handler); } },
    log: Object.fromEntries(['debug', 'info', 'warn', 'error'].map(level => [level, (m: string) => { logs.push(`${level}: ${m}`); }])),
    experimental_hooks: { on(_name: string, hook: Hook) { hooks.push(hook); } }, rpc: { register(_c: unknown, h: typeof handlers) { Object.assign(handlers, h); } },
    sdk: {
      threads: {
        async get({ threadId }: { threadId: string }) { return thread(threadId); }, async list() { return [...threads.values()]; },
        async update({ threadId, title }: { threadId: string; title?: string | null }) {
          const t = thread(threadId); if (title !== undefined) t.title = title;
          if (!threads.has(threadId)) others.set(threadId, t);
          return t;
        },
        // The plugin's own namespace of a thread's metadata; set merges keys, as BB does.
        async getPluginMetadata({ threadId }: { threadId: string }) { return { ...(metadata.get(threadId) ?? {}) }; },
        async updatePluginMetadata({ threadId, set = {}, remove = [] }: { threadId: string; set?: Record<string, unknown>; remove?: string[] }) {
          const next = { ...(metadata.get(threadId) ?? {}), ...set }; for (const k of remove) delete next[k];
          metadata.set(threadId, next); return { ...next };
        },
        // BB creates the thread, then runs the dispatch pass on its first message before any provider sees it.
        async spawn(args: { prompt: string; projectId: string; parentThreadId?: string; title?: string; providerId: string; environment: unknown }) {
          spawns.push(args);
          const id = threads.size ? `thread-${threads.size + 1}` : 'primary';
          const created = { id, providerId: args.providerId, projectId: args.projectId, parentThreadId: args.parentThreadId ?? null, environmentId: 'env', title: args.title ?? null, createdAt: 1000 + threads.size };
          threads.set(id, created);
          for (const hook of hooks) {
            const decision = await hook({ thread: created, project: { id: args.projectId }, environment: null, input: { text: args.prompt, blocks: [{ type: 'text', text: args.prompt }] }, attemptKind: 'start-turn', initiator: 'user', senderThreadId: null, queuedMessages: [] });
            if (decision.action === 'reject') throw new Error(`mock BB: dispatch rejected: ${decision.message}`);
          }
          logRequest(id, args.prompt, 'user', null, 'spawn');
          return created;
        },
        // A plugin's send on an existing thread (no sender thread: BB's author is "user"): recorded; with a provider, dispatched.
        async send(args: { threadId: string; input: { type: string; text: string }[] }) {
          sends.push(args);
          if (!provider.deliver) return {};
          await dispatch(args.threadId, args.input.map(p => p.text).join(''), 'user', null);
          return {};
        },
        // BB's thread event log (bb.sdk.threads.events.list) with BB 0.48's query rules (threadEventsQuerySchema and its
        // route): limit, afterSeq and beforeSeq are digit strings; limit at most 100 (THREAD_EVENT_LIST_PAGE_SIZE), refused
        // with HTTP 400 as the SDK reports it; absent, one page of 100. Rows after afterSeq and before beforeSeq, by type,
        // oldest first or newest first.
        events: {
          async list({ threadId, types, order = 'asc', limit, afterSeq, beforeSeq }: { threadId: string; types?: string[]; order?: 'asc' | 'desc'; limit?: string; afterSeq?: string; beforeSeq?: string }) {
            for (const [name, value] of [['limit', limit], ['afterSeq', afterSeq], ['beforeSeq', beforeSeq]] as const)
              if (value !== undefined && !/^\d+$/.test(String(value))) throw new Error(`HTTP 400: ${name} must be a string of digits`);
            if (limit !== undefined && Number(limit) > 100) throw new Error('HTTP 400: Thread event limit cannot exceed 100');
            const page = limit === undefined ? 100 : Number(limit);
            if (page <= 0) throw new Error('HTTP 400: limit must be a positive integer');
            const rows = (requested.get(threadId) ?? []).filter(r => (!types || types.includes(r.type)) && (afterSeq === undefined || r.seq > Number(afterSeq)) && (beforeSeq === undefined || r.seq < Number(beforeSeq)));
            return (order === 'desc' ? [...rows].reverse() : rows).slice(0, page);
          },
        },
      },
      projects: { async list() { return [{ id: 'project', name: 'Exo' }]; }, async get() { return { id: 'project', sources: [{ hostId: 'host', path: vault }] }; } },
    } };
  (await import(pathToFileURL(join(PLUGIN, 'server.ts')).href)).default(bb);
  /** Starts the plugin's background services as BB does, except the isolated clone's (its home is outside the fixture). */
  const streams = () => {
    const stop = new AbortController();
    for (const s of services) if (s.name !== 'workspace-stream') s.start(stop.signal).catch(e => { if (!stop.signal.aborted) throw e; });
    return () => stop.abort();
  };
  /** BB's stored name of a thread, as the person (or BB) set it; what thread_list reads as the surface's title. */
  const retitle = (threadId: string, title: string) => { threads.set(threadId, { ...thread(threadId), title }); };
  /** A message reaching a thread from someone other than the person: another thread's `bb thread tell` (agent, with its
   *  sender) or a system notice (system), dispatched as BB does. */
  const tell = (threadId: string, text: string, from: { senderThreadId: string } | 'system') =>
    dispatch(threadId, text, from === 'system' ? 'system' : 'agent', from === 'system' ? null : from.senderThreadId);
  /** The person's queued message sent with BB's explicit Send-now: BB skips the dispatch pass for it by design (BB 0.48
   *  dispatch: `if (!sendNow && hasMessageDispatchHooks())`), then logs the request (author "user") and starts the turn. */
  const sendNow = (threadId: string, text: string) => { logRequest(threadId, text, 'user', null, 'tell'); provider.deliver!(threadId, text); };
  return { handlers, spawns, sends, provider, realtime, streams, retitle, idle, logs, tell, sendNow };
}

/** A fresh canonical install made through server.ts's canonical_setup RPC, as the setup panel runs it. Sets EXO_CONFIG. */
export async function liveFixture() {
  if (!existsSync(join(PLUGIN, 'dist', 'canonical-initialization.js')) || !existsSync(join(PLUGIN, 'dist', 'optchat-init.js'))) throw new Error('Run npm run build:owner && npm run build:runtime first (the packaged runtime is what the owner launches)');
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'exo-live-')));
  const home = join(root, 's'), optchatHome = join(root, 'o'), vault = join(root, 'v'), optchat = join(root, 'optchat');
  mkdirSync(vault); writeFileSync(join(vault, 'AGENTS.md'), '# Vault\n');
  mkdirSync(join(optchat, 'src'), { recursive: true });
  writeFileSync(join(optchat, 'package.json'), JSON.stringify({ name: 'pi-optchat', version: '0.8.6', type: 'module', pi: { extensions: ['./src/index.js'] } }));
  writeFileSync(join(optchat, 'src', 'profiles.ts'), FAKE_PROFILES); writeFileSync(join(optchat, 'src', 'index.js'), FAKE_OPTCHAT);
  // The installer's local config names the state homes and profile; setup confirms the rest and refuses any conflict.
  const config = join(root, 'exosurface.json');
  writeFileSync(config, JSON.stringify({ ownerLabel: 'fixture.owner', primaryStateDir: home, primaryOptchatHome: optchatHome, primaryProfile: 'exo-optchat', primaryAgentDir: join(home, 'pi-config'), vault, optchat, piCli: PI_CLI }));
  process.env.EXO_CONFIG = config; // legacy/primary reads its local config once, at import: one fixture per process.
  // The model as reached over HTTP (the namer's Pi): answers every request with model.state.reply. Closed when this process exits.
  const model = await fakeModelHttp(); model.agentDir(join(home, 'pi-config'));
  const { handlers: rpc, spawns, sends, provider, realtime, streams, retitle, idle, logs, tell, sendNow } = await serverRpc(vault);
  const setup = await rpc.canonical_setup({ operationId: 'fixture-operation', projectId: 'project', vault, piCli: PI_CLI, optchat, authorizeInitialization: true });
  // The person's own instructions, written after setup: every Exo thread must read exactly these.
  writeFileSync(join(optchatHome, 'profiles', setup.profile, 'AGENTS.md'), INSTRUCTIONS);
  /** Lets the profile's "hold:" turn be answered. */
  const release = (profile: string) => { mkdirSync(join(optchatHome, 'release'), { recursive: true }); writeFileSync(join(optchatHome, 'release', profile), ''); };
  return { root, home, optchatHome, vault, config, rpc, setup, spawns, sends, provider, realtime, streams, retitle, idle, logs, tell, sendNow, model, release, piRuns: () => existsSync(join(optchatHome, 'pi-runs.jsonl')) ? readFileSync(join(optchatHome, 'pi-runs.jsonl'), 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] };
}
type Fixture = Awaited<ReturnType<typeof liveFixture>>;

const childEnv = (f: Fixture) => ({ EXO_CONFIG: f.config, HOME: f.root, TMPDIR: f.root, PATH: process.env.PATH ?? '/usr/bin:/bin' });

/** The release owner as launchd runs it, from source. Resolves once it reports ready. */
export async function owner(f: Fixture) {
  const child = reaped(spawn(process.execPath, [...PARENT_WATCH, '--experimental-transform-types', '--no-warnings', join(PLUGIN, 'legacy/primary/release-owner.ts')], { cwd: f.vault, env: childEnv(f), stdio: ['ignore', 'pipe', 'pipe'] }));
  let errors = ''; child.stderr!.on('data', b => { errors += b; });
  const state = join(f.home, 'owner', 'state.json');
  await settled(() => child.exitCode !== null || (existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).ready), 15000, 25);
  if (child.exitCode === null && existsSync(state) && JSON.parse(readFileSync(state, 'utf8')).ready) return child;
  child.kill(); throw new Error(`Owner did not become ready: ${existsSync(state) ? readFileSync(state, 'utf8') : 'no state'}\n${errors}`);
}

export type BridgeLine = { at: number; value: any };
/** host.ts (package.json bb.host) as BB runs it: a child process speaking JSON-RPC lines on stdio. */
export function bridge(f: Fixture) {
  const shim = `import{createInterface}from'node:readline';const{handleLine}=await import(${JSON.stringify(pathToFileURL(join(PLUGIN, 'host.ts')).href)});for await(const line of createInterface({input:process.stdin}))handleLine(line);`;
  const child: ChildProcess = reaped(spawn(process.execPath, [...PARENT_WATCH, '--experimental-transform-types', '--no-warnings', '--input-type=module', '-e', shim], { cwd: f.vault, env: childEnv(f), stdio: ['pipe', 'pipe', 'pipe'] }));
  const t0 = Date.now(), lines: BridgeLine[] = [], providers = new Map<string, string>(); let buffer = '', errors = '', id = 0;
  child.stdout!.setEncoding('utf8'); child.stderr!.on('data', b => { errors += b; });
  // As BB does when a turn ends (the bridge's turn.boundary), the thread goes idle: thread.idle to the plugin's listeners.
  child.stdout!.on('data', chunk => { buffer += chunk; let end: number; while ((end = buffer.indexOf('\n')) >= 0) { const l = buffer.slice(0, end); buffer = buffer.slice(end + 1); if (l.trim()) {
    const value = JSON.parse(l); lines.push({ at: Date.now() - t0, value });
    if (value.method === 'thread/delta' && value.params.deltas.some((d: any) => d.kind === 'turn.boundary')) void f.idle(value.params.threadId);
  } } });
  const options = { model: 'exo-opus-5-5', reasoningLevel: 'high', permissionMode: 'full', permissionScope: 'full', approvalReviewer: null, permissionEscalation: null, providerOptions: { runtimeKind: 'canonical' } };
  const request = (method: string, params: object) => { const n = ++id; child.stdin!.write(JSON.stringify({ jsonrpc: '2.0', id: n, method, params }) + '\n'); return n; };
  const response = async (n: number, ms = 15000) => {
    if (await settled(() => lines.some(l => l.value.id === n), ms, 20)) return lines.find(l => l.value.id === n)!.value;
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
    /** thread/start, with the thread's first message as BB sends it for a spawned thread. */
    async start(threadId: string, input?: object[]) {
      const answer = await response(request('thread/start', { threadId, cwd: f.vault, instructionMode: 'append', options, ...(input ? { input } : {}) }));
      if (answer.result) providers.set(threadId, answer.result.providerThreadId);
      return answer;
    },
    send: (threadId: string, text: string) => request('turn/start', { threadId, providerThreadId: providers.get(threadId), clientRequestId: `creq_abcdefghi${'23456789'[id % 8]}`, options, input: [{ type: 'text', text }] }),
    async settled(threadIds: string[], ms = 20000) {
      if (!(await settled(() => threadIds.every(t => turn(t).end), ms, 20))) throw new Error(`Turns did not settle: ${JSON.stringify(lines.map(l => l.value))}\n${errors}`);
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

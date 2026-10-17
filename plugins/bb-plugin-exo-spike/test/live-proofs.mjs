import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { chromium } from './playwright.mjs';
const exec = promisify(execFile);
const BB = '/Applications/bb.app/Contents/Resources/app.asar.unpacked/node_modules/bb-app/host-daemon/dist/bb';
const ROOT = `${process.env.HOME}/.exo-bb-spike`;
const VAULT = `${process.env.HOME}/Sync/Exocortex`;
const RUN = Date.now().toString(36);
const report = { run: RUN, model: 'anthropic/claude-opus-5-5', fixture: false, proofs: [], errors: [] };
const cli = async (...args) => JSON.parse((await exec(process.execPath, [BB, ...args], { env: { ...process.env, BB_SERVER_URL: 'http://127.0.0.1:38886' }, timeout: 60_000, maxBuffer: 5_000_000 })).stdout);
async function wait(fn, label, timeout = 180_000) { const end = Date.now() + timeout; while (Date.now() < end) { const value = await fn(); if (value) return value; await new Promise(r => setTimeout(r, 400)); } throw new Error(`Timed out: ${label}`); }
const load = file => JSON.parse(readFileSync(file, 'utf8'));
let main, browser;
try {
  // Fresh thread/profile every run; no fixture-history import or previous success markers.
  const project = (await cli('thread', 'get', 'thr_hpkdzye5am', '--json')).thread.projectId;
  const input = `This is a bounded BB/Pi/OptChat integration trial in a fresh isolated profile, not a real-life planning request. Do not modify vault notes or perform external actions. Remember the synthetic test token LIVE_RECALL_${RUN} only in this trial chat history. Use read to inspect .agents/skills/nitride/SKILL.md. In at most 3 short lines, give its name, the owner timezone from your loaded AGENTS.md, and LIVE_TOOL_READY_${RUN}. Do not spawn yet. No other tasks.`;
  main = await cli('thread', 'spawn', '--project', project, '--new-environment', 'personal', '--provider', 'exo-spike', '--model', 'live-opus-5-5', '--reasoning-level', 'high', '--permission-mode', 'full', '--title', `Exo live qualification ${RUN}`, '--prompt', input, '--json');
  report.main = main.id;
  const binding = () => load(`${ROOT}/bindings/${main.id}.json`);
  const audit = () => readFileSync(`${ROOT}/audit/${main.id}.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  const entries = () => existsSync(binding().sessionFile) ? readFileSync(binding().sessionFile, 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [];
  const reply = (marker, since = 0) => wait(() => entries().slice(since).find(e => e.message?.role === 'assistant' && e.message.stopReason === 'stop' && e.message.provider === 'anthropic' && e.message.content.some(p => p.type === 'text' && p.text.includes(marker))), `fresh actual model reply: ${marker}`);
  const idle = () => wait(async () => (await cli('thread', 'get', main.id, '--json')).thread.status === 'idle', 'BB idle');
  await wait(() => existsSync(`${ROOT}/bindings/${main.id}.json`), 'owner binding');
  const info = load(`${ROOT}/runtime-info/${main.id}.json`);
  assert.equal(info.model.provider, 'anthropic'); assert.equal(info.model.id, 'claude-opus-5-5'); assert.equal(info.mode, 'rpc');
  assert.equal(info.cwd, VAULT); assert.equal(info.projectTrusted, true); assert.equal(info.fixtureLoaded, false);
  assert.equal(info.hasVaultInstructions, true); assert.equal(info.hasDisabledObsidianCliPolicy, true);
  for (const name of ['obsidian', 'nitride', 'tom-operating-style']) assert.ok(info.skills.some(s => s.name === `skill:${name}`), `Missing skill: ${name}`);
  assert.ok(binding().profile.startsWith('live-')); assert.equal(binding().runtimeKind, 'live');
  report.runtime = info;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const page = await context.newPage();
  page.on('pageerror', e => report.errors.push(e.message));
  await page.goto(`http://127.0.0.1:38886/plugins/exo-spike/proof/${main.id}`);
  const chat = page.locator('section[aria-label="Native BB conversation"]');
  const send = async value => { const e = chat.locator('[contenteditable="true"]'); await e.waitFor(); await e.fill(value); await e.press('Enter'); };
  const seen = marker => wait(async () => (await chat.innerText()).includes(marker), marker);
  await reply(`LIVE_TOOL_READY_${RUN}`); await seen(`LIVE_TOOL_READY_${RUN}`); await idle();
  assert.ok(entries().some(e => e.message?.role === 'toolResult' && e.message.toolName === 'read' && !e.message.isError));
  report.proofs.push({ id: 'normal-resources-tool', status: 'pass', detail: 'Real Opus response through native BB chat; canonical vault instructions/skills loaded and read executed, separate profile, no fixture provider.' });
  const start = audit().length;
  // /fast has no "status" argument. Toggle twice before any next model call,
  // restoring the process-local override to its initial effective value.
  for (let i = 0; i < 2; i++) {
    const commandStart = audit().length;
    await send('/fast');
    await wait(() => audit().slice(commandStart).some(e => e.event === 'prompt-response' && e.disposition === 'handled'), 'actual fast toggle handled'); await idle();
  }
  await page.getByRole('button', { name: 'Command feedback', exact: true }).click();
  await wait(async () => (await page.getByLabel('Pi feedback').innerText()).includes('EXO_LIVE_RUNTIME_VISIBLE'), 'visible command feedback'); await idle();
  assert.equal(audit().slice(start).filter(e => e.event === 'agent_start').length, 0);
  const scratch = `${ROOT}/tool-probe-${RUN}.txt`;
  await send(`Integration test only. Use write to create ${scratch} with ONE on one line. Use edit to change ONE to TWO. Then use read to verify. Reply exactly LIVE_WRITE_EDIT_OK_${RUN}. Do not write any other file or call any external service.`);
  await reply(`LIVE_WRITE_EDIT_OK_${RUN}`); await seen(`LIVE_WRITE_EDIT_OK_${RUN}`); await idle(); assert.equal(readFileSync(scratch, 'utf8').trim(), 'TWO');
  for (const tool of ['write', 'edit', 'read']) assert.ok(entries().some(e => e.message?.role === 'toolResult' && e.message.toolName === tool && !e.message.isError));
  report.proofs.push({ id: 'commands-followup-and-bounded-writes', status: 'pass', detail: 'Actual pi-fast toggled twice (original effective value restored before further model work), live diagnostic command, zero-model command settlement, visible feedback; native write/edit/read confined by requested scope to an isolated scratch file. Not an independent security boundary.' });
  const continuation = audit().length;
  await send(`LIVE_CONTINUATION_PROBE ${RUN} Reply exactly LIVE_CONTINUATION_FIRST_${RUN}. No tools or other work.`);
  await reply(`LIVE_CONTINUATION_FINAL_${RUN}`); await seen(`LIVE_CONTINUATION_FINAL_${RUN}`); await idle();
  const life = audit().slice(continuation).filter(e => ['agent_end', 'agent_settled', 'bb-settle'].includes(e.event)).map(e => e.event);
  assert.ok(life.filter(e => e === 'agent_end').length >= 2); assert.equal(life.filter(e => e === 'bb-settle').length, 1);
  report.proofs.push({ id: 'real-model-continuation', status: 'pass', lifecycle: life });
  const directory = `${ROOT}/profiles/${binding().profile}/runs`;
  await send(`Integration test only. Spawn exactly one native OptChat child in ${VAULT}. Its task: use read on .agents/skills/nitride/SKILL.md, report its name and LIVE_NATIVE_CHILD_${RUN}. No writes, external actions or additional children. Return promptly after spawning; never poll or wait for it. When its native completion report arrives, acknowledge it with LIVE_NATIVE_REPORT_RECEIVED_${RUN}. Do not create a BB child thread.`);
  const child = await wait(() => existsSync(directory) && readdirSync(directory).filter(f => f.endsWith('.optchat.json')).map(f => load(`${directory}/${f}`)).find(r => r.task.includes(RUN)), 'native child');
  await wait(() => load(`${directory}/${child.id}.optchat.json`).state === 'completed', 'child completed');
  await reply(`LIVE_NATIVE_REPORT_RECEIVED_${RUN}`); await seen(`LIVE_NATIVE_REPORT_RECEIVED_${RUN}`); await idle();
  const childEntries = readFileSync(child.sessionFile, 'utf8').trim().split('\n').map(l => JSON.parse(l));
  assert.ok(childEntries.some(e => e.message?.role === 'toolResult' && e.message.toolName === 'read' && !e.message.isError));
  assert.ok(!childEntries.some(e => e.type === 'custom' && e.customType === 'optchat.profile'));
  const children = (await cli('thread', 'list', '--json')).filter(t => t.parentThreadId === main.id); assert.equal(children.length, 0);
  report.child = { id: child.id, sessionFile: child.sessionFile, model: child.model };
  report.proofs.push({ id: 'live-native-worker', status: 'pass', detail: 'Actual native child model/tool execution and report wake into main, no second profile owner, no BB child/completion-summary path.' });
  const before = binding(); const resumeStart = entries().length; await cli('thread', 'stop', main.id, '--json');
  await send('Resume qualification: what was the synthetic test token from my first request? Reply only that token. Do not read files or call tools.');
  await reply(`LIVE_RECALL_${RUN}`, resumeStart); await seen(`LIVE_RECALL_${RUN}`); await idle();
  assert.equal(binding().sessionFile, before.sessionFile); assert.equal(binding().providerThreadId, before.providerThreadId);
  const starts = audit().filter(e => e.event === 'owner-started'); assert.equal(starts.length, 2); assert.equal(starts[0].sessionId, starts[1].sessionId);
  report.proofs.push({ id: 'real-owner-stop-resume-recall', status: 'pass', detail: 'Actual owner stop/release, same Pi session/profile restored; first synthetic token recalled after several intervening turns.' });
  const assistant = entries().filter(e => e.message?.role === 'assistant').map(e => e.message);
  report.usage = { assistantMessages: assistant.length, providerReportedTokens: assistant.reduce((sum, m) => sum + (m.usage?.totalTokens ?? 0), 0), catalogEstimatedCost: assistant.reduce((sum, m) => sum + (m.usage?.cost?.total ?? 0), 0), note: 'Main session only; not a verified vendor bill and excludes separate child/OptChat compressor ledger.' };
  await page.screenshot({ path: 'evidence/live-desktop.png' });
  assert.equal(report.errors.length, 0); report.passed = true;
} catch (error) { report.passed = false; report.failure = error.stack; process.exitCode = 1; }
finally {
  if (main) { await cli('thread', 'stop', main.id, '--json').catch(() => {}); report.stopped = (await cli('thread', 'get', main.id, '--json')).thread.status === 'idle'; }
  await browser?.close(); writeFileSync('evidence/live-proofs.json', JSON.stringify(report, null, 2) + '\n');
  // Only synthetic result metadata; no raw provider stream or credentials.
  console.log(JSON.stringify(report, null, 2));
}

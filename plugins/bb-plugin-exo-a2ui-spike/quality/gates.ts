// The package check (docs/specs/quality-gate.spec.html): hard gates must be clean; counted gates are
// compared with the committed baseline, which only the record step writes and only ever lowers.
// Every tool is a pinned devDependency of this package; nothing here calls a network service or model.
import {spawn} from 'node:child_process';
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';

const BASELINE_FILE = 'quality-baseline.json';
const TYPECHECK_PROJECTS = ['tsconfig.json', 'tsconfig.live.json'];
const STRICTEST_PROJECT = 'tsconfig.strictest.json';

type HardGate = 'typecheck' | 'dependencies' | 'tests';
const COUNTED = ['strictest-typecheck', 'lint', 'unused-files', 'unused-exports', 'unused-types'] as const;
type CountedGate = (typeof COUNTED)[number];
type Counts = Record<CountedGate, number>;

const LABEL: Record<HardGate | CountedGate, string> = {
  typecheck: 'type check (tsc, package tsconfig)',
  dependencies: 'dependencies (knip unlisted)',
  tests: 'tests (npm test)',
  'strictest-typecheck': 'strictest type check (@tsconfig/strictest)',
  lint: 'lint (typescript-eslint strictTypeChecked)',
  'unused-files': 'unused files (knip)',
  'unused-exports': 'unused exports (knip)',
  'unused-types': 'unused exported types (knip)',
};
const name = (gate: HardGate | CountedGate) => `${gate}: ${LABEL[gate]}`;

// Tools come from this package's own install, whichever directory is checked.
const BIN = join(fileURLToPath(new URL('..', import.meta.url)), 'node_modules', '.bin');

interface Run {code: number; stdout: string; stderr: string}
function run(command: string, args: readonly string[], cwd: string): Promise<Run> {
  // A check started from inside a test run must not report to that run's test runner.
  const env = {...process.env};
  delete env['NODE_TEST_CONTEXT'];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {cwd, env, stdio: ['ignore', 'pipe', 'pipe']});
    let stdout = '', stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d: string) => { stderr += d; });
    child.on('error', reject);
    child.on('close', code => { resolve({code: code ?? 1, stdout, stderr}); });
  });
}
const tool = (bin: string, args: readonly string[], cwd: string) => run(process.execPath, [join(BIN, bin), ...args], cwd);
const firstLine = (r: Run) => (r.stderr.trim() || r.stdout.trim()).split('\n')[0] ?? `exit ${String(r.code)}`;

// A tool that could not produce a result fails its gate rather than counting as zero.
class ToolError extends Error {}

function tscErrors(r: Run): string[] {
  const errors = r.stdout.split('\n').filter(l => /(^|: )error TS\d+:/.test(l));
  if (r.code !== 0 && !errors.length) throw new ToolError(`tsc failed: ${firstLine(r)}`);
  return errors;
}

interface KnipIssue {file: string; files?: unknown[]; exports?: unknown[]; types?: unknown[]; unlisted?: {name: string}[]}
async function knipIssues(dir: string, args: readonly string[]): Promise<KnipIssue[]> {
  const r = await tool('knip', [...args, '--reporter', 'json', '--no-progress', '--no-exit-code', '--no-config-hints'], dir);
  try { return (JSON.parse(r.stdout) as {issues: KnipIssue[]}).issues; } catch { throw new ToolError(`knip failed: ${firstLine(r)}`); }
}

// Unused files, exports and types: knip's reachability analysis from the configured entries.
interface Knip {files: number; exports: number; types: number}
async function knip(dir: string): Promise<Knip> {
  const issues = await knipIssues(dir, []);
  const sum = (key: 'files' | 'exports' | 'types') => issues.reduce((n, i) => n + (i[key]?.length ?? 0), 0);
  return {files: sum('files'), exports: sum('exports'), types: sum('types')};
}

// Unlisted dependencies in EVERY project file, reachable or not: knip skips imports inside unused
// files, so this pass makes every project file an entry. Counted unused-file debt cannot hide one.
const KNIP_DEFAULT_PROJECT = ['**/*.{js,mjs,cjs,jsx,ts,tsx,mts,cts}!'];
async function unlisted(dir: string): Promise<string[]> {
  const file = join(dir, 'knip.json');
  const config = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown> : {};
  const project = config['project'] ?? KNIP_DEFAULT_PROJECT;
  const temp = mkdtempSync(join(tmpdir(), 'knip-all-files-'));
  try {
    writeFileSync(join(temp, 'knip.json'), JSON.stringify({...config, entry: project, project}));
    const issues = await knipIssues(dir, ['--config', join(temp, 'knip.json'), '--include', 'unlisted']);
    return issues.flatMap(i => (i.unlisted ?? []).map(u => `${u.name} (${i.file})`)).sort();
  } finally { rmSync(temp, {recursive: true, force: true}); }
}

async function strictest(dir: string): Promise<number> {
  return tscErrors(await tool('tsc', ['--noEmit', '--pretty', 'false', '-p', STRICTEST_PROJECT], dir)).length;
}

async function lint(dir: string): Promise<number> {
  const r = await tool('eslint', ['--format', 'json', '.'], dir);
  try { return (JSON.parse(r.stdout) as {messages: unknown[]}[]).reduce((n, f) => n + f.messages.length, 0); } catch { throw new ToolError(`eslint failed: ${firstLine(r)}`); }
}

type Measured<T> = {ok: true; value: T} | {ok: false; error: string};
async function settle<T>(p: Promise<T>): Promise<Measured<T>> {
  try { return {ok: true, value: await p}; } catch (e) { return {ok: false, error: e instanceof Error ? e.message : String(e)}; }
}
type CountResult = Record<CountedGate, Measured<number>>;

function counts(dir: string, knipRun: Promise<Knip>): Promise<CountResult> {
  const fromKnip = (key: 'files' | 'exports' | 'types') => settle(knipRun.then(k => k[key]));
  return Promise.all([settle(strictest(dir)), settle(lint(dir)), fromKnip('files'), fromKnip('exports'), fromKnip('types')])
    .then(([s, l, f, e, t]) => ({'strictest-typecheck': s, lint: l, 'unused-files': f, 'unused-exports': e, 'unused-types': t}));
}

function measureCounts(dir: string): Promise<CountResult> {
  return counts(dir, knip(dir));
}

// Baseline: one JSON object, every counted gate a non-negative integer, written in gate order.
function readBaseline(dir: string): Counts | null {
  const file = join(dir, BASELINE_FILE);
  if (!existsSync(file)) return null;
  const raw = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  const out = {} as Counts;
  for (const gate of COUNTED) {
    const v = raw[gate];
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw new Error(`${BASELINE_FILE}: ${gate} must be a non-negative integer`);
    out[gate] = v;
  }
  return out;
}
function formatBaseline(c: Counts): string {
  return JSON.stringify(Object.fromEntries(COUNTED.map(g => [g, c[g]])), null, 2) + '\n';
}

interface Report {ok: boolean; details: string[]; lines: string[]}

// R1/R2: above baseline fails; below baseline passes and is named ready to record.
function compareCounts(result: CountResult, baseline: Counts | null): {ok: boolean; lines: string[]} {
  let ok = true;
  const lines = COUNTED.map(gate => {
    const r = result[gate];
    if (!r.ok) { ok = false; return `FAIL ${name(gate)}: ${r.error}`; }
    if (!baseline) { ok = false; return `FAIL ${name(gate)}: count ${String(r.value)}, no baseline recorded (${BASELINE_FILE})`; }
    const was = baseline[gate];
    if (r.value > was) { ok = false; return `FAIL ${name(gate)}: count ${String(r.value)} above baseline ${String(was)}`; }
    if (r.value < was) return `ok   ${name(gate)}: count ${String(r.value)} below baseline ${String(was)}, ready to record (just record)`;
    return `ok   ${name(gate)}: count ${String(r.value)}, baseline ${String(was)}`;
  });
  return {ok, lines};
}

export async function check(dir: string): Promise<Report> {
  const knipRun = knip(dir);
  const typecheck = Promise.all(TYPECHECK_PROJECTS.filter(p => existsSync(join(dir, p)))
    .map(async p => tscErrors(await tool('tsc', ['--noEmit', '--pretty', 'false', '-p', p], dir)).map(e => `${p}: ${e}`)));
  const [tc, deps, tests, counted] = await Promise.all([
    settle(typecheck.then(all => all.flat())), settle(unlisted(dir)), settle(run('npm', ['test'], dir)), counts(dir, knipRun),
  ]);
  const details: string[] = [], lines: string[] = [], failed: HardGate[] = [];
  const hard = (gate: HardGate, failure: string | null, detail: readonly string[] = []) => {
    if (failure === null) { lines.push(`ok   ${name(gate)}`); return; }
    failed.push(gate); lines.push(`FAIL ${name(gate)}: ${failure}`); details.push(...detail);
  };
  if (!tc.ok) hard('typecheck', tc.error);
  else hard('typecheck', tc.value.length ? `${String(tc.value.length)} errors` : null, tc.value);
  if (!deps.ok) hard('dependencies', deps.error);
  else hard('dependencies', deps.value.length ? `unlisted ${deps.value.join(', ')}` : null);
  if (!tests.ok) hard('tests', tests.error);
  else {
    const notOk = tests.value.stdout.split('\n').filter(l => l.startsWith('not ok'));
    hard('tests', tests.value.code === 0 ? null : notOk.length ? `${String(notOk.length)} failing` : `npm test exited ${String(tests.value.code)}`,
      notOk.length ? notOk : [tests.value.stdout, tests.value.stderr].join('\n').trim().split('\n').slice(-20));
  }
  const compared = compareCounts(counted, readBaseline(dir));
  return {ok: !failed.length && compared.ok, details, lines: [...lines, ...compared.lines]};
}

// R3: the baseline changes only here, from the check's own counts, and only downwards.
type RecordPlan = {ok: true; next: Counts; lowered: string[]} | {ok: false; lines: string[]};
function planRecord(result: CountResult, baseline: Counts | null): RecordPlan {
  const refused: string[] = [], lowered: string[] = [], next = {} as Counts;
  for (const gate of COUNTED) {
    const r = result[gate];
    if (!r.ok) { refused.push(`REFUSED ${name(gate)}: ${r.error}`); continue; }
    next[gate] = r.value;
    if (!baseline) continue;
    if (r.value > baseline[gate]) refused.push(`REFUSED ${name(gate)}: count ${String(r.value)} above baseline ${String(baseline[gate])}; recording never raises a count`);
    else if (r.value < baseline[gate]) lowered.push(`lowered ${name(gate)}: ${String(baseline[gate])} -> ${String(r.value)}`);
  }
  return refused.length ? {ok: false, lines: refused} : {ok: true, next, lowered};
}

export async function record(dir: string): Promise<{ok: boolean; lines: string[]}> {
  const baseline = readBaseline(dir), plan = planRecord(await measureCounts(dir), baseline);
  if (!plan.ok) return {ok: false, lines: [...plan.lines, `record: refused, ${BASELINE_FILE} unchanged`]};
  if (baseline && !plan.lowered.length) return {ok: true, lines: [`record: no count below baseline, ${BASELINE_FILE} unchanged`]};
  writeFileSync(join(dir, BASELINE_FILE), formatBaseline(plan.next));
  return {ok: true, lines: [...(baseline ? plan.lowered : [`created ${BASELINE_FILE}`]), `record: ${BASELINE_FILE} written`]};
}

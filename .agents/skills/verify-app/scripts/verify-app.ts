/**
 * verify-app: drive the Exo plugin's offline run surface, the ADR 0002 fallback demo launcher
 * `plugins/bb-plugin-exosurface/demo/surfaces <scenario>`, the way a user does and keep the proof.
 * Usage: verify-app setup|launch|doctor|drive <feature>|cleanup|run
 * Run state: $VERIFY_APP_RUN_DIR. Evidence: $VERIFY_APP_EVIDENCE_DIR.
 * Both default outside the git dir, under ${TMPDIR:-/tmp}.
 * Node runs this file directly (type stripping, no build), through ./verify-app. qc.toml is read with python3's
 * tomllib (mise.toml pins python); the commands that read only the run state need nothing else.
 */
import { spawn, spawnSync, type SpawnSyncReturns } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ME = "verify-app";
const USAGE = "usage: verify-app setup|launch|doctor|drive <feature>|cleanup|run";
const SCRIPT_DIR = import.meta.dirname;
const REPO = path.resolve(SCRIPT_DIR, "../../../..");
const CONTRACT = path.join(REPO, "qc.toml");
const PLUGIN = path.join(REPO, "plugins", "bb-plugin-exosurface");
/** Each mapped feature with a drive, and the demo/surfaces scenario it runs (features/<feature>.md). */
const FEATURES: Record<string, string> = { "new-surface": "new-surface" };
/** One scenario's wall-clock bound, then the wait for its process group to be gone once it exited. */
const CASE_SECONDS = 300;
const GROUP_GONE_SECONDS = 15;

/** POSIX cksum's CRC, so the default folders keep the name the template's helper gives them. */
function cksum(data: Buffer): number {
  const tail: number[] = [];
  for (let n = data.length; n > 0; n = Math.floor(n / 256)) tail.push(n % 256);
  let crc = 0;
  for (const b of [...data, ...tail]) {
    crc = (crc ^ (b << 24)) >>> 0;
    for (let i = 0; i < 8; i++) crc = (crc & 0x80000000 ? (crc << 1) ^ 0x04c11db7 : crc << 1) >>> 0;
  }
  return ~crc >>> 0;
}

function envOr(name: string, fallback: string): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

const BASE = path.join(envOr("TMPDIR", "/tmp"), `${ME}.${String(process.getuid?.() ?? 0)}.${String(cksum(Buffer.from(REPO)))}`);
const RUN_DIR = envOr("VERIFY_APP_RUN_DIR", path.join(BASE, "run"));
const EVIDENCE_DIR = envOr("VERIFY_APP_EVIDENCE_DIR", path.join(BASE, "evidence"));
const STATE = path.join(RUN_DIR, "state");
// The default folders sit in the shared temp dir under a predictable name, so each is used only when
// it is private: a real directory (never a symlink), owned by this user, writable by no one else.
// An absent one is made 0700. A folder set by VERIFY_APP_RUN_DIR or VERIFY_APP_EVIDENCE_DIR is the
// caller's choice and is used as given.
const DEFAULTS = [RUN_DIR, EVIDENCE_DIR].filter((dir) => path.dirname(dir) === BASE);

function say(msg: string): void {
  process.stdout.write(`${ME}: ${msg}\n`);
}

function die(msg: string): never {
  process.stderr.write(`${ME}: ${msg}\n`);
  process.exit(1);
}

function now(): string {
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

/** Refuse a default folder that is not this user's private directory; make it when absent. */
function privateDir(dir: string, create: boolean): void {
  let info = fs.lstatSync(dir, { throwIfNoEntry: false });
  if (info === undefined) {
    if (!create) return;
    try {
      fs.mkdirSync(dir, { mode: 0o700 });
      info = fs.lstatSync(dir);
    } catch (e) {
      die(`cannot make private folder ${dir}: ${String(e)}`);
    }
  }
  if (!info.isDirectory()) die(`${dir} is not a real directory (a symlink or file); it is not yours to trust: remove it`);
  if (info.uid !== process.getuid?.()) die(`${dir} is owned by uid ${String(info.uid)}, not you; remove it (or set VERIFY_APP_*_DIR)`);
  if ((info.mode & 0o022) !== 0) {
    die(`${dir} is writable by others (mode ${(info.mode & 0o777).toString(8)}); fix: chmod 700 ${dir}`);
  }
}

/** BASE and each default folder in it: checked if present, made private if absent. */
function secureDefaults(): void {
  if (DEFAULTS.length > 0) privateDir(BASE, true);
  for (const dir of DEFAULTS) privateDir(dir, false);
}

/** Prove a folder is writable by writing to it; `test -w` lies under some sandboxes. */
function writable(dir: string): boolean {
  if (DEFAULTS.includes(dir)) privateDir(dir, true);
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.verify-app-probe.${String(process.pid)}`);
    fs.writeFileSync(probe, "");
    fs.rmSync(probe);
    return true;
  } catch {
    return false;
  }
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): SpawnSyncReturns<string> {
  return spawnSync(cmd, args, { encoding: "utf8", ...opts });
}

/** A probe's exit code and its stdout and stderr, trailing newlines stripped as `$(...)` does. */
function output(cmd: string, args: string[], opts: { cwd?: string } = {}): { code: number; out: string } {
  const r = run(cmd, args, opts);
  if (r.error) return { code: 127, out: r.error.message };
  return { code: r.status ?? 128, out: (r.stdout + r.stderr).replace(/\n+$/, "") };
}

function gitRev(repo: string): string {
  const { code, out } = output("git", ["-C", repo, "rev-parse", "--short", "HEAD"]);
  return code === 0 && out !== "" ? out : "unknown";
}

/**
 * The app-driver contract, qc.toml at the repo root (format 1). The helper sets up, enters and resets the
 * app only through it; its commands run under sh with QC_REPO set.
 */
interface Contract {
  setup: string;
  entry: string;
  services: string[];
  fixtures: Record<string, string>; // name: reset command
  values: Record<string, string>;
}

/** A plain object (a TOML table, as tomllib's JSON gives it). */
function isTable(t: unknown): t is Record<string, unknown> {
  return Object.prototype.toString.call(t) === "[object Object]";
}

function strings(t: unknown): Record<string, string> | undefined {
  if (!isTable(t)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(t)) {
    if (typeof v !== "string") return undefined;
    out[k] = v;
  }
  return out;
}

/** qc.toml as data, read by python3's tomllib (no TOML package in this repo's graph). */
function parseToml(file: string): unknown {
  const r = run("python3", ["-c", "import json,sys,tomllib;print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))", file]);
  if (r.error) die(`cannot run python3 to read ${file} (${r.error.message}): run just setup (mise.toml pins python)`);
  if (r.status !== 0) die(`cannot read the app-driver contract ${file}: ${r.stderr.trim()}`);
  return JSON.parse(r.stdout);
}

function readContract(): Contract {
  const c = parseToml(CONTRACT);
  if (!isTable(c)) die(`${CONTRACT} does not match format 1 (validate: octo-feather-contract)`);
  const { format, entry, services, fixture, values: rawValues, setup = "" } = c;
  if (format !== 1) {
    die(`${CONTRACT}: format ${format === undefined ? "None" : JSON.stringify(format)}; this helper reads format 1 (validate: octo-feather-contract)`);
  }
  const values = strings(rawValues);
  const fixtures: Record<string, string> = {};
  let fixturesOk = isTable(fixture);
  if (isTable(fixture)) {
    for (const [name, f] of Object.entries(fixture)) {
      const reset = isTable(f) ? f["reset"] : undefined;
      if (typeof reset === "string") fixtures[name] = reset;
      else fixturesOk = false;
    }
  }
  const command = isTable(entry) ? entry["command"] : undefined;
  if (typeof command !== "string" || !isTable(services) || !fixturesOk || values === undefined || typeof setup !== "string") {
    die(`${CONTRACT} does not match format 1 (validate: octo-feather-contract)`);
  }
  return { setup, entry: command, services: Object.keys(services), fixtures, values };
}

/** A contract command, as the contract says it runs: under sh, in the repo, with QC_REPO set. */
function shInRepo(command: string): boolean {
  const r = spawnSync("sh", ["-c", command], { cwd: REPO, env: { ...process.env, QC_REPO: REPO }, stdio: "inherit" });
  return r.status === 0;
}

interface State {
  contract: Contract;
  app: string;
  node: string;
  repo: string;
  rev: string;
  launched: string;
}

function loadState(): State {
  if (!fs.existsSync(STATE)) die(`no run state at ${STATE}: run 'verify-app launch' first`);
  return JSON.parse(fs.readFileSync(STATE, "utf8")) as State;
}

function cmdSetup(contract?: Contract): void {
  const c = contract ?? readContract();
  if (c.setup === "") {
    say(`no setup declared in ${CONTRACT}`);
    return;
  }
  say(`setup in ${REPO} (qc.toml setup): ${c.setup}`);
  if (!shInRepo(c.setup)) die(`qc.toml setup failed: ${c.setup}`);
}

/** A word quoted for sh, as the run state's `surfaces` command and the case files show it. */
function quote(s: string): string {
  return /^[A-Za-z0-9_@%+=:,./-]+$/.test(s) ? s : `'${s.replaceAll("'", `'"'"'`)}'`;
}

function cmdLaunch(): void {
  if (!writable(RUN_DIR)) die(`cannot write run state folder: ${RUN_DIR}`);
  if (!writable(EVIDENCE_DIR)) die(`cannot write evidence folder: ${EVIDENCE_DIR}`);
  const c = readContract();
  // Each scenario starts and stops its own fixture processes: this helper starts no service.
  if (c.services.length > 0) {
    die(`qc.toml declares services (${c.services.join(" ")}); this helper drives one scenario process at a time and starts none: extend it to start and ready them`);
  }
  cmdSetup(c);
  // The `surfaces` command: qc.toml's entry with the user's arguments appended.
  const app = path.join(RUN_DIR, "bin", "surfaces");
  fs.mkdirSync(path.join(RUN_DIR, "bin"), { recursive: true });
  fs.mkdirSync(path.join(RUN_DIR, "scratch"), { recursive: true });
  try {
    fs.writeFileSync(app, `#!/usr/bin/env bash\nexport QC_REPO=${quote(REPO)}\nexec sh -c ${quote(`${c.entry} "$@"`)} surfaces "$@"\n`, { mode: 0o755 });
    fs.chmodSync(app, 0o755);
  } catch {
    die(`cannot write surfaces command: ${app}`);
  }
  const rev = gitRev(REPO);
  const state: State = { contract: c, app, node: process.execPath, repo: REPO, rev, launched: now() };
  try {
    fs.writeFileSync(STATE, `${JSON.stringify(state, null, 1)}\n`);
  } catch {
    die(`cannot write run state file: ${STATE}`);
  }
  if (fs.statSync(STATE).size === 0) die(`run state file is empty: ${STATE}`);
  say(`ready: surfaces=${app} entry=${c.entry} rev=${rev}`);
  say(`run state: ${RUN_DIR}`);
  say(`evidence:  ${EVIDENCE_DIR}`);
}

/** Whether version a (1.2.3) is at least b. */
function atLeast(a: string, b: string): boolean {
  const [x, y] = [a.split(".").map(Number), b.split(".").map(Number)];
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0;
  }
  return true;
}

function field(o: unknown, k: string): unknown {
  return isTable(o) ? o[k] : undefined;
}

function pluginPackage(): { version: string; engines: string } {
  const p: unknown = JSON.parse(fs.readFileSync(path.join(PLUGIN, "package.json"), "utf8"));
  const version = field(p, "version");
  const engines = field(field(p, "engines"), "node");
  return { version: typeof version === "string" ? version : "unknown", engines: typeof engines === "string" ? engines : "unknown" };
}

/** The build outputs each build step writes, missing or older than their source: [missing, stale]. */
function buildGaps(): { owner: [string[], string[]]; runtime: string[] } {
  const dist = path.join(PLUGIN, "dist");
  const mtime = (f: string): number | undefined => fs.statSync(f, { throwIfNoEntry: false })?.mtimeMs;
  // build:owner (build.mjs): each src/*.ts as dist/*.js, owner-service.ts as first-run-shell-owner-service.js.
  const missing: string[] = [];
  const stale: string[] = [];
  for (const name of fs.readdirSync(path.join(PLUGIN, "src")).filter((n) => n.endsWith(".ts"))) {
    const out = path.join(dist, name === "owner-service.ts" ? "first-run-shell-owner-service.js" : name.replace(/\.ts$/, ".js"));
    const built = mtime(out);
    if (built === undefined) missing.push(path.relative(PLUGIN, out));
    else if (built < (mtime(path.join(PLUGIN, "src", name)) ?? 0)) stale.push(path.relative(PLUGIN, out));
  }
  // build:runtime (build-runtime.mjs): dist/runtime-graph.json and each bundle its entries name.
  const graph = path.join(dist, "runtime-graph.json");
  if (mtime(graph) === undefined) return { owner: [missing, stale], runtime: ["dist/runtime-graph.json"] };
  const entries = field(JSON.parse(fs.readFileSync(graph, "utf8")) as unknown, "entries");
  const names = isTable(entries) ? Object.keys(entries) : [];
  if (names.length === 0) return { owner: [missing, stale], runtime: ["dist/runtime-graph.json entries"] };
  return { owner: [missing, stale], runtime: names.map((n) => `dist/${n}.js`).filter((f) => mtime(path.join(PLUGIN, f)) === undefined) };
}

function cmdDoctor(tee?: string): number {
  const s = loadState();
  let ok = 0;
  const lines: string[] = [];
  const report = (level: string, msg: string): void => {
    const line = `${level.padEnd(8)} ${msg}`;
    process.stdout.write(`${line}\n`);
    lines.push(line);
  };
  const fail = (msg: string): void => {
    report("FAIL", msg);
    ok = 1;
  };
  try {
    fs.accessSync(s.app, fs.constants.X_OK);
    report("ok", `surfaces command ${s.app}`);
  } catch {
    fail(`surfaces command missing: ${s.app}`);
  }
  report("info", `entry (qc.toml): ${s.contract.entry}`);
  const { engines, version } = pluginPackage();
  const nodeVersion = output("node", ["--version"]).out;
  if (atLeast(nodeVersion.replace(/^v/, ""), engines.replace(/^>=/, ""))) report("ok", `node ${nodeVersion} on PATH meets the plugin's engines.node ${engines}`);
  else fail(`node ${nodeVersion} on PATH below the plugin's engines.node ${engines} (run through mise: just setup)`);
  const { owner: [missing, stale], runtime } = buildGaps();
  if (missing.length > 0) fail(`owner build (build:owner) missing ${missing.join(", ")}: run 'verify-app setup'`);
  else if (stale.length > 0) fail(`owner build (build:owner) older than its source: ${stale.join(", ")}: run 'verify-app setup'`);
  else report("ok", "owner build (build:owner) present and newer than src/");
  if (runtime.length > 0) fail(`runtime build (build:runtime) missing ${runtime.join(", ")}: run 'verify-app setup'`);
  else report("ok", "runtime build (build:runtime) present: dist/runtime-graph.json and its bundles");
  const pi = path.join(PLUGIN, "node_modules/@earendil-works/pi-coding-agent/dist/bundle/cli.js");
  if (fs.existsSync(pi)) report("ok", `Pi CLI installed (${path.relative(REPO, pi)})`);
  else fail(`Pi CLI not installed at ${path.relative(REPO, pi)}: run 'verify-app setup'`);
  // `surfaces` with no scenario prints the usage line naming every scenario and exits 2.
  const usage = output(s.app, []);
  const unlisted = Object.values(FEATURES).filter((sc) => !usage.out.includes(`|${sc}|`) && !usage.out.includes(`<${sc}|`) && !usage.out.includes(`|${sc}>`));
  if (usage.code === 2 && usage.out.startsWith("usage: demo/surfaces <") && unlisted.length === 0) {
    report("ok", `'surfaces' usage lists ${Object.values(FEATURES).join(", ")} (exit 2)`);
  } else {
    fail(`'surfaces' usage check: exit ${String(usage.code)}${unlisted.length > 0 ? `, scenario(s) not listed: ${unlisted.join(", ")}` : ""}, output: ${usage.out}`);
  }
  report("info", `plugin version ${version}`);
  const rev = gitRev(s.repo);
  if (rev === s.rev) report("ok", `checkout at launch rev ${s.rev}`);
  else report("WARN", `checkout moved: launched at ${s.rev}, now ${rev} (relaunch)`);
  const scratch = path.join(RUN_DIR, "scratch");
  if (fs.existsSync(scratch) && fs.statSync(scratch).isDirectory()) report("ok", `scratch cwd ${scratch}`);
  else fail("scratch cwd missing");
  if (tee !== undefined) fs.writeFileSync(tee, lines.map((l) => `${l}\n`).join(""));
  return ok;
}

/** What one case left: stdout, stderr, exit code. */
interface Case {
  out: string;
  err: string;
  code: number;
}

function signalNumber(signal: NodeJS.Signals | null): number {
  return signal === null ? 0 : os.constants.signals[signal];
}

/** The processes still in a process group, as `ps` lists them (pid and command line). */
function groupMembers(pgid: number): string[] {
  const r = run("ps", ["-e", "-o", "pid=,pgid=,args="]);
  return r.stdout
    .split("\n")
    .map((l) => /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => m !== null && Number(m[2]) === pgid)
    .map((m) => `${m[1] ?? ""} ${m[3] ?? ""}`);
}

function signalGroup(pgid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pgid, signal);
  } catch {
    // the group is gone already
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** The case running now, so an interrupted helper stops its process group, and only that, before it exits. */
let runningGroup: number | undefined;
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    if (runningGroup !== undefined) signalGroup(runningGroup, "SIGTERM");
    process.stderr.write(`${ME}: ${signal}: stopped the running scenario's process group ${String(runningGroup ?? "(none)")}\n`);
    process.exit(signal === "SIGINT" ? 130 : 143);
  });
}

/**
 * One isolated case: fresh empty cwd, captured argv, stdout, stderr, exit code. The scenario runs as the leader of its
 * own process group (its bridge, owner and Pi children are in it); once it exits, the helper waits for that group to
 * be empty and records in <case>.procs any process still in it, which then gets SIGKILL and fails the case.
 */
async function caseRun(s: State, dir: string, name: string, args: string[]): Promise<void> {
  const cwd = path.join(RUN_DIR, "scratch", name);
  fs.rmSync(cwd, { recursive: true, force: true });
  fs.mkdirSync(cwd, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.cmd`), `${["surfaces", ...args].map((a) => `${quote(a)} `).join("")}\n`);
  const out = fs.openSync(path.join(dir, `${name}.stdout`), "w");
  const err = fs.openSync(path.join(dir, `${name}.stderr`), "w");
  const child = spawn(s.app, args, { cwd, detached: true, stdio: ["ignore", out, err] });
  const pgid = child.pid;
  if (pgid === undefined) die(`cannot start ${s.app}`);
  runningGroup = pgid;
  const bound = { timedOut: false }; // set by the timer below; a field, so the compiler does not narrow it
  const timer = setTimeout(() => {
    bound.timedOut = true;
    signalGroup(pgid, "SIGTERM");
    setTimeout(() => { signalGroup(pgid, "SIGKILL"); }, 10000).unref();
  }, CASE_SECONDS * 1000);
  const [code, signal] = await new Promise<[number | null, NodeJS.Signals | null]>((resolve) => child.once("exit", (c, sg) => { resolve([c, sg]); }));
  clearTimeout(timer);
  fs.closeSync(out);
  fs.closeSync(err);
  // The scenario's own teardown stops its children; wait for the group to be empty, else stop it and say so.
  let left = groupMembers(pgid);
  for (let waited = 0; left.length > 0 && waited < GROUP_GONE_SECONDS * 1000; waited += 250) {
    await sleep(250);
    left = groupMembers(pgid);
  }
  if (left.length > 0) {
    signalGroup(pgid, "SIGKILL");
    await sleep(500);
  }
  runningGroup = undefined;
  fs.writeFileSync(path.join(dir, `${name}.procs`), left.map((l) => `${l}\n`).join(""));
  const exit = bound.timedOut ? 124 : (code ?? 128 + signalNumber(signal));
  fs.writeFileSync(path.join(dir, `${name}.exit`), `${String(exit)}\n`);
  // Side effect check: the scenario writes nothing where it runs (its fixture lives under the temp dir).
  const files = fs.readdirSync(cwd, { recursive: true }).map((p) => `${path.join(cwd, p.toString())}\n`).sort();
  fs.writeFileSync(path.join(dir, `${name}.files`), files.join(""));
}

/** PASS when the case's facts hold, it left no files in its cwd and no process in its group; prints what the user saw. */
function check(dir: string, name: string, holds: (c: Case) => boolean): boolean {
  const read = (ext: string): string => fs.readFileSync(path.join(dir, `${name}.${ext}`), "utf8");
  const [out, err, code] = [read("stdout"), read("stderr"), Number(read("exit"))];
  let passed: boolean;
  try {
    passed = holds({ out, err, code });
  } catch (e) {
    process.stderr.write(`check error: ${String(e)}\n`);
    passed = false;
  }
  passed &&= read("files") === "" && read("procs") === "";
  const line = `${passed ? "PASS" : "FAIL"} ${name}: ${read("cmd").replace(/\n$/, "")}`;
  process.stdout.write(`${line}\n`);
  fs.appendFileSync(path.join(dir, "summary.txt"), `${line}\n`);
  // Show what the user saw: stdout (stderr is in <case>.stderr: React's act() notices from jsdom), then the exit code.
  const shown = out.endsWith("\n") ? out.slice(0, -1) : out;
  if (out !== "") for (const ln of shown.split("\n")) process.stdout.write(`    stdout: ${ln}\n`);
  process.stdout.write(`    stderr: ${String(err.split("\n").length - 1)} line(s) in ${path.join(dir, `${name}.stderr`)}\n`);
  for (const ext of ["procs", "files"]) if (read(ext) !== "") process.stdout.write(`    ${ext} left: ${read(ext).trim().replaceAll("\n", "; ")}\n`);
  process.stdout.write(`    exit: ${String(code)}\n`);
  return passed;
}

/** pages-and-activity#acceptance-new-surface: the rendered panel, New surface pressed (features/new-surface.md). */
async function driveNewSurface(s: State): Promise<boolean> {
  const feature = "new-surface";
  const dir = path.join(EVIDENCE_DIR, feature);
  // The names expected: qc.toml values.home and values.new_surface.
  const { home, new_surface: made } = s.contract.values;
  if (home === undefined || made === undefined) {
    die("qc.toml [values] needs home and new_surface: the new-surface drive expects Home and the new surface's name");
  }
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "summary.txt"), `${feature} @ rev ${s.rev}, ${now()}\n`);
  const scenario = FEATURES[feature] ?? feature;
  await caseRun(s, dir, scenario, [scenario]);
  const lines = (c: Case): string[] => c.out.split("\n");
  const passed = check(dir, scenario, (c) => {
    const l = lines(c);
    return c.code === 0
      && l.some((x) => x.startsWith(`surface in view: ${made} (thread `))
      && l.includes("  page: one empty page")
      && l.includes("  input: shown, empty")
      && l.includes("  activity: 0 Exo message(s)")
      && l.includes(`sidebar: ${home}, ${made}`);
  });
  say(`${feature} evidence: ${dir}`);
  return passed;
}

async function cmdDrive(feature: string | undefined): Promise<number> {
  const names = Object.keys(FEATURES).join(" ");
  if (feature === undefined || feature === "") die(`usage: verify-app drive <feature> (features: ${names})`);
  const s = loadState();
  if (!writable(EVIDENCE_DIR)) die(`cannot write evidence folder: ${EVIDENCE_DIR}`);
  for (const [name, reset] of Object.entries(s.contract.fixtures)) {
    say(`reset fixture ${name} (qc.toml)`);
    if (!shInRepo(reset)) die(`qc.toml fixture ${name} reset failed: ${reset}`);
  }
  if (feature !== "new-surface") die(`unknown feature '${feature}' (features: ${names})`);
  const passed = await driveNewSurface(s);
  recordEvidence(s, feature);
  return passed ? 0 : 1;
}

/**
 * Every drive, passed or failed, appends one record to this repo's evidence store (octo-feather quality spec
 * #evidence-store) through the kit's octo-feather-evidence: the criterion the feature file's `Drive criterion:`
 * line names, the feature's evidence folder as its outputs. The store is outside the repo and outside both
 * helper folders; cleanup never touches it.
 */
function recordEvidence(s: State, feature: string): void {
  const file = path.join(SCRIPT_DIR, "..", "features", `${feature}.md`);
  if (output("sh", ["-c", "command -v octo-feather-evidence"]).code !== 0) {
    die("octo-feather-evidence (the octo-feather kit's scripts/) not on PATH: every drive appends a record to the evidence store");
  }
  const crit = /^Drive criterion: `([^`]*)`/m.exec(fs.readFileSync(file, "utf8"))?.[1] ?? "";
  if (crit === "") die(`${file} has no Drive criterion line (Drive criterion: \`<spec>#<anchor>\`): each drive names the criterion it serves`);
  // The criterion's text is its element in this repo's docs/specs/<spec>.spec.html, which octo-feather-evidence reads and hashes.
  const r = spawnSync("octo-feather-evidence", ["append", "--repo", s.repo, "--criterion", crit, "--outputs", path.join(EVIDENCE_DIR, feature)], {
    encoding: "utf8",
    stdio: ["inherit", "pipe", "inherit"],
  });
  if (r.status !== 0) {
    die(`evidence record for ${feature} not appended for criterion ${crit} (octo-feather-evidence failed, message above; its text must be in docs/specs/${crit.split("#")[0] ?? ""}.spec.html)`);
  }
  say(`evidence record ${r.stdout.trim()} (criterion ${crit}; read: octo-feather-evidence read --criterion ${crit} --commit ${s.rev})`);
}

function cmdCleanup(): void {
  // No process outlives a case: each scenario's process group is seen empty before the case ends. Remove only our run state.
  if (fs.existsSync(RUN_DIR)) {
    fs.rmSync(path.join(RUN_DIR, "scratch"), { recursive: true, force: true });
    fs.rmSync(STATE, { force: true });
    fs.rmSync(path.join(RUN_DIR, "bin", "surfaces"), { force: true });
    for (const d of [path.join(RUN_DIR, "bin"), RUN_DIR]) {
      try {
        fs.rmdirSync(d);
      } catch {
        // not empty: something else lives there, keep it
      }
    }
    say(`removed run state ${RUN_DIR}`);
  }
  say(`evidence kept at ${EVIDENCE_DIR}`);
}

async function cmdRun(): Promise<number> {
  cmdLaunch();
  let code = cmdDoctor(path.join(EVIDENCE_DIR, "doctor.txt"));
  if (code === 0) code = await cmdDrive("new-surface");
  cmdCleanup();
  if (!fs.existsSync(EVIDENCE_DIR)) die(`evidence folder gone after cleanup: ${EVIDENCE_DIR}`);
  spawnSync("ls", ["-laR", EVIDENCE_DIR], { stdio: "inherit" });
  say(code === 0 ? "run PASS" : "run FAIL");
  return code;
}

async function main(argv: string[]): Promise<number> {
  secureDefaults();
  switch (argv[0]) {
    case "setup":
      cmdSetup();
      return 0;
    case "launch":
      cmdLaunch();
      return 0;
    case "doctor":
      return cmdDoctor();
    case "drive":
      return cmdDrive(argv[1]);
    case "cleanup":
      cmdCleanup();
      return 0;
    case "run":
      return cmdRun();
    default:
      return die(USAGE);
  }
}

process.exitCode = await main(process.argv.slice(2));

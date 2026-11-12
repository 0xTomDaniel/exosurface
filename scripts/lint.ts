// Root gate driver for the TS/JS standards tools: the TypeScript compiler over the justfile's ts_projects, typed
// ESLint and knip, each a gate of the counted no-raise ratchet (scripts/standards-baseline.ts, owner decision #216
// comment 6829935664). --compiler-files and --files also print each tool's own covered-file list for check-languages.
// Default mode checks against scripts/standards-baseline.json; --record-baseline lowers existing gates;
// --record-initial adds gates absent from the baseline and never touches existing ones.
import { spawnSync, execFileSync } from "node:child_process";
import path from "node:path";
import type ts from "typescript";
import { check, counts, describeResult, knipFindings, record, recordInitial, type Counts, type Finding } from "./standards-baseline.ts";
import { deferredTreeDrift, deferredTreeLines, isDeferredTree } from "./owner-deferrals.ts";

const baselineFile = "scripts/standards-baseline.json";
const initial = process.argv.includes("--record-initial");
const recording = initial || process.argv.includes("--record-baseline");
const rootPrefix = `${process.cwd()}${path.sep}`;
const relative = (file: string) => path.relative(process.cwd(), file);
/** Tool messages without this checkout's absolute path, so baseline keys are the same on every machine. */
function portable(text: string): string {
  return text.split(rootPrefix).join("");
}

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0").filter((file) => /\.[cm]?[jt]sx?$/u.test(file));
// Integrity-pinned sources (scripts/source-inventory.json, verified) are not maintained TS/JS.
const exempt = new Set(execFileSync("python", ["-B", "scripts/source-inventory.py", "--exempt"], { encoding: "utf8" }).trim().split("\n"));
// Owner-deferred source trees (scripts/owner-deferrals.ts) leave the TS/JS universe: not assessed, never baselined.
const unique = [...new Set(files)].filter((file) => !exempt.has(file) && !isDeferredTree(file)).sort();

const child = process.argv.find((arg) => arg.startsWith("--compiler-project="));
if (child !== undefined) {
  await compilerProject(child.slice("--compiler-project=".length));
} else {
  const projects = process.argv.filter((arg) => arg.startsWith("--project=")).map((arg) => arg.slice("--project=".length));
  const drift = deferredTreeDrift(process.cwd(), projects);
  if (drift.length > 0) throw new Error(`owner deferral drift: ${drift.join("; ")}`);
  for (const line of deferredTreeLines([...new Set(files)])) console.error(line);
  if (process.argv.includes("--compiler") || process.argv.includes("--compiler-files")) compiler(projects);
  else if (process.argv.includes("--knip")) knip();
  else eslint();
}

/** Check or record each measured gate; returns false when any gate fails or recording refuses. */
function ratchet(gates: Record<string, Finding[]>): boolean {
  const current: Record<string, Counts> = Object.fromEntries(Object.entries(gates).map(([gate, list]) => [gate, counts(list)]));
  if (recording) {
    if (initial && process.argv.includes("--record-baseline")) {
      console.error("standards baseline: refused: use --record-initial or --record-baseline, not both");
      return false;
    }
    try {
      if (initial) {
        for (const gate of recordInitial(baselineFile, current, exempt)) {
          console.error(`standards baseline: initial record added ${gate}: ${String(Object.values(current[gate] ?? {}).reduce((sum, count) => sum + count, 0))} findings`);
        }
        return true;
      }
      for (const result of record(baselineFile, current, exempt)) console.error(`recorded ${describeResult(result).join("\n")}`);
      console.error(`standards baseline: recorded ${Object.keys(current).join(", ")} in ${baselineFile}`);
      return true;
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error));
      return false;
    }
  }
  let ok = true;
  for (const [gate, values] of Object.entries(current)) {
    try {
      const result = check(gate, values, baselineFile);
      for (const line of describeResult(result)) console.error(line);
      ok &&= result.ok;
    } catch (error) {
      console.error(`${gate}: unanswered: ${error instanceof Error ? error.message : String(error)}`);
      ok = false;
    }
  }
  return ok;
}

// Dead-code gate: knip's own JSON report (gate `knip`). Exit 0/1 is an answer (1 = issues found); any other exit, a
// signal, a spawn error or an unknown report shape is unanswered.
function knip(): void {
  const result = spawnSync("pnpm", ["exec", "knip", "--reporter", "json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 240000 });
  if (result.error !== undefined || result.signal !== null || result.status === null || result.status > 1) {
    throw new Error(`knip unanswered: ${result.error?.message ?? result.signal ?? String(result.status)}: ${result.stderr}`);
  }
  if (result.stderr.length > 0) process.stderr.write(result.stderr);
  const findings = knipFindings(JSON.parse(result.stdout) as unknown, exempt).filter((finding) => !isDeferredTree(finding.file));
  const byType = new Map<string, number>();
  for (const finding of findings) byType.set(finding.code, (byType.get(finding.code) ?? 0) + 1);
  console.error(`knip: ${[...byType].map(([type, count]) => `${type} ${String(count)}`).join(", ") || "no issues"}`);
  process.exitCode = ratchet({ knip: findings }) ? 0 : 1;
}

interface LintMessage { ruleId: string | null; message: string; line: number; column: number; fatal?: boolean }
interface LintResult { filePath: string; messages: LintMessage[]; errorCount: number; warningCount: number; fatalErrorCount: number }

/** ESLint's JSON formatter output (`--format json`), checked field by field; anything else is unanswered. */
function lintResults(value: unknown): LintResult[] {
  const shape = (why: string) => new Error(`ESLint report unanswered: ${why}`);
  if (!Array.isArray(value)) throw shape("not a list");
  return value.map((entry: unknown) => {
    if (typeof entry !== "object" || entry === null || !("filePath" in entry) || typeof entry.filePath !== "string"
      || !("messages" in entry) || !Array.isArray(entry.messages)
      || !("errorCount" in entry) || typeof entry.errorCount !== "number" || !("warningCount" in entry) || typeof entry.warningCount !== "number"
      || !("fatalErrorCount" in entry) || typeof entry.fatalErrorCount !== "number") throw shape("result without filePath/messages/counts");
    const messages = (entry.messages as unknown[]).map((message): LintMessage => {
      if (typeof message !== "object" || message === null || !("ruleId" in message) || (message.ruleId !== null && typeof message.ruleId !== "string")
        || !("message" in message) || typeof message.message !== "string") throw shape("a message without ruleId/message");
      const line = "line" in message && typeof message.line === "number" ? message.line : 0;
      const column = "column" in message && typeof message.column === "number" ? message.column : 0;
      return { ruleId: message.ruleId, message: message.message, line, column, fatal: "fatal" in message && message.fatal === true };
    });
    return { filePath: entry.filePath, messages, errorCount: entry.errorCount, warningCount: entry.warningCount, fatalErrorCount: entry.fatalErrorCount };
  });
}

// Typed ESLint over the maintained TS/JS universe in bounded batches (gate `eslint`). --files prints each linted file
// on stdout (ESLint's own covered list for check-languages) and the messages on stderr.
function eslint(): void {
  const batchSize = 32;
  const findings: Finding[] = [];
  let errors = 0;
  let warnings = 0;
  const listing = process.argv.includes("--files");
  const out = (line: string) => { if (listing) console.error(line); else console.log(line); };
  for (let offset = 0; offset < unique.length; offset += batchSize) {
    const batch = unique.slice(offset, offset + batchSize);
    const result = spawnSync("pnpm", ["exec", "eslint", "--no-warn-ignored", "--format", "json", ...batch], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000,
    });
    if (result.error !== undefined || result.status === null || result.status > 1) {
      throw new Error(`ESLint batch failed: ${result.error?.message ?? result.stderr}`);
    }
    const report = lintResults(JSON.parse(result.stdout) as unknown);
    const expectedBatch = batch.map((file) => path.resolve(file)).sort();
    const actualBatch = report.map((entry) => entry.filePath).sort();
    if (JSON.stringify(expectedBatch) !== JSON.stringify(actualBatch)) {
      throw new Error(`ESLint input/report union differs: ${JSON.stringify({ expectedBatch, actualBatch })}`);
    }
    for (const entry of report) {
      // A fatal result (parse/project failure, no rule ran) is not a finding: the file was never linted. It is
      // unanswered, before counting, coverage or recording, so it can never be baselined.
      const file = relative(entry.filePath);
      const unanswered = (message: string) => new Error(`ESLint unanswered: ${file}: ${portable(message)}`);
      if (entry.fatalErrorCount > 0) throw unanswered(entry.messages.find((message) => message.fatal === true)?.message ?? "fatal error");
      for (const message of entry.messages) {
        if (message.fatal === true || message.ruleId === null) throw unanswered(message.message);
        findings.push({ file, code: message.ruleId, message: portable(message.message) });
        out(`${entry.filePath}:${String(message.line)}:${String(message.column)} ${message.ruleId}: ${message.message}`);
      }
      errors += entry.errorCount;
      warnings += entry.warningCount;
      if (listing) console.log(entry.filePath);
    }
  }
  console.error(`ESLint: ${String(errors)} errors, ${String(warnings)} warnings`);
  process.exitCode = ratchet({ eslint: findings }) ? 0 : 1;
}

/** One compiler project's answer, as its child process prints it. */
interface CompilerReport { project: string; files: string[]; governing: Finding[]; integrityOnly: number }

function compilerReport(value: unknown): CompilerReport {
  const shape = (why: string) => new Error(`compiler report unanswered: ${why}`);
  if (typeof value !== "object" || value === null || !("project" in value) || typeof value.project !== "string"
    || !("files" in value) || !Array.isArray(value.files) || !("governing" in value) || !Array.isArray(value.governing)
    || !("integrityOnly" in value) || typeof value.integrityOnly !== "number") throw shape("missing project/files/governing/integrityOnly");
  const reportFiles = (value.files as unknown[]).map((file) => {
    if (typeof file !== "string") throw shape("a program file is not a path");
    return file;
  });
  const governing = (value.governing as unknown[]).map((finding): Finding => {
    if (typeof finding !== "object" || finding === null || !("file" in finding) || typeof finding.file !== "string"
      || !("code" in finding) || typeof finding.code !== "string" || !("message" in finding) || typeof finding.message !== "string") throw shape("a finding without file/code/message");
    return { file: finding.file, code: finding.code, message: finding.message };
  });
  return { project: value.project, files: reportFiles, governing, integrityOnly: value.integrityOnly };
}

// Each project compiles in its own child process (bounded; native compiler memory is released per project). A child
// that fails, is killed or prints anything but a report is unanswered: nothing is ratcheted.
function compiler(projects: string[]): void {
  if (projects.length === 0) throw new Error("Compiler projects unanswered: use the justfile's ts_projects list");
  const union = new Set<string>();
  const gates: Record<string, Finding[]> = {};
  for (const project of projects) {
    const result = spawnSync(process.execPath, [import.meta.filename, `--compiler-project=${project}`], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000,
    });
    if (result.error !== undefined || result.status === null || result.status > 1) {
      throw new Error(`Compiler project unanswered ${project}: ${result.error?.message ?? result.stderr}`);
    }
    if (result.stderr.length > 0) process.stderr.write(result.stderr);
    const report = compilerReport(JSON.parse(result.stdout) as unknown);
    if (report.project !== path.resolve(project) || result.status !== (report.governing.length > 0 ? 1 : 0)) {
      throw new Error(`Compiler project report differs: ${project}`);
    }
    for (const file of report.files) union.add(file);
    gates[`tsc:${project}`] = report.governing;
    if (report.integrityOnly > 0) console.error(`tsc:${project}: ${String(report.integrityOnly)} diagnostics in integrity-pinned files (not maintained, not counted)`);
  }
  // --no-coverage: one project's ratchet only (the plugin package's typecheck step); coverage of the whole TS/JS
  // universe stays with the canonical check-ts/ts-files recipes over every ts_projects entry.
  const projectOnly = process.argv.includes("--no-coverage");
  if (projectOnly && (projects.length !== 1 || process.argv.includes("--compiler-files") || recording)) {
    throw new Error("--no-coverage takes exactly one --project, never --compiler-files or a record flag");
  }
  const missing = projectOnly ? [] : unique.filter((file) => !union.has(path.resolve(file)));
  if (projectOnly) console.error("compiler coverage not checked for this single-project run; check-ts owns coverage");
  for (const file of missing) console.error(`Compiler coverage gap: ${file}; include it in its actual owner tsconfig and ts_projects`);
  if (process.argv.includes("--compiler-files")) {
    for (const file of unique.filter((file) => union.has(path.resolve(file)))) console.log(path.resolve(file));
  }
  const covered = ratchet(gates);
  process.exitCode = covered && missing.length === 0 ? 0 : 1;
}

// Child: the project's real config, program and pre-emit diagnostics. Config, options and global diagnostics always
// govern; a diagnostic in an integrity-pinned file is only counted as integrity-only.
async function compilerProject(project: string): Promise<void> {
  const { default: native } = await import("typescript");
  const configPath = path.resolve(project);
  const flatten = (text: string | ts.DiagnosticMessageChain): string =>
    typeof text === "string" ? text : [text.messageText, ...(text.next ?? []).map(flatten)].join("\n");
  const finding = (diagnostic: ts.Diagnostic): Finding => ({
    file: diagnostic.file === undefined ? "<no-file>" : relative(path.resolve(diagnostic.file.fileName)),
    code: `TS${String(diagnostic.code)}`,
    message: portable(flatten(diagnostic.messageText)),
  });
  const loaded = native.readConfigFile(configPath, (file) => native.sys.readFile(file));
  if (loaded.error !== undefined) {
    console.log(JSON.stringify({ project: configPath, files: [], governing: [finding(loaded.error)], integrityOnly: 0 }));
    process.exitCode = 1;
    return;
  }
  const parsed = native.parseJsonConfigFileContent(loaded.config, native.sys, path.dirname(configPath), undefined, configPath);
  const program = native.createProgram({
    rootNames: parsed.fileNames, options: parsed.options,
    ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
    configFileParsingDiagnostics: parsed.errors,
  });
  const unconditional = new Set([...program.getConfigFileParsingDiagnostics(), ...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()]);
  const governing: Finding[] = [];
  let integrityOnly = 0;
  for (const diagnostic of native.getPreEmitDiagnostics(program)) {
    const record = finding(diagnostic);
    if (!unconditional.has(diagnostic) && diagnostic.file !== undefined && exempt.has(record.file)) integrityOnly += 1;
    else governing.push(record);
  }
  const programFiles = program.getSourceFiles().map((file) => path.resolve(file.fileName));
  console.log(JSON.stringify({ project: configPath, files: programFiles, governing, integrityOnly }));
  process.exitCode = governing.length > 0 ? 1 : 0;
}

// Existing bounded native-tool driver: typed ESLint batches or actual public TS compiler projects.
// --files prints ESLint's own reports; --compiler-files prints the actual maintained compiler-program union.
import { spawnSync, execFileSync } from "node:child_process";
import path from "node:path";
import { appendFileSync, closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import type { ESLint } from "eslint";
import type ts from "typescript";
import { check, counts, describeResult, knipFindings, record, recordInitial, type Counts, type Finding } from "./standards-baseline.ts";
import { deferredTreeDrift, deferredTreeLines, isDeferredTree } from "./owner-deferrals.ts";

// Counted no-raise ratchet (owner decision #216 comment 6829935664): check mode by default; --record-baseline lowers
// existing gates; --record-initial adds gates absent from the baseline and never touches existing ones.
const baselineFile = "scripts/standards-baseline.json";
const initial = process.argv.includes("--record-initial");
const recording = initial || process.argv.includes("--record-baseline");
const rootPrefix = `${process.cwd()}${path.sep}`;
function portable(text: string): string {
  return text.split(rootPrefix).join("");
}
/** Check or record each measured gate; returns false when any gate fails or recording refuses. */
function ratchet(gates: Record<string, Finding[]>, recordable: boolean): boolean {
  const current: Record<string, Counts> = Object.fromEntries(Object.entries(gates).map(([gate, list]) => [gate, counts(list)]));
  if (recording) {
    if (!recordable) {
      console.error("standards baseline: refused: a partial run (--file/--smoke) never records a baseline");
      return false;
    }
    if (initial && process.argv.includes("--record-baseline")) {
      console.error("standards baseline: refused: use --record-initial or --record-baseline, not both");
      return false;
    }
    try {
      if (initial) {
        for (const gate of recordInitial(baselineFile, current, exempt)) console.error(`standards baseline: initial record added ${gate}: ${String(Object.values(current[gate] ?? {}).reduce((sum, count) => sum + count, 0))} findings`);
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

const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })
  .split("\0").filter((file) => /\.[cm]?[jt]sx?$/u.test(file));
// Same literal applicability and existing-pin verification used by language coverage.
const exempt = new Set(execFileSync("python", ["-B", "scripts/source-inventory.py", "--exempt"], { encoding: "utf8" }).trim().split("\n"));
// Owner-deferred source trees (scripts/owner-deferrals.ts) leave the TS/JS universe: not assessed, never baselined.
const unique = [...new Set(files)].filter((file) => !exempt.has(file) && !isDeferredTree(file)).sort();
if (!process.argv.includes("--python") && !process.argv.some((arg) => arg.startsWith("--compiler-project="))) {
  const gatedProjects = process.argv.filter((arg) => arg.startsWith("--project=")).map((arg) => arg.slice("--project=".length));
  const drift = deferredTreeDrift(process.cwd(), gatedProjects);
  if (drift.length > 0) throw new Error(`owner deferral drift: ${drift.join("; ")}`);
  for (const line of deferredTreeLines([...new Set(files)])) console.error(line);
}
if (process.argv.includes("--python")) {
  python();
} else if (process.argv.some((arg) => arg.startsWith("--compiler"))) {
  await compiler();
} else if (process.argv.includes("--knip")) {
  knip();
} else {
  eslint();
}

// Dead-code gate: knip's own JSON report under the same counted ratchet (gate `knip`). Exit 0/1 is an answer
// (1 = issues found); any other exit, a signal, a spawn error or an unknown report shape is unanswered.
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
  process.exitCode = ratchet({ knip: findings }, true) ? 0 : 1;
}

function python(): void {
  const selected = execFileSync("python", ["-B", "scripts/source-inventory.py", "--maintained"], { encoding: "utf8" }).trim().split("\n").filter(Boolean).sort();
  if (selected.length === 0 || new Set(selected).size !== selected.length) throw new Error("Python maintained inputs unanswered");
  const identities = (): Record<string, string> => Object.fromEntries(selected.map((file) => [file, createHash("sha256").update(readFileSync(file)).digest("hex")]));
  const profiles = () => ["ruff.toml", "pyrightconfig.json"].map((file) => ({ file, mode: statSync(file).mode, sha256: createHash("sha256").update(readFileSync(file)).digest("hex") }));
  const before = identities(), profileBefore = profiles();
  function launch(tool: string, args: string[]) {
    const start = new Date().toISOString();
    const answer = spawnSync(tool, args, { encoding: "utf8", timeout: 75000, maxBuffer: 64 * 1024 * 1024 });
    console.error(JSON.stringify({ tool, args, start, end: new Date().toISOString(), nativeRC: answer.status, signal: answer.signal, error: answer.error?.message ?? null, stdout: answer.stdout, stderr: answer.stderr }));
    return answer;
  }
  const version = launch("ruff", ["--version"]);
  const coverage = launch("ruff", ["check", "--show-files", ...selected]);
  const ruffArgs = ["check", "--output-format", "json", ...selected];
  const basedArgs = ["exec", "basedpyright", "--project", "pyrightconfig.json", "--outputjson", "--warnings", ...selected];
  // BOTH actual native answers are captured before either is judged.
  const ruff = launch("ruff", ruffArgs), based = launch("pnpm", basedArgs);
  const after = identities(), profileAfter = profiles();
  if (JSON.stringify(profileBefore) !== JSON.stringify(profileAfter) || JSON.stringify(before) !== JSON.stringify(after)) throw new Error("Python profile/source brackets changed; raw answers above retained");
  if (version.error || version.signal || version.status !== 0 || version.stdout.trim() !== "ruff 0.17.1" || coverage.error || coverage.signal || coverage.status !== 0) throw new Error("Python native version/coverage unanswered");
  const observed = coverage.stdout.trim().split("\n").filter(Boolean).map((file) => path.relative(process.cwd(), path.resolve(file))).sort();
  if (JSON.stringify(observed) !== JSON.stringify(selected)) throw new Error("Ruff actual coverage differs");
  const envelope = { version: 1, tool: "ruff", toolVersion: "0.17.1", configSha256: createHash("sha256").update(readFileSync("ruff.toml")).digest("hex"), inputs: selected, coverage: observed, sourceHashes: before, nativeRC: ruff.status, stdout: ruff.stdout, stderr: ruff.stderr, signal: ruff.signal, error: ruff.error?.message ?? null, execution: { argv: ruffArgs, cwd: process.cwd(), sourceHashesBefore: before, sourceHashesAfter: after, profileBefore, profileAfter } };
  const basedEnvelope = { version: 1, tool: "basedpyright", toolVersion: "1.40.2", configSha256: createHash("sha256").update(readFileSync("pyrightconfig.json")).digest("hex"), inputs: selected, coverage: selected, sourceHashes: before, nativeRC: based.status, stdout: based.stdout, stderr: based.stderr, signal: based.signal, error: based.error?.message ?? null, execution: { argv: basedArgs, cwd: process.cwd(), sourceHashesBefore: before, sourceHashesAfter: after, profileBefore, profileAfter } };
  // Replay API and canonical driver use the SAME production decoder for BOTH tools.
  const partitions = [envelope, basedEnvelope].map((native) => ({ native, answer: spawnSync("python", ["-B", "scripts/source-inventory.py", "--audit-native"], { input: JSON.stringify(native), encoding: "utf8", timeout: 75000, maxBuffer: 64 * 1024 * 1024 }) }));
  function isObject(value: unknown): value is Record<string, unknown> {
    return value !== null && typeof value === "object" && !Array.isArray(value);
  }
  function object(value: unknown): Record<string, unknown> {
    if (!isObject(value)) throw new Error("Unknown native audit schema");
    return value;
  }
  let governing = 0;
  for (const { native, answer } of partitions) {
    if (answer.stderr) process.stderr.write(answer.stderr);
    console.error(JSON.stringify({ nativeAuditTool: native.tool, nativeRC: answer.status, signal: answer.signal, error: answer.error?.message ?? null, stdout: answer.stdout, stderr: answer.stderr }));
    if (answer.error || answer.signal || answer.status !== 0) throw new Error("Native audit refused; raw answers remain governing");
    const report = object(JSON.parse(answer.stdout));
    const rows = report["records"];
    const raw = native.tool === "ruff" ? JSON.parse(native.stdout) : object(JSON.parse(native.stdout))["generalDiagnostics"];
    if (!Array.isArray(rows) || !Array.isArray(raw) || report["version"] !== 1 || report["adaptedCount"] !== 0 || report["proofAdmissionImplemented"] !== false || report["fullCoverage"] !== true || report["rawCount"] !== raw.length || report["governingCount"] !== rows.length || rows.length !== raw.length || JSON.stringify(report["native"]) !== JSON.stringify(native)) throw new Error("Native partition/count/identity differs");
    rows.forEach((value: unknown, index: number) => {
      const row = object(value);
      if (row["rawIndex"] !== index || row["disposition"] !== "governing" || JSON.stringify(row["raw"]) !== JSON.stringify(raw[index])) throw new Error("Dropped/changed/duplicate raw partition");
    });
    governing += rows.length;
    console.error(JSON.stringify({ pythonNativeAudit: report }));
  }
  if (JSON.stringify(profileBefore) !== JSON.stringify(profiles()) || JSON.stringify(before) !== JSON.stringify(identities())) throw new Error("Inputs changed during audit");
  process.exitCode = governing ? 1 : 0;
}

function eslint(): void {
  const smoke = process.argv.includes("--smoke");
  const batchSize = 32;
  const requested = process.argv.filter((arg) => arg.startsWith("--file=")).map((arg) => arg.slice("--file=".length));
  for (const file of requested) {
    if (!unique.includes(file)) throw new Error(`Not a maintained tracked lint input: ${file}`);
  }
  const selected = requested.length > 0 ? unique.filter((file) => requested.includes(file)) : smoke ? unique.slice(0, batchSize) : unique;
  const actual: string[] = [];
  const findings: Finding[] = [];
  let errors = 0;
  let warnings = 0;
  for (let offset = 0; offset < selected.length; offset += batchSize) {
    const batch = selected.slice(offset, offset + batchSize);
    const result = spawnSync("pnpm", ["exec", "eslint", "--no-warn-ignored", "--format", "json", ...batch], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000,
    });
    if (result.error !== undefined || result.status === null || result.status > 1) {
      throw new Error(`ESLint batch failed: ${result.error?.message ?? result.stderr}`);
    }
    // ESLint's documented JSON formatter protocol; a malformed/unanswered report fails JSON.parse.
    const report = JSON.parse(result.stdout) as ESLint.LintResult[];
    const expectedBatch = batch.map((file) => path.resolve(file)).sort();
    const actualBatch = report.map((entry) => entry.filePath).sort();
    if (JSON.stringify(expectedBatch) !== JSON.stringify(actualBatch)) {
      throw new Error(`ESLint input/report union differs: ${JSON.stringify({ expectedBatch, actualBatch })}`);
    }
    actual.push(...actualBatch);
    for (const entry of report) {
      errors += entry.errorCount;
      warnings += entry.warningCount;
      for (const message of entry.messages) {
        findings.push({ file: path.relative(process.cwd(), entry.filePath), code: message.ruleId ?? "parser", message: portable(message.message) });
      }
      if (process.argv.includes("--files")) {
        console.log(entry.filePath);
        for (const message of entry.messages) console.error(`${entry.filePath}:${String(message.line)}:${String(message.column)} ${message.ruleId ?? "parser"}: ${message.message}`);
      }
      else {
        for (const message of entry.messages) console.log(`${entry.filePath}:${String(message.line)}:${String(message.column)} ${message.ruleId ?? "parser"}: ${message.message}`);
      }
    }
  }
  if (smoke || requested.length > 0) console.error(JSON.stringify({ intendedUniverse: unique, selected, actual, fullCoverage: false }));
  if (!process.argv.includes("--files")) {
    console.log(`ESLint: ${String(errors)} errors, ${String(warnings)} warnings`);
  } else console.error(`ESLint: ${String(errors)} errors, ${String(warnings)} warnings`);
  process.exitCode = ratchet({ eslint: findings }, !smoke && requested.length === 0) ? 0 : 1;
}

type NativeDiagnostic = Omit<ts.Diagnostic, "file" | "relatedInformation"> & {
  file: string | null;
  relatedInformation: NativeDiagnostic[];
};
interface CompilerReport {
  project: string;
  files: string[];
  governing: NativeDiagnostic[];
  integrityOnly: NativeDiagnostic[];
  rawDiagnosticCount: number;
}

// Phase records are synchronous/fsynced before native entry and immediately on native return.
// They observe the existing program, not an alternate diagnostic order or checker.
function compilerPhases(): (phase: string, event: string, detail?: unknown) => void {
  const directory = path.join(execFileSync("git", ["rev-parse", "--absolute-git-dir"], { encoding: "utf8" }).trim(), "compiler-phases");
  mkdirSync(directory, { recursive: true });
  const file = path.join(directory, `${String(Date.now())}-${String(process.pid)}.jsonl`);
  const descriptor = openSync(file, "wx", 0o600);
  process.once("exit", () => { closeSync(descriptor); });
  process.stderr.write(`Compiler phase log: ${file}\n`);
  return (phase, event, detail) => {
    appendFileSync(descriptor, JSON.stringify({ utc: new Date().toISOString(), pid: process.pid, phase, event, detail }) + "\n");
    fsyncSync(descriptor);
  };
}

function compilerFileIdentity(file: string): unknown {
  // Stream identity reads, avoiding a whole executable/library buffer before native analysis.
  let descriptor: number | undefined;
  try {
    const metadata = statSync(file);
    descriptor = openSync(file, "r");
    const buffer = Buffer.alloc(65536);
    const hash = createHash("sha256");
    for (let size = readSync(descriptor, buffer, 0, buffer.length, null); size > 0; size = readSync(descriptor, buffer, 0, buffer.length, null)) hash.update(buffer.subarray(0, size));
    return { file, size: metadata.size, mode: metadata.mode, sha256: hash.digest("hex") };
  } catch (error) {
    return { file, identityReadError: error instanceof Error ? error.message : String(error) };
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}

// Diagnostic experiment only: temporary function identities/arity/stack, logging allocations and
// cancellation timing differ. Fatal abort cannot restore descriptors or guarantee telemetry.
function publicDiagnosticSubcalls<T>(program: ts.Program, operation: () => T,
  phase: (name: string, event: string, detail?: unknown) => void): T {
  let invalid = false;
  function invalidate(): void {
    invalid = true;
    process.exitCode = 2;
    try { process.stderr.write("DIAGNOSTIC OBSERVATION INVALID\n"); } catch { /* Nonzero/unanswered even if both telemetry channels fail. */ }
  }
  function trace(name: string, event: string): void {
    try { phase(`public.${name}`, event); } catch { invalidate(); }
  }
  function forward<Args extends unknown[], Result>(name: string, original: (...args: Args) => Result): (this: unknown, ...args: Args) => Result {
    return function (this: unknown, ...args: Args): Result {
      trace(name, "BEGIN");
      try {
        const value = Reflect.apply(original, this, args);
        trace(name, "NATIVE_RETURN");
        return value;
      } catch (error) {
        trace(name, "THROW");
        throw error;
      }
    };
  }
  type Name = "getConfigFileParsingDiagnostics" | "getOptionsDiagnostics" | "getSyntacticDiagnostics" | "getGlobalDiagnostics" | "getSemanticDiagnostics" | "getDeclarationDiagnostics";
  const names: Name[] = ["getConfigFileParsingDiagnostics", "getOptionsDiagnostics", "getSyntacticDiagnostics", "getGlobalDiagnostics", "getSemanticDiagnostics", "getDeclarationDiagnostics"];
  const saved = names.map((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(program, name);
    if (descriptor === undefined || !Object.hasOwn(descriptor, "value") || Object.hasOwn(descriptor, "get") || Object.hasOwn(descriptor, "set")
      || descriptor.writable !== true || descriptor.configurable !== true) throw new Error(`Unsupported public diagnostic descriptor: ${name}`);
    const original: unknown = descriptor.value;
    if (typeof original !== "function" || original !== program[name]) throw new Error(`Public diagnostic reference differs: ${name}`);
    return { name, descriptor, original };
  });
  const replacements = {
    getConfigFileParsingDiagnostics: forward("getConfigFileParsingDiagnostics", program.getConfigFileParsingDiagnostics),
    getOptionsDiagnostics: forward("getOptionsDiagnostics", program.getOptionsDiagnostics),
    getSyntacticDiagnostics: forward("getSyntacticDiagnostics", program.getSyntacticDiagnostics),
    getGlobalDiagnostics: forward("getGlobalDiagnostics", program.getGlobalDiagnostics),
    getSemanticDiagnostics: forward("getSemanticDiagnostics", program.getSemanticDiagnostics),
    getDeclarationDiagnostics: forward("getDeclarationDiagnostics", program.getDeclarationDiagnostics),
  };
  let pendingThrow = false;
  try {
    for (const entry of saved) Object.defineProperty(program, entry.name, { ...entry.descriptor, value: replacements[entry.name] });
    trace("getPreEmitDiagnostics", "BEGIN");
    try {
      const value = operation();
      trace("getPreEmitDiagnostics", "NATIVE_RETURN");
      return value;
    } catch (error) {
      trace("getPreEmitDiagnostics", "THROW");
      throw error;
    }
  } catch (error) {
    pendingThrow = true;
    throw error;
  } finally {
    let restorationFailed = false;
    for (const entry of saved) {
      try {
        Object.defineProperty(program, entry.name, entry.descriptor);
        const restored = Object.getOwnPropertyDescriptor(program, entry.name);
        const value: unknown = restored?.value;
        if (restored === undefined || !Object.hasOwn(restored, "value") || Object.hasOwn(restored, "get") || Object.hasOwn(restored, "set")
          || value !== entry.original || restored.writable !== entry.descriptor.writable
          || restored.enumerable !== entry.descriptor.enumerable || restored.configurable !== entry.descriptor.configurable) throw new Error("Descriptor restoration differs");
      } catch { restorationFailed = true; invalidate(); }
    }
    if (!restorationFailed) trace("descriptors", "RESTORED");
    // Never replace even a thrown undefined with a cleanup/telemetry error.
    if (!pendingThrow && invalid) throw new Error("Diagnostic observation invalid; no answered native report");
  }
}

// Both canonical compiler recipes enter this adapter with the same actual project list.
// Preserve native programs/options/imported types; applicability partitions diagnostics, not types.
async function compiler(): Promise<void> {
  const phase = compilerPhases();
  function observe<T>(name: string, operation: () => T): T {
    phase(name, "BEGIN");
    const value = operation();
    // No value serialization occurs before this durable native-return marker.
    phase(name, "NATIVE_RETURN");
    return value;
  }
  const one = process.argv.find((arg) => arg.startsWith("--compiler-project="));
  const diagnosticOnly = process.argv.includes("--compiler-observe-public-subcalls");
  if (diagnosticOnly && one === undefined) throw new Error("Public-subcall observation is direct compiler-project only, not a canonical recipe");
  if (one !== undefined) {
    phase("typescriptImport", "BEGIN");
    const { default: native } = await import("typescript");
    phase("typescriptImport", "NATIVE_RETURN");
    const project = path.resolve(one.slice("--compiler-project=".length));
    const loaded = observe("readConfigFile", () => native.readConfigFile(project, native.sys.readFile));
    if (loaded.error !== undefined) {
      phase("configErrorReport", "SERIALIZATION_BEGIN");
      const output = JSON.stringify({ project, files: [], governing: [serialize(loaded.error)], integrityOnly: [], rawDiagnosticCount: 1 });
      phase("configErrorReport", "SERIALIZATION_END");
      console.log(output);
      process.exitCode = diagnosticOnly ? 2 : 1;
      return;
    }
    const parsed = observe("parseJsonConfigFileContent", () => native.parseJsonConfigFileContent(loaded.config, native.sys, path.dirname(project), undefined, project));
    phase("createProgram", "INPUT", {
      cwd: process.cwd(), mode: "compiler-project", argv: process.argv.slice(2), rootSelection: "parsed.fileNames (unchanged)",
      project, config: compilerFileIdentity(project), configInput: loaded.config,
      options: parsed.options, configErrors: parsed.errors.map(serialize), references: parsed.projectReferences,
      roots: parsed.fileNames, rootIdentities: parsed.fileNames.map(compilerFileIdentity),
      adapter: compilerFileIdentity(import.meta.filename), node: process.version, executable: compilerFileIdentity(process.execPath),
      compilerVersion: native.version, compiler: compilerFileIdentity(createRequire(import.meta.url).resolve("typescript")),
    });
    const program = observe("createProgram", () => native.createProgram({
      rootNames: parsed.fileNames, options: parsed.options,
      ...(parsed.projectReferences === undefined ? {} : { projectReferences: parsed.projectReferences }),
      configFileParsingDiagnostics: [...(loaded.error === undefined ? [] : [loaded.error]), ...parsed.errors],
    }));
    const observedSources = observe("program.getSourceFiles.observation", () => program.getSourceFiles());
    phase("createProgram", "SERIALIZATION_END", { sourceFiles: observedSources.map((file) => ({ file: file.fileName, isDeclarationFile: file.isDeclarationFile })) });
    phase("program.getSourceFiles.observation", "SERIALIZATION_END");
    const raw = diagnosticOnly
      ? publicDiagnosticSubcalls(program, () => native.getPreEmitDiagnostics(program), phase)
      : observe("getPreEmitDiagnostics", () => native.getPreEmitDiagnostics(program));
    function serialize(diagnostic: ts.Diagnostic): NativeDiagnostic {
      const { file, relatedInformation, ...fields } = diagnostic;
      return { ...fields, file: file === undefined ? null : path.resolve(file.fileName),
        relatedInformation: (relatedInformation ?? []).map(serialize) };
    }
    // Opt-in only, AFTER exact restoration: complete ordered records for cold reference comparison.
    if (diagnosticOnly) phase("public.rawDiagnostics", "ORDERED_REPORT", { diagnostics: raw.map(serialize) });
    const unconditional = new Set([
      ...observe("program.getConfigFileParsingDiagnostics", () => program.getConfigFileParsingDiagnostics()),
      ...observe("program.getOptionsDiagnostics", () => program.getOptionsDiagnostics()),
      ...observe("program.getGlobalDiagnostics", () => program.getGlobalDiagnostics()),
    ].map((diagnostic) => JSON.stringify(serialize(diagnostic))));
    phase("unconditionalDiagnostics", "SERIALIZATION_END");
    for (const name of ["program.getConfigFileParsingDiagnostics", "program.getOptionsDiagnostics", "program.getGlobalDiagnostics"]) phase(name, "SERIALIZATION_END");
    phase("diagnosticPartition", "BEGIN");
    const report: CompilerReport = { project, files: observe("program.getSourceFiles.report", () => program.getSourceFiles()).map((file) => path.resolve(file.fileName)),
      governing: [], integrityOnly: [], rawDiagnosticCount: raw.length };
    for (const diagnostic of raw) {
      const record = serialize(diagnostic);
      // No-file/global/options/config diagnostics can never be exempted. Unknown files govern.
      if (!unconditional.has(JSON.stringify(record)) && record.file !== null && exempt.has(path.relative(process.cwd(), record.file))) report.integrityOnly.push(record);
      else report.governing.push(record);
    }
    phase("program.getSourceFiles.report", "SERIALIZATION_END");
    phase("diagnosticPartition", "SERIALIZATION_END");
    phase("report", "SERIALIZATION_BEGIN");
    const output = JSON.stringify(report);
    phase("report", "SERIALIZATION_END", { raw: report.rawDiagnosticCount, governing: report.governing.length, integrityOnly: report.integrityOnly.length });
    phase("getPreEmitDiagnostics", "SERIALIZATION_END");
    console.log(output);
    // Reserved non-production status: even a complete observation is never canonical green.
    process.exitCode = diagnosticOnly ? 2 : report.governing.length > 0 ? 1 : 0;
    return;
  }
  const projects = process.argv.filter((arg) => arg.startsWith("--project=")).map((arg) => arg.slice("--project=".length));
  if (projects.length === 0) throw new Error("Compiler projects unanswered: use the justfile's ts_projects list");
  const union = new Set<string>();
  const gates: Record<string, Finding[]> = {};
  let governing = 0;
  let integrityOnly = 0;
  for (const project of projects) {
    // Existing bounded sequential driver boundary releases native compiler memory per actual project.
    phase("compilerChild", "BEGIN", { project });
    const child = spawnSync(process.execPath, [import.meta.filename, `--compiler-project=${project}`], {
      encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000,
    });
    phase("compilerChild", "NATIVE_RETURN", { project, status: child.status, signal: child.signal, error: child.error?.message });
    if (child.error !== undefined || child.status === null || child.status > 1) {
      throw new Error(`Compiler project unanswered ${project}: ${child.error?.message ?? child.stderr}`);
    }
    if (child.stderr.length > 0) process.stderr.write(child.stderr);
    const report = JSON.parse(child.stdout) as CompilerReport;
    if (report.project !== path.resolve(project) || report.rawDiagnosticCount !== report.governing.length + report.integrityOnly.length
      || child.status !== (report.governing.length > 0 ? 1 : 0)) {
      throw new Error(`Compiler project report differs: ${project}`);
    }
    for (const file of report.files) union.add(file);
    gates[`tsc:${project}`] = report.governing.map((diagnostic) => ({
      file: diagnostic.file === null ? "<no-file>" : path.relative(process.cwd(), diagnostic.file),
      code: `TS${String(diagnostic.code)}`,
      message: portable(flatten(diagnostic.messageText)),
    }));
    governing += report.governing.length;
    integrityOnly += report.integrityOnly.length;
    // Complete raw native records, including frozen-source diagnostics, stay exposed separately.
    console.error(JSON.stringify(report));
  }
  // --no-coverage: one project's ratchet only (the plugin package's typecheck step); coverage of the whole TS/JS
  // universe stays with the canonical check-ts/ts-files recipes over every ts_projects entry.
  const projectOnly = process.argv.includes("--no-coverage");
  if (projectOnly && (projects.length !== 1 || process.argv.includes("--compiler-files") || recording)) {
    throw new Error("--no-coverage takes exactly one --project, never --compiler-files or a record flag");
  }
  const missing = projectOnly ? [] : unique.filter((file) => !union.has(path.resolve(file)));
  if (projectOnly) console.error(`compiler coverage not checked for this single-project run; check-ts owns coverage`);
  for (const file of missing) console.error(`Compiler coverage gap: ${file}; include it in its actual owner tsconfig and ts_projects`);
  if (process.argv.includes("--compiler-files")) {
    for (const file of unique.filter((file) => union.has(path.resolve(file)))) console.log(path.resolve(file));
  }
  console.error(JSON.stringify({ compilerProjects: projects, governingDiagnostics: governing,
    integrityOnlyDiagnostics: integrityOnly, missing, maintainedUniverse: unique.length,
    nativeDiagnosticFree: governing + integrityOnly === 0 }));
  const covered = ratchet(gates, true);
  process.exitCode = covered && missing.length === 0 ? 0 : 1;
}

function flatten(text: string | ts.DiagnosticMessageChain): string {
  if (typeof text === "string") return text;
  return [text.messageText, ...(text.next ?? []).map(flatten)].join("\n");
}

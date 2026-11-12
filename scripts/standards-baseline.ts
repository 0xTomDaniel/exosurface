// Counted no-raise ratchet for the TS gates (owner decision #216 comment 6829935664). Zero is the end target.
// The baseline is a position-free multiset per gate: key = file + code/rule + message, value = count.
// Line moves never fail; a new key or a count above the baseline fails. Only an explicit record step writes the
// baseline, and it refuses any rise. Integrity-pinned files (scripts/source-inventory.json) are never baselined.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export interface Finding {
  file: string;
  code: string;
  message: string;
}

export type Counts = Record<string, number>;

interface Baseline {
  version: 1;
  gates: Record<string, Counts>;
}

interface Raised {
  finding: Finding;
  count: number;
  baseline: number;
}

interface GateResult {
  gate: string;
  total: number;
  baselineTotal: number;
  raised: Raised[];
  ok: boolean;
}

function key(finding: Finding): string {
  return JSON.stringify([finding.file, finding.code, finding.message]);
}

function decode(entry: string): Finding {
  const parsed: unknown = JSON.parse(entry);
  if (!Array.isArray(parsed) || parsed.length !== 3 || !parsed.every((part) => typeof part === "string")) {
    throw new Error(`standards baseline: malformed key ${entry}`);
  }
  const [file, code, message] = parsed as [string, string, string];
  return { file, code, message };
}

export function counts(findings: Finding[]): Counts {
  const result: Counts = {};
  for (const finding of findings) {
    const name = key(finding);
    result[name] = (result[name] ?? 0) + 1;
  }
  return result;
}

function total(values: Counts): number {
  return Object.values(values).reduce((sum, count) => sum + count, 0);
}

function readBaseline(file: string): Baseline {
  if (!existsSync(file)) throw new Error(`standards baseline: ${file} is missing; record one with the gate's record step`);
  const parsed: unknown = JSON.parse(readFileSync(file, "utf8"));
  if (typeof parsed !== "object" || parsed === null || !("version" in parsed) || parsed.version !== 1 || !("gates" in parsed)) {
    throw new Error(`standards baseline: ${file} is not a version 1 baseline`);
  }
  const gates: unknown = parsed.gates;
  if (typeof gates !== "object" || gates === null || Array.isArray(gates)) throw new Error(`standards baseline: ${file} has no gates`);
  for (const [gate, values] of Object.entries(gates as Record<string, unknown>)) {
    if (typeof values !== "object" || values === null || Array.isArray(values)) throw new Error(`standards baseline: gate ${gate} is not a count map`);
    for (const [entry, count] of Object.entries(values)) {
      decode(entry);
      if (!Number.isSafeInteger(count) || (count as number) < 1) throw new Error(`standards baseline: gate ${gate} has a non-positive count for ${entry}`);
    }
  }
  return { version: 1, gates: gates as Record<string, Counts> };
}

function compare(gate: string, current: Counts, baseline: Counts): GateResult {
  const raised: Raised[] = [];
  for (const [entry, count] of Object.entries(current)) {
    const allowed = baseline[entry] ?? 0;
    if (count > allowed) raised.push({ finding: decode(entry), count, baseline: allowed });
  }
  return { gate, total: total(current), baselineTotal: total(baseline), raised, ok: raised.length === 0 };
}

/**
 * Findings of `knip --reporter json` (knip 6): code = issue type, message = the issue's name (duplicates: the names
 * joined), file = the issue row's file. Positions are dropped. Integrity-pinned files are left out, like the
 * compiler's integrity-only partition. Any other report shape throws: the gate is then unanswered.
 */
export function knipFindings(report: unknown, integrity: ReadonlySet<string>): Finding[] {
  const shape = (why: string): Error => new Error(`knip report unanswered: ${why}`);
  if (typeof report !== "object" || report === null || !("issues" in report) || !Array.isArray(report.issues)) throw shape("no issues array");
  const findings: Finding[] = [];
  for (const row of report.issues as unknown[]) {
    if (typeof row !== "object" || row === null || !("file" in row) || typeof row.file !== "string") throw shape("issue row without file");
    const file = row.file;
    for (const [type, list] of Object.entries(row)) {
      if (type === "file") continue;
      if (!Array.isArray(list)) throw shape(`${file} ${type} is not a list`);
      for (const item of list as unknown[]) {
        const items: unknown[] = Array.isArray(item) ? item : [item];
        const names = items.map((entry) => {
          if (typeof entry !== "object" || entry === null || !("name" in entry) || typeof entry.name !== "string") throw shape(`${file} ${type} entry has no name`);
          return entry.name;
        });
        if (!integrity.has(file)) findings.push({ file, code: type, message: names.join(", ") });
      }
    }
  }
  return findings;
}

/** Check mode: the gate passes when every current key is at or below its baseline count. */
export function check(gate: string, current: Counts, file: string): GateResult {
  return compare(gate, current, readBaseline(file).gates[gate] ?? {});
}

/** One line per gate with its count and baseline (debt stays visible), plus one line per raised key. */
export function describeResult(result: GateResult): string[] {
  const head = `${result.gate}: ${String(result.total)} findings, baseline ${String(result.baselineTotal)}`;
  if (result.ok) return [`${head}; no finding above the baseline${result.total < result.baselineTotal ? " (lower: record it)" : ""}`];
  return [
    `${head}; FAILED: ${String(result.raised.length)} finding keys above the baseline`,
    ...result.raised.map(({ finding, count, baseline }) => `  ${finding.file} ${finding.code} (${String(count)} > baseline ${String(baseline)}): ${finding.message}`),
  ];
}

/**
 * Record mode, never run by the check: lowers or removes keys of gates already in the baseline. It throws naming the
 * gate, leaving the file unchanged, when a key rises, a key names an integrity-pinned file, or the gate is absent
 * from the baseline (that needs the separate initial record). Other gates are kept.
 */
export function record(file: string, current: Record<string, Counts>, integrity: ReadonlySet<string>): GateResult[] {
  const baseline = readBaseline(file);
  const results: GateResult[] = [];
  for (const [gate, values] of Object.entries(current)) {
    refuseIntegrity(gate, values, integrity);
    const previous = baseline.gates[gate];
    if (previous === undefined) throw new Error(`standards baseline: refused for ${gate}: the gate has no baseline; add it with the initial record step`);
    const result = compare(gate, values, previous);
    if (!result.ok) throw new Error(`standards baseline: refused for ${gate}: ${describeResult(result).join("\n")}`);
    results.push(result);
  }
  write(file, { ...baseline.gates, ...current });
  return results;
}

function refuseIntegrity(gate: string, values: Counts, integrity: ReadonlySet<string>): void {
  const pinned = Object.keys(values).map(decode).filter((finding) => integrity.has(finding.file));
  if (pinned.length > 0) throw new Error(`standards baseline: refused for ${gate}: integrity-pinned files are never baselined: ${pinned.map((f) => f.file).join(", ")}`);
}

function write(file: string, gates: Record<string, Counts>): void {
  const ordered = Object.fromEntries(Object.keys(gates).sort().map((gate) => {
    const values = gates[gate] ?? {};
    return [gate, Object.fromEntries(Object.keys(values).sort().map((entry) => [entry, values[entry]]))];
  }));
  const temporary = `${file}.tmp`;
  writeFileSync(temporary, `${JSON.stringify({ version: 1, gates: ordered }, null, 2)}\n`);
  renameSync(temporary, file);
}

/**
 * Initial record, an explicit separate step: adds gates absent from the baseline (creating the file if missing) and
 * returns their names. It never touches an existing gate: a given gate already in the file refuses, naming it, and
 * the file is left unchanged. Integrity-pinned files are refused as in record.
 */
export function recordInitial(file: string, current: Record<string, Counts>, integrity: ReadonlySet<string>): string[] {
  const baseline = existsSync(file) ? readBaseline(file) : { version: 1 as const, gates: {} };
  for (const [gate, values] of Object.entries(current)) {
    if (gate in baseline.gates) throw new Error(`standards baseline: initial record refused for ${gate}: the gate already has a baseline; use the normal record step`);
    refuseIntegrity(gate, values, integrity);
  }
  write(file, { ...baseline.gates, ...current });
  return Object.keys(current).sort();
}

// Counted no-raise ratchet for the TS gates (owner decision #216 comment 6829935664). Zero is the end target.
// The baseline is a position-free multiset per gate, value = count. Key = [file, rule/code] for the TS compiler and
// ESLint gates: TypeScript prints type text non-deterministically (union member order), so no message text is part of
// their keys; messages stay in the printed output. Key = [file, issue type, name] for knip (no printed type text).
// Accepted cost (#216 review): within one file and one rule, fixing one finding and adding another passes.
// Line moves never fail; a new key or a count above the baseline fails. Only an explicit record step writes the
// baseline, and it refuses any rise. Integrity-pinned files (scripts/source-inventory.json) are never baselined.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";

// Tool and baseline files are external input: parsed JSON is validated with these schemas (Zod, as the rest of the
// repo); anything else is unanswered, never counted or recorded.
export const findingSchema = z.object({ file: z.string(), code: z.string(), message: z.string() });
export type Finding = z.infer<typeof findingSchema>;

export type Counts = Record<string, number>;

const keySchema = z.union([z.tuple([z.string(), z.string()]), z.tuple([z.string(), z.string(), z.string()])]);
const baselineSchema = z.object({
  version: z.literal(1),
  gates: z.record(z.string(), z.record(z.string(), z.number().int().min(1).max(Number.MAX_SAFE_INTEGER))),
});
type Baseline = z.infer<typeof baselineSchema>;
const nameSchema = z.looseObject({ name: z.string() });
// knip 6 --reporter json: one row per file, one list per issue type (duplicates: lists of names).
const knipReportSchema = z.object({
  issues: z.array(z.object({ file: z.string() }).catchall(z.array(z.union([nameSchema, z.array(nameSchema)])))),
});

/** A baseline key: [file, code] for compiler/ESLint findings, [file, code, message] for knip findings. */
interface Keyed {
  file: string;
  code: string;
  message?: string;
}

interface Raised {
  finding: Keyed;
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

function key(finding: Finding, withMessage: boolean): string {
  return JSON.stringify(withMessage ? [finding.file, finding.code, finding.message] : [finding.file, finding.code]);
}

function decode(entry: string): Keyed {
  const parsed = keySchema.safeParse(JSON.parse(entry));
  if (!parsed.success) throw new Error(`standards baseline: malformed key ${entry}`);
  const [file, code, message] = parsed.data;
  return message === undefined ? { file, code } : { file, code, message };
}

/** Per-key counts; withMessage only for gates whose messages are deterministic (knip). */
export function counts(findings: Finding[], withMessage: boolean): Counts {
  const result: Counts = {};
  for (const finding of findings) {
    const name = key(finding, withMessage);
    result[name] = (result[name] ?? 0) + 1;
  }
  return result;
}

function total(values: Counts): number {
  return Object.values(values).reduce((sum, count) => sum + count, 0);
}

function readBaseline(file: string): Baseline {
  if (!existsSync(file)) throw new Error(`standards baseline: ${file} is missing; record one with the gate's record step`);
  const parsed = baselineSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`standards baseline: ${file} is not a version 1 baseline of positive counts: ${z.prettifyError(parsed.error)}`);
  for (const values of Object.values(parsed.data.gates)) for (const entry of Object.keys(values)) decode(entry);
  return parsed.data;
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
  const parsed = knipReportSchema.safeParse(report);
  if (!parsed.success) throw new Error(`knip report unanswered: ${z.prettifyError(parsed.error)}`);
  const findings: Finding[] = [];
  for (const { file, ...types } of parsed.data.issues) {
    for (const [type, list] of Object.entries(types)) {
      for (const item of list) {
        const names = (Array.isArray(item) ? item : [item]).map((entry) => entry.name);
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
    ...result.raised.map(({ finding, count, baseline }) => `  ${finding.file} ${finding.code} (${String(count)} > baseline ${String(baseline)})${finding.message === undefined ? "" : `: ${finding.message}`}`),
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

// Counted no-raise ratchet for the TS gates (owner decision #216 comment 6829935664). Zero is the end target.
// The baseline is a position-free multiset per gate: key = file + code/rule + message, value = count.
// Line moves never fail; a new key or a count above the baseline fails. Only an explicit record step writes the
// baseline, and it refuses any rise. Integrity-pinned files (scripts/source-inventory.json) are never baselined.
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { z } from "zod";

// Tool and baseline files are external input: parsed JSON is validated with these schemas (Zod, as the rest of the
// repo); anything else is unanswered, never counted or recorded.
export const findingSchema = z.object({ file: z.string(), code: z.string(), message: z.string() });
export type Finding = z.infer<typeof findingSchema>;

export type Counts = Record<string, number>;

const keySchema = z.tuple([z.string(), z.string(), z.string()]);
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

// Key canonicalization (keys only; tool output is printed unchanged). TypeScript prints union members in type-id
// order, which differs between runs of the same inputs, so the same finding could print as `A | B` or `B | A`.
// Within quoted type text (ESLint backticks, tsc single quotes) union members are sorted at every nesting depth.
// Unions are commutative, so two keys only meet when they are the same type printed two ways.
const CLOSERS: Readonly<Record<string, string>> = { "(": ")", "[": "]", "{": "}", "<": ">" };

/** Pieces of text split at separator where no bracket is open (string literals and "=>" are not brackets). */
function topLevel(text: string, separators: readonly string[]): { piece: string; separator: string }[] {
  const result: { piece: string; separator: string }[] = [];
  const open: string[] = [];
  let from = 0;
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    if (char === "\"") {
      const end = text.indexOf("\"", index + 1);
      if (end < 0) break;
      index = end;
      continue;
    }
    if (open.length === 0) {
      const separator = separators.find((candidate) => text.startsWith(candidate, index));
      if (separator !== undefined) {
        result.push({ piece: text.slice(from, index), separator });
        index += separator.length - 1;
        from = index + 1;
        continue;
      }
    }
    if (char === ">" && text.charAt(index - 1) === "=") continue;
    const closer = CLOSERS[char];
    if (closer !== undefined) open.push(closer);
    else if (char === open.at(-1)) open.pop();
  }
  result.push({ piece: text.slice(from), separator: "" });
  return result;
}

/** Type text with every union's members sorted; text without unions comes back unchanged. */
function canonicalType(text: string): string {
  const arrow = topLevel(text, [" => "]);
  if (arrow.length > 1) {
    const [parameters, ...rest] = arrow;
    return `${canonicalGroups(parameters?.piece ?? "")} => ${canonicalType(rest.map(({ piece, separator }) => piece + separator).join(""))}`;
  }
  const members = topLevel(text, [" | "]).map(({ piece }) => canonicalGroups(piece));
  return members.length > 1 ? [...members].sort().join(" | ") : (members[0] ?? "");
}

/** Text with the contents of each bracket group canonicalized (lists, properties and nested types). */
function canonicalGroups(text: string): string {
  let result = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text.charAt(index);
    const closer = CLOSERS[char];
    if (closer === undefined || (char === ">" && text.charAt(index - 1) === "=")) {
      result += char;
      continue;
    }
    const inner = topLevel(text.slice(index + 1), [closer]);
    if (inner.length < 2) {
      result += text.slice(index);
      break;
    }
    const body = inner[0]?.piece ?? "";
    result += char + canonicalList(body) + closer;
    index += body.length + 1;
  }
  return result;
}

/** A bracket body: comma/semicolon-separated items, each a type or a `key: type` property. */
function canonicalList(body: string): string {
  return topLevel(body, [",", ";"]).map(({ piece, separator }) => {
    const leading = /^\s*/u.exec(piece)?.[0] ?? "";
    const trailing = /\s*$/u.exec(piece.slice(leading.length))?.[0] ?? "";
    const core = piece.slice(leading.length, piece.length - trailing.length);
    const property = topLevel(core, [": "]);
    const item = property.length > 1
      ? `${canonicalGroups(property[0]?.piece ?? "")}: ${canonicalType(property.slice(1).map(({ piece: part, separator: next }) => part + next).join(""))}`
      : canonicalType(core);
    return leading + item + trailing + separator;
  }).join("");
}

function canonicalMessage(message: string): string {
  return message.replace(/`[^`]*`|'[^']*'/gu, (quoted) => quoted.charAt(0) + canonicalType(quoted.slice(1, -1)) + quoted.charAt(0));
}

function key(finding: Finding): string {
  return JSON.stringify([finding.file, finding.code, canonicalMessage(finding.message)]);
}

function decode(entry: string): Finding {
  const parsed = keySchema.safeParse(JSON.parse(entry));
  if (!parsed.success) throw new Error(`standards baseline: malformed key ${entry}`);
  const [file, code, message] = parsed.data;
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
  const parsed = baselineSchema.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) throw new Error(`standards baseline: ${file} is not a version 1 baseline of positive counts: ${z.prettifyError(parsed.error)}`);
  // Keys are canonical when read, so a baseline written before canonicalization (or in the other union order) matches.
  const gates: Record<string, Counts> = {};
  for (const [gate, values] of Object.entries(parsed.data.gates)) {
    const canonical: Counts = {};
    for (const [entry, count] of Object.entries(values)) {
      const name = key(decode(entry));
      canonical[name] = (canonical[name] ?? 0) + count;
    }
    gates[gate] = canonical;
  }
  return { version: 1, gates };
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

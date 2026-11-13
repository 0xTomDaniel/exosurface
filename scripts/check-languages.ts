// Every language in this repo's tracked files has its lint and type step in `just check`.
//
// The octo-feather kit's check (scripts/check-languages), ported function for function: this repo needs no
// Python. Rule owners: issue #261 comment 6498859284 (with #225 comment 6446828103). Each repo's own data, read at
// run time: the justfile's `check_languages` (language, tool, gate recipe, the recipe printing the tool's file
// list), its gate (GATE_RECIPES and what `check` depends on), and .gitattributes `language-exempt` (paths not
// scanned).
//
// Fails, naming each file and its fix: 1. scc calls a tracked file Unknown;
// 2. a language is neither in `check_languages` nor DATA; 3. a tool's file list misses a file of its
// language; 4. a tool's gate recipe is not in the gate; 5. a file scc does not list starts with `#!`
// (scc drops `env -S` shebangs); 6. mise.toml pins pnpm and package.json has `packageManager`.
// Passes by design: a file scc does not list that does not start with `#!` (no language found).
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { OWNER_DEFERRALS, deferredTreeDrift, deferredTreeLines, isDeferredTree } from "./owner-deferrals.ts";

// Owner-deferred tool rows (issue #216 comment 6828772822): Python lint/type is DEFERRED BY OWNER, not compliant,
// waived or exempt. Exactly these check_languages rows, each present once, and their recipe outside the gate.
// Their files are still scanned and classified; only these two tools' gate membership and file lists are not asked.
// Owner-deferred source trees (issue #216 comment 6830616474): their files are still scanned and classified, but
// the TypeScript/JavaScript tools (tsc, eslint) are not asked to cover them. Both records: scripts/owner-deferrals.ts.
const OWNER_DEFERRED = OWNER_DEFERRALS.python;
const TREE_DEFERRED_TOOLS = new Set(["tsc", "eslint"]);

// Languages that are data, with no lint or type step.
const DATA = new Set(["Markdown", "JSON", "JSONL", "TOML", "YAML", "HTML", "CSS", "Patch", "Plain Text", "License"]);

/** A tool gave no usable answer: the check cannot pass. */
class UnansweredError extends Error {}

interface Dump {
  assignments: Record<string, { value: string } | undefined>;
  recipes: Record<string, { doc: string | null; dependencies: { recipe: string }[] } | undefined>;
}

function missingTool(tool: string): string {
  const r = spawnSync("mise", ["which", tool], { encoding: "utf8" });
  if (r.error !== undefined) return "mise is not on PATH: install mise at mise-version, then run just setup";
  if (r.status === 0) return `${tool} is installed (${r.stdout.trim()}) but not on PATH: run this through just`;
  return `${tool} is not installed: run just setup (mise.toml, mise.lock)`;
}

function ask(...cmd: string[]): string {
  const [program = "", ...args] = cmd;
  const r = spawnSync(program, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.error !== undefined) throw new UnansweredError(`cannot run ${program}: ${r.error.message}; ${missingTool(program)}`);
  if (r.status !== 0) throw new UnansweredError(`${cmd.join(" ")} exited ${String(r.status)}: ${r.stderr.trim()}`);
  // Counted ratchet gates (scripts/standards-baseline.ts) keep their debt visible on a pass: echo their summary lines.
  for (const line of r.stderr.split("\n")) {
    if (/^\S+: \d+ findings, baseline \d+;/u.test(line)) process.stderr.write(`check-languages: ${line}\n`);
  }
  return r.stdout;
}

function relative(line: string): string {
  return path.isAbsolute(line) ? path.relative(process.cwd(), line) : line.replace(/^\.\//u, "");
}

function scanned(): Set<string> {
  const out = ask("git", "ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", ".", ":(exclude,attr:language-exempt)");
  // Literal source classifications are usable only after their existing pins and vendor reverse-patch verify.
  const verified = new Set(ask("python", "-B", "scripts/source-inventory.py", "--exempt").trim().split("\n"));
  return new Set(out.split("\0").filter((f) => f !== "" && !verified.has(f) && fs.lstatSync(f, { throwIfNoEntry: false })?.isFile() === true));
}

function sccLanguages(files: Set<string>): Map<string, string> {
  // scc walks the directory: named on its command line, a file under a dot dir loses its shebang.
  const out = ask("scc", "--by-file", "--format", "json", "--count-unsupported", "--no-config", ".");
  const found = new Map<string, string>();
  const langs = JSON.parse(out) as { Name: string; Files: { Location: string }[] | null }[];
  for (const lang of langs) {
    for (const f of lang.Files ?? []) {
      if (files.has(relative(f.Location))) found.set(relative(f.Location), lang.Name);
    }
  }
  return found;
}

function justfile(): [string[][], Set<string>, Dump] {
  const dump = JSON.parse(ask("just", "--justfile", "justfile", "--dump", "--dump-format", "json")) as Dump;
  const rows = (dump.assignments["check_languages"]?.value ?? "").split(/\s+/u).filter(Boolean).map((e) => e.split(":"));
  const gate = new Set((dump.assignments["GATE_RECIPES"]?.value ?? "").split(/\s+/u).filter(Boolean));
  const todo = ["check"];
  for (let name = todo.pop(); name !== undefined; name = todo.pop()) {
    for (const dep of dump.recipes[name]?.dependencies ?? []) {
      if (!gate.has(dep.recipe)) {
        gate.add(dep.recipe);
        todo.push(dep.recipe);
      }
    }
  }
  return [rows, gate, dump];
}

function findings(found: Map<string, string>, rows: string[][], gate: Set<string>, dump: Dump): string[] {
  const bad: string[] = [];
  const lists = new Map<string, Set<string>>();
  for (const lang of [...new Set(found.values())].sort()) {
    const files = [...found].filter(([, name]) => name === lang).map(([f]) => f).sort();
    const tools = rows.filter((row) => row[0] === lang);
    if (lang === "Unknown") {
      bad.push(
        ...files.map(
          (f) =>
            `${f}: scc does not know this file type; give it a known extension, or mark it` +
            " `language-exempt` in .gitattributes with the reason",
        ),
      );
    } else if (tools.length === 0 && !DATA.has(lang)) {
      bad.push(
        `${lang} (${files.join(", ")}) has no lint or type step: add its tools to the gate` +
          " and to the justfile's check_languages, or declare it DATA in check-languages",
      );
    }
    for (const row of tools) {
      if ((OWNER_DEFERRED.rows as readonly string[]).includes(row.join(":"))) continue;
      const [, tool = "", recipe = "", filesRecipe = ""] = row;
      if (!gate.has(recipe)) bad.push(`${tool} gates ${lang}, but its recipe ${recipe} is not in the gate`);
      let list = lists.get(filesRecipe);
      if (list === undefined) {
        const out = ask("just", "--justfile", "justfile", filesRecipe);
        list = new Set(out.split("\n").filter(Boolean).map(relative));
        lists.set(filesRecipe, list);
      }
      const how = String(dump.recipes[filesRecipe]?.doc);
      for (const f of files) {
        if (TREE_DEFERRED_TOOLS.has(tool) && isDeferredTree(f)) continue;
        if (!list.has(f)) bad.push(`${f}: ${lang}, but ${tool}'s own file list misses it; ${how} (just ${filesRecipe})`);
      }
    }
  }
  return bad;
}

function unreadableShebangs(unlisted: string[]): string[] {
  return unlisted
    .sort()
    .filter((f) => fs.readFileSync(f).subarray(0, 2).toString() === "#!")
    .map(
      (f) =>
        `${f}: scc cannot name the language of its shebang (it drops \`env -S\` forms); start it` +
        " with #!/usr/bin/env <interpreter> or give it an extension",
    );
}

function bothPnpmPins(): string[] {
  const pins = JSON.parse(ask("mise", "ls", "--local", "--json")) as Record<string, unknown>;
  const manifest = fs.existsSync("package.json")
    ? (JSON.parse(fs.readFileSync("package.json", "utf8")) as Record<string, unknown>)
    : {};
  if (!("pnpm" in pins) || !("packageManager" in manifest)) return [];
  return [
    "package.json: packageManager and mise.toml [tools] pnpm both pin pnpm; delete" +
      " packageManager: mise owns pnpm (owner ruling, issue #261), and pnpm's switch to" +
      " packageManager would override it and need the network",
  ];
}

// Validates the closed deferral before any coverage query; refuses drift instead of skipping it.
function deferral(rows: string[][], gate: Set<string>, dump: Dump): string[] {
  const bad: string[] = [];
  const fix = `owner deferral ${OWNER_DEFERRED.url} covers exactly ${OWNER_DEFERRED.rows.join(" ")}`;
  const joined = rows.map((row) => row.join(":"));
  for (const want of OWNER_DEFERRED.rows) {
    const count = joined.filter((row) => row === want).length;
    if (count !== 1) bad.push(`check_languages has ${String(count)} copies of ${want}; ${fix}`);
  }
  for (const [index, row] of rows.entries()) {
    const text = joined[index] ?? "";
    if ((OWNER_DEFERRED.rows as readonly string[]).includes(text)) continue;
    if (row[0] === OWNER_DEFERRED.language || row.includes(OWNER_DEFERRED.recipe) || row[1] === "ruff" || row[1] === "basedpyright") {
      bad.push(`check_languages row ${text} is not an owner-deferred row and names Python tooling; ${fix}`);
    }
  }
  if (gate.has(OWNER_DEFERRED.recipe)) bad.push(`${OWNER_DEFERRED.recipe} is in the gate while deferred; remove it from GATE_RECIPES or end the deferral (${OWNER_DEFERRED.url})`);
  const projects = (dump.assignments["ts_projects"]?.value ?? "").split(/\s+/u).filter(Boolean);
  if (projects.length === 0) bad.push("justfile ts_projects is empty or missing; the deferred-tree check needs the gated compiler projects");
  bad.push(...deferredTreeDrift(process.cwd(), projects));
  return bad;
}

function main(): number {
  const [rows, gate, dump] = justfile();
  const drift = deferral(rows, gate, dump);
  for (const line of drift) process.stderr.write(`check-languages: ${line}\n`);
  if (drift.length > 0) return 1;
  for (const row of OWNER_DEFERRED.rows) {
    process.stderr.write(`check-languages: ${row}: DEFERRED BY OWNER ${OWNER_DEFERRED.url}; not assessed, not compliant, waived or exempt\n`);
  }
  const files = scanned();
  for (const line of deferredTreeLines([...files])) process.stderr.write(`check-languages: ${line}\n`);
  const found = sccLanguages(files);
  const bad = [
    ...findings(found, rows, gate, dump),
    ...unreadableShebangs([...files].filter((f) => !found.has(f))),
    ...bothPnpmPins(),
  ];
  for (const line of bad) process.stderr.write(`check-languages: ${line}\n`);
  if (bad.length > 0) return 1;
  process.stdout.write(
    `languages: assessed tools ok (${String(files.size)} tracked files scanned); ${String(OWNER_DEFERRED.rows.length)} Python tools and ${String(OWNER_DEFERRALS.sourceTrees.prefixes.length)} source trees DEFERRED BY OWNER, not assessed\n`,
  );
  return 0;
}

try {
  process.exitCode = main();
} catch (e) {
  if (!(e instanceof UnansweredError || e instanceof SyntaxError)) throw e;
  process.stderr.write(`check-languages: ${e.message}\n`);
  process.exitCode = 1;
}

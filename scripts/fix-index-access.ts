// Mechanical migration for TypeScript TS4111, using the compiler's own diagnostics.
// Default: report. --write applies edits; --file PATH limits the first-unit smoke.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const args = process.argv.slice(2);
const selected = new Set<string>();
for (const [index, arg] of args.entries()) {
  if (arg !== "--file") continue;
  const file = args[index + 1];
  if (file === undefined || file.startsWith("--")) throw new Error("--file needs a path");
  selected.add(path.resolve(file));
}
const configPath = "plugins/bb-plugin-exosurface/tsconfig.json";
const config = ts.readConfigFile(configPath, (file) => fs.readFileSync(file, "utf8"));
if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const edits = new Map<string, { start: number; end: number; replacement: string }[]>();
for (const diagnostic of ts.getPreEmitDiagnostics(program)) {
  const file = diagnostic.file;
  const start = diagnostic.start;
  if (diagnostic.code !== 4111 || file === undefined || start === undefined) continue;
  if (selected.size > 0 && !selected.has(path.resolve(file.fileName))) continue;
  let access: ts.PropertyAccessExpression | undefined;
  const visit = (node: ts.Node): void => {
    if (ts.isPropertyAccessExpression(node) && node.name.getStart(file) <= start && start < node.name.end) access = node;
    ts.forEachChild(node, visit);
  };
  visit(file);
  if (access === undefined) throw new Error(`${file.fileName}: TS4111 access not located`);
  const old = file.text.slice(access.expression.end, access.end);
  const expected = `${access.questionDotToken === undefined ? "." : "?."}${access.name.text}`;
  if (old !== expected) throw new Error(`${file.fileName}: preserve commented or spaced access by hand: ${old}`);
  const list = edits.get(file.fileName) ?? [];
  list.push({ start: access.expression.end, end: access.end, replacement: `${access.questionDotToken === undefined ? "" : "?."}[${JSON.stringify(access.name.text)}]` });
  edits.set(file.fileName, list);
}
let total = 0;
for (const [file, list] of edits) {
  let source = fs.readFileSync(file, "utf8");
  for (const edit of list.sort((a, b) => b.start - a.start)) source = source.slice(0, edit.start) + edit.replacement + source.slice(edit.end);
  if (args.includes("--write")) fs.writeFileSync(file, source);
  total += list.length;
  console.log(`${args.includes("--write") ? "updated" : "would update"} ${file}: ${String(list.length)} TS4111 accesses`);
}
console.log(`TS4111: ${String(total)} edits in ${String(edits.size)} files`);

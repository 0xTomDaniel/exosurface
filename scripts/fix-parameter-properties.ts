// Diagnostic-driven erasable-syntax codemod. Writes only when TS6's normalized ES2022 emission is identical.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const configPath = "plugins/bb-plugin-exosurface/tsconfig.json";
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const program = ts.createProgram(parsed.fileNames, parsed.options);
const checker = program.getTypeChecker();
const affected = new Set(ts.getPreEmitDiagnostics(program).filter((item) => item.code === 1294).flatMap((item) => item.file === undefined ? [] : [item.file.fileName]));
const requested = process.argv.flatMap((argument, index) => argument === "--file" ? [process.argv[index + 1] ?? ""] : []);
function emitted(source: string, file: string): string {
  const output = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, removeComments: true } }).outputText;
  return ts.createPrinter({ removeComments: true }).printFile(ts.createSourceFile(file, output, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS));
}
let total = 0;
for (const file of [...affected].sort()) {
  if (requested.length > 0 && !requested.some((name) => path.resolve(name) === path.resolve(file))) continue;
  const source = fs.readFileSync(file, "utf8");
  const tree = program.getSourceFile(file);
  if (tree === undefined) throw new Error(`${file}: missing compiler-owned source file`);
  const edits: { start: number; end: number; text: string }[] = [];
  const fields = new Map<number, string[]>();
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (ts.isConstructorDeclaration(node) && node.body !== undefined) {
      const properties = node.parameters.filter((parameter) => ts.isParameterPropertyDeclaration(parameter, node));
      if (properties.length > 0) {
        let insert = node.body.getStart(tree) + 1;
        if (node.parent.heritageClauses?.some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword) === true) {
          const superCall = node.body.statements.find((statement) => ts.isExpressionStatement(statement) && ts.isCallExpression(statement.expression) && statement.expression.expression.kind === ts.SyntaxKind.SuperKeyword);
          if (superCall === undefined) throw new Error(`${file}: derived constructor needs explicit super-call review`);
          insert = superCall.end;
        }
        const assignments: string[] = [];
        for (const parameter of properties) {
          if (!ts.isIdentifier(parameter.name)) throw new Error(`${file}: destructured parameter needs explicit review`);
          const inferred = checker.getTypeAtLocation(parameter);
          const type = parameter.type?.getText(tree) ?? checker.typeToString(inferred, parameter, ts.TypeFormatFlags.NoTruncation);
          if ((inferred.flags & ts.TypeFlags.Any) !== 0) throw new Error(`${file}: public parameter type needs annotation first`);
          const modifiers = parameter.modifiers ?? [];
          const declarations = fields.get(node.parent.members.pos) ?? [];
          declarations.push(`${modifiers.map((modifier) => modifier.getText(tree)).join(" ")} ${parameter.name.text}${parameter.questionToken === undefined ? "" : "?"}: ${type};`);
          fields.set(node.parent.members.pos, declarations);
          for (const modifier of modifiers) edits.push({ start: modifier.getStart(tree), end: modifier.end, text: "" });
          assignments.push(`this.${parameter.name.text} = ${parameter.name.text};`);
          count++;
        }
        edits.push({ start: insert, end: insert, text: "\n" + assignments.join("\n") + "\n" });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  for (const [position, declarations] of fields) edits.push({ start: position, end: position, text: "\n" + declarations.join("\n") + "\n" });
  let updated = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) updated = updated.slice(0, edit.start) + edit.text + updated.slice(edit.end);
  if (emitted(source, file) !== emitted(updated, file)) throw new Error(`${file}: ES2022 emission differs; no write`);
  if (process.argv.includes("--write")) fs.writeFileSync(file, updated);
  console.log(JSON.stringify({ file, properties: count, equalES2022Emission: true, written: process.argv.includes("--write") }));
  total += count;
}
console.log(`${String(total)} parameter properties`);

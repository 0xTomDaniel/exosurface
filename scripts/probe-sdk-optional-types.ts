// Diagnostic only: test the SDK Standard Schema optional-property declaration repair in memory.
// Never writes installed packages or changes runtime validation.
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const configPath = "plugins/bb-plugin-exosurface/tsconfig.json";
const config = ts.readConfigFile(configPath, (file) => fs.readFileSync(file, "utf8"));
if (config.error !== undefined) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, "\n"));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, path.dirname(configPath));
const host = ts.createCompilerHost(parsed.options);
const read = host.readFile.bind(host);
const changes: { file: string; property: string; position: number }[] = [];
host.readFile = (file): string | undefined => {
  const source = read(file);
  if (source === undefined || !file.includes("/@get-bb/plugin-sdk/") || !file.endsWith(".d.ts")) return source;
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const edits: number[] = [];
  const visit = (node: ts.Node): void => {
    if (ts.isPropertySignature(node) && node.questionToken !== undefined && node.type !== undefined && ts.isIdentifier(node.name)) {
      let parent: ts.Node | undefined = node.parent;
      while (parent !== undefined && !ts.isInterfaceDeclaration(parent)) parent = parent.parent;
      if (parent !== undefined && ts.isInterfaceDeclaration(parent)) {
        const owner = parent.name.text;
        const name = node.name.text;
        if ((owner === "StandardSchemaV1Issue" && name === "path") ||
            (owner === "StandardSchemaV1" && (name === "types" || (name === "jsonSchema" && !process.argv.includes("--minimal"))))) {
          edits.push(node.type.end);
          changes.push({ file, property: `${owner}.${name}`, position: node.type.end });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  let updated = source;
  for (const position of edits.sort((a, b) => b - a)) updated = updated.slice(0, position) + " | undefined" + updated.slice(position);
  return updated;
};
const program = ts.createProgram(parsed.fileNames, parsed.options, host);
const diagnostics = ts.getPreEmitDiagnostics(program);
const counts: Record<string, number> = {};
for (const item of diagnostics) counts[String(item.code)] = (counts[String(item.code)] ?? 0) + 1;
console.log(JSON.stringify({ changes, diagnostics: diagnostics.length, codes: counts }, null, 2));
for (const item of diagnostics.filter((entry) => entry.file?.fileName.endsWith("/test/mock-bb.ts") === true)) {
  console.log(ts.flattenDiagnosticMessageText(item.messageText, "\n"));
}

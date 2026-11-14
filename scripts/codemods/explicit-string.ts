// Rerun: node scripts/codemods/explicit-string.ts [files...]
// Defaults exclude other live units. Explicit paths support later owner batches.
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join, relative } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const base = 'plugins/bb-plugin-exosurface';
const excluded = new Set(['demo/surfaces.ts', 'legacy/primary/server.ts', 'legacy/primary/src/exo-turn.ts', 'legacy/primary/src/owner-service.ts', 'legacy/surface/app.tsx', ...['workspace-extension', 'workspace', 'stage', 'canvas-memory'].map(name => `legacy/surface/src/${name}.ts`)]);
const files = process.argv.slice(2).map(file => resolve(file));
function collect(dir: string): void {
  for (const entry of readdirSync(resolve(root, dir), { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory() && !['node_modules', 'dist', 'generated', 'vendor'].includes(entry.name)) collect(file);
    else if (/\.(?:[cm]?[jt]s|[jt]sx)$/.test(entry.name) && !excluded.has(relative(base, file))) files.push(resolve(root, file));
  }
}
if (files.length === 0) for (const dir of ['src', 'legacy', 'demo']) collect(join(base, dir));
const config = ts.readConfigFile(resolve(root, base, 'tsconfig.json'), name => ts.sys.readFile(name));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, resolve(root, base));
const program = ts.createProgram(files, parsed.options);
const checker = program.getTypeChecker();
const totals = { converted: 0, skipped: 0 };
function isType(type: ts.Type, flags: ts.TypeFlags): boolean {
  return type.isUnion() ? type.types.every(part => isType(part, flags)) : (type.flags & flags) !== 0;
}
for (const file of files) {
  if (file.split(/[\\/]/).includes('vendor')) continue;
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot parse ${file}`);
  const text = readFileSync(file, 'utf8');
  const edits: { start: number; text: string }[] = [];
  const seen = new Set<ts.Expression>();
  function convert(expression: ts.Expression): void {
    if (seen.has(expression)) return;
    seen.add(expression);
    const type = checker.getTypeAtLocation(expression);
    if (isType(type, ts.TypeFlags.StringLike)) return;
    const binding = checker.resolveName('String', expression, ts.SymbolFlags.Value, false);
    const globalString = binding?.declarations?.some(declaration => program.isSourceFileDefaultLibrary(declaration.getSourceFile())) && binding.declarations.every(declaration => declaration.getSourceFile().isDeclarationFile);
    if (!isType(type, ts.TypeFlags.NumberLike | ts.TypeFlags.BooleanLike | ts.TypeFlags.BigIntLike) || !globalString) { totals.skipped++; return; }
    edits.push({ start: expression.getStart(source), text: 'String(' }, { start: expression.end, text: ')' });
    totals.converted++;
  }
  function visit(node: ts.Node): void {
    // Tagged templates pass raw values to user code, not implicit conversions.
    if (ts.isTemplateExpression(node) && !ts.isTaggedTemplateExpression(node.parent)) {
      const context = checker.getContextualType(node);
      const constrained = context && (context.isUnion() ? context.types : [context]).some(type =>
        (type.flags & (ts.TypeFlags.TemplateLiteral | ts.TypeFlags.StringLiteral)) !== 0);
      for (const span of node.templateSpans) {
        if (constrained) totals.skipped++;
        else convert(span.expression);
      }
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken &&
        (isType(checker.getTypeAtLocation(node.left), ts.TypeFlags.StringLike) || isType(checker.getTypeAtLocation(node.right), ts.TypeFlags.StringLike))) {
      convert(node.left); convert(node.right);
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusEqualsToken &&
        isType(checker.getTypeAtLocation(node.left), ts.TypeFlags.StringLike)) convert(node.right);
    ts.forEachChild(node, visit);
  }
  visit(source);
  let output = text;
  for (const edit of edits.sort((a, b) => b.start - a.start)) output = output.slice(0, edit.start) + edit.text + output.slice(edit.start);
  if (output !== text) writeFileSync(file, output);
}
console.log(JSON.stringify(totals));

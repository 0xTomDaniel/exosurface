// Usage: node scripts/codemods/return-signature.ts functionName 'ReturnType' files...
// The caller supplies the independently established contract. Bodies stay byte-identical.
import ts from 'typescript';
import { readFileSync, writeFileSync } from 'node:fs';

const [name, annotation, ...files] = process.argv.slice(2);
if (!name || !annotation || files.length === 0) throw new Error('Expected function name, return type and files');
const probe = ts.createSourceFile('contract.ts', `type Contract = ${annotation};`, ts.ScriptTarget.Latest, true);
const validation = ts.createProgram({ rootNames: ['contract.ts'], options: { noLib: true }, host: {
  ...ts.createCompilerHost({}),
  getSourceFile: file => file === 'contract.ts' ? probe : undefined,
} });
if (validation.getSyntacticDiagnostics().length) throw new Error('Invalid return type');
const totals = { changed: 0, skipped: 0 };
for (const file of files) {
  const input = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, input, ts.ScriptTarget.Latest, true);
  const positions: number[] = [];
  for (const statement of source.statements) {
    if (!ts.isFunctionDeclaration(statement)) continue;
    if (statement.name?.text !== name || statement.type || !statement.body ||
        !statement.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)) {
      totals.skipped++;
      continue;
    }
    const close = statement.getChildren(source).find(c => c.kind === ts.SyntaxKind.CloseParenToken);
    if (!close) { totals.skipped++; continue; }
    positions.push(close.end);
  }
  let output = input;
  for (const position of positions.reverse()) output = output.slice(0, position) + ': ' + annotation + output.slice(position);
  totals.changed += positions.length;
  if (output !== input) writeFileSync(file, output);
}
console.log(JSON.stringify(totals));

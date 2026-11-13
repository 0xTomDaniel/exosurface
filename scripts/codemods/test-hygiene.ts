// Rerun: node scripts/codemods/test-hygiene.ts [files...]
// No arguments selects the maintained harness, excluding routing-owned files.
import ts from 'typescript';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const directory = 'plugins/bb-plugin-exosurface/test';
const excluded = new Set(['mock-bb.ts', 'exo-block.test.ts', 'required.ts']);
const files = process.argv.slice(2).map(file => resolve(file));
process.chdir(resolve(import.meta.dirname, '../..'));
if (files.length === 0) {
  for (const name of readdirSync(directory)) {
    if (/\.(?:ts|mjs)$/.test(name) && !excluded.has(name)) files.push(join(directory, name));
  }
}
const config = ts.readConfigFile('plugins/bb-plugin-exosurface/tsconfig.json', name => ts.sys.readFile(name));
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, 'plugins/bb-plugin-exosurface');
const program = ts.createProgram(files, parsed.options);
const checker = program.getTypeChecker();
const totals = { nonNull: 0, dot: 0, floating: 0, async: 0, assertion: 0, leftNonNull: 0, leftAsync: 0, leftAssertion: 0, leftDot: 0, leftRegistration: 0 };
for (const file of files) {
  if (excluded.has(file.split('/').at(-1) ?? '')) continue;
  const text = readFileSync(file, 'utf8');
  const source = program.getSourceFile(file);
  if (!source) throw new Error(`Cannot parse ${file}`);
  const edits: { start: number; end: number; text: string }[] = [];
  const initialNonNull = totals.nonNull;
  // A conflicting binding requires judgment rather than a guessed rename.
  const collision = /\brequired\b/.test(text);
  const testNames = new Set<string>();
  const suiteNames = new Set<string>();
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier) || statement.moduleSpecifier.text !== 'node:test') continue;
    const clause = statement.importClause;
    if (clause?.name) testNames.add(clause.name.text);
    const bindings = clause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const element of bindings.elements) {
        if (['test', 'it'].includes((element.propertyName ?? element.name).text)) testNames.add(element.name.text);
        if ((element.propertyName ?? element.name).text === 'describe') suiteNames.add(element.name.text);
      }
    }
  }
  function add(start: number, end: number, replacement: string): void {
    edits.push({ start, end, text: replacement });
  }
  function visit(node: ts.Node): void {
    if (ts.isNonNullExpression(node)) {
      let reference: ts.Node = node;
      let parent = node.parent;
      while (ts.isParenthesizedExpression(parent)) { reference = parent; parent = parent.parent; }
      const type = checker.getTypeAtLocation(node.expression);
      const symbol = checker.getSymbolAtLocation(node.expression);
      const mutable = ts.isIdentifier(node.expression) && symbol?.declarations?.some(d =>
        ts.isVariableDeclaration(d) && ts.isVariableDeclarationList(d.parent) &&
        (d.parent.flags & ts.NodeFlags.Const) === 0);
      const nullishOnly = (type.flags & (ts.TypeFlags.Null | ts.TypeFlags.Undefined | ts.TypeFlags.Never)) !== 0;
      // Do not turn a reference (assignment target or method receiver) into a value.
      if (!collision && !nullishOnly && !mutable && !(ts.isCallExpression(parent) && parent.expression === reference) &&
          !ts.isBinaryExpression(parent) && !ts.isPrefixUnaryExpression(parent) &&
          !ts.isPostfixUnaryExpression(parent) && !ts.isTaggedTemplateExpression(parent) &&
          !ts.isDeleteExpression(parent) && !ts.isForInStatement(parent) && !ts.isForOfStatement(parent)) {
        add(node.getStart(source), node.getStart(source), 'required(');
        add(node.expression.end, node.end, `, ${JSON.stringify(`Expected ${node.expression.getText(source)} to be non-null`)})`);
        totals.nonNull++;
      } else totals.leftNonNull++;
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) &&
        /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(node.argumentExpression.text) &&
        checker.getPropertyOfType(checker.getTypeAtLocation(node.expression), node.argumentExpression.text)) {
      add(node.expression.end, node.end, `${node.questionDotToken ? '?.' : '.'}${node.argumentExpression.text}`);
      totals.dot++;
    }
    if (ts.isExpressionStatement(node) && ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) &&
        (testNames.has(node.expression.expression.text) || suiteNames.has(node.expression.expression.text))) totals.leftRegistration++;
    // node:test documents discarding top-level promises. Awaiting each registration
    // lets root after hooks run before the next test registers, destroying shared fixtures.
    // https://nodejs.org/api/test.html#testname-options-fn
    // Inner suites/concurrency require judgment.
    if (ts.isExpressionStatement(node) && ts.isSourceFile(node.parent) && ts.isCallExpression(node.expression) &&
        ts.isIdentifier(node.expression.expression) && testNames.has(node.expression.expression.text) &&
        node.expression.arguments.every(arg => !ts.isObjectLiteralExpression(arg) ||
          arg.properties.every(prop => ts.isPropertyAssignment(prop) && prop.name.getText(source) !== 'concurrency'))) {
      add(node.getStart(source), node.getStart(source), 'void '); totals.floating++;
      for (const arg of node.expression.arguments) {
        if (!ts.isArrowFunction(arg) && !ts.isFunctionExpression(arg)) continue;
        const modifier = arg.modifiers?.find(m => m.kind === ts.SyntaxKind.AsyncKeyword);
        if (!modifier || arg.parameters.length > 1 || (ts.isFunctionExpression(arg) && arg.asteriskToken)) continue;
        const body = arg.body;
        let unsafe = !ts.isBlock(body);
        function scan(child: ts.Node): void {
          if (ts.isAwaitExpression(child) || ts.isReturnStatement(child) ||
              (ts.isForOfStatement(child) && child.awaitModifier)) unsafe = true;
          if (child !== body && ts.isFunctionLike(child)) return;
          ts.forEachChild(child, scan);
        }
        scan(body);
        if (!unsafe) { add(modifier.getStart(source), modifier.end + 1, ''); totals.async++; }
      }
    }
    if (ts.isElementAccessExpression(node) && ts.isStringLiteral(node.argumentExpression) &&
        !checker.getPropertyOfType(checker.getTypeAtLocation(node.expression), node.argumentExpression.text)) totals.leftDot++;
    if (ts.isAsExpression(node) || ts.isTypeAssertionExpression(node)) {
      const before = checker.getTypeAtLocation(node.expression);
      const after = checker.getTypeAtLocation(node);
      if (ts.isAsExpression(node) && ts.isIdentifier(node.expression) && before === after &&
          (before.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) === 0) {
        add(node.expression.end, node.end, ''); totals.assertion++;
      } else totals.leftAssertion++;
    }
    if (ts.isFunctionLike(node) && ts.canHaveModifiers(node) && ts.getModifiers(node)?.some(m => m.kind === ts.SyntaxKind.AsyncKeyword)) totals.leftAsync++;
    ts.forEachChild(node, visit);
  }
  visit(source);
  let output = text;
  // Refuse overlapping replacements, including nested property rewrites.
  edits.sort((a, b) => b.start - a.start || b.end - a.end);
  let boundary = text.length;
  for (const edit of edits) {
    if (edit.end > boundary) throw new Error(`Overlapping edits in ${file}; left original unchanged`);
    output = output.slice(0, edit.start) + edit.text + output.slice(edit.end);
    boundary = edit.start;
  }
  if (totals.nonNull > initialNonNull) output = "import { required } from './required.ts';\n" + output;
  if (output !== text) writeFileSync(resolve(file), output);
}
totals.leftAsync -= totals.async;
totals.leftRegistration -= totals.floating;
console.log(JSON.stringify(totals));

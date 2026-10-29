import ts from 'typescript';
import { digest, moduleIdentity, definitionRef } from '../lib/source-ref.mjs';
const isFunction = node => ts.isArrowFunction(node) || ts.isFunctionExpression(node);
/** Only opted-in wrappers with inline callbacks are linked; labels are never used to resolve a function. */
export function transformSource({ root, moduleId, source, nodeReceivers = [] }) {
  const sf = ts.createSourceFile(moduleId, source, ts.ScriptTarget.Latest, true);
  if (sf.parseDiagnostics.length) throw new TypeError('Source parse failed');
  const module = moduleIdentity(root, moduleId, source);
  const manifestId = digest(JSON.stringify(module));
  const edits = [], definitions = [], bindings = new Map();
  // TypeScript's lexical symbols prevent a shadowing local variable from being mistaken for an imported tracer.
  const host = { getSourceFile: file => file === moduleId ? sf : undefined, getDefaultLibFileName: () => '',
    writeFile() {}, getCurrentDirectory: () => '/', getDirectories: () => [], fileExists: file => file === moduleId,
    readFile: file => file === moduleId ? source : undefined, getCanonicalFileName: file => file,
    useCaseSensitiveFileNames: () => true, getNewLine: () => '\n' };
  const checker = ts.createProgram([moduleId], { allowJs: true, noLib: true, noResolve: true, jsx: ts.JsxEmit.Preserve }, host).getTypeChecker();
  for (const statement of sf.statements) {
    if (!ts.isImportDeclaration(statement) || !['@open-view/runtime', 'open-view/browser'].includes(statement.moduleSpecifier.text)) continue;
    for (const item of statement.importClause?.namedBindings?.elements || []) {
      if ((item.propertyName || item.name).text === 'traceAction') bindings.set(checker.getSymbolAtLocation(item.name), 'action');
    }
  }
  // Node receivers must be explicitly opted in and declared as parameters, not arbitrary name matches.
  function bindNode(node) {
    if (ts.isParameter(node)) {
      const names = ts.isObjectBindingPattern(node.name) ? node.name.elements.map(item => item.name) : [node.name];
      for (const name of names) if (ts.isIdentifier(name) && nodeReceivers.includes(name.text)) bindings.set(checker.getSymbolAtLocation(name), 'receiver');
    }
    ts.forEachChild(node, bindNode);
  }
  if (nodeReceivers.length) bindNode(sf);
  bindings.delete(undefined);
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const expression = node.expression;
      let mode;
      if (ts.isIdentifier(expression) && bindings.get(checker.getSymbolAtLocation(expression)) === 'action') mode = 'action';
      if (ts.isPropertyAccessExpression(expression) && expression.name.text === 'span'
          && bindings.get(checker.getSymbolAtLocation(expression.expression)) === 'receiver') mode = 'function';
      const [label, callback, options] = node.arguments;
      if (mode && label && ts.isStringLiteralLike(label) && callback && isFunction(callback)
          && node.arguments.length <= 3 && (!options || ts.isObjectLiteralExpression(options))
          && (!options || options.properties.every(property => ts.isPropertyAssignment(property) && property.name.text !== 'source' && !ts.isComputedPropertyName(property.name)))) {
        const ref = definitionRef(module, callback.getStart(sf), callback.getEnd());
        const startLocation = sf.getLineAndCharacterOfPosition(ref.start);
        definitions.push({ sourceRef: ref, label: label.text, line: startLocation.line + 1, column: startLocation.character + 1 });
        const value = JSON.stringify({ manifestId, definitionId: ref.definitionId });
        if (options) edits.push({ start: options.getEnd() - 1, end: options.getEnd() - 1,
          value: `${options.properties.length && !options.properties.hasTrailingComma ? ',' : ''}source:${value}` });
        else edits.push({ start: callback.getEnd(), end: callback.getEnd(), value: `,{source:${value}}` });
        const parameter = callback.parameters[0]?.name;
        if (parameter && ts.isIdentifier(parameter)) bindings.set(checker.getSymbolAtLocation(parameter), 'receiver');
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(sf);
  let code = source;
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
  return { code, manifestId, module, definitions };
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import { relativeModule } from '../lib/source-ref.mjs';
import { identifier } from './protocol.mjs';
import { transformSource } from './source-transform.mjs';
/** Explicit source inspection: opted-in source text is retained locally, never in telemetry payloads. */
export function createSourceRegistry({ projectId, root, maxVersions = 128, maxBytes = 8 * 1024 * 1024,
  maxFileBytes = 256 * 1024, ttlMs = 30 * 60_000, now = Date.now } = {}) {
  if (!identifier(projectId) || typeof root !== 'string' || !path.isAbsolute(root)
      || !Number.isInteger(maxVersions) || maxVersions < 1 || maxVersions > 512
      || !Number.isInteger(maxBytes) || maxBytes < 1 || maxBytes > 32 * 1024 * 1024
      || !Number.isInteger(maxFileBytes) || maxFileBytes < 1 || maxFileBytes > 1024 * 1024
      || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('Invalid source registry configuration');
  const records = new Map(); let bytes = 0, evicted = 0;
  const drop = key => { bytes -= records.get(key).size; records.delete(key); evicted++; };
  function prune() { for (const [key, record] of records) if (record.createdAt + ttlMs <= now()) drop(key); }
  function capture({ moduleId, source, buildId, nodeReceivers = [] }) {
    prune();
    if (!identifier(buildId) || typeof moduleId !== 'string' || moduleId !== relativeModule(root, path.resolve(root, moduleId))
        || typeof source !== 'string' || Buffer.byteLength(source) > Math.min(maxFileBytes, maxBytes)) throw new TypeError('Source capture rejected');
    const result = transformSource({ root, moduleId, source, nodeReceivers });
    if (!result.definitions.length) return result;
    if (result.definitions.length > 1000) throw new TypeError('Source definition capacity exceeded');
    let record = records.get(result.manifestId);
    if (record && !record.builds.has(buildId) && record.builds.size >= 128) throw new TypeError('Source build binding capacity exceeded');
    if (!record) {
      // Include metadata and JS string overhead in the budget, not only raw source bytes.
      const size = 2 * Buffer.byteLength(source) + Buffer.byteLength(JSON.stringify(result.definitions)) * 2 + 4096;
      if (size > maxBytes) throw new TypeError('Source registry byte capacity exceeded');
      while (records.size >= maxVersions || bytes + size > maxBytes) drop(records.keys().next().value);
      record = { ...result, code: undefined, source, size, createdAt: now(), builds: new Set() };
      records.set(result.manifestId, record); bytes += size;
    }
    record.builds.add(buildId);
    return result;
  }
  function resolve(event) {
    prune();
    if (!event.source) return { status: 'not-instrumented' };
    if (event.projectId !== projectId) return { status: 'project-mismatch' };
    const record = records.get(event.source.manifestId);
    if (!record) return { status: 'not-retained' };
    if (!record.builds.has(event.buildId)) return { status: 'build-mismatch' };
    const definition = record.definitions.find(item => item.sourceRef.definitionId === event.source.definitionId);
    if (!definition) return { status: 'definition-mismatch' };
    return { status: 'linked', manifestId: record.manifestId, ...definition };
  }
  function read(manifestId, definitionId) {
    prune(); const record = records.get(manifestId);
    const definition = record?.definitions.find(item => item.sourceRef.definitionId === definitionId);
    if (!definition) return null;
    return { ...definition, manifestId, capture: 'explicit-local-source',
      code: record.source.slice(definition.sourceRef.start, definition.sourceRef.end) };
  }
  return { projectId, root, capture, resolve, read,
    stats() { prune(); return { versions: records.size, bytes, evicted, maxVersions, maxBytes, ttlMs }; },
    clear() { records.clear(); bytes = 0; },
  };
}
/** Dev-only loader for a selected trusted ESM module. Keeps the exact read bytes, not later disk contents. */
export async function loadSourceModule({ registry, moduleId, buildId, nodeReceivers = ['tracer'] }) {
  const file = path.resolve(registry.root, moduleId);
  relativeModule(registry.root, file);
  const real = await fs.realpath(file);
  if (real !== file || (await fs.stat(real)).size > 256 * 1024) throw new TypeError('Module symlink or size denied');
  const original = await fs.readFile(real, 'utf8');
  const transformed = registry.capture({ moduleId, source: original, buildId, nodeReceivers });
  const sf = ts.createSourceFile(file, transformed.code, ts.ScriptTarget.Latest, true);
  const edits = [];
  for (const statement of sf.statements) {
    const specifier = statement.moduleSpecifier;
    if (!specifier || !ts.isStringLiteral(specifier)) continue;
    if (specifier.text.startsWith('.')) edits.push({ start: specifier.getStart(sf), end: specifier.getEnd(),
      value: JSON.stringify(new URL(specifier.text, pathToFileURL(file)).href) });
    else if (!specifier.text.startsWith('node:')) throw new TypeError('Dev source loader supports relative and node: static imports only');
  }
  let code = transformed.code;
  for (const edit of edits.sort((a, b) => b.start - a.start)) code = code.slice(0, edit.start) + edit.value + code.slice(edit.end);
  // Deliberately limited loader: import.meta/dynamic relative imports would change semantics in a data URL.
  let unsupported = false;
  function visit(node) { if (ts.isMetaProperty(node) || ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword) unsupported = true; ts.forEachChild(node, visit); }
  visit(sf); if (unsupported) throw new TypeError('Dev source loader does not support import.meta or dynamic imports');
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

import fs from 'node:fs/promises';
import path from 'node:path';
import { constants } from 'node:fs';
import { relativeModule } from '../lib/source-ref.mjs';
export const CONFIG_NAME = 'open-view.config.json';
export const configurationError = (code, message) => Object.assign(new Error(message), { code });
const fail = (code, message) => { throw configurationError(code, message); };
export async function projectRoot(value = '.') {
  const root = await fs.realpath(path.resolve(value));
  if (!(await fs.stat(root)).isDirectory()) fail('PROJECT_ROOT', 'Project root must be a directory.');
  return root;
}
// Fixed JSON and selected code files only. Refuse symlinks at every path component.
export async function readLocalFile(root, relative, maxBytes = 256 * 1024) {
  if (typeof relative !== 'string' || !relative || relative.includes('\\') || path.isAbsolute(relative)
      || relative.split('/').some(part => !part || part === '.' || part === '..')) fail('PATH_DENIED', 'Use a normalized project-relative file path.');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) fail('SYMLINK_DENIED', 'Symlink files and directories are not selected.');
  }
  const handle = await fs.open(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maxBytes) fail('FILE_SIZE', 'Selected file exceeds the regular-file size limit.');
    // Bound actual reads as well as the pre-read stat, including concurrently growing files.
    const buffer = Buffer.alloc(maxBytes + 1); let length = 0;
    while (length < buffer.length) {
      const result = await handle.read(buffer, length, buffer.length - length, length);
      if (!result.bytesRead) break; length += result.bytesRead;
    }
    if (length > maxBytes) fail('FILE_SIZE', 'Selected file exceeds the size limit.');
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length));
  } finally { await handle.close(); }
}
export function validateConfig(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
      || Object.keys(input).some(key => !['schemaVersion', 'sourceFiles', 'uiPort', 'appPort'].includes(key))
      || input.schemaVersion !== 1) fail('CONFIG_SCHEMA', 'Use schemaVersion 1 and only sourceFiles/uiPort/appPort.');
  if (!Array.isArray(input.sourceFiles) || input.sourceFiles.length < 1 || input.sourceFiles.length > 32
      || new Set(input.sourceFiles).size !== input.sourceFiles.length) fail('SOURCE_FILES', 'Choose 1–32 unique source files explicitly.');
  for (const file of input.sourceFiles) {
    if (typeof file !== 'string' || file.length > 240 || file.includes('\\') || file.includes(':')
        || file.split('/').some(part => !part || part === '.' || part === '..')
        || !/\.(?:[jt]sx?|mjs)$/.test(file)) fail('SOURCE_PATH', 'Only normalized relative JS/TS source paths are supported.');
    try { relativeModule('/open-view-project', path.resolve('/open-view-project', file)); }
    catch { fail('SOURCE_PATH', 'Hidden, output, dependency, and outside-root paths are not selectable.'); }
  }
  const result = { schemaVersion: 1, sourceFiles: [...input.sourceFiles], uiPort: input.uiPort ?? 4418, appPort: input.appPort ?? 5173 };
  for (const port of [result.uiPort, result.appPort]) if (!Number.isInteger(port) || port < 0 || port > 65535 || port > 0 && port < 1024) fail('CONFIG_PORT', 'Ports must be 0 or 1024–65535.');
  if (result.uiPort !== 0 && result.uiPort === result.appPort) fail('CONFIG_PORT', 'UI and application ports must differ.');
  return result;
}
export async function loadConfig(root) {
  let data;
  try { data = JSON.parse(await readLocalFile(root, CONFIG_NAME, 16 * 1024)); }
  catch (error) { if (error.code === 'ENOENT') fail('CONFIG_MISSING', 'Run init --source <relative-file> and review the configuration first.'); throw error; }
  return validateConfig(data);
}
export async function initProject({ project = '.', sourceFiles, write = false, uiPort, appPort } = {}) {
  const root = await projectRoot(project), config = validateConfig({ schemaVersion: 1, sourceFiles, uiPort, appPort });
  for (const file of config.sourceFiles) await readLocalFile(root, file);
  const content = JSON.stringify(config, null, 2) + '\n';
  if (write) {
    // Exclusive creation: never clobber an existing config or a symlink, even with concurrent init calls.
    const handle = await fs.open(path.join(root, CONFIG_NAME), 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); } finally { await handle.close(); }
  }
  return { command: 'init', written: write, path: CONFIG_NAME, config,
    note: 'Only this JSON is created. Package scripts, Vite config, application code and .env are untouched.' };
}

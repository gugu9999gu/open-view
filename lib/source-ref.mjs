import crypto from 'node:crypto';
import path from 'node:path';
export const digest = value => crypto.createHash('sha256').update(value).digest('hex');
export const staticProjectId = root => 'project:' + digest(root).slice(0, 20);
export function moduleIdentity(root, moduleId, source) {
  const projectId = staticProjectId(root), moduleVersion = digest(source);
  return { projectId, moduleId, moduleVersion };
}
/** File-content identity is shared by the static scanner and dev transform. */
export function definitionRef(module, start, end) {
  const definitionId = 'function:' + digest(JSON.stringify([module.projectId, module.moduleId, module.moduleVersion, start, end])).slice(0, 20);
  return { ...module, definitionId, start, end };
}
export function relativeModule(root, file) {
  const relative = path.relative(root, file);
  if (!relative || relative.startsWith('..' + path.sep) || relative === '..' || path.isAbsolute(relative)) throw new TypeError('Source must be inside the project');
  const moduleId = relative.split(path.sep).join('/');
  if (moduleId.split('/').some(part => part.startsWith('.') || ['node_modules', 'dist', 'build'].includes(part)) || !/\.(?:[jt]sx?|mjs|cjs)$/.test(moduleId)) throw new TypeError('Unsupported source path');
  return moduleId;
}

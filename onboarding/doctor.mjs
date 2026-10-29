import path from 'node:path';
import { createRequire } from 'node:module';
import { projectRoot, readLocalFile, loadConfig, validateConfig } from './config.mjs';
import { transformSource } from '../runtime/source-transform.mjs';
export async function diagnoseProject({ project = '.', config: supplied } = {}) {
  const checks = [], files = [];
  const record = (id, status, message) => checks.push({ id, status, message });
  let root, config, packageJson;
  try { root = await projectRoot(project); } catch { record('root', 'error', 'Project directory is unavailable.'); }
  if (root) {
    try { config = supplied ? validateConfig(supplied) : await loadConfig(root); record('config', 'ok', 'Explicit configuration is valid.'); }
    catch (error) { record('config', 'error', error.code === 'CONFIG_MISSING' ? 'Configuration missing: run init first.' : 'Invalid or unsafe configuration.'); }
    try { packageJson = JSON.parse(await readLocalFile(root, 'package.json', 128 * 1024)); if (!packageJson || typeof packageJson !== 'object' || Array.isArray(packageJson)) throw new Error(); record('package', 'ok', 'Read package metadata without executing scripts.'); }
    catch { record('package', 'error', 'A readable project package.json is required.'); }
  }
  if (packageJson) {
    const declared = { ...packageJson.dependencies, ...packageJson.devDependencies };
    if (declared.next || declared.nuxt || declared['@sveltejs/kit']) record('framework', 'error', 'Next/Nuxt/SvelteKit routing and SSR are not supported by this connector.');
    const require = createRequire(path.join(root, 'package.json'));
    for (const [name, major] of [['vite', 7], ['react', 19]]) {
      try {
        if (!declared[name]) throw new Error();
        const filename = require.resolve(`${name}/package.json`);
        // Dependency metadata is JSON only; never import the entrypoint or config during diagnosis.
        const metadata = JSON.parse(await readLocalFile(path.dirname(filename), 'package.json', 256 * 1024));
        const version = metadata.version;
        if (typeof version !== 'string' || !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(version)) throw new Error();
        record(name, Number(version.split('.')[0]) === major ? 'ok' : 'error', `${name} ${version}; verified major: ${major}.`);
      } catch { record(name, 'error', `${name} must be declared and installed in this project; no automatic install is performed.`); }
    }
    if (packageJson.workspaces) record('workspaces', 'warning', 'Select one application package as root. Automatic monorepo traversal is not supported.');
  }
  record('node', Number(process.versions.node.split('.')[0]) >= 22 ? 'ok' : 'error', `Node ${process.versions.node}; requires 22 or newer.`);
  if (root && config) for (const moduleId of config.sourceFiles) {
    try {
      const source = await readLocalFile(root, moduleId);
      const result = transformSource({ root, moduleId, source });
      files.push({ moduleId, linkedCallbacks: result.definitions.length,
        status: result.definitions.length ? 'supported' : 'not-instrumented' });
      if (!result.definitions.length) record('source-wrapper', 'warning', `${moduleId}: no supported traceAction inline callback; do not infer runtime coverage.`);
    } catch { files.push({ moduleId, status: 'rejected', linkedCallbacks: 0 }); record('source-file', 'error', `${moduleId}: unreadable, oversized, unsafe, or invalid syntax.`); }
  }
  return { schemaVersion: 1, command: 'doctor', status: checks.some(check => check.status === 'error') ? 'blocked' : 'ready-with-limitations',
    checks, files, executionObserved: false, configurationExecuted: false,
    limitations: ['Static preflight only; does not prove that a callback executed.', 'Vite root/base/SSR/plugin conflicts are checked after explicitly trusted config execution.',
      'Only selected inline callbacks are mapped. Source text can include literals and comments.', 'No credentials, .env files, script bodies or source text are included in this report.'] };
}

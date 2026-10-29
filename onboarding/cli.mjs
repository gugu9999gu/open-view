#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import readline from 'node:readline';
import { initProject, loadConfig, projectRoot, configurationError } from './config.mjs';
import { diagnoseProject } from './doctor.mjs';
import { openView } from './vite.mjs';
export const HELP = `Open View — trusted local projects only
  open-view init --project <folder> --source src/App.jsx [--source src/Other.jsx] [--write]
  open-view doctor --project <folder> [--json]
  open-view dev --project <folder> --trust-project

init previews by default; --write only creates open-view.config.json, never overwrites.
doctor reads JSON metadata and selected source files, never executes config/scripts or reads .env.
dev executes the project's existing trusted Vite config and plugins. It does not install packages.
Choose ports in open-view.config.json (0 selects a free port). No cloud or DB is provisioned.
Import { traceAction } from 'open-view/browser' and explicitly wrap selected inline callbacks.
Production uses the no-op package export even when no Open View Vite plugin is configured.
Type auth to issue a new login URL; stop-collector stops only observation until dev restarts.`;
export function parseArgs(args) {
  const [command, ...rest] = args;
  if (command === '--help' || command === 'help' || !command) return { command: 'help' };
  if (!['init','doctor','dev'].includes(command)) throw configurationError('CLI_ARGS', 'Unknown command. Use --help.');
  const result = { command, project: '.', sourceFiles: [], write: false, json: false, trusted: false }, seen = new Set();
  for (let index = 0; index < rest.length; index++) {
    const key = rest[index];
    if (key !== '--source' && seen.has(key)) throw configurationError('CLI_ARGS', 'Duplicate option.');
    seen.add(key);
    if (key === '--project' || key === '--source' && command === 'init') {
      const value = rest[++index];
      if (!value || value.startsWith('--')) throw configurationError('CLI_ARGS', 'Option value is missing.');
      if (key === '--project') result.project = value; else result.sourceFiles.push(value);
    } else if (key === '--write' && command === 'init') result.write = true;
    else if (key === '--json' && command === 'doctor') result.json = true;
    else if (key === '--trust-project' && command === 'dev') result.trusted = true;
    else throw configurationError('CLI_ARGS', 'Unknown or misplaced option. Use --help.');
  }
  return result;
}
export async function connectProject({ project = '.', trusted = false, onReady } = {}) {
  if (!trusted) throw configurationError('TRUST_REQUIRED', 'dev executes project code. Review it first and pass --trust-project.');
  const root = await projectRoot(project), config = await loadConfig(root);
  const report = await diagnoseProject({ project: root, config });
  if (report.status === 'blocked') throw configurationError('DOCTOR_BLOCKED', 'Preflight blocked. Run doctor --json to see the checks.');
  // Only the target project's installed Vite is loaded, and only after explicit trust and preflight.
  const require = createRequire(path.join(root, 'package.json'));
  const { createServer } = await import(pathToFileURL(require.resolve('vite')).href);
  let ready, app;
  const connector = openView({ project: root, ...config, onReady: details => { ready = details; } });
  try {
    app = await createServer({ root, server: { host: '127.0.0.1', port: config.appPort, strictPort: true }, plugins: [connector] });
    await app.listen();
    const details = { ...ready, appUrl: `http://127.0.0.1:${app.httpServer.address().port}`, report };
    await onReady?.(details);
    return { ...details, app, connector, close: async () => {
      // Drain pending pre-transforms before closing the watcher (Vite may add imports asynchronously).
      await app.environments.client.waitForRequestsIdle();
      await app.close(); await connector.api.close();
    } };
  } catch (error) { await app?.close(); await connector.api.dispose(); throw error; }
}
export async function main(args = process.argv.slice(2)) {
  try {
    const options = parseArgs(args);
    if (options.command === 'help') { console.log(HELP); return; }
    if (options.command === 'init') { console.log(JSON.stringify(await initProject(options), null, 2)); return; }
    if (options.command === 'doctor') {
      const report = await diagnoseProject(options);
      console.log(options.json ? JSON.stringify(report, null, 2) : [
        `Open View: ${report.status}`,
        ...report.checks.map(check => `[${check.status}] ${check.id}: ${check.message}`),
        ...report.files.map(file => `${file.moduleId}: ${file.status}, ${file.linkedCallbacks} supported callbacks`),
        ...report.limitations,
      ].join('\n'));
      if (report.status === 'blocked') process.exitCode = 2;
      return;
    }
    const running = await connectProject({ project: options.project, trusted: options.trusted,
      onReady: ({ loginUrl, uiUrl, appUrl }) => console.log(`OPEN_VIEW_CONNECTED=${JSON.stringify({ loginUrl, uiUrl, appUrl })}`) });
    const input = readline.createInterface({ input: process.stdin });
    input.on('line', async line => {
      if (line.trim() === 'auth' && running.connector.api.status().enabled) console.log(`OPEN_VIEW_LOGIN=${running.connector.api.issueLoginUrl()}`);
      if (line.trim() === 'stop-collector') { await running.connector.api.close(); console.log('OPEN_VIEW_COLLECTOR_STOPPED'); }
    });
    let closing = false;
    for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => {
      if (closing) return; closing = true; input.close(); process.stdin.pause(); await running.close(); process.exitCode = 0;
    });
  } catch (error) {
    const known = ['TRUST_REQUIRED','DOCTOR_BLOCKED','CLI_ARGS','CONFIG_SCHEMA','SOURCE_FILES','SOURCE_PATH','CONFIG_PORT','CONFIG_MISSING',
      'PATH_DENIED','SYMLINK_DENIED','FILE_SIZE','PROJECT_ROOT','ROOT_MISMATCH','UNSUPPORTED_VITE_CONFIG','ALIAS_CONFLICT','DUPLICATE_CONNECTOR'];
    const code = known.includes(error.code) ? error.code : error.code === 'EEXIST' ? 'CONFIG_EXISTS' : error.code === 'EADDRINUSE' ? 'PORT_BUSY' : 'CONNECT_FAILED';
    // Do not print thrown project config text, credentials, stack traces or request values.
    console.error(JSON.stringify({ status: 'blocked', code, message: known.includes(code) ? error.message : 'Could not connect safely. Existing files are preserved; inspect configuration and selected ports.' }));
    process.exitCode = 2;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();

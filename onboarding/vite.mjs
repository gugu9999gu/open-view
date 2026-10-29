import path from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import { createServer } from '../server.mjs';
import { createCollector } from '../runtime/collector.mjs';
import { createSourceRegistry } from '../runtime/source-registry.mjs';
import { openViewRelay } from '../runtime/vite-plugin.mjs';
import { createEmitter, httpTransport } from '../runtime/emitter.mjs';
import { createNodeTracer } from '../runtime/node-sdk.mjs';
import { staticProjectId } from '../lib/source-ref.mjs';
import { validateConfig, projectRoot, readLocalFile, configurationError } from './config.mjs';
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const error = (code, message) => { throw configurationError(code, message); };
/** Explicit local Vite adapter. Starts no process and reads no selected source until dev setup. */
export function openView({ project, sourceFiles, uiPort = 4418, onReady = details => console.log(`OPEN_VIEW_CONNECTED=${JSON.stringify(details)}`) } = {}) {
  const options = validateConfig({ schemaVersion: 1, sourceFiles, uiPort, appPort: 0 });
  if (typeof onReady !== 'function') throw new TypeError('onReady must be a function');
  let command, root, relay, ui, collector, emitter, tracer, uiUrl, closed = false, viteServer;
  const messages = new Set();
  async function close() {
    if (closed) return; closed = true;
    emitter?.close();
    if (ui) { ui.server.closeAllConnections(); await new Promise(resolve => ui.server.close(resolve)); }
    collector?.close();
  }
  const plugin = {
    name: 'open-view-project-connector', enforce: 'pre',
    config(config, environment) {
      command = environment.command;
      const alias = config.resolve?.alias;
      const entries = Array.isArray(alias) ? alias : Object.entries(alias || {}).map(([find, replacement]) => ({ find, replacement }));
      for (const { find } of entries) if (['open-view/browser', '@open-view/runtime'].some(name => typeof find === 'string' ? find === name : find.test(name))) error('ALIAS_CONFLICT', 'Remove the conflicting Open View alias before connecting.');
      const client = path.join(packageRoot, 'runtime', command === 'serve' ? 'browser-client.mjs' : 'browser-disabled.mjs');
      return { resolve: { alias: [{ find: /^open-view\/browser$/, replacement: client }, { find: /^@open-view\/runtime$/, replacement: client }] },
        optimizeDeps: { exclude: ['open-view/browser', '@open-view/runtime'] } };
    },
    async configResolved(config) {
      if (command !== 'serve') return;
      root = await projectRoot(project || config.root);
      if (await projectRoot(config.root) !== root) error('ROOT_MISMATCH', 'Vite root and selected project root must be the same.');
      if (config.base !== '/' || config.server.https || config.server.middlewareMode || config.isProduction
          || config.build.ssr || config.server.host && !['127.0.0.1', 'localhost'].includes(config.server.host)) {
        error('UNSUPPORTED_VITE_CONFIG', 'This adapter supports development, base=/, standalone loopback HTTP only.');
      }
      if (config.plugins.filter(item => item.name === plugin.name).length !== 1) error('DUPLICATE_CONNECTOR', 'Use the CLI injection or a Vite plugin entry, not both.');
      for (const file of options.sourceFiles) await readLocalFile(root, file);
    },
    async configureServer(server) {
      viteServer = server;
      if (closed) error('CONNECTOR_CLOSED', 'Create a fresh connector instance for each Vite server.');
      const projectId = staticProjectId(root), buildId = `dev:${crypto.randomUUID()}`;
      const sources = createSourceRegistry({ projectId, root });
      collector = createCollector({ projectId, sources });
      ui = createServer({ project: root, port: options.uiPort, collector });
      try {
        await new Promise((resolve, reject) => { ui.server.once('error', reject); ui.server.listen(options.uiPort, '127.0.0.1', resolve); });
        uiUrl = `http://127.0.0.1:${ui.server.address().port}`;
        const agent = collector.issueAgent({ buildId, runtimeInstanceId: `node:${crypto.randomUUID()}`, kinds: ['function','http.server','db.transaction','db.query','fallback'] });
        emitter = createEmitter(agent.scope, { send: httpTransport({ url: `${uiUrl}/api/ingest`, token: agent.token }) });
        tracer = createNodeTracer({ emitter });
        relay = openViewRelay({ projectId, buildId, collectorUrl: uiUrl, issueAgent: collector.issueAgent,
          revokeAgent: collector.revoke, sources, sourceFiles: options.sourceFiles });
        relay.configureServer(server);
        server.httpServer?.once('close', () => { void close(); });
        await onReady({ uiUrl, loginUrl: `${uiUrl}/#token=${ui.token}`, sourceFiles: options.sourceFiles,
          note: 'Selected source text is kept locally. Event capture is best-effort; no database is provisioned.' });
      } catch (cause) { await close(); await server.close(); throw cause; }
    },
    async transform(code, id, context) {
      if (!relay || context?.ssr) return null;
      const file = id.split('?')[0];
      const selected = options.sourceFiles.find(relative => path.resolve(root, relative) === file);
      if (!selected) return null;
      try {
        // Never map already-transformed text or a file swapped to a symlink to the original AST.
        if (await readLocalFile(root, selected) !== code) throw new Error();
        return relay.transform(code, id);
      } catch {
        if (!messages.has(selected)) { messages.add(selected); this.warn(`Open View: source mapping skipped for ${selected}; original bytes unavailable.`); }
        return null;
      }
    },
    handleHotUpdate(context) { return relay?.handleHotUpdate(context); },
    closeBundle: close,
    api: {
      get tracer() { if (!tracer) error('NOT_STARTED', 'Node tracer is available after configureServer.'); return tracer; },
      status() { return { enabled: !!uiUrl && !closed, sourceFiles: [...options.sourceFiles], uiUrl: uiUrl || null }; },
      issueLoginUrl() { if (!ui || closed) error('NOT_STARTED', 'Connector is not running.'); return `${uiUrl}/#token=${ui.issueBootstrapToken()}`; },
      close,
      async dispose() { await viteServer?.close(); await close(); },
    },
  };
  return plugin;
}

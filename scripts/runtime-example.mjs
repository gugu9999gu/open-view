import path from 'node:path';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import pg from 'pg';
import { createServer as createOpenViewServer } from '../server.mjs';
import { createCollector, readJsonBody } from '../runtime/collector.mjs';
import { createEmitter, httpTransport } from '../runtime/emitter.mjs';
import { createNodeTracer } from '../runtime/node-sdk.mjs';
import { openViewRelay } from '../runtime/vite-plugin.mjs';
import { saveCustomer } from '../examples/runtime-app/service.mjs';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function validateExampleDatabase(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
      || !/^\/open_view_(example|test)[a-z0-9_]*$/.test(url.pathname) || url.search || url.hash) throw new Error('Use an explicit loopback database named open_view_example or open_view_test*');
  return value;
}
export async function startRuntimeExample({ databaseUrl = process.env.OPEN_VIEW_EXAMPLE_DATABASE_URL, uiPort = 4418, appPort = 5173 } = {}) {
  if (!databaseUrl) throw new Error('Set OPEN_VIEW_EXAMPLE_DATABASE_URL to a dedicated local example/test database');
  validateExampleDatabase(databaseUrl);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 4, connectionTimeoutMillis: 2000, statement_timeout: 3000 });
  pool.on('error', () => { /* Idle connection loss is not a telemetry event with raw error content. */ });
  let ui, app, emitter;
  try {
    await pool.query('CREATE TABLE IF NOT EXISTS open_view_runtime_examples (id bigserial PRIMARY KEY, name text NOT NULL)');
    const buildHash = crypto.createHash('sha256');
    for (const file of ['examples/runtime-app/src/main.jsx', 'examples/runtime-app/service.mjs', 'runtime/node-sdk.mjs', 'runtime/browser-sdk.mjs']) buildHash.update(await fs.readFile(path.join(root, file)));
    const buildId = `example:${buildHash.digest('hex').slice(0,32)}`, projectId = 'open-view-runtime-example';
    const collector = createCollector({ projectId });
    ui = createOpenViewServer({ project: path.join(root, 'examples/runtime-app'), port: uiPort, collector });
    await new Promise((resolve,reject) => { ui.server.once('error', reject); ui.server.listen(uiPort,'127.0.0.1',resolve); });
    const uiUrl = `http://127.0.0.1:${ui.server.address().port}`;
    const agent = collector.issueAgent({ buildId, runtimeInstanceId: `node:${crypto.randomUUID()}`, kinds: ['function','http.server','db.transaction','db.query','fallback'] });
    emitter = createEmitter(agent.scope, { send: httpTransport({ url: `${uiUrl}/api/ingest`, token: agent.token }) });
    const tracer = createNodeTracer({ emitter });
    app = await createViteServer({ configFile: path.join(root,'examples/runtime-app/vite.config.mjs'),
      server: { host: '127.0.0.1', port: appPort, strictPort: true },
      plugins: [openViewRelay({ projectId, buildId, collectorUrl: uiUrl, issueAgent: collector.issueAgent, revokeAgent: collector.revoke }), {
        name: 'example-business-api', apply: 'serve', configureServer(server) {
          server.middlewares.use(async (req,res,next) => {
            if (!req.url?.startsWith('/api/')) return next();
            const send = (status, body) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
            const port = server.httpServer.address()?.port;
            if (![`127.0.0.1:${port}`,`localhost:${port}`].includes(req.headers.host)
                || req.headers.origin && req.headers.origin !== `http://${req.headers.host}` || req.headers['sec-fetch-site'] === 'cross-site') return send(403,{message:'Origin denied'});
            try {
              if (req.url === '/api/ping' && req.method === 'GET') return await tracer.request('poll',req.headers.traceparent,()=>send(200,{ok:true}));
              if (req.url !== '/api/customers' || req.method !== 'POST') return send(404,{message:'Not found'});
              const body = await readJsonBody(req, 2048);
              if (!body || typeof body.name !== 'string' || body.name.length > 80 || !['success','rollback','after-commit','fixture'].includes(body.scenario)) return send(400,{message:'Invalid example input'});
              await tracer.request('POST /api/customers', req.headers.traceparent, async span => {
                try { const result = await saveCustomer({tracer,pool,name:body.name,scenario:body.scenario}); span.setOutcome({transport:'response'}); send(200,result); }
                catch (error) { span.setOutcome({transport:'response'}); throw error; }
              });
            } catch (error) { send(error.status || 500,{message:'Example operation failed'}); }
          });
        }
      }] });
    await app.listen();
    const appUrl = `http://127.0.0.1:${app.httpServer.address().port}`;
    let collectorStopped = false;
    async function stopCollector() {
      if (collectorStopped) return;
      collectorStopped = true; ui.server.closeAllConnections(); await new Promise(resolve => ui.server.close(resolve));
    }
    return { uiUrl, loginUrl: `${uiUrl}/#token=${ui.token}`, appUrl, collector, pool, emitter,
      stopCollector, async close() { await app.close(); await emitter.flush(); emitter.close(); await stopCollector(); await pool.end(); } };
  } catch (error) {
    await app?.close(); emitter?.close(); ui?.server.closeAllConnections(); ui?.server.close(); await pool.end(); throw error;
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await startRuntimeExample({ uiPort: Number(process.env.OPEN_VIEW_UI_PORT || 4418), appPort: Number(process.env.OPEN_VIEW_APP_PORT || 5173) });
  console.log(`OPEN_VIEW_READY=${JSON.stringify({ loginUrl: app.loginUrl, appUrl: app.appUrl })}`);
  // Terminal-only failure injection. There is no unauthenticated HTTP shutdown route.
  let input = ''; process.stdin.setEncoding('utf8'); process.stdin.on('data', async chunk => {
    input += chunk; let index;
    while ((index = input.indexOf('\n')) >= 0) { const line = input.slice(0,index).trim(); input = input.slice(index+1);
      if (line === 'stop-collector') { await app.stopCollector(); console.log('OPEN_VIEW_COLLECTOR_STOPPED'); }
    }
  });
  let closing = false;
  for (const signal of ['SIGINT','SIGTERM']) process.once(signal, async () => { if (closing) return; closing = true; process.stdin.pause(); await app.close(); process.exit(0); });
}

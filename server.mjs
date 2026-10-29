import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { createAuth } from './lib/auth.mjs';
import { scanInWorker } from './lib/scan-runner.mjs';
import { readJsonBody } from './runtime/collector.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_PORT = 4418;
const publicAssets = new Map([
  ['/app.mjs', 'text/javascript; charset=utf-8'],
  ['/graph-model.mjs', 'text/javascript; charset=utf-8'],
  ['/session-client.mjs', 'text/javascript; charset=utf-8'],
  ['/runtime-view.mjs', 'text/javascript; charset=utf-8'],
  ['/source-view.mjs', 'text/javascript; charset=utf-8'],
]);
export function authorizedHost(host, port) {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
export function createServer({ project, port = DEFAULT_PORT,
  token = crypto.randomBytes(32).toString('hex'), authOptions = {}, scanTimeoutMs = 30_000, collector = null,
} = {}) {
  if (typeof project !== 'string' || !project) throw new TypeError('A trusted project directory is required');
  const auth = createAuth({ ...authOptions, token });
  const shutdown = new AbortController();
  let scanPromise = null;
  const server = http.createServer({ maxHeaderSize: 16 * 1024 }, async (req, res) => {
    const send = (status, body, type = 'application/json; charset=utf-8') => {
      res.writeHead(status, {
        'Content-Type': type, 'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
      });
      res.end(req.method === 'HEAD' ? undefined : typeof body === 'string' ? body : JSON.stringify(body));
    };
    try {
      const actualPort = server.address()?.port ?? port;
      if (!authorizedHost(req.headers.host, actualPort)) return send(403, { error: 'Host denied' });
      const origin = `http://${req.headers.host}`;
      const url = new URL(req.url, origin);
      if (url.origin !== origin) return send(403, { error: 'Request origin denied' });
      if (req.headers.origin && req.headers.origin !== origin) return send(403, { error: 'Origin denied' });
      if (req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Cross-site request denied' });
      if (url.pathname === '/api/ingest' && collector) {
        if (req.method !== 'POST') return send(405, { error: 'POST required' });
        if (!collector.authorize(req.headers.authorization)) return send(401, { error: 'Ingest credential required' });
        try { return send(202, collector.ingest(req.headers.authorization, await readJsonBody(req))); }
        catch (error) { return send(error.status || 400, { error: error.status ? error.message : 'Invalid batch' }); }
      }
      if (url.pathname === '/api/session' && req.method === 'POST') {
        const session = auth.exchange(req.headers.authorization);
        return session ? send(200, session) : send(401, { error: 'Expired, consumed, or invalid bootstrap token' });
      }
      if (url.pathname.startsWith('/api/')) {
        if (!auth.authorize(req.headers.authorization)) return send(401, { error: 'A valid UI session is required' });
        if (url.pathname === '/api/session' && req.method === 'DELETE') {
          auth.revoke(req.headers.authorization);
          return send(204, '');
        }
        if (collector && url.pathname === '/api/traces' && req.method === 'DELETE') {
          collector.clear(); return send(204, '');
        }
        if (req.method !== 'GET') return send(405, { error: 'Read-only analysis API' });
        if (collector?.sources && /^\/api\/sources\/[a-f0-9]{64}\/function:[a-f0-9]{20}$/.test(url.pathname)) {
          const [, , , manifestId, definitionId] = url.pathname.split('/');
          const source = collector.sources.read(manifestId, definitionId);
          return source ? send(200, source) : send(404, { error: 'Source version not retained' });
        }
        if (collector && url.pathname === '/api/traces') return send(200, collector.list());
        if (collector && /^\/api\/traces\/[a-f0-9]{32}$/.test(url.pathname)) {
          const result = collector.trace(url.pathname.split('/').pop());
          return result ? send(200, result) : send(404, { error: 'Trace not retained' });
        }
        if (url.pathname === '/api/graph') {
          if (!scanPromise) scanPromise = scanInWorker(project, {
            timeoutMs: scanTimeoutMs, signal: shutdown.signal,
          }).finally(() => { scanPromise = null; });
          return send(200, await scanPromise);
        }
        if (url.pathname === '/api/config') return send(200, { project, mode: 'static', runtime: collector ? 'explicit-wrappers' : 'not-implemented' });
        return send(404, { error: 'Not found' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, { error: 'Method not allowed' });
      if (url.pathname === '/' || url.pathname === '/index.html') {
        const nonce = crypto.randomBytes(18).toString('base64');
        const html = (await fs.readFile(path.join(here, 'public/index.html'), 'utf8'))
          .replace('type="module" src="./app.mjs"', `type="module" nonce="${nonce}" src="./app.mjs"`);
        res.setHeader('Content-Security-Policy', [
          "default-src 'none'", `script-src 'self' 'nonce-${nonce}'`, "style-src 'unsafe-inline'",
          "connect-src 'self'", "img-src 'self' data:", "frame-src 'self' about:",
          "base-uri 'none'", "frame-ancestors 'none'", "form-action 'none'",
        ].join('; '));
        // Migration only: expire the old bootstrap-bearing cookie, never create a new one.
        if (/(?:^|;\s*)ov_session=/.test(req.headers.cookie || '')) {
          res.setHeader('Set-Cookie', 'ov_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
        }
        return send(200, html, 'text/html; charset=utf-8');
      }
      if (publicAssets.has(url.pathname)) {
        return send(200, await fs.readFile(path.join(here, 'public', url.pathname.slice(1)), 'utf8'), publicAssets.get(url.pathname));
      }
      if (url.pathname === '/favicon.ico') return send(204, '');
      return send(404, { error: 'Not found' });
    } catch (error) {
      const timeout = error.code === 'SCAN_TIMEOUT';
      console.error(timeout ? 'Analysis exceeded its time budget.' : 'Local analysis request failed.');
      if (!res.headersSent) send(timeout ? 503 : 500, { error: timeout ? 'Analysis timed out; reduce project scope.' : 'Analysis failed; consult the local terminal.' });
      else res.end();
    }
  });
  server.requestTimeout = 10_000;
  server.headersTimeout = 10_000;
  server.on('close', () => { shutdown.abort(); auth.clear(); collector?.close(); });
  return { server, token, issueBootstrapToken: () => auth.issueBootstrap() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const value = (key, fallback) => { const i = args.indexOf(key); return i < 0 ? fallback : args[i + 1]; };
  if (args.includes('--help')) {
    console.log(`node server.mjs --project <trusted-local-folder> --port ${DEFAULT_PORT}\nRead-only AST scanner. No runtime agent yet. Type auth in the terminal for a new login link.`);
    process.exit(0);
  }
  const port = Number(value('--port', String(DEFAULT_PORT)));
  if (!Number.isInteger(port) || (port !== 0 && (port < 1024 || port > 65535))) throw new Error('Port must be 0 or 1024–65535');
  const project = await fs.realpath(path.resolve(value('--project', path.join(here, 'examples/demo-project'))));
  const { server, token, issueBootstrapToken } = createServer({ project, port });
  let input;
  const printLink = capability => console.log(`http://127.0.0.1:${server.address().port}/#token=${capability}`);
  server.on('error', error => {
    console.error(error.code === 'EADDRINUSE' ? `Port ${port} is busy. Choose --port <number> or --port 0.` : 'Could not start local server.');
    process.exitCode = 1;
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`Open View — LOCAL ONLY\nProject: ${project}`);
    printLink(token);
    console.log('Login link: single use, expires in 5 minutes. Type auth for another link.\nThe initial graph is DEMO. Select “폴더 분석” for static evidence. No target files or databases are modified.');
    if (process.stdin.isTTY) {
      input = readline.createInterface({ input: process.stdin });
      input.on('line', line => { if (line.trim() === 'auth') printLink(issueBootstrapToken()); });
    }
  });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => {
    input?.close(); server.closeAllConnections(); server.close();
  });
}

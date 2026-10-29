import crypto from 'node:crypto';
import { readJsonBody } from './collector.mjs';
import { randomId } from './protocol.mjs';
import { httpTransport } from './emitter.mjs';
/** Dev-only, same-origin metadata relay. Agent ingest credentials never enter browser code. */
export function openViewRelay({ projectId, buildId, collectorUrl, issueAgent, revokeAgent = () => {} }) {
  const sessions = new Map(); let currentBuild = buildId;
  const clear = () => { for (const session of sessions.values()) revokeAgent(session.agent.token); sessions.clear(); };
  return {
    name: 'open-view-dev-relay', apply: 'serve',
    handleHotUpdate(context) {
      currentBuild = `dev:${randomId()}`; clear();
      // Full reload prevents a runtime from silently claiming the previous build. Historic mapping is not implemented.
      context.server.ws.send({ type: 'full-reload' });
    },
    configureServer(server) {
      server.httpServer?.once('close', clear);
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/__open_view/')) return next();
        const send = (status, body) => {
          res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(JSON.stringify(body));
        };
        try {
          const port = server.httpServer.address()?.port;
          if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(req.headers.host)) return send(403, { error: 'Host denied' });
          const origin = `http://${req.headers.host}`;
          if (req.headers.origin && req.headers.origin !== origin || req.headers['sec-fetch-site'] === 'cross-site') return send(403, { error: 'Origin denied' });
          const url = new URL(req.url, origin);
          if (url.origin !== origin) return send(403, { error: 'Origin denied' });
          for (const [key, session] of sessions) if (session.agent.expiresAt <= Date.now()) { sessions.delete(key); revokeAgent(session.agent.token); }
          if (url.pathname === '/__open_view/bootstrap' && req.method === 'GET') {
            if (sessions.size >= 32) return send(429, { error: 'Page session capacity reached' });
            const agent = issueAgent({ buildId: currentBuild, runtimeInstanceId: `browser:${randomId()}`, pageInstanceId: randomId(),
              kinds: ['action', 'function', 'http.client', 'fallback'] });
            const relaySession = crypto.randomBytes(32).toString('hex');
            sessions.set(relaySession, { agent, send: httpTransport({ url: `${collectorUrl}/api/ingest`, token: agent.token }) });
            return send(200, { ...agent.scope, projectId, relaySession, expiresAt: agent.expiresAt });
          }
          if (url.pathname !== '/__open_view/events' || req.method !== 'POST') return send(404, { error: 'Not found' });
          const header = req.headers.authorization || '';
          const session = /^Bearer [a-f0-9]{64}$/.test(header) ? sessions.get(header.slice(7)) : null;
          if (!session) return send(401, { error: 'Page session required' });
          const body = await readJsonBody(req);
          if (!body || Object.keys(body).join() !== 'events' || !Array.isArray(body.events) || body.events.length > 64) return send(400, { error: 'Invalid batch' });
          const delivered = await session.send(body.events);
          return send(delivered ? 202 : 503, { delivered });
        } catch (error) { return send(error.status || 503, { error: 'Telemetry unavailable' }); }
      });
    },
  };
}

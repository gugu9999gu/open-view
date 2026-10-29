import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createBrowserTracer } from '../runtime/browser-sdk.mjs';
async function listen(t, handler) {
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return `http://127.0.0.1:${server.address().port}`;
}
test('actual HTTP redirect never forwards trace headers to a second origin', async t => {
  let destinationRequests = 0;
  const destination = await listen(t, (_req, res) => { destinationRequests++; res.end('unexpected'); });
  let sourceHeader;
  const origin = await listen(t, (req, res) => {
    sourceHeader = req.headers.traceparent;
    res.writeHead(302, { Location: destination + '/target' }); res.end();
  });
  const events = [];
  const tracer = createBrowserTracer({ emitter: { emit: event => events.push(event) }, baseUrl: origin, allowedOrigins: [origin] });
  await assert.rejects(tracer.traceAction('redirect test', action => action.fetch(origin + '/redirect')), TypeError);
  assert.match(sourceHeader, /^00-[a-f0-9]{32}-[a-f0-9]{16}-01$/);
  assert.equal(destinationRequests, 0);
  assert.equal(events.find(event => event.kind === 'http.client').outcome.transport, 'network-error');
});
test('actual in-flight HTTP cancellation preserves AbortError and records cancellation', async t => {
  let received;
  const seen = new Promise(resolve => { received = resolve; });
  const origin = await listen(t, (_req, _res) => received());
  const events = [], controller = new AbortController();
  const tracer = createBrowserTracer({ emitter: { emit: event => events.push(event) }, baseUrl: origin, allowedOrigins: [origin] });
  const task = tracer.traceAction('abort test', action => action.fetch(origin + '/pending', { signal: controller.signal }));
  const assertion = assert.rejects(task, error => error.name === 'AbortError');
  await seen; controller.abort(); await assertion;
  assert.ok(events.every(event => event.status === 'cancelled'));
  assert.equal(events.find(event => event.kind === 'http.client').outcome.transport, 'cancelled');
});

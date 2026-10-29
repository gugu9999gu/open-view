import { randomId, traceparent } from './protocol.mjs';
import { normalizeOutcome, propagationHeaders } from '../lib/observation-contract.mjs';
/** Browser context is explicit, not a global mutable current-action variable. */
export function createBrowserTracer({ emitter, baseUrl, allowedOrigins = [], fetchImpl = globalThis.fetch } = {}) {
  async function span(name, callback, { kind = 'function', parent = null } = {}) {
    const context = { traceId: parent?.traceId || randomId(), spanId: randomId(8), parentSpanId: parent?.spanId || null,
      interactionId: parent?.interactionId || randomId() };
    const startedAt = Date.now(), start = performance.now(); let status = 'ok', outcome = normalizeOutcome();
    const control = { ...context,
      setOutcome(patch) { outcome = normalizeOutcome({ ...outcome, ...patch }); },
      span(label, task) { return span(label, task, { parent: context }); },
      fetch(input, init = {}) {
        const target = new URL(input instanceof Request ? input.url : String(input), baseUrl);
        const headers = propagationHeaders({ url: target, baseUrl, traceparent: traceparent(context), allowedOrigins });
        if (!headers.traceparent) return fetchImpl(input, init);
        return span('HTTP request', async http => {
          const requestHeaders = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
          requestHeaders.set('traceparent', traceparent(http));
          try {
            const response = await fetchImpl(input, { ...init, headers: requestHeaders, redirect: 'error' });
            http.setOutcome({ transport: 'response' }); return response;
          } catch (error) { http.setOutcome({ transport: error?.name === 'AbortError' ? 'cancelled' : 'network-error' }); throw error; }
        }, { kind: 'http.client', parent: context });
      },
    };
    try { return await callback(control); }
    catch (error) { status = error?.name === 'AbortError' ? 'cancelled' : 'error'; throw error; }
    finally { try { emitter.emit({ ...context, kind, name, startedAt, durationMs: performance.now() - start, status, outcome }); } catch {} }
  }
  return { traceAction: (name, callback) => span(name, callback, { kind: 'action' }) };
}

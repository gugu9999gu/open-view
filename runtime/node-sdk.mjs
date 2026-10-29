import { AsyncLocalStorage } from 'node:async_hooks';
import { randomId, parseTraceparent } from './protocol.mjs';
import { normalizeOutcome } from '../lib/observation-contract.mjs';
/** Explicit wrappers only. No global patches or request/SQL payload capture. */
export function createNodeTracer({ emitter } = {}) {
  const storage = new AsyncLocalStorage();
  async function span(name, callback, { kind = 'function', remote = null } = {}) {
    const parent = remote || storage.getStore();
    const context = { traceId: parent?.traceId || randomId(), spanId: randomId(8),
      parentSpanId: parent?.spanId || parent?.parentSpanId || null, interactionId: parent?.interactionId || null };
    const startedAt = Date.now(), started = performance.now(); let status = 'ok', outcome = normalizeOutcome();
    const control = { ...context, setOutcome(patch) { outcome = normalizeOutcome({ ...outcome, ...patch }); } };
    return storage.run(context, async () => {
      try { return await callback(control); }
      catch (error) { status = error?.name === 'AbortError' ? 'cancelled' : 'error'; throw error; }
      finally {
        try { emitter.emit({ ...context, kind, name, startedAt, durationMs: performance.now() - started, status, outcome }); } catch { /* Observability cannot replace application result. */ }
      }
    });
  }
  return { span, current: () => storage.getStore(),
    request(name, header, callback) { return span(name, callback, { kind: 'http.server', remote: parseTraceparent(header) }); } };
}

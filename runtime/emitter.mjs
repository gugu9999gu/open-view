import { randomId, validateEvent } from './protocol.mjs';
/** Bounded, non-blocking telemetry; never await this from a business callback. */
export function createEmitter(scope, { send, maxQueue = 256, batchSize = 32, autoFlush = true } = {}) {
  if (typeof send !== 'function' || !Number.isInteger(maxQueue) || maxQueue < 1 || maxQueue > 4096
      || !Number.isInteger(batchSize) || batchSize < 1 || batchSize > 64) throw new TypeError('Invalid emitter configuration');
  let sequence = 0, dropped = 0, delivered = 0, closed = false, pending = null, timer;
  const queue = [];
  function emit(span) {
    if (closed) return;
    try {
      const event = validateEvent({ ...span, ...scope, schemaVersion: 1, eventId: randomId(), sequence: ++sequence, droppedCount: dropped });
      if (queue.length >= maxQueue) { dropped++; return; }
      queue.push(event);
      if (autoFlush && !timer && !pending) {
        timer = setTimeout(() => { timer = undefined; void flush(); }, 40); timer.unref?.();
      }
    } catch { dropped++; }
  }
  function flush() {
    if (pending) return pending;
    clearTimeout(timer); timer = undefined;
    pending = (async () => {
      while (queue.length && !closed) {
        const batch = queue.splice(0, batchSize).map(event => ({ ...event, droppedCount: dropped }));
        try { if (await send(batch) === false) dropped += batch.length; else delivered += batch.length; }
        catch { dropped += batch.length; }
      }
    })().finally(() => { pending = null; });
    return pending;
  }
  return { emit, flush, stats: () => ({ queued: queue.length, dropped, delivered, sequence }),
    close() { closed = true; dropped += queue.length; queue.length = 0; clearTimeout(timer); } };
}
export function httpTransport({ url, token, fetchImpl = globalThis.fetch, timeoutMs = 1000 }) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname)
      || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new TypeError('Collector must be loopback HTTP');
  return async events => {
    const response = await fetchImpl(endpoint, { method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ events }), credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(timeoutMs) });
    await response.arrayBuffer(); return response.ok;
  };
}

/** Future SDK/collector wire contract. This module does not collect runtime events. */
const OUTCOMES = {
  transport: ['unknown', 'response', 'network-error', 'cancelled'],
  operation: ['unknown', 'succeeded', 'failed'],
  transaction: ['unknown', 'committed', 'rolled-back', 'not-applicable'],
  business: ['unknown', 'succeeded', 'failed'],
  dataOrigin: ['unknown', 'remote', 'fixture', 'cache', 'mixed'],
};
export function normalizeOutcome(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Invalid outcome');
  for (const key of Object.keys(input)) if (!Object.hasOwn(OUTCOMES, key)) throw new TypeError('Unsupported outcome field');
  return Object.fromEntries(Object.entries(OUTCOMES).map(([key, allowed]) => {
    const value = Object.hasOwn(input, key) ? input[key] : 'unknown';
    if (!allowed.includes(value)) throw new TypeError(`Invalid ${key}`);
    return [key, value];
  }));
}
export function persistenceStatus(input) {
  const outcome = normalizeOutcome(input);
  if (outcome.transaction === 'committed') return 'commit-confirmed';
  if (outcome.transaction === 'rolled-back') return 'rollback-confirmed';
  return 'not-confirmed';
}
export function parseTraceparent(value) {
  if (typeof value !== 'string') return null;
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$/.exec(value);
  if (!match || /^0+$/.test(match[1]) || /^0+$/.test(match[2])) return null;
  return { traceId: match[1], parentSpanId: match[2], sampled: (parseInt(match[3], 16) & 1) === 1 };
}
/** No automatic fetch patching. An adapter must also recheck redirect destinations. */
export function propagationHeaders({ url, baseUrl, traceparent, allowedOrigins = [], collectorOrigins = [] }) {
  const target = new URL(url, baseUrl);
  if (!parseTraceparent(traceparent) || !['http:', 'https:'].includes(target.protocol)
      || target.username || target.password || !allowedOrigins.includes(target.origin)
      || collectorOrigins.includes(target.origin) || target.pathname.startsWith('/__open_view/')) return {};
  return { traceparent };
}

import { normalizeOutcome, parseTraceparent } from '../lib/observation-contract.mjs';
export { parseTraceparent };
export const KINDS = ['action', 'function', 'http.client', 'http.server', 'db.query', 'db.transaction', 'fallback'];
const ID = /^[a-zA-Z0-9_.:/-]{1,160}$/;
const HEX = (value, size) => typeof value === 'string' && new RegExp(`^[a-f0-9]{${size}}$`).test(value) && !/^0+$/.test(value);
export const identifier = value => typeof value === 'string' && ID.test(value);
export function randomId(bytes = 16) {
  const buffer = new Uint8Array(bytes); globalThis.crypto.getRandomValues(buffer);
  return [...buffer].map(value => value.toString(16).padStart(2, '0')).join('');
}
export function traceparent(context) { return `00-${context.traceId}-${context.spanId}-01`; }
export function validateEvent(input) {
  const fields = ['schemaVersion', 'eventId', 'projectId', 'buildId', 'runtimeInstanceId', 'pageInstanceId', 'interactionId', 'sequence', 'droppedCount', 'traceId', 'spanId', 'parentSpanId', 'kind', 'name', 'startedAt', 'durationMs', 'status', 'outcome'];
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !fields.includes(key))) throw new TypeError('Unsupported event fields');
  if (input.schemaVersion !== 1 || !HEX(input.eventId, 32) || !HEX(input.traceId, 32) || !HEX(input.spanId, 16)
      || (input.parentSpanId !== null && (!HEX(input.parentSpanId, 16) || input.parentSpanId === input.spanId))) throw new TypeError('Invalid event identity');
  for (const key of ['projectId', 'buildId', 'runtimeInstanceId']) if (!identifier(input[key])) throw new TypeError('Invalid scope');
  for (const key of ['pageInstanceId', 'interactionId']) if (input[key] !== null && !HEX(input[key], 32)) throw new TypeError('Invalid instance');
  if (!Number.isSafeInteger(input.sequence) || input.sequence < 1 || input.sequence > 1_000_000
      || !Number.isSafeInteger(input.droppedCount) || input.droppedCount < 0 || input.droppedCount > 1_000_000) throw new TypeError('Invalid sequence');
  if (!KINDS.includes(input.kind) || typeof input.name !== 'string' || input.name.length < 1 || input.name.length > 120
      || /[\x00-\x1f\x7f]/.test(input.name)) throw new TypeError('Invalid span label');
  if (!Number.isFinite(input.startedAt) || input.startedAt < 0 || !Number.isFinite(input.durationMs)
      || input.durationMs < 0 || input.durationMs > 86_400_000 || !['ok', 'error', 'cancelled'].includes(input.status)) throw new TypeError('Invalid span timing/status');
  return { ...input, outcome: normalizeOutcome(input.outcome) };
}

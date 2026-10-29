import crypto from 'node:crypto';
import { sourceGraph } from './source-graph.mjs';
import { identifier, validateEvent, KINDS } from './protocol.mjs';
const digest = token => crypto.createHash('sha256').update(token).digest('hex');
const fail = (status, message) => Object.assign(new Error(message), { status });
/** Local trusted agents only. An OBSERVED event is agent-reported, not an attestation. */
export function createCollector({ projectId, maxEvents = 5000, maxAgents = 64, ttlMs = 30 * 60_000, now = Date.now, sources = null } = {}) {
  if (!identifier(projectId) || !Number.isInteger(maxEvents) || maxEvents < 1 || maxEvents > 20_000
      || !Number.isInteger(maxAgents) || maxAgents < 1 || maxAgents > 256 || !Number.isFinite(ttlMs) || ttlMs <= 0) throw new TypeError('Invalid collector configuration');
  const grants = new Map(), records = new Map(); let evicted = 0;
  function prune() {
    for (const [key, grant] of grants) if (grant.expiresAt <= now()) grants.delete(key);
    for (const [key, record] of records) if (record.receivedAt + ttlMs <= now()) { records.delete(key); evicted++; }
  }
  function authorize(header) {
    prune();
    if (typeof header !== 'string' || !/^Bearer [a-f0-9]{64}$/.test(header)) return null;
    return grants.get(digest(header.slice(7))) || null;
  }
  function issueAgent({ buildId, runtimeInstanceId, pageInstanceId = null, kinds = KINDS } = {}) {
    prune();
    if (!identifier(buildId) || !identifier(runtimeInstanceId) || (pageInstanceId !== null && !/^[a-f0-9]{32}$/.test(pageInstanceId))
        || !Array.isArray(kinds) || !kinds.length || kinds.some(kind => !KINDS.includes(kind))) throw new TypeError('Invalid agent scope');
    if (grants.size >= maxAgents || [...grants.values()].some(grant => grant.runtimeInstanceId === runtimeInstanceId)) throw fail(429, 'Agent capacity exceeded');
    const token = crypto.randomBytes(32).toString('hex');
    const grant = { projectId, buildId, runtimeInstanceId, pageInstanceId, kinds, expiresAt: now() + ttlMs,
      sequences: new Map(), maxSequence: 0, droppedCount: 0, windowAt: now(), requests: 0 };
    grants.set(digest(token), grant);
    return { token, scope: { projectId, buildId, runtimeInstanceId, pageInstanceId }, expiresAt: grant.expiresAt };
  }
  function ingest(header, body) {
    const grant = authorize(header); if (!grant) throw fail(401, 'Ingest credential required');
    if (now() - grant.windowAt >= 60_000) { grant.windowAt = now(); grant.requests = 0; }
    if (++grant.requests > 240) throw fail(429, 'Ingest rate exceeded');
    if (!body || Object.keys(body).join() !== 'events' || !Array.isArray(body.events) || !body.events.length || body.events.length > 64) throw fail(400, 'Invalid batch');
    let events;
    try { events = body.events.map(validateEvent); } catch { throw fail(400, 'Invalid event schema'); }
    const staged = new Map(), eventIds = new Map();
    for (const event of events) {
      if (['projectId', 'buildId', 'runtimeInstanceId', 'pageInstanceId'].some(key => event[key] !== grant[key]) || !grant.kinds.includes(event.kind)) throw fail(403, 'Agent scope mismatch');
      const fingerprint = digest(JSON.stringify(event));
      const known = grant.sequences.get(event.sequence) || staged.get(event.sequence);
      if (known && known !== fingerprint) throw fail(409, 'Sequence collision');
      const batchFingerprint = eventIds.get(event.eventId);
      if (batchFingerprint && batchFingerprint !== fingerprint) throw fail(409, 'Event identity collision');
      eventIds.set(event.eventId, fingerprint);
      const prior = records.get(event.eventId);
      if (prior && prior.fingerprint !== fingerprint) throw fail(409, 'Event identity collision');
      staged.set(event.sequence, fingerprint);
    }
    if (grant.sequences.size + [...staged.keys()].filter(sequence => !grant.sequences.has(sequence)).length > 10_000) throw fail(429, 'Runtime event quota exceeded; start a new runtime');
    let accepted = 0;
    for (const event of events) {
      const fingerprint = staged.get(event.sequence);
      if (grant.sequences.has(event.sequence)) continue;
      grant.sequences.set(event.sequence, fingerprint); grant.maxSequence = Math.max(grant.maxSequence, event.sequence);
      grant.droppedCount = Math.max(grant.droppedCount, event.droppedCount);
      records.set(event.eventId, { event, fingerprint, receivedAt: now() }); accepted++;
      while (records.size > maxEvents) { records.delete(records.keys().next().value); evicted++; }
    }
    return { accepted };
  }
  function trace(id) {
    prune();
    const events = [...records.values()].map(record => record.event).filter(event => event.traceId === id).sort((a,b) => a.startedAt - b.startedAt || a.sequence - b.sequence);
    if (!events.length) return null;
    const spanIds = new Set(events.map(event => event.spanId));
    const runtimeIds = new Set(events.map(event => event.runtimeInstanceId));
    const scopes = [...grants.values()].filter(grant => runtimeIds.has(grant.runtimeInstanceId));
    return { traceId: id, basis: 'observed', sourceMapping: sources ? 'per-span-manifest' : 'not-linked', events,
      ...(sources ? { sourceGraph: sourceGraph(events, sources) } : {}),
      coverage: { status: 'best-effort', missingParents: [...new Set(events.filter(event => event.parentSpanId && !spanIds.has(event.parentSpanId)).map(event => event.parentSpanId))],
        runtimeSequenceGaps: scopes.reduce((n, grant) => n + grant.maxSequence - grant.sequences.size, 0),
        reportedDropped: scopes.reduce((n, grant) => n + grant.droppedCount, 0), evicted,
        note: 'Runtime gaps may belong to other traces. A missing final event or process crash cannot always be detected.' } };
  }
  function list() {
    prune();
    const groups = new Map();
    for (const {event} of records.values()) {
      const group = groups.get(event.traceId) || { traceId: event.traceId, name: event.name, startedAt: event.startedAt, spans: 0, errors: 0, transactions: [], pageInstanceIds: [] };
      if (event.kind === 'action') group.name = event.name;
      group.startedAt = Math.min(group.startedAt, event.startedAt); group.spans++;
      if (event.status !== 'ok') group.errors++;
      if (event.kind === 'db.transaction') group.transactions.push(event.outcome.transaction);
      if (event.pageInstanceId && !group.pageInstanceIds.includes(event.pageInstanceId)) group.pageInstanceIds.push(event.pageInstanceId);
      groups.set(event.traceId, group);
    }
    return { basis: 'observed', traces: [...groups.values()].sort((a,b) => b.startedAt - a.startedAt).slice(0,100),
      retainedEvents: records.size, retainedTraces: groups.size, evicted, retentionMs: ttlMs, capture: 'metadata-only', completeness: 'best-effort' };
  }
  return { projectId, sources, issueAgent, authorize, ingest, list, trace,
    clear() { records.clear(); evicted = 0; sources?.clear(); },
    close() { grants.clear(); records.clear(); sources?.clear(); },
    revoke(token) { grants.delete(digest(token)); } };
}
export function readJsonBody(req, maxBytes = 64 * 1024) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) { req.resume(); return Promise.reject(fail(415, 'JSON required')); }
  if (req.headers['content-encoding']) { req.resume(); return Promise.reject(fail(415, 'Encoded bodies are not supported')); }
  return new Promise((resolve, reject) => {
    let length = 0, tooLarge = false; const parts = [];
    req.on('data', part => {
      if (tooLarge) return;
      length += part.length;
      if (length > maxBytes) { tooLarge = true; parts.length = 0; reject(fail(413, 'Batch too large')); }
      else parts.push(part);
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(JSON.parse(Buffer.concat(parts).toString('utf8'))); } catch { reject(fail(400, 'Invalid JSON')); }
    });
    req.on('error', () => reject(fail(400, 'Body read failed')));
    req.on('aborted', () => reject(fail(400, 'Body aborted')));
  });
}

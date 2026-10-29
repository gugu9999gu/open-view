import crypto from 'node:crypto';

export const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
export const SESSION_TTL_MS = 8 * 60 * 60 * 1000;
const digest = value => crypto.createHash('sha256').update(value).digest();
const secret = () => crypto.randomBytes(32).toString('hex');

/** Credentials are capabilities, not cookies. Only digests are retained. */
export function createAuth({
  token = secret(), now = Date.now,
  bootstrapTtlMs = BOOTSTRAP_TTL_MS, sessionTtlMs = SESSION_TTL_MS,
  maxSessions = 8,
} = {}) {
  for (const value of [bootstrapTtlMs, sessionTtlMs, maxSessions]) {
    if (!Number.isSafeInteger(value) || value <= 0) throw new TypeError('Invalid auth limits');
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new TypeError('Bootstrap token must be 32 random bytes in hex');
  let bootstrap = { hash: digest(token), expiresAt: now() + bootstrapTtlMs };
  const sessions = new Map();
  const bearer = header => typeof header === 'string' && /^Bearer [a-f0-9]{64}$/.test(header)
    ? header.slice(7) : null;
  function prune() {
    const time = now();
    for (const [key, session] of sessions) if (time >= session.expiresAt) sessions.delete(key);
    if (bootstrap && time >= bootstrap.expiresAt) bootstrap = null;
  }
  return {
    issueBootstrap() {
      const value = secret();
      bootstrap = { hash: digest(value), expiresAt: now() + bootstrapTtlMs };
      return value;
    },
    exchange(header) {
      prune();
      const value = bearer(header);
      if (!value || !bootstrap || !crypto.timingSafeEqual(digest(value), bootstrap.hash)) return null;
      // Consume synchronously, before any asynchronous work can accept a replay.
      bootstrap = null;
      if (sessions.size >= maxSessions) sessions.delete(sessions.keys().next().value);
      const accessToken = secret();
      const expiresAt = now() + sessionTtlMs;
      sessions.set(digest(accessToken).toString('hex'), { expiresAt });
      return { accessToken, expiresAt, tokenType: 'Bearer' };
    },
    authorize(header) {
      prune();
      const value = bearer(header);
      return value ? sessions.has(digest(value).toString('hex')) : false;
    },
    revoke(header) {
      const value = bearer(header);
      return value ? sessions.delete(digest(value).toString('hex')) : false;
    },
    clear() { bootstrap = null; sessions.clear(); },
  };
}

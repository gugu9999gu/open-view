import test from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from '../lib/auth.mjs';
const token = 'a'.repeat(64), bearer = value => `Bearer ${value}`;

test('bootstrap is single-use and exchanges for a distinct read session', () => {
  const auth = createAuth({ token });
  assert.equal(auth.authorize(bearer(token)), false);
  const session = auth.exchange(bearer(token));
  assert.notEqual(session.accessToken, token);
  assert.equal(auth.exchange(bearer(token)), null);
  assert.equal(auth.authorize(bearer(session.accessToken)), true);
  assert.equal(auth.exchange(bearer(session.accessToken)), null);
});
test('invalid guesses do not consume bootstrap; malformed credentials are rejected', () => {
  const auth = createAuth({ token });
  for (const header of [undefined, '', 'Bearer x', bearer('b'.repeat(64)), bearer(token)+' ']) assert.equal(auth.exchange(header), null);
  assert(auth.exchange(bearer(token)));
});
test('bootstrap and session expiration are enforced by server time', () => {
  let now = 0;
  const auth = createAuth({ token, now: () => now, bootstrapTtlMs: 5, sessionTtlMs: 20 });
  now = 5;
  assert.equal(auth.exchange(bearer(token)), null);
  const replacement = auth.issueBootstrap();
  const session = auth.exchange(bearer(replacement));
  now = 24; assert(auth.authorize(bearer(session.accessToken)));
  now = 25; assert.equal(auth.authorize(bearer(session.accessToken)), false);
});
test('reissued login invalidates older unconsumed link, logout revokes session', () => {
  const auth = createAuth({ token });
  const replacement = auth.issueBootstrap();
  assert.equal(auth.exchange(bearer(token)), null);
  const session = auth.exchange(bearer(replacement));
  assert(auth.revoke(bearer(session.accessToken)));
  assert.equal(auth.authorize(bearer(session.accessToken)), false);
});
test('session retention is bounded and clear revokes all credentials', () => {
  const auth = createAuth({ token, maxSessions: 1 });
  const first = auth.exchange(bearer(token));
  const second = auth.exchange(bearer(auth.issueBootstrap()));
  assert.equal(auth.authorize(bearer(first.accessToken)), false);
  assert(auth.authorize(bearer(second.accessToken)));
  auth.clear(); assert.equal(auth.authorize(bearer(second.accessToken)), false);
});

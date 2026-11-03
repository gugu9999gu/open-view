import test from 'node:test';
import assert from 'node:assert/strict';
import { createRefreshLoop } from '../public/runtime-view.mjs';

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function clock() {
  let now = 0, serial = 0;
  const queue = new Map();
  return {
    setTimeout(fn, delay) { const id = ++serial; queue.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { queue.delete(id); },
    get size() { return queue.size; },
    async advance(delta) {
      const end = now + delta;
      for (let count = 0; ; count++) {
        if (count > 1000) throw new Error('Unbounded scheduler');
        const entry = [...queue].filter(([, task]) => task.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!entry) break;
        const [id, task] = entry; now = task.at; queue.delete(id); task.fn(); await flush();
      }
      now = end; await flush();
    },
  };
}
const settings = { intervalMs: 10, maxDelayMs: 40, timeoutMs: 100 };

test('refresh loop validates configuration', () => {
  for (const config of [{}, { load() {}, intervalMs: 0 }, { load() {}, maxDelayMs: 1 }, { load() {}, timeoutMs: Infinity }]) {
    assert.throws(() => createRefreshLoop(config), TypeError);
  }
});
test('manual refresh runs once without starting automatic polling', async () => {
  const timers = clock(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: async () => { calls++; } });
  loop.refresh(); await flush(); await timers.advance(1000);
  assert.equal(calls, 1); assert.equal(timers.size, 0);
});
test('automatic refresh waits for completion plus the interval; never overlaps', async () => {
  const timers = clock(), pending = deferred(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: () => { calls++; return pending.promise; } });
  loop.start(); loop.start(); await timers.advance(50); assert.equal(calls, 1);
  pending.resolve(); await flush(); await timers.advance(9); assert.equal(calls, 1);
  await timers.advance(1); assert.equal(calls, 2); loop.stop(); await flush();
  assert.equal(timers.size, 0);
});
test('many refresh clicks coalesce into one trailing request', async () => {
  const timers = clock(), pending = deferred(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: () => { calls++; return pending.promise; } });
  loop.refresh(); for (let i = 0; i < 20; i++) loop.refresh();
  assert.equal(calls, 1); pending.resolve(); await flush(); await timers.advance(0);
  assert.equal(calls, 2); assert.equal(timers.size, 0);
});
test('stop aborts the request and ignores a late rejection without retry or error UI', async () => {
  const timers = clock(), pending = deferred(); let signal, errors = 0, calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: value => { signal = value; calls++; return pending.promise; }, onError: () => { errors++; } });
  loop.start(); loop.stop(); assert.equal(signal.aborted, true);
  pending.reject(new Error('late response from a previous selection')); await flush(); await timers.advance(1000);
  assert.equal(calls, 1); assert.equal(errors, 0); assert.equal(timers.size, 0);
});
test('stop and restart waits for old work to settle, then starts exactly one new request', async () => {
  const timers = clock(), pending = deferred(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: () => ++calls === 1 ? pending.promise : Promise.resolve() });
  loop.start(); loop.stop(); loop.start(); loop.start(); assert.equal(calls, 1);
  pending.resolve(); await flush(); await timers.advance(0); assert.equal(calls, 2);
  loop.stop(); await timers.advance(1000); assert.equal(calls, 2);
});
test('network errors use capped exponential backoff and success resets it', async () => {
  const timers = clock(), retry = []; let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers,
    load: async () => { calls++; if (calls !== 5) throw new Error('offline'); },
    onError: (_error, state) => { retry.push(state.retryMs); return true; } });
  loop.start(); await flush(); assert.deepEqual(retry, [10]);
  await timers.advance(10); assert.deepEqual(retry, [10, 20]);
  await timers.advance(20); assert.deepEqual(retry, [10, 20, 40]);
  await timers.advance(40); assert.deepEqual(retry, [10, 20, 40, 40]);
  await timers.advance(40); assert.equal(calls, 5);
  await timers.advance(10); assert.equal(calls, 6); assert.equal(retry.at(-1), 10);
  loop.stop(); assert.equal(timers.size, 0);
});
test('terminal authentication/unavailable errors stop automatic and queued requests', async () => {
  const timers = clock(), pending = deferred(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: () => { calls++; return pending.promise; }, onError: () => false });
  loop.start(); loop.refresh(); pending.reject(Object.assign(new Error(), { status: 401 }));
  await flush(); await timers.advance(1000); assert.equal(calls, 1); assert.equal(timers.size, 0);
});
test('deadline aborts a hung transport and marks timeout for bounded retry', async () => {
  const timers = clock(), states = []; let calls = 0, signal;
  const loop = createRefreshLoop({ ...settings, timers,
    load: value => { calls++; signal = value; return new Promise((_, reject) => value.addEventListener('abort', () => reject(new Error('aborted')), { once: true })); },
    onError: (_error, state) => { states.push(state); return true; } });
  loop.start(); await timers.advance(99); assert.equal(signal.aborted, false);
  await timers.advance(1); assert.equal(signal.aborted, true); assert.equal(states[0].timedOut, true);
  await timers.advance(10); assert.equal(calls, 2); loop.stop(); await flush(); assert.equal(timers.size, 0);
});
test('late success after a timeout does not count as a successful refresh', async () => {
  const timers = clock(), pending = deferred(), states = [];
  const loop = createRefreshLoop({ ...settings, timers, load: () => pending.promise,
    onError: (_error, state) => { states.push(state); return false; } });
  loop.start(); await timers.advance(100); pending.resolve(); await flush();
  assert.equal(states.length, 1); assert.equal(states[0].timedOut, true); assert.equal(timers.size, 0);
});
test('manual refresh cancels a scheduled retry instead of creating a second timer', async () => {
  const timers = clock(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: async () => { calls++; } });
  loop.start(); await flush(); await timers.advance(5); loop.refresh(); await flush();
  assert.equal(calls, 2); await timers.advance(9); assert.equal(calls, 2);
  await timers.advance(1); assert.equal(calls, 3); loop.stop();
});
test('repeated stop is idempotent and a manual refresh after stop stays manual', async () => {
  const timers = clock(); let calls = 0;
  const loop = createRefreshLoop({ ...settings, timers, load: async () => { calls++; } });
  loop.start(); await flush(); loop.stop(); loop.stop(); loop.refresh(); await flush();
  await timers.advance(1000); assert.equal(calls, 2); assert.equal(timers.size, 0);
});

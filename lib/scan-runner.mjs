import { Worker } from 'node:worker_threads';

/** A hard deadline also covers synchronous compiler work, not just file traversal. */
export function scanInWorker(project, { timeoutMs = 30_000, options = {}, signal } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0) throw new TypeError('Invalid scan timeout');
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(Object.assign(new Error('Scan aborted'), { code: 'SCAN_ABORTED' }));
    const worker = new Worker(new URL('./scan-worker.mjs', import.meta.url), {
      workerData: { project, options },
      resourceLimits: { maxOldGenerationSizeMb: 512 },
      // Do not inherit --input-type from callers using node --input-type=module.
      execArgv: process.execArgv.filter(arg => !arg.startsWith('--input-type')),
    });
    let settled = false;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      void worker.terminate();
      if (error) reject(error); else resolve(value);
    };
    const failure = code => Object.assign(new Error(code), { code });
    const abort = () => finish(failure('SCAN_ABORTED'));
    const timer = setTimeout(() => finish(failure('SCAN_TIMEOUT')), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    worker.once('message', message => message.ok ? finish(null, message.graph) : finish(failure('SCAN_FAILED')));
    worker.once('error', () => finish(failure('SCAN_FAILED')));
    worker.once('exit', () => { if (!settled) finish(failure('SCAN_FAILED')); });
  });
}

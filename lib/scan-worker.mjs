import { parentPort, workerData } from 'node:worker_threads';
import { scanProject } from './scanner.mjs';

try {
  parentPort.postMessage({ ok: true, graph: await scanProject(workerData.project, workerData.options) });
} catch {
  // Do not send source text, absolute error paths, or compiler internals to the browser.
  parentPort.postMessage({ ok: false });
}

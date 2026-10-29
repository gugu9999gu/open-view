import { createBrowserTracer } from '../../../runtime/browser-sdk.mjs';
import { createEmitter } from '../../../runtime/emitter.mjs';
import { traceAction as disabled } from './tracing-disabled.mjs';
let action = disabled;
try {
  const response = await fetch('/__open_view/bootstrap', { credentials: 'omit', redirect: 'error', signal: AbortSignal.timeout(1000) });
  if (!response.ok) throw new Error('Telemetry unavailable');
  const { relaySession, expiresAt, ...scope } = await response.json();
  const emitter = createEmitter(scope, { send: async events => {
    const response = await fetch('/__open_view/events', { method: 'POST', credentials: 'omit', redirect: 'error',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${relaySession}` },
      body: JSON.stringify({ events }), signal: AbortSignal.timeout(1000) });
    return response.ok;
  } });
  action = createBrowserTracer({ emitter, baseUrl: location.href, allowedOrigins: [location.origin] }).traceAction;
  window.addEventListener('pagehide', () => { void emitter.flush(); }, { once: true });
} catch { /* Collector failure must not prevent the example from rendering or saving. */ }
export const traceAction = (...args) => action(...args);

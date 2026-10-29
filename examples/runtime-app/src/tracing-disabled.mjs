// Production has no telemetry code, endpoints, tokens, or source manifests.
function context() { return { fetch: (...args) => globalThis.fetch(...args), span: (_label, callback) => callback(context()) }; }
export const traceAction = (_label, callback) => callback(context());

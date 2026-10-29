// Default package entry: safe for production and ordinary Vite builds without the dev connector.
function control() {
  return { fetch: (...args) => globalThis.fetch(...args), setOutcome() {},
    span: (_name, callback) => callback(control()) };
}
export const traceAction = async (_name, callback) => callback(control());

# Changelog

## 0.2.0 — 2026-10-29

- Add explicit Browser/Node SDKs, bounded ingest collector with separate credentials, and development-only Vite relay.
- Observe a real React click through Node and a single-client PostgreSQL transaction, preserving commit, rollback, unknown, business result and fixture provenance separately.
- Add authenticated OBSERVED list/detail/delete UI; do not connect events to static definitions by name or timestamp.
- Add actual PostgreSQL integration and browser-to-database tests, concurrent actions/tabs/polling, collector shutdown, and production instrumentation-exclusion checks.
- Runtime phase acceptance: 10/12 (83.3%). Precise source mapping and historical HMR source/graph highlighting remain unimplemented.
- Verified code head 10e0a0c3, CI 40834192100: Node/HTTP 66, PostgreSQL integration 9, static browser 14, runtime browser 12 passed.
- No automatic merge or deployment; PR #2 is stacked on PR #1.

## 0.1.1 — 2026-10-29

- Fix reusable bootstrap credentials and cross-port auth-cookie exposure by exchanging a short-lived single-use bootstrap for a separate expiring UI Bearer session; add logout and terminal reissue.
- Change UI default port to 4418; add CSP nonce and explicit same-origin API transport.
- Fix depth-limit completeness, add bounded streaming source collection and worker time limits, and expose partial scan reasons.
- Search the entire analyzed graph rather than only the first 100 rendered nodes; focus matching nodes and their neighbors, with paginated results.
- Add content-scoped static source identities and tested outcome/trace-context helpers. Runtime agents and database tracing are still not implemented.
- Replace simulated-transport UI validation with a real browser-network E2E script. Add read-only PR CI and lockfile-based installation.
- Graph schemaVersion is now 2. The UI requires the local server; direct file:// opening is no longer supported.

Local Node/HTTP tests: 44 passed. Local browser navigation was blocked by environment policy; see per-commit CI evidence rather than assuming browser E2E passed.

PR CI run 40820622011 (code head 6b0ffdf91c30d4542346861b514af82b86e44c94): npm ci, leerness verify, 44 Node tests and 14 real browser-network E2E checks passed.

# Changelog

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

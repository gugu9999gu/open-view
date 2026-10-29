# Changelog

## Unreleased — project connection, 2026-10-29

- Add explicit init/doctor/dev CLI and a local package bin/exports; no registry publication.
- Preview configuration by default; create only new JSON on --write. Validate selected paths, size limits and symlinks.
- Diagnose installed Vite/React and inline wrappers without executing project configuration/scripts or reading .env.
- Require explicit trust before dev executes the target project's existing Vite configuration and plugins.
- Inject selected development instrumentation without rewriting target source/config/scripts; default browser package export is production no-op.
- Dispose UI/Vite resources on startup failures and drain pending transforms before closing watchers.
- Verify actual packed-package installation in an independent consumer, real browser/API/source/HMR, error semantics, collector shutdown and production exclusion.
- New O01–O10 milestone: 9/10 (90%). O10 is untested user-selected business-project acceptance; existing R01–R12 stays 12/12.
- Code e7e40867 / CI 40853572299: Node97, PG9 including parent, browser14+17+12, syntax49. Later documentation commits require their own CI.
- PR #4 is stacked on PR #3, package remains private 0.2.0, changes Unreleased. No main merge/deployment/public npm publish.

## Unreleased — R11/R12, 2026-10-29

- Link selected explicit inline callbacks through original-file SHA-256 and AST offsets; share version-scoped definition IDs with the static scanner.
- Retain bounded local source versions and expose original callbacks through UI-authenticated source endpoints. Never infer missing mappings from function names or timestamps.
- Add a trace-specific OBSERVED source graph, verified-node highlighting, original source preview and explicit unmapped/expired states.
- Preserve historical callback bytes across Vite full reloads with new build IDs. This is not React state-preserving HMR or Node hot reload.
- Source retention is separate from metadata-only telemetry: original source can include literals, SQL and comments.
- Runtime acceptance R01–R12: 12/12 (100%), not whole-product or effort completion.
- Code 256d6db8, CI 40845242282: Node82, PG9 including parent, browser14+17, syntax42, production9 markers absent. Later commits require their own CI confirmation.
- PR #3 is stacked on PR #2; package version remains 0.2.0. No merge, release or deployment.

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

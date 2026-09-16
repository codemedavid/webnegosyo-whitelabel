# Sentry production error fixes — 2026-09-16

## Changes

- **2H / 2M:** Deployed the missing platform modifier-library and simple-option-stock migrations. Verified RPC visibility through PostgREST, service-only execution privileges, and a successful real production application. Added a production prebuild contract check so the application cannot deploy before its required stock API exists.
- **2N:** Enforce the QR renderer's level-M capacity before saving a pending order or clearing the cart. Compact only redundant, scanner-compatible fields. Existing oversized cached orders either compact successfully or retain their readable summary with recovery guidance.
- **2J:** Use the same explicit Philippine timezone during server rendering and browser hydration.
- **2F:** Replace recipe editor Server Actions with an authenticated, uncached HTTP endpoint. Abort obsolete reads, preserve pending writes during navigation, suppress stale callbacks, and hold dialog/picker navigation while saving. Validate origin and request input; report unexpected server failures to Sentry.
- **2K:** Filter only the exact disposed Facebook Android performance bridge exception when its injected frame is present.
- **2G / new 2P:** Preserve network/chunk error reporting, attach online/resource context without query credentials, reload a failed chunk once with a session cooldown, and use full-page recovery for resource failures. The generic Safari failure still lacks evidence for a more specific root cause.

## Verification

- Full web Jest suite: **750 suites / 8,190 tests passed**, with 1 suite / 8 pre-existing skips.
- Production Turbopack build: passed, including type checks; local Sentry artifact upload was disabled.
- Targeted ESLint: zero errors.
- Production prebuild database contract check: passed.
- Isolated SQL harness: sale, cancellation, revision, idempotency, oversell rollback, tenant scope, and stock-preserving editor updates passed.
- QR tests use the real renderer and the merchant decoder. Route tests exercise oversized cached payloads.
- The initial full rerun encountered the existing randomized reference-number collision test; it passed on isolated rerun, and the subsequent complete suite passed unchanged.

## Production data audit

The missing RPC was restored at approximately **10:29 UTC**. Sentry queries after that timestamp found no further 2H/2M events during validation.

Reconciliation covered 34 captured orders. Thirty checkout orders retained exact selection snapshots and were replayed. They created 30 simple-option application claims but no quantity movements; the ingredient path likewise found no configured movements and retained no claims. Four POS records did not retain exact option IDs. Their base-only attempts created no claims or movements, and the final repair runner refuses such incomplete records. Their historical selection-based stock effect cannot be reconstructed from available data.

The earlier diagnosis established a failed stock-processing window, not a proven quantity discrepancy. Do not replay these orders again after changing recipes or option mappings. See [the operational runbook](../operations/inventory-stock-incident-repair.md). Order/event identifiers remain in the local incident manifest outside source control.

# Security and performance audit — 2026-10-04

Three agents investigated web security, web performance, and merchant-mobile query behavior. The coordinating agent reviewed their changes, optimized Redis invalidation, checked dependencies, and ran integration checks. Existing uncommitted work was preserved. No production services or databases were changed.

## Implemented changes

| Finding | Change | Evidence |
| --- | --- | --- |
| High: staff without Settings permission could retrieve Facebook page tokens and change connections | One shared authorization rule now checks role, tenant, and Settings permission across five Facebook management endpoints. A matching RLS migration closes direct database access. | Unauthorized HTTP and direct PostgreSQL reads reproduced before the fixes; route and SQL regressions pass afterward. |
| Merchant mobile could show the previous tenant's or branch's order data during navigation | Both previous-data hooks use a shared resource/tenant/branch identity guard. Same-branch argument changes still retain useful kitchen data. | Seven regressions reproduced before the fix; 29 hook tests pass afterward. This addresses client-side display isolation. |
| Changing polling options could start overlapping order-tracking requests | The pending-request guard survives effect replacement and resumes polling when the pending call completes. | Regression observed two concurrent calls before the fix and one afterward. |
| Customer history waited for each 100-order item chunk in sequence | Independent chunks run with concurrency capped at four, retaining pagination, ordering, and failure fallback. | The controlled 800-order fixture uses the same eight requests in two 20 ms waves instead of eight serial waves. This is simulated latency, not a production benchmark. |
| Every Redis invalidation enumerated the shared keyspace with KEYS | Exact keys use DEL directly; wildcard patterns use cursor SCAN and deletion batches of at most 100 keys. | Tests cover empty nonterminal pages, large pages, wildcard semantics, and failures. Exact-key invalidation drops from two Redis commands to one. |
| Wallet dependency pinned vulnerable Joi 17.13.4 | Scoped passkit-generator override and lockfile update to Joi 17.13.8 | Production dependency audit no longer reports Joi; wallet tests and a smoke check using the actual PKPass schema pass. |

The Joi patch addresses the published [ISO-date validation denial-of-service advisory](https://github.com/advisories/GHSA-6h2x-m376-mqjq), along with the other Joi advisories reported by npm for the old version.

## Verification

- Combined web integration run: **18 suites, 201 tests passed** (cache, tenant keys, wallet, customer history, polling, and Facebook authorization).
- Merchant-mobile hook suites: **2 suites, 29 tests passed**.
- Local PostgreSQL/PGlite Facebook policy regression: passed. Covers restricted staff reads/writes, authorized staff, owners, legacy administrators, superadmins, cross-tenant changes, and anonymous non-secret page lookup.
- Scoped strict TypeScript checks for the changed web and mobile modules and their imports: passed.
- Scoped ESLint and diff whitespace checks: passed.
- `npm install --ignore-scripts --no-audit --no-fund`: completed; the separate production audit is recorded below.
- Actual passkit-generator schema smoke with Joi 17.13.8: passed. Signing with production Apple certificates was not tested.

The combined web command was:

```sh
npx jest --runInBand --silent \
  src/lib/__tests__/redis-cache.test.ts \
  tests/unit/tenant-cache-keys.test.ts \
  tests/unit/loyalty/wallet-pass \
  tests/unit/hooks/use-visibility-poll.test.tsx \
  tests/unit/hooks/use-ready-alarm.test.tsx \
  tests/unit/customer-facts-reader.test.ts \
  tests/unit/customer-hub-overview.test.ts \
  tests/unit/api/customer-hub-overview.test.ts \
  tests/unit/api/facebook-management-authz.test.ts \
  tests/unit/facebook-token-reads-use-admin-client.test.ts
```

Mobile tests run from `webnegosyo-app` for `lib/backends/use-platform-query.test.tsx` and `lib/query/use-resource-keep-previous.test.tsx`. Jest retained handles after their passing summaries; the agent stopped its own processes. This is not a clean-process-exit claim.

The SQL runner is `tests/sql/run-facebook-settings-permission.cjs`. It uses an isolated PGlite installation, with the invocation documented in the file. It never connects to a configured Supabase database.

## Deployment requirement

Deploy `supabase/migrations/20261004160000_facebook_settings_permission.sql` with the application update. The API guard alone cannot prevent direct access under the old database policy. The migration has been verified locally but has **not** been applied to production.

## Open findings and limits

1. **Inventory double deduction remains reproducible.** `tests/unit/inventory-double-deduction-repro.test.ts` has four passing controls and two failures: un-cancelling when cancellation never restored stock, and repeating an un-cancel request. Both result in −400 g where one live order requires −200 g. `redepleteOrderStockBestEffort` allocates a fresh revision without proving that a corresponding restore occurred. This needs a separate lifecycle/idempotency fix covering both ingredient and simple-option stock; this pass did not modify that service.
2. **Unpatched node-forge advisory remains.** `npm audit --omit=dev` now reports two high package findings: node-forge and its parent passkit-generator, representing the same dependency chain. [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv) reports no patched version; the registry's latest node-forge was 1.4.0. No application exploit was established. The inspected wallet path signs passes with configured certificates; the advisory concerns signature verification. A forced downgrade was not applied.
3. **The complete repository suite is not green.** The broad run also encountered failures in inventory-stock-manager, order-type-live-sync, inventory-count-wiring, inventory-transfers-workbench, and inventory-import-workbook. Several included timeouts. Those failures were not diagnosed in this pass. The broad run was stopped after the failures were captured; the independent inventory reproduction and changed-area checks were then completed.
4. Full web/mobile type-check attempts remained silent for several minutes and were stopped in favor of the successful scoped checks. No full production build, live load test, browser journey, or exhaustive security assessment was completed. Timing improvements above describe specific verified work reductions, not whole-application latency guarantees.

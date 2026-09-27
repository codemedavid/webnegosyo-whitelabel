# Release review — 2026-09-27

PR: https://github.com/codemedavid/webnegosyo-whitelabel/pull/64

The pending workspace was committed on `release/reviewed-updates-2026-09-27` and integrated with `origin/main`, preserving the existing storefront packs, order deletion, receipt styling and inventory import work. Two independent reviewers covered backend/security/data integrity and web/mobile/desktop integration. Further delivery hardening from another concurrent session was preserved and independently reviewed.

## Confirmed issues addressed

- Combo checkout previously repriced surcharge-only component rows as ordinary dishes, losing the advertised combo total. The server now validates tenant-owned active bundles, complete slots, quantities, choices and current extras, then allocates the total in exact centavos across real dish rows. Caller-controlled bundle flags cannot grant discounts.
- The QR handoff and merchant scanner use the same combo contract; scanner prices must be verified against the current store catalog before order creation.
- Delivery booking now claims an order before calling the paid provider. Web/API and Convex paths preserve ambiguous in-flight claims, prevent requote/sync races, and refuse missing/foreign orders. Signed quotes bind tenant, quotation, destination and provider expiry. Checkout retries are reachable and submit checks wall-clock expiry.
- Cart/item suggestions load required modifier and preorder configuration so an offer cannot bypass item setup.
- Loyalty recovery prioritizes new lifecycle events and unfinished earning. Completed platform jobs sleep until a transactional trigger re-enqueues them; completed external jobs have a finite polling window.
- Repository lint errors, merchant query-layer/test boundary issues, and integration regressions were corrected. The older storefront pack checkout no longer imports the retired upsell modal.
- Convex bundle version increases to 35. Missing-function fallback supports a staggered rollout; authentication refusals never fall back to public mutations.

## Validation

| Check | Result |
| --- | --- |
| Full root Jest | 939 suites / 10,554 tests passed; one suite / eight tests skipped |
| Full merchant Jest | 457 suites / 5,732 tests passed; final QR scanner/stock regressions also passed |
| TypeScript | Root, merchant app, customer app, desktop main and renderer passed |
| Repository ESLint | Zero errors; 337 existing warnings |
| QR/backend pricing parity | 20 focused tests passed, plus 42 broader QR checks |
| SQL execution | All five isolated harnesses passed; Lalamove policy harness includes eight role/tenant checks |
| Root npm audit | Zero reported vulnerabilities |
| Convex template | Bundle rebuilt successfully, version 35 |
| Production stock contract | Read-only probe passed |

The first local build/test attempts overlapped the integration and were superseded. Clearing the generated Next ESLint cache removed stale merge-marker diagnostics. A native test import initially polluted web ambient types; the test now keeps native declarations out of the web TypeScript program while exercising the real HTTP client. The final PR preview is the full build gate; check its status before promotion.

SQL harnesses run with an isolated PGlite install outside the repository. They execute the loyalty activity, earning recovery, wallet history, staff shift server-time and anonymous Lalamove insertion contracts without changing production data. Root dependency audit reports zero vulnerabilities. The production stock-contract read-only check passed.

## Deployment gate and order

Production deployment was not performed during this review. The Supabase CLI returns `User is banned`, including for project listing. Its saved link also points at `chfgovrbsaeebpbykacs`, whereas both the local application and Vercel production use **`tjcmkstsuhqdwkfdrxan`**. Restore management access, link the correct project, inspect its migration ledger, and apply only missing migrations in timestamp order. Do not apply migrations against the stale CLI target.

Read-only checks with Vercel production credentials confirm `inventory_audit_log` and `order_deletions` exist, but `loyalty_activity` and `loyalty_earning_jobs` are missing.

1. Restore Supabase management access and verify the production migration ledger. Apply missing additive migrations, including activity/recovery/wallet history, shift server timestamps and the anonymous Lalamove guard. Older prerequisites must be present first.
2. Deploy the updated `manage-staff` function and publish the verified web build. The server's internal-Convex call falls back only when an older deployment lacks that function.
3. Roll out Convex v35 with the existing bulk-deploy flow and verify results/version rows. Do not push v35 ahead of the web update: the previous website calls the public order mutation that v35 restricts for Lalamove tenants.
4. Release compatible customer/merchant native builds separately, then smoke-test affected paths on devices.

## Practical limits

Old customer apps using unbound ImageKit GET signing must update. Customer native checkout does not yet obtain signed Lalamove quotes; the updated source directs affected customers to the website before any order write. The new database/Convex guards refuse older direct customer writes that bypass that verification. This is a rollout compatibility requirement, not a claim that existing installed binaries have been updated.

Combo QR pricing parity requires the updated merchant scanner build. Older installed scanners still use standalone item repricing; old combo QR codes without slot/cart provenance must be regenerated. Old web checkout tabs must refresh before submitting bundles.

Desktop source typechecks pass, but installer packaging was not validated: its pre-existing package manifest contains Prettier metadata instead of the application's build scripts. No store submissions, native binaries, live paid delivery bookings or production migrations were made. Shared-database Playwright tests and physical-device/payment-provider checks were not run.

Existing offline-bookkeeping, transactional order/item creation and damaged-ledger reconciliation limits remain documented in `pos-offline-audit.md`. This review and its tests do not establish that every possible production failure is eliminated.

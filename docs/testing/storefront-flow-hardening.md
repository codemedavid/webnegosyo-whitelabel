# Storefront flow hardening

## Changes

- Admin bundle read actions now require the tenant's menu permission before opening a service-role client.
- Bundle updates verify ownership before writing, and require the tenant-scoped update to return a row before deleting child slots. Previously a zero-row update could continue into deletion of another tenant's slots.
- Bundle writes validate category, included-item and price-override ownership. Slot category reads are tenant-scoped. Reorder failures now propagate instead of returning success.
- Storefront bundle hydration reuses the already paginated tenant catalog. This removes the additional serial item-query phase, retains availability filtering, and supports explicit choices spanning categories. An ID index avoids scanning the entire catalog for every explicit choice list.
- Bundle customization pricing is shared by cart totals, review and order-line serialization. Slot quantity and add-on quantity are both included; grouped variations consistently take precedence over legacy variations.
- Loyalty progress results are keyed by tenant, phone and outlet during render, preventing a previous customer's balance from appearing before effect cleanup.
- The final allowed inline upgrade remains open after its impression consumes the remaining prompt budget.
- SSR test doubles now model chainable sorting and pagination and await their requests, fixing an unhandled rejection that terminated the broad Jest run.

## Regression coverage

New regressions were run failing before their fixes: unauthorized bundle reads, cross-tenant child deletion, unscoped category metadata, reorder failure reporting, foreign bundle references, cross-category catalog choices, transient stale loyalty balances, disappearing upgrade prompts, and bundle extras with multiple units.

Related suites cover cart calculations, bundle order selection IDs, catalog pagination, out-of-stock items, and the menu data cache integration. Source assertions tied to the removed slot query were replaced by catalog behavior coverage.

Verification: the root Jest run passed 873 suites / 9,797 tests (one suite / eight tests skipped). The bundle security suite also passed independently, including authorized create/update cases. TypeScript (`tsc --noEmit --incremental false`), ESLint on changed source/test files, and `git diff --check` passed. The root Jest configuration excludes the separate mobile projects and Playwright tests.

## Limits and remaining review areas

This is a targeted application-code audit, not a production penetration test or a full-system certification. No production writes, deployments, or database migrations were performed.

- Bundle parent/slot replacement still spans multiple database requests. A database transaction is needed to guarantee rollback after a mid-write failure or concurrent edits.
- Server checkout currently reprices flattened bundle lines through ordinary menu-item pricing. The flattened payload carries customization extras but does not allocate the fixed bundle base across its lines. End-to-end bundle price reconciliation needs a dedicated contract covering bundle instance/slot identity, server validation of completeness, and currency allocation. The customization refactor here does not resolve that existing contract issue.
- Live database policies, production latency, browser checkout behavior, dependency advisories, and separate mobile/desktop application builds were not validated by these changes.

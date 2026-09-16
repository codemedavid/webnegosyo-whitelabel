# Web variation/add-on restoration — verification

Date: 2026-09-16. Implemented locally; not deployed.

## Behavior

- Menu management separates Variations and Add-ons and lets merchants convert an
  existing group without replacing its option IDs or recipe associations.
- Add-ons use explicit quantity mode; choosing one portion does not make an
  add-on a variation. Existing choice-only groups keep their rules.
- Customer product detail, quick view and cart editing support per-item portions.
  Cart pricing and identity distinguish one extra from three. Summaries display
  quantities, and linked-option prices survive cart editing.
- Web order snapshots preserve IDs and quantities across all three order backends
  using their existing JSON metadata field. QR handoff preserves add-on prices,
  quantities and stock metadata; scanning now notifies the stock service.
- Recipe depletion accounts for parent quantity × extra portions. Unified recipe
  IDs resolve correctly, linked item recipes provide a fallback, and an old
  legacy recipe is not counted again when a unified recipe supersedes it.
- Simple option stock has atomic recorded movements, aggregate stock checks,
  retry protection and restoration. Its counter remains store-wide, matching
  the existing JSON storage; ingredient stock retains outlet scope.

## Verification

Red-to-green evidence included cart pricing (expected 260, received 220), repeated
selection projection, customer plus/minus controls, admin creation/library rules,
linked price restoration, inventory quantities and SQL movement behavior.

The pure ordering journey test composes selection → cart → saved snapshot → recipe
depletion and verifies two burgers with three extra cheese portions produce a
260 bill, consume two buns, and consume six extra cheese slices.

- 19 focused web suites passed, 270 tests; a subsequent persistence test also
  passed with its two affected suites (33 tests).
- Inventory agent: 117 suites passed, 1,280 tests, 8 existing skips; additional
  focused review regressions passed.
- Merchant QR tests: 2 suites, 16 tests passed (`npm test -- --runInBand
  lib/qr-order-stock.test.ts lib/scan-handoff-validate.test.ts` from `webnegosyo-app`).
- Changed application-source ESLint and `git diff --check` passed.
- Full TypeScript checking still reports existing test-file typing errors;
  changed application source has no reported TypeScript errors.
- Isolated PostgreSQL/PGlite scenarios cover sale, retry, cancel, reopen, edit,
  aggregate shortfall rollback, malformed quantities, role restriction and tenant
  isolation. Harness: `tests/sql/run-simple-option-stock.cjs`; requires PGlite.
  Session command (using the existing isolated dependency installation):
  `NODE_PATH=/private/tmp/whitelabel-auth-regression/node_modules node tests/sql/run-simple-option-stock.cjs`.

## Rollout

Apply these platform database migrations before application rollout:

1. `20260916120000_modifier_group_library_selection_mode.sql`
2. `20260916121000_simple_option_stock.sql`

The merchant app must be rebuilt for the QR scanner changes. No live database,
production application or app-store deployment was performed.

## Existing boundaries

Stock writes remain post-save and best-effort. A preflight rejects a known simple
stock shortage and the atomic RPC protects counters, but a concurrent sale may
exhaust stock after preflight while the order is being saved. This is not a
checkout reservation transaction.

Merchant POS editing is a separate selection flow. Writers changing a saved
order's selections must refresh the inventory snapshot; mismatched parent IDs or
quantities invalidate the snapshot, while an add-on-only edit requires writer
integration. External-backend reopen entrypoints retain their existing routing
limitations. This change restores web ordering and customer cart editing; it does
not add quantity authoring to the merchant POS modifier sheet.

No live storefront or production tenant was exercised in this session.

# Per-order-type POS pricing, aggregator kinds, per-surface availability — TDD evidence

Date: 2026-09-10. Branch `feat/order-type-pricing`. Plan: `.claude/plans/sparkling-brewing-tulip.md`.

## Scope

- `order_types.type` accepts `grab | foodpanda | other` (core three stay one-per-tenant via partial unique index `order_types_tenant_core_type_uq`).
- `order_types.available_on_web` / `available_on_pos` (default true, CHECK at least one on).
- `order_types.pos_markup_percent` (nullable, -100..500) + `order_type_item_prices` exact overrides.
- POS register prices by the selected order type; web storefront and customer app keep store prices and only gain the availability filter. Desktop register untouched (follow-up).

## Migration

`supabase/migrations/20260909120000_order_type_kinds_availability_pricing.sql` — APPLIED to the live project 2026-09-10 via MCP. Post-apply probes (each rolled back):

| Probe | Result |
|---|---|
| two `'other'` rows for one tenant | inserted; count 2 |
| second `'pickup'` for the same tenant | `unique_violation` on `order_types_tenant_core_type_uq` |
| both availability flags false | `check_violation` on `order_types_available_somewhere_ck` |
| item price row pointing at another tenant's menu item | guard trigger raised |

Security advisors: no new findings for `order_types`, `order_type_item_prices`, or the guard function. `src/types/supabase.ts` regenerated via MCP.

## RED → GREEN

| Suite | RED | GREEN |
|---|---|---|
| web `order-type-kinds` | module missing | 16 |
| web `order-type-pricing` | module missing | 27 |
| web `pickup-qr-gating` (+grab case) | 1 failed | 16 |
| app `lib/order-type-pricing` | module missing | 27 (body byte-identical to web below the header) |
| web `order-type-schema`, `order-type-pricing-service`, `order-type-create-kinds`, `order-type-availability-admin`, `order-type-pricing-panel` | 26 failed / 5 passed | 140/140 across the order-type admin set |
| web `order-type-availability`, `order-types-client-availability`, `actions/create-order-web-availability` | 3 failed | 113 across the storefront set |
| app `pos-catalog` | compile failure on new API | 22 (register reader filters `available_on_pos`; shared reader does not) |
| app `pos-order-type-pricing` | module missing | 18 |
| app `stores/pos-order-type-pricing-journey` | module missing | 10 |
| app `components/pos/ModifierSheet.pricing` | render failure | 4 |

Full runs: web `npx jest --roots tests/unit` → 606/608 suites (the two failures, `leads-analytics` env gap and `downloads` version pin, are pre-existing and untouched). App `npx jest` → 325 suites / 4159 tests green. `tsc --noEmit` clean in `src/`; app clean except the pre-existing `KitchenScene.tsx` error. Web lint at the 26-error baseline.

## Decisions locked by tests

- Markup scales base price AND modifier prices; an exact item override replaces the base only.
- Re-pricing derives from `listBasePrice` / `listPriceModifier`, so switching order types twice never compounds.
- Hydrated edit-mode lines carry no `listBasePrice` and are returned by reference; the store also skips repricing while `editContext` is set.
- `listRegisterOrderTypes` (register) filters `available_on_pos`; `listOrderTypes` (payment-method editor) does not, so a web-only type can still be linked to a payment method from the app.
- Web `createOrderAction` refuses an order type whose `available_on_web` is explicitly false; a row without the column proceeds.
- QR scan-to-collect stays `pickup` only.

## Manual verification still owed

Register: create "Grab" (markup 25, one exact override), set Dine In `available_on_pos = false`; confirm the chip disappears, tiles and an open modifier sheet reprice on switch, the charged order's `items[].price` is the marked-up base, and an edited placed order keeps its placed prices. Storefront: a web-hidden type is absent at checkout.

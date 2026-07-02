# TDD Evidence: Product Management + Cost/Profit in webnegosyo-app

**Source plan**: inline `/plan` output from this session (no `*.plan.md` file was written; plan text is preserved in conversation history — summarized below).
**Date**: 2026-07-02

## User Journeys

1. As a merchant, I want to create, edit, and delete menu products from the merchant admin app, so I don't need the web dashboard to manage my menu.
2. As a merchant, I want to toggle a product's availability from the app.
3. As a merchant, I want to add a photo to a product from my phone's photo library.
4. As a merchant, I want to see profit and margin % per product (price minus cost), reusing the store's existing cost-price feature.
5. As a merchant, my mobile edits should show up on the public menu promptly, not after a long ISR delay.

## Task Report

| Task | Summary | Validation command | Result |
|---|---|---|---|
| Products data layer | `webnegosyo-app/lib/products.ts` — validation, PostgREST search sanitization, margin math, and tenant-scoped Supabase CRUD for `menu_items`/`categories` | `npx jest webnegosyo-app/lib/products.test.ts` | RED (module missing) → GREEN (25/25) |
| Image upload | `webnegosyo-app/lib/product-image-upload.ts` — reuses the web app's `/api/imagekit/auth` signed-token endpoint for mobile uploads | `npx jest webnegosyo-app/lib/product-image-upload.test.ts` | RED (module missing) → GREEN (6/6) |
| Revalidation endpoint | `src/app/api/revalidate-menu/route.ts` — Bearer-token-authenticated route mobile calls after a write, mirroring `verifyTenantAdmin` | `npx jest tests/unit/api/revalidate-menu.test.ts` | RED (module missing) → GREEN (6/6) |
| Product management screens | `app/(main)/product-management.tsx` (list/search/filter/toggle) and `app/(main)/product/[productId].tsx` (create/edit/delete + Cost & Profit card) | `npx tsc --noEmit` (webnegosyo-app) | 0 errors; no RN component test harness exists in this app (only `lib/*.test.ts` pure-logic tests are established here), so these screens follow the app's existing untested-component convention |

RED evidence (representative, `products.test.ts`):
```
Cannot find module './products' from 'webnegosyo-app/lib/products.test.ts'
Test Suites: 1 failed, 1 total
```

GREEN evidence:
```
PASS webnegosyo-app/lib/products.test.ts (25 passed)
PASS webnegosyo-app/lib/product-image-upload.test.ts (6 passed)
PASS tests/unit/api/revalidate-menu.test.ts (6 passed)
PASS webnegosyo-app/lib/order-alerts-utils.test.ts (pre-existing, unaffected)
Test Suites: 4 passed, 4 total
Tests:       45 passed, 45 total
```

## Test Specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | Product name/description/price/category are required; discounted price must be lower than price | `webnegosyo-app/lib/products.test.ts:validateProductInput` | unit | PASS |
| 2 | Search input is sanitized against PostgREST filter-injection and length-capped | `webnegosyo-app/lib/products.test.ts:sanitizeSearchQuery` | unit | PASS |
| 3 | Profit/margin % computed correctly, including zero-price and cost-exceeds-price edge cases, with no divide-by-zero | `webnegosyo-app/lib/products.test.ts:calculateMargin` | unit | PASS |
| 4 | Product list/create/update/delete/toggle-availability queries are scoped to `tenant_id`; create rejects invalid input before hitting Supabase | `webnegosyo-app/lib/products.test.ts:listProducts/createProduct/updateProduct/deleteProduct/toggleProductAvailability` | unit (mocked Supabase) | PASS |
| 5 | Category list is scoped to `tenant_id` | `webnegosyo-app/lib/products.test.ts:listCategories` | unit | PASS |
| 6 | ImageKit upload response is validated/normalized; missing fields throw | `webnegosyo-app/lib/product-image-upload.test.ts:parseUploadResponse` | unit | PASS |
| 7 | Upload flow fetches signed auth then uploads, and surfaces friendly errors on auth or upload failure | `webnegosyo-app/lib/product-image-upload.test.ts:uploadProductImage` | unit (mocked fetch) | PASS |
| 8 | `/api/revalidate-menu` requires `tenantId`/`tenantSlug` and a valid bearer token; only the tenant's own admin or a superadmin may trigger it; revalidates `/{slug}/menu` on success | `tests/unit/api/revalidate-menu.test.ts` | integration (mocked Supabase auth) | PASS |

## Coverage and Known Gaps

- Coverage command not run with `--coverage` flag in this session (small, isolated new modules; every branch of the pure-logic functions is exercised by name in the table above).
- **Known gap, explicitly scoped out**: no automated test coverage for the two new screen components (`product-management.tsx`, `product/[productId].tsx`). `webnegosyo-app` has no React Native Testing Library harness installed, and the app's only existing precedent (`order-alerts-utils.test.ts`) tests pure logic, not screens — adding an RN component-testing harness was out of scope for this task. Screens were instead verified via `npx tsc --noEmit` (0 errors) and manual review against existing screen patterns (`product-analytics.tsx`, `order/[orderId].tsx`).
- Variation groups / addon editing on mobile intentionally deferred (noted in the confirmed plan) — updates never touch `variations`/`variation_types`/`addons`, so existing data is preserved.
- The revalidation call from mobile is best-effort/fire-and-forget; if it fails, the existing ISR TTL is the fallback (pre-existing risk, unchanged by this work).

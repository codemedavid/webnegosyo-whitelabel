# TDD Evidence: Lalamove Overhaul — Web Hardening + Full In-App Delivery Management

**Source plan**: inline `/plan` output (2026-08-20), approved via "proceed". Branch `lalamove-overhaul` off `origin/main`.

## User journeys

1. As a merchant on a **platform-backend** store, I want the app's delivery card to actually work (book/sync/cancel/tip), so I can run Lalamove without the web dashboard. *(It 404'd on every op — see Phase 0.)*
2. As a merchant, I want the delivery status and driver to update **by themselves**, so I don't have to press Sync to learn a rider was assigned.
3. As a merchant confirming an order **more than ~5 minutes after checkout**, I want a way to get a fresh quotation, so the order isn't permanently unbookable.
4. As a merchant on the phone, I want booking to **confirm before dispatching a paid rider**, readable status words, and a rider chip on the orders list.
5. As the platform operator, I don't want anonymous visitors able to burn a tenant's Lalamove account or pull its secret keys through checkout-reachable actions.

## Task report (RED → GREEN per phase)

### Phase 0 — `/api/lalamove` selected a column that doesn't exist
- **Defect**: route selected `delivery_address` from platform `orders`; the column doesn't exist (address lives in `customer_data`). PostgREST errored → `data: null` → **404 "Order not found" for every op** (book, sync, cancel, priority fee) on every platform-backend tenant.
- **RED**: taught the test's admin mock to emulate PostgREST unknown-column behavior + moved the fixture address into `customer_data`. `npx jest --runTestsByPath tests/unit/api/lalamove-route.test.ts` → **9 failed with 404**, the exact production failure. Commit `2874d6d`.
- **GREEN**: route reads `customer_data->delivery_address`. Same command → **15/15 pass**. Commit `06d5e4f`.

### Phase 1 — consolidation + hardening
- **RED** (commit `test: RED — shared Lalamove vocabulary + server-action drift reproducers`): 2 module suites failed to resolve (`lalamove-status`, `lalamove-sender` did not exist — compile-time RED) and **5/6 action tests failed** against real drift: sync blanked `lalamove_status`/`lalamove_tracking_url` with `|| null` on thin polls; sync missed the embedded `driver` payload shape; cancel accepted a DELIVERED delivery; no rate limit; `select('*')` on the anon path.
- **GREEN**: `src/lib/lalamove-status.ts` (final set incl. `REJECTED`/`CANCELED`, active predicate, badge tones incl. the `ASSIGNING_DRIVER` regression), `src/lib/lalamove-sender.ts` (single pickup-contact resolution), fixes in `src/app/actions/lalamove.ts`. 42/42 across the four suites.
- Also: per-tenant quotation rate limit (30/min via existing `checkRateLimit`), named-column tenant selects, superadmin form no longer prefills Lalamove secrets (blank keeps stored keys — both submit paths convert `''`→`undefined`, dropped by supabase-js), market default HK→PH, dead `validateDeliveryAddress` removed, `orders-service` auto-book no longer builds a fake sender from the customer's phone.

### Phase 2 — requote + auto-sync
- **RED** (commit `test: RED — expired quotations have no recovery path`): 6 tests — `requoteLalamoveAction is not a function`, route rejected `op: 'requote'`.
- **GREEN**: requote on all three transports — server action, `/api/lalamove` op, `convex-template` `lalamove:requoteLalamove` (**schema v20**, `lalamoveQuotationId` accepted by both updateLalamoveDetails mutations). One intermediate failure was itself caught by the tests: `Number(null) === 0` passed the pickup-pin guard; replaced with the existing `toFiniteNumber`. 36/36.
- Web panel auto-syncs active deliveries every 45 s (predicate `isActiveLalamoveDelivery` unit-tested; interval wiring reviewed, not component-tested) and has a "Get New Quote" button.
- `delivery_fee` is deliberately never changed by requote — checkout price stands.

### Phase 3 — merchant app
- **RED** (commit `test: RED — app delivery card lacks confirm-to-book...`): app `lib/lalamove-status` missing (compile RED) + 7 card tests failing (no confirm-before-book, no requote anywhere, no auto-sync, raw `ON_GOING` shown).
- **GREEN**: app `lib/lalamove-status.ts` (the card's old inline FINAL set **missed `CANCELED` and `REJECTED`** — dead Cancel/Tip buttons on finished deliveries), card upgrade (confirm-to-book, Get New Quote button + recovery folded into the expired-failure alert, 45 s auto-sync with demo/unavailable/final guards, readable labels + badge variants), `requote` in the transport op union, rider chip on `OrderCard`.
- **Full app suite: 195 suites / 2,857 tests pass.** `npx tsc --noEmit` (app): clean.

## Test specification (new/changed guarantees)

| # | What is guaranteed | Test file | Result |
|---|---|---|---|
| 1 | `/api/lalamove` reads the address from `customer_data`; a select naming a nonexistent column can no longer pass the suite | `tests/unit/api/lalamove-route.test.ts` | PASS |
| 2 | Requote builds store-pin → order-coordinates quotes; refuses booked orders and missing pins (route + action) | route + `tests/unit/actions/lalamove-actions.test.ts` | PASS |
| 3 | Thin sync polls never blank stored tracking/driver fields; both driver payload shapes read | `tests/unit/actions/lalamove-actions.test.ts` | PASS |
| 4 | Cancel refuses finished deliveries (action now matches route) | same | PASS |
| 5 | Anon quotation action is rate limited and never `select('*')`s the tenant row | same | PASS |
| 6 | Final/active/tone status vocabulary incl. `ASSIGNING_DRIVER`, `CANCELED`, `REJECTED`, case-insensitivity | `tests/unit/lib/lalamove-status.test.ts` (+ app mirror `webnegosyo-app/lib/lalamove-status.test.ts`) | PASS |
| 7 | Sender resolution prefers `lalamove_sender_phone`, normalizes E.164, never invents a phone | `tests/unit/lib/lalamove-sender.test.ts` | PASS |
| 8 | App card: confirm-before-book on both transports; requote routes correctly; expired-book failure offers recovery; auto-sync polls active deliveries and never final ones | `webnegosyo-app/components/LalamoveDeliveryCard.test.tsx` | PASS |

## Validation commands

- Web: `npm test` → 14,790 pass; all 42 failing suites are stale copies under `.claude/worktrees/merchant-mcp/` (another session's worktree caught by jest's scan), zero under `tests/`/`src/`.
- Web types: `npx tsc --noEmit` → 0 errors in `src/` (test-file mock-typing errors are preexisting repo-wide).
- Web lint: no errors on any touched file (repo's 116 errors are preexisting in `webnegosyo-desktop/` + generated code).
- App: `npx jest` → 2,857/2,857; `npx tsc --noEmit` clean.
- Convex bundle: `node scripts/prebundle-convex.mjs` rebuilt `src/lib/convex-push-bundle.json` (17 modules) with `requoteLalamove`; `CURRENT_SCHEMA_VERSION = 20`.

## Known gaps / intentional scope cuts

- **Not deployed.** Live behavior needs: web deploy (route fix + actions), Convex bulk deploy to v20 per tenant, and an EAS Update for the app JS. `/api/lalamove` was noted as not deployed even before this work.
- Tenant-own-Supabase (`order_backend='supabase'`) stores stay read-only in the app — that backend path is unproven end-to-end.
- The web panel's 45 s auto-sync interval is not component-tested (predicate is unit-tested; the app card's identical behavior is component-tested with fake timers).
- No Lalamove webhook: tracking is poll-based by design for now (works identically across all three backends, no per-tenant portal setup). Webhook + signature verification remains a future hardening; the existing `lalamove-convex` route is unchanged.
- Quotation `distance`/`duration` still return placeholder `'0 km'/'0 min'` (SDK does not expose them in the price breakdown).

# TDD evidence — Vouchers Phase 1: schema

**Source plan**: inline plan from `/ecc:plan` for the voucher & discount system. Phase 1 of 8.
**Migration**: `supabase/migrations/20260817120000_vouchers_and_discounts.sql` — **APPLIED 2026-08-02**.

Schema work is validated by probing the live database rather than by Jest: the
guarantees that matter here (a race that cannot double-claim, a trigger that
keeps a counter honest, a unique index that is case-insensitive) exist in
Postgres, not in TypeScript.

## User journeys

1. As a merchant, I want a voucher I can only give away 100 times to stop at 100
   — even if two cashiers claim the last one at the same moment.
2. As a customer whose checkout timed out and retried, I want to be charged once
   and to have used my voucher once.
3. As a merchant, I do not want anyone able to enumerate my unreleased promo
   codes, or to redeem against them from outside my store.

## Probe report

Run via a temporary `public.__voucher_probe()` function that created its own
rows, asserted, cleaned up after itself, and was then dropped.

| # | What is guaranteed | Result |
|---|---|---|
| 1 | A first claim on an in-limit voucher is granted | PASS |
| 2 | The trigger bumps `used_count` to 1 on redemption | PASS |
| 3 | A claim past `usage_limit_total` is refused — the conditional UPDATE inside `redeem_voucher()` is the concurrency control, so two simultaneous claimants cannot both win | PASS |
| 4 | Re-running redemption for the same `(voucher, order)` returns the existing redemption instead of claiming again — this is what makes a retried checkout safe | PASS |
| 5 | `used_count` stays at 1 after a retry plus a refused claim | PASS |
| 6 | Voiding a redemption returns the claim to the pool | PASS |
| 7 | A duplicate code differing only in case is rejected (`welcome10` vs `WELCOME10`) | PASS |
| 8 | An unknown `discount_type` is rejected by the check constraint | PASS |
| 9 | Every probe row was removed; the tables are empty | PASS |

Post-probe state: `vouchers 0 / voucher_targets 0 / voucher_redemptions 0`,
probe function dropped, `orders` has both new columns, `order_items` has one,
3 RLS policies present.

## Two problems the live database found

1. **`app_users` joins on `user_id`, not `id`.** The first apply failed outright
   with `42703: column au.id does not exist`. The RLS policies were written from
   the pattern in neighbouring migrations but with the wrong key; nothing in the
   repo would have caught it, because SQL is not typechecked here.

2. **Both new `SECURITY DEFINER` functions were callable by `anon`.** PostgREST
   publishes every function in `public` as an RPC. `redeem_voucher()` bypasses
   RLS by design, so at `/rest/v1/rpc/redeem_voucher` an anonymous caller could
   have burned redemptions against any tenant's vouchers. Caught by the Supabase
   security advisor (`anon_security_definer_function_executable`), fixed in
   `vouchers_lock_rpc_to_service_role`: `EXECUTE` revoked from
   `public, anon, authenticated` and granted only to `service_role`. The advisor
   no longer reports either function.

## Design notes worth keeping

- **`voucher_redemptions.order_id` is TEXT**, not a uuid FK. Orders live in
  Convex for some tenants, and Convex ids are not uuids. Same precedent as
  `stock_movements` (`20260727120000_stock_movements_order_id_text`).
- **`used_count` is a cache, the ledger is the truth.** The counter is
  trigger-maintained so a redemption and its count cannot drift.
- **No anon RLS policy on `vouchers`.** A public read would let anyone list a
  merchant's unreleased promo codes. Validation runs server-side through the
  service-role client instead.
- **Policies compare `au.tenant_id` to the ROW's `tenant_id`, table-qualified** —
  the shape that prevents the `au.tenant_id = au.tenant_id` self-comparison bug
  fixed in `20260815130000`.

## Known gaps / follow-ups

- `src/types/database.ts` does not yet carry `vouchers`, `voucher_targets`,
  `voucher_redemptions`, or the new order columns. Phase 3 needs them and adds
  them; until then Supabase queries against these tables will not typecheck.
- The per-customer limit relies on a `customer_key`. Deriving it consistently
  from the existing `customer-identity.ts` normalization is Phase 3 work.
- No tenant has any voucher yet — the tables are live but empty, so nothing in
  the running product changes until Phase 3 and 5 ship.

## Checkpoint commits

| Stage | Commit |
|---|---|
| Schema written (not applied) | `562825c` |
| Applied + probed + RPC lockdown | `cd17443` |

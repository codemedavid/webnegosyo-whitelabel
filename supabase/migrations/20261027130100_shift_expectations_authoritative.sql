-- ===========================================================================
-- Expected cash: the SERVER figure becomes authoritative on platform stores
-- (P2b of docs/plans/cashier-remittance, 07 §3.5 "P1b").
--
-- DO NOT APPLY until the live drift probe (CASH_LIVE=1 … cash-expectation-live)
-- has compared cash.shift_expected with the stored device figure over real
-- closed shifts and every difference is explained (the server is expected to
-- be MORE complete: it sees orders the register's page did not reach).
--
-- What changes: cash.expected_mode() returns 'server', so
--   * the close trigger writes the server figure into staff_shifts.expected_cash
--     on every close path (legacy direct UPDATE included) — the register can no
--     longer choose what its drawer "should" hold;
--   * count_shift / close_shift / preview_shift_close pick the server figure
--     first (cash.choose_expected), the device figure only when there is none
--     (Convex / tenant-Supabase stores, or the server computation failed).
-- Nothing else moves; frozen rows keep the mode they were frozen under.
-- Runner: tests/sql/run-shift-expectations.cjs applies it in PGlite only.
-- Rollback: the same function returning 'shadow'.
-- ===========================================================================

set lock_timeout = '3s';

create or replace function cash.expected_mode()
returns text
language sql
stable
as $$ select 'server'::text $$;

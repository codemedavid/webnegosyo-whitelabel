# TDD evidence — Vouchers Phase 4: admin management

**Source plan**: inline plan from `/ecc:plan` ("remaining tasks"), Phase 4.
**Depends on**: [Phase 3b server authority](./vouchers-phase-3b-server-authority.tdd.md).

## User journeys

1. As an owner, I want to create a discount code without writing SQL.
2. As an owner, I do not want every staff member who can rename a dish to be
   able to mint a standing discount on my revenue.
3. As a merchant, I want to be told a voucher is broken at the form, not by
   next week's receipts.
4. As a merchant, I want to stop a code being accepted without erasing the
   orders that already used it.

## Task report

| Task | RED | GREEN |
|---|---|---|
| `vouchers` staff permission in all three registries | 3 failed, 3 passed | `jest staff` → 8 suites, 108 passed |
| Voucher draft validation | `Cannot find module '@/lib/vouchers/admin-validation'` | 19 passed |
| Route gating + sidebar entry | 4 failed, 1 passed | 5 passed |
| Admin CRUD actions + UI | — (typecheck/lint gate) | `tsc` 0 errors under `src/`; lint clean |

Full suite: `4924 passed, 34 failed` — the same pre-existing failures as
`origin/main` (`cache`, `leads` ×2, `order-token`, `inventory-live-e2e`).

## A pre-existing drift this phase uncovered

The staff-permission registry is duplicated across three surfaces, guarded by
`tests/unit/staff-permissions-parity.test.ts`. That test compared **two** of the
three copies. The desktop register's copy declared its keys as a **type union**
with no `STAFF_PERMISSION_KEYS` export, so the parity test could not import it —
and it had silently fallen a whole key behind (`branch_staff`).

It is now an array, the union is derived from it, and the new test compares all
three copies. This was drift that existed before the voucher work and would
have kept widening.

## Decisions the tests encode

- **Vouchers get their own permission key.** Under `menu` it would go to
  everyone who can rename a dish; under `settings` it would be hidden from the
  manager who actually runs promotions.
- **A permission no route consults is decoration.** `permissionForAdminPath`
  maps the section, so an ungranted staff member never sees it.
- **Retire, don't delete.** `voucher_redemptions` references the voucher, and a
  merchant reading a past discounted order needs the code to still resolve.
- **An uncapped percentage is a warning, not an error.** A merchant may
  genuinely want one — they should just see it before saving.
- **Validation runs on the server too.** The form's copy is a courtesy; a
  server action is reachable without the form.
- **A scoped voucher with no targets cannot be saved.** The engine reads an
  empty target list as "matches nothing" — correct at redemption time, but a
  silently dead voucher at the form.
- **Duplicate codes are caught by the unique index**, not by a pre-check. The
  `23505` is translated into English rather than raced against.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `vouchers` exists as its own permission key with a label | `staff-permission.test.ts` | unit | PASS |
| 2 | Ungranted staff are refused; owners are not | `staff-permission.test.ts` | unit | PASS |
| 3 | All three registries list the same keys | `staff-permission.test.ts` | unit | PASS |
| 4 | The route is gated, with and without a tenant prefix | `admin-route-gating.test.ts` | unit | PASS |
| 5 | The sidebar entry is hidden from ungranted staff | `admin-route-gating.test.ts` | unit | PASS |
| 6 | A percentage over 100 is rejected | `admin-validation.test.ts` | unit | PASS |
| 7 | A fixed amount over 100 is allowed — it is pesos, not percent | `admin-validation.test.ts` | unit | PASS |
| 8 | A scoped voucher with no targets is rejected | `admin-validation.test.ts` | unit | PASS |
| 9 | A window that ends before it starts is rejected | `admin-validation.test.ts` | unit | PASS |
| 10 | A null limit is unlimited, not an error | `admin-validation.test.ts` | unit | PASS |
| 11 | An uncapped large percentage warns without blocking | `admin-validation.test.ts` | unit | PASS |
| 12 | Every problem is reported at once, not one per save | `admin-validation.test.ts` | unit | PASS |

## Known gaps

- **No product/category picker.** Deliberately absent rather than half-built:
  validation refuses to save a scoped voucher with no targets, so a partial
  picker would produce vouchers that cannot be saved. The form says so plainly.
  Until it exists, scoped vouchers can only be created by SQL.
- **The CRUD actions have no unit tests of their own.** They are thin over
  `validateVoucherDraft` (19 tests) and `mapVoucherRow` (already covered);
  their own logic is permission-gating and error translation, gated here by
  typecheck and lint. Worth an integration test when one is cheap.
- Two unrelated jsdom suites (`checkout-form-payment-terms`,
  `checkout-page-video`) failed on one full run and passed on a rerun and in
  isolation. They are slow (15s, 9s) and flaky under worker pressure.

## Checkpoint commits

| Stage | Commit |
|---|---|
| RED — staff permission | `2a74919` |
| GREEN — staff permission (3 registries + desktop drift fix) | `fecc64f` |
| RED — draft validation | `3f1592c` |
| GREEN — draft validation | `933cdf8` |
| RED — route gating | `16a4d87` |
| GREEN — admin section, actions and UI | `000fec9` |

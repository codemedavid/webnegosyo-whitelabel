# TDD Evidence — Customer Management, Phase 1 (data layer)

**Source plan**: inline plan agreed in-session (no `*.plan.md` artifact).
**Scope of this phase**: validation + repo for manual customer creation and
management in the merchant app, plus the schema columns they need. UI (Phase 2),
the app-order capture gap (Phase 3), and the POS picker (Phase 4) are **not**
covered here and remain outstanding.

## Context: most of this feature already existed

Worth recording, because it shaped the scope. `public.customers` has been live
since migration `20260706120000_customer_identity.sql` — 581 profiles across 80
tenants, 800 of 1709 orders linked via `orders.customer_id`. Identity
resolution (`src/lib/customer-identity.ts`), aggregation, the web admin list,
and an SMS-shaped app screen all pre-date this work. Phase 1 adds only what was
genuinely missing: a way to create a customer that no order produced.

## User journeys

1. As a merchant, I want to type a new guest in at the counter, so I can start
   tracking someone who has not ordered online.
2. As a merchant, I want a bad phone number rejected before it is saved, so my
   guest list does not fill with people I can never match again.
3. As a merchant, I want to search my guests by the number printed on the
   receipt, so I can find them without knowing the stored format.
4. As a merchant, I want to be told when a guest already exists, so I add a note
   to the right person instead of creating a second copy.

## Task report

### Task 1 — Validation for hand-entered customers

Added `webnegosyo-app/lib/customers/validation.ts`. Enforces, before any write,
the two invariants the derived path got for free: reachability (phone or email,
mirroring the `customers_identity_ck` constraint) and personhood (reusing
`isIdentifiableContact`, so `"Walk-in"` / `"POS"` / `"N/A"` cannot be saved as a
guest name). Reports every bad field at once rather than the first.

- **RED**: `npx jest lib/customers/validation.test.ts` →
  `TS2307: Cannot find module './validation'` — compile-time RED, the test
  newly referenced the missing implementation.
- **GREEN**: same command → `Tests: 21 passed, 21 total`.

### Task 2 — Schema columns for manual creation

Migration `supabase/migrations/20260819120000_customers_manual_creation.sql`,
purely additive: `created_source` (`'order' | 'manual' | 'import'`, defaulted to
`'order'` and CHECK-constrained) and `notes`.

`created_source` exists because a hand-entered guest who has not ordered yet and
a derived row whose order rollup failed **both** have `order_count = 0`, and
without a discriminator no report can tell them apart.

- **Applied** via `mcp__supabase__apply_migration` → `{"success": true}`.
- **Probed**: `select created_source, count(*) from customers group by 1` →
  `[{"created_source": "order", "count": 581}]` — every pre-existing row took
  the correct default, none were rewritten.
- `src/types/database.ts` `Customer` updated to match.

### Task 3 — Customer management repo

Added `webnegosyo-app/lib/customers/repo.ts`: list (search + sort + paging),
get, find-by-phone, create, update.

- **RED**: `npx jest lib/customers/repo.test.ts` →
  `TS2307: Cannot find module './repo'` — compile-time RED.
- **GREEN**: `npx jest lib/customers` → `Tests: 40 passed, 40 total`.
- **No regression**: `npx jest` → `Test Suites: 131 passed`,
  `Tests: 2172 passed, 2172 total`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A customer with neither phone nor email is rejected with an actionable message, not a Postgres constraint error | `lib/customers/validation.test.ts:rejects a draft with neither phone nor email` | unit | PASS |
| 2 | Phone-only and email-only drafts are both accepted | `validation.test.ts:accepts a phone-only draft`, `:accepts an email-only draft` | unit | PASS |
| 3 | `09171234567`, `+63 917 123 4567`, `9171234567`, `0917-123-4567` all normalize to `+639171234567` | `validation.test.ts:normalizes %s to %s` | unit | PASS |
| 4 | A phone that cannot be normalized is rejected, so no unmatchable ghost guest is stored | `validation.test.ts:rejects a phone that cannot be normalized` | unit | PASS |
| 5 | Email is lowercased and trimmed; malformed email rejected | `validation.test.ts:lowercases and trims a valid email`, `:rejects a malformed email` | unit | PASS |
| 6 | Placeholder names (`Walk-in`, `walk in`, `POS`, `N/A`, `guest`, `-`) cannot become a customer | `validation.test.ts:rejects the placeholder name %s` | unit | PASS |
| 7 | All bad fields are reported in one pass, not just the first | `validation.test.ts:reports every bad field at once rather than the first` | unit | PASS |
| 8 | Every read carries an explicit `tenant_id` filter rather than relying on RLS alone | `repo.test.ts:scopes the read to the tenant explicitly...` | unit | PASS |
| 9 | A failed read throws instead of resolving to `[]` (which renders as "no customers yet" over a full database) | `repo.test.ts:throws when the read fails instead of returning an empty list` | unit | PASS |
| 10 | Rows map to the record shape the screen consumes | `repo.test.ts:maps a row into the record the screen consumes` | unit | PASS |
| 11 | `recent`/`top_spend`/`frequent` map to `last_order_at`/`total_spent`/`order_count` descending | `repo.test.ts:sorts %s by %s descending` | unit | PASS |
| 12 | A receipt-format phone search is normalized to E.164 before querying, so it can match at all | `repo.test.ts:matches a phone-shaped search against the normalized phone column` | unit | PASS |
| 13 | A non-phone query falls back to a name search | `repo.test.ts:falls back to a name search when the query is not a phone` | unit | PASS |
| 14 | Single-customer reads filter on tenant **and** id | `repo.test.ts:scopes to the tenant as well as the id` | unit | PASS |
| 15 | Created rows are stamped `created_source: 'manual'` | `repo.test.ts:stamps the row as manually created` | unit | PASS |
| 16 | Creation does not seed `order_count` / `total_spent` — no number on screen that no order supports | `repo.test.ts:does not seed order totals` | unit | PASS |
| 17 | A duplicate phone surfaces as `DuplicateCustomerError`, not raw `23505` | `repo.test.ts:surfaces a duplicate phone as DuplicateCustomerError` (create + update) | unit | PASS |
| 18 | Non-duplicate failures rethrow with their message | `repo.test.ts:rethrows any other failure` | unit | PASS |
| 19 | Updates filter on tenant as well as id | `repo.test.ts:scopes the write to the tenant, not just the id` | unit | PASS |
| 20 | Editing a derived guest never relabels them as manually created | `repo.test.ts:never rewrites created_source` | unit | PASS |

## Coverage and known gaps

`webnegosyo-app` has no coverage threshold configured in `jest.config.js`; the
project convention is pure-logic modules with colocated tests, and both new
modules are fully exercised (40 tests over ~2 modules, every exported function
and every error branch). No coverage command was run, so no coverage percentage
is claimed here.

Deliberate gaps and outstanding risks:

- **Phases 2–4 are not built.** No UI, no POS attachment, and critically no fix
  for the capture gap below.
- **App-created orders still do not build customer profiles.** Every capture
  call site (`upsertCustomerFromOrder`, `captureExternalOrderBestEffort`) lives
  in `src/` — the Next.js app. The merchant app inserts orders directly via
  `webnegosyo-app/lib/backends/supabase-adapter.ts:339` or Convex, touching
  none of them. POS sales are therefore invisible to the customer profile
  system. This is Phase 3 and must land before Phase 4, or attaching a customer
  produces a link whose statistics never move.
- **RLS is not a permission boundary here.** `customers_write_admin` checks
  `role = 'admin'`, and in this codebase all staff rows are `role='admin'`. The
  `customers` staff-permission key is enforced app-side only, so any staff
  member can read and write the full tenant PII list. Flagged in the plan as
  HIGH; unresolved, and it is a product decision rather than a code fix.
- **Race on duplicate creation.** `findCustomerByPhone` narrows the window but
  does not close it; the partial unique index plus `DuplicateCustomerError` is
  the real backstop, which is why both are tested.
- **Pre-existing type drift, not fixed here.** `Customer` in
  `src/types/database.ts` still omits `sms_opt_out` / `sms_opt_out_at`, which
  exist in the database. Out of scope for this phase.
- Screen-mount tests (the `*-screen-mount.test.ts` convention) land with the
  Phase 2 UI.

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`:

- `a438799` — `feat: validate manually-entered customers` (RED compile-time,
  GREEN 21/21)
- `4d0f914` — `feat: add customer management repo and manual-creation columns`
  (RED compile-time, GREEN 40/40, full suite 2172/2172)

No refactor commit: both modules were written to their final shape and the
suite stayed green, so there was nothing to clean up.

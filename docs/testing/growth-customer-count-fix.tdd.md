# TDD Evidence — Growth "1 customer" count fix

**Source plan:** conversational (`/ecc:plan`), memory `growth-customer-count-fix`.
**Feature:** Merchant app Growth/Insights screen reported "1 customer" for a
499-order tenant because order `customerContact` dropped the real identity.

## User journeys

- As a merchant, I want the Growth screen to show the true number of distinct
  buyers, so my per-customer and repeat-rate metrics are meaningful.
- As a merchant with a custom checkout form (phone field named `phone` / `mobile`
  / `contact_number`), I want each buyer counted once regardless of field name.
- As a merchant, I want anonymous/walk-in orders counted as walk-ins, never
  merged into a single phantom customer.

## Phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Write path — persist a canonical `customerContact` on new orders | DONE (prior session) |
| 2 | Read side — resolve legacy/cross-channel identity in `getCustomerInsights` | DONE (this session) |
| 3 | Backfill historical Convex orders | PENDING (needs per-tenant deploy) |
| 4 | Growth screen label consistency | PENDING |

## Phase 2 task report

**Summary:** Added `resolveAnalyticsContact(contact, customerData)` to
`convex-template/convex/customerIdentity.ts` and wired it into
`getCustomerInsights` (`convex-template/convex/analytics.ts`). It resolves one
canonical key per real person — normalized PH E.164 phone first, then lowercased
email — from the stored contact OR `customerData`, so legacy orders (blank/
placeholder contact) and cross-channel format drift (`09...` vs `+639...`) group
together. Genuinely anonymous orders resolve to `""` and are tallied as walk-ins.

- **RED:** `npx jest tests/unit/convex-customer-identity.test.ts` → 10 failed
  (`resolveAnalyticsContact is not a function`), 2 passed (existing-helper sanity).
- **GREEN:** same command → 12 passed.
- **Regression + typecheck:** `npx jest tests/unit/convex-customer-identity.test.ts
  tests/unit/customer-identity-lib.test.ts` → 30 passed; `tsc --noEmit` in
  `convex-template` → clean.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | E.164 contact preserved (web orders) | `convex-customer-identity.test.ts` | unit | PASS |
| 2 | Legacy raw phone (`09...`/`9...`) normalized to E.164 → groups with web | `convex-customer-identity.test.ts` | unit | PASS |
| 3 | Phone recovered from `customerData` when contact blank (the bug) | `convex-customer-identity.test.ts` | unit | PASS |
| 4 | Real phone recovered even under a placeholder contact | `convex-customer-identity.test.ts` | unit | PASS |
| 5 | Two different phones stay two distinct customers | `convex-customer-identity.test.ts` | unit | PASS |
| 6 | Email fallback, lowercased | `convex-customer-identity.test.ts` | unit | PASS |
| 7 | Phone preferred over email | `convex-customer-identity.test.ts` | unit | PASS |
| 8 | Anonymous → `""` (walk-in, never a phantom customer) | `convex-customer-identity.test.ts` | unit | PASS |
| 9 | Malformed `customerData` (null/string/number) doesn't throw | `convex-customer-identity.test.ts` | unit | PASS |
| 10 | Non-PH identifiable contact stays a stable key | `convex-customer-identity.test.ts` | unit | PASS |

## Coverage / known gaps

- Pure resolver logic is fully unit-covered. `getCustomerInsights` itself is a
  Convex query (no runner in `convex-template`); its per-order grouping delegates
  entirely to the tested resolver, so behavior is covered at the unit boundary.
- **Phase 3 (backfill)** still required for the *existing* 499 orders to recount
  on-device; Phase 2 fixes the read for any order whose `customerData` carries the
  identity, but orders with neither a resolvable contact nor `customerData` remain
  walk-ins. Ships via prebundle + `CURRENT_SCHEMA_VERSION` bump + per-tenant deploy.

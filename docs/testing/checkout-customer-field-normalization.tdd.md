# TDD Evidence — Checkout Customer-Field Normalization

**Task:** Normalize all order-type/checkout customer fields (especially phone
numbers and email) so the customer database is stored in one clean, canonical
shape.

**Source plan:** None — journeys derived during this TDD run from the user request
via `/ecc:tdd-workflow`.

**Branch:** `feat/unified-modifier-groups`

## User journey

> As a merchant, I want every customer field captured at checkout (phone, email,
> name, address) stored in a normalized, canonical form, so my customer database
> is clean: the same person's phone always looks identical (E.164 `+639XXXXXXXXX`),
> emails are lowercased/trimmed, and names/addresses have no stray whitespace.

## What was built

- **`src/lib/customer-field-normalization.ts`** — a pure, immutable normalizer.
  `normalizeCustomerData(customerData, formFields)` returns a NEW map with each
  declared form field normalized by its `field_type`:
  - `phone` → `normalizePhoneE164` (PH E.164); falls back to a whitespace-collapsed
    copy when the number can't be confidently normalized (never blanks a typed number).
  - `email` → lowercased + trimmed.
  - `text` / `textarea` / `select` / `number` → trimmed + internal whitespace collapsed.
  - Keys that are not declared form fields (`delivery_lat`, `delivery_lng`,
    `scheduled_for`) pass through untouched; absent fields are never invented.
- **`src/hooks/useCheckout.ts`** — funnels the raw `customerData` through the
  normalizer at both submit entry points before anything is persisted or sent:
  - `handleCheckout` (Messenger message + confirmation snapshot + `createOrderAction`).
  - `handleQrHandoff` (QR payload written by the vendor scanner).
  - The delivery-fee validity guard was repointed at the RAW address (the value the
    fee was quoted for) so a whitespace-only normalization change never drops a fee.

The existing `resolveOrderContact` still derives the stable identity/dedupe key;
this change cleans the human-visible field values stored alongside it. Because the
normalizer runs before `resolveOrderContact`, phone/email identity is now derived
from already-canonical input (idempotent).

## Task report

| Step | Command | Result |
|------|---------|--------|
| RED  | `npx jest customer-field-normalization` | FAIL — `Cannot find module '@/lib/customer-field-normalization'` (test compiled + executed, failed for the intended reason: implementation absent) |
| GREEN | `npx jest customer-field-normalization` | PASS — 16/16 |
| Regression | `npx jest` | 2030 passed; only 2 pre-existing failures in the separate `webnegosyo-app/` mobile project (fail on clean HEAD too — verified via `git stash`) |
| Typecheck | `npx tsc --noEmit` | No errors in touched files |
| Lint | `npx eslint src/hooks/useCheckout.ts src/lib/customer-field-normalization.ts` | Clean |
| Coverage | `npx jest customer-field-normalization --coverage --collectCoverageFrom=src/lib/customer-field-normalization.ts` | 98.85% stmts / 94.44% branch / 100% funcs |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | Local PH mobile (`0917...`) becomes E.164 `+639171234567` | `normalizePhoneField` | unit | PASS |
| 2 | E.164 input is idempotent | `normalizePhoneField` | unit | PASS |
| 3 | Un-normalizable number is kept (trimmed), never blanked | `normalizePhoneField` | unit | PASS |
| 4 | Email is lowercased + trimmed | `normalizeEmailField` | unit | PASS |
| 5 | Free text is trimmed + whitespace-collapsed (incl. newlines/tabs) | `normalizeTextField` | unit | PASS |
| 6 | Value is routed by `field_type` (phone/email/text/textarea/select/number) | `normalizeCustomerFieldValue` | unit | PASS |
| 7 | Whole `customerData` map normalized per declared type | `normalizeCustomerData` | unit | PASS |
| 8 | Input object is not mutated (immutability) | `normalizeCustomerData` | unit | PASS |
| 9 | Non-form keys (lat/lng/scheduled_for) pass through untouched | `normalizeCustomerData` | unit | PASS |
| 10 | Fields absent from data are not invented as empty keys | `normalizeCustomerData` | unit | PASS |

## Coverage and known gaps

- New module: 98.85% stmts / 94.44% branch / 100% funcs. The single uncovered line
  is the `default:` arm of the `field_type` switch — unreachable through the closed
  `field_type` union; kept as a defensive fallback.
- **Server-side normalization is intentionally out of scope here.** The web write
  path now sends normalized data, but `createOrderAction` / `orders-service.ts` still
  store `customer_data` as received (they only truncate). A future hardening phase
  could re-normalize server-side (requires fetching `customer_form_fields` types) and
  backfill historical rows. This mirrors the deferred read-side hardening noted for
  the customer-identity layer.
- The `webnegosyo-app/` mobile app has its own separate checkout store and is not
  covered by this change.

## Merge evidence (for squash)

RED: new suite failed on missing module. GREEN: 16/16 pass, full web suite green
(2030 passed, 2 unrelated pre-existing mobile failures). Refactor: none needed —
module is pure and minimal. Commits: `test: RED reproducer…` → `feat: normalize
checkout customer fields by type (GREEN)`.

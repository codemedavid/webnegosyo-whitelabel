# TDD evidence — multi-branch selection timing (before the menu vs at checkout)

**Branch**: `feat/platform-supabase-order-parity`
**Commits**: `e45a5d1` → `bdaf683` (6 checkpoints, RED/GREEN alternating)
**Date**: 2026-07-28 / 2026-07-29

## Source plan

No `*.plan.md` artifact was written. The plan was produced inline by `/ecc:plan` from this
request and confirmed with "proceed":

> "add an option to choose between choose first or choose after on the multi branch feature.
> So the choose first allows customer to choose dine pick up delivery and outlet first then
> they see the menu. On the choose after. They see the menu first and on the check out they
> choose the outlet and they can use the normal checkout"

Interpretation recorded at planning time: this is a **per-tenant** option on the existing
multi-branch feature, not a per-customer one, and `before` must remain the default so no
already-live tenant changes behaviour.

## User journeys

1. **As a merchant with several branches**, I want to choose *when* customers are asked which
   branch, so the question fits how my shop actually works.
2. **As a customer of a "before" tenant**, I want the branch chooser over the menu exactly as
   it works today, so nothing I already know changes.
3. **As a customer of an "after" tenant**, I want to browse the menu immediately and pick the
   branch at checkout beside the order type, so nothing stands between me and the food.
4. **As a customer placing a delivery order**, I want to only be offered branches that can
   actually deliver, so I cannot place an order a branch is unable to serve.
5. **As a customer who changes the order type at checkout**, I want a branch that can no longer
   fulfill my order to be dropped, so a stale choice never rides along silently.
6. **As a single-location merchant**, I want none of this to appear, so my storefront is
   unchanged.

## Task report

### Task 1 — Timing resolution and the two mutually exclusive flows

Added `src/lib/outlets/selection-timing.ts`: `resolveOutletSelectionTiming`,
`shouldGateMenuForOutlet`, `shouldPickOutletAtCheckout`. Anything not exactly `'after'` — a
missing column, `null`, a typo — reads as `'before'`.

- RED (`e45a5d1`): `npx jest --testPathPatterns="outlets-selection-timing"` →
  `Cannot find module '@/lib/outlets/selection-timing'`
- GREEN (`d85038b`): same command → passing
- Guarantees: default is `'before'` at every layer; the gate and the checkout picker are never
  both active; both require the flag on **and** two or more **active** branches.

### Task 2 — Order type → mode, and narrowing branches to it

The shipped flow maps mode → order type (`resolveOrderTypeIdForMode`). The `after` flow needs
the inverse, so the chosen order type narrows which branches are offered. Added
`resolveModeForOrderType` and `src/lib/outlets/checkout-outlet.ts`
(`resolveCheckoutOutletSelection`), which reuses `rankOutlets` for eligibility and ordering and
only adds the keep-or-drop rule for the current selection.

- RED (`e45a5d1`): `npx jest --testPathPatterns="checkout-outlet-selection"` →
  `Cannot find module '@/lib/outlets/checkout-outlet'`
- GREEN (`d85038b`): same command → passing
- Guarantees: a delivery order is never offered a dine-in-only branch; a single eligible branch
  is auto-selected; a still-valid selection survives an order-type change; a deactivated or
  newly-ineligible one is dropped to `null`; input is not mutated. A non-branch custom order
  type (e.g. "catering") maps to no mode, so all active branches are offered.

### Task 3 — The menu gate stands down under "after"

`OutletGate` now guards on `shouldGateMenuForOutlet` instead of `isMultiBranchEnabled(tenant) &&
outlets.length < 2`. Side benefit: the count is now of *active* branches, which the old check
was not.

- RED (`6e1c196`): `npx jest --testPathPatterns="outlet-gate-timing"` → 1 failing of 4 —
  the splash still rendered under `outlet_selection_timing: 'after'`
- GREEN (`b14425c`): same command → 4 passing
- Guarantees: splash shows under `'before'` and when the column is absent; renders nothing under
  `'after'`; renders nothing with the flag off.

### Task 4 — Schema, service, and storefront plumbing

`supabase/migrations/20260801120000_outlet_selection_timing.sql` adds one defaulted `TEXT`
column with a `CHECK (… IN ('before','after'))`. Also wired: `src/types/database.ts`, the zod
schema and both write payloads in `src/lib/tenants-service.ts`, and — guarding the known
storefront SELECT-drift hazard — `src/lib/queries/tenant-storefront-select.ts`.

- Validation: `npx tsc --noEmit` → no `src/` errors
- Note: the legacy `tenant-form.tsx` does not edit this field but now passes the tenant's own
  value through, so saving there cannot silently move the question back to the splash.

### Task 5 — Superadmin control

A `Select` in the **Branches** card, shown only when `multi_branch_enabled` is on.

- Validation: `npx tsc --noEmit` → clean. An earlier edit landed the control in the Branding
  card by mistake; caught by inspection and moved before the GREEN commit.

### Task 6 — The checkout-time picker

`useCheckoutOutlet` resolves the branch under **both** timings — reading the splash's stored
answer under `'before'`, fetching + narrowing under `'after'` — which let `useCheckout` replace
its submit-time `localStorage` read with a single `outlet.selectedOutletId`.
`CheckoutOutletSection` renders from the page shell, so all five checkout designs get it from
one place. Submit is blocked with a toast while the question is unanswered.

- RED (`e417143`): `npx jest --testPathPatterns="use-checkout-outlet"` →
  `Cannot find module '@/lib/outlets/outlets-client'`
- RED (`665f0ab`): `npx jest --testPathPatterns="checkout-outlet-section"` →
  `Cannot find module '.../checkout-outlet-section'`
- GREEN (`bdaf683`): both → 12 passing; `npm run test` → 279 suites / 3389 passing

## Test specification

| # | What is guaranteed | Test file | Type | Result |
|---|---|---|---|---|
| 1 | A missing, null, or unrecognised timing column reads as `'before'` | `tests/unit/outlets-selection-timing.test.ts` | unit | PASS |
| 2 | The menu gate and the checkout picker are never both active | `tests/unit/outlets-selection-timing.test.ts` | unit | PASS |
| 3 | Both flows require the flag on and ≥2 **active** branches | `tests/unit/outlets-selection-timing.test.ts` | unit | PASS |
| 4 | Each order type maps back to its mode; renamed labels still match; unknown/custom types map to none | `tests/unit/outlets-mode-order-type.test.ts` | unit | PASS |
| 5 | Only branches that can fulfill the chosen order type are offered | `tests/unit/checkout-outlet-selection.test.ts` | unit | PASS |
| 6 | A selection the new order type cannot fulfill is dropped to null | `tests/unit/checkout-outlet-selection.test.ts` | unit | PASS |
| 7 | A single eligible branch is auto-selected; several leave it unset | `tests/unit/checkout-outlet-selection.test.ts` | unit | PASS |
| 8 | The splash shows under `'before'` and when the column is absent | `tests/unit/outlet-gate-timing.test.tsx` | unit (RTL) | PASS |
| 9 | The splash renders nothing under `'after'` or with the flag off | `tests/unit/outlet-gate-timing.test.tsx` | unit (RTL) | PASS |
| 10 | Branches are fetched only for `'after'` tenants — never for `'before'` or flag-off | `tests/unit/use-checkout-outlet.test.tsx` | unit (RTL) | PASS |
| 11 | The `'before'` path reuses the branch already stored by the splash | `tests/unit/use-checkout-outlet.test.tsx` | unit (RTL) | PASS |
| 12 | Changing the order type drops an outgrown branch and re-blocks submit | `tests/unit/use-checkout-outlet.test.tsx` | unit (RTL) | PASS |
| 13 | Single-location tenants get no branch on the order and no picker | `tests/unit/use-checkout-outlet.test.tsx` | unit (RTL) | PASS |
| 14 | The section lists every offered branch and reports the choice back | `tests/unit/checkout-outlet-section.test.tsx` | unit (RTL) | PASS |
| 15 | The section renders nothing when there is no question to ask | `tests/unit/checkout-outlet-section.test.tsx` | unit (RTL) | PASS |
| 16 | The chosen branch is `aria-pressed` for assistive technology | `tests/unit/checkout-outlet-section.test.tsx` | unit (RTL) | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom="src/lib/outlets/**/*.ts" \
  --collectCoverageFrom="src/hooks/use-checkout-outlet.ts" \
  --collectCoverageFrom="src/components/customer/checkout-templates/checkout-outlet-section.tsx"

All files                     |   91.94 |    99.31 |   97.61 |   91.94
  checkout-outlet-section.tsx |     100 |      100 |     100 |     100
  use-checkout-outlet.ts      |     100 |      100 |     100 |     100
  checkout-outlet.ts          |     100 |      100 |     100 |     100
  selection-timing.ts         |     100 |      100 |     100 |     100
  outlets-client.ts           |       0 |        0 |       0 |       0
```

Full suite: `npm run test` → **279 suites passed, 3389 tests passed, 8 skipped**.
Lint: `npm run lint` → no new errors from these files (one pre-existing
`exhaustive-deps` warning in `useCheckout.ts:364`, untouched by this work).

## Known gaps

- **`src/lib/outlets/outlets-client.ts` is at 0%.** It is a thin Supabase read that the hook
  tests mock. Its failure path (log + return `[]`, which degrades to "no question to ask") is
  reasoned, not executed by a test.
- **The migration is written but NOT applied.** `20260801120000_outlet_selection_timing.sql`
  must be run before any tenant can be switched to `'after'`. Until then every tenant reads as
  `'before'` — the shipped behaviour — because the storefront tenant read retries with `*` on
  undefined-column errors and the lib layer defaults anything unexpected to `'before'`.
- **No E2E.** The full "browse → checkout → pick branch → order lands on that branch" path is
  covered by unit tests at each seam, not end to end in a browser.
- **The `'after'` picker is not styled per checkout design.** It renders in the shell above the
  form with neutral styling under the `checkout/colors` branding scope; a design-specific
  treatment is a follow-up, not a correctness gap.

## Merge evidence

If these six commits are squashed, the RED/GREEN record above is the surviving proof. Each
production change was preceded by a compiled, executed, failing test whose failure was caused by
the missing implementation — never by broken setup. One RED (Task 3) was a runtime failure of an
existing-module assertion; the rest were compile-time REDs on modules that did not yet exist.

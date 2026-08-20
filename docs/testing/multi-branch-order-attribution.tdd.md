# TDD Evidence — Multi-branch orders must always name a branch

**Date:** 2026-08-20 · **Branch:** `worktree-merchant-mcp` · **Commits:** `6d44017..f9c8558`

## Source plan

No `*.plan.md`. Journeys were derived in this TDD run from two parallel
investigation subagents (outlet-selection flow trace + order-creation
`outlet_id` audit) triggered by: "orders on a multi-branch brand must always
ask which branch, so nothing lands on the Unassigned branch."

## User journeys

1. As a customer on a multi-branch store, when my saved branch choice is gone
   (expired, wiped, new device, direct checkout link), I am asked for the
   branch at checkout instead of my order silently going nowhere.
2. As a customer arriving through a `/b/{slug}` branch QR link, my order is
   attributed to the branch the link named, under either selection timing.
3. As a customer browsing while the branch list is still loading, my
   already-chosen branch is not deleted by the loading state.
4. As a merchant, a branch I deactivate stops receiving orders — a customer
   whose saved choice points at it is asked to pick again.

## Task report (RED → GREEN, all on this branch)

| Defect | RED commit / evidence | GREEN commit / evidence |
|---|---|---|
| Loading branch list wipes stored choice (product-detail via `useBranchPricing`) | `6d44017` — `npx jest outlets-selection-survives-load` → 3 failed ("stored key deleted while loading") | `dc06bd8` — same target → 4 passed |
| `before`-timing checkout submits with no branch (no stored choice / QR-only arrival) | `16b5434` — `npx jest checkout-outlet-before-timing-net` → 5 of 6 failed (`isMissingRequiredSelection` stayed false, fetch never fired) | `170a3d7` — 6/6 passed; all 7 checkout-outlet suites (57 tests) passed |
| Stored branch trusted verbatim even after merchant deactivated it (found by code-reviewer agent, HIGH) | `34ace51` — 2 tests failed ("o-ghost" returned as `selectedOutletId`) | `f9c8558` — 7/7 passed; 31 outlet suites / 523 tests passed |

The first defect's RED/GREEN pair was cherry-picked from `2f05a48`/`a4a6c3d`
(the fix existed only on side branches and was missing from both this branch
and `origin/main` — a live regression).

## What is guaranteed

| # | Guarantee | Test | Result |
|---|---|---|---|
| 1 | An in-flight (empty) branch list never clears the stored branch; a failed fetch never counts as "no branches" | `tests/unit/outlets-selection-survives-load.test.tsx` | PASS |
| 2 | `before`-timing checkout with no stored choice blocks submit and offers the branch picker | `checkout-outlet-before-timing-net.test.tsx` "blocks the order…" | PASS |
| 3 | A `/b/{slug}` linked branch takes the order under `before` timing | "…branch the QR link named" | PASS |
| 4 | The fallback picker's tap lifts the block and rides into the order | "accepts the branch tapped…" | PASS |
| 5 | A single active branch is auto-attributed, not dropped | "auto-picks the only branch…" | PASS |
| 6 | A valid stored choice is honored instantly and survives background validation | "keeps a stored splash choice…" | PASS |
| 7 | A deactivated stored branch is dropped and the customer is re-asked | "drops a stored branch the merchant has since deactivated…" | PASS |
| 8 | Tenant with zero branches degrades to branchless checkout (setup gap, no stranding) | "degrades to a branchless checkout…" | PASS |
| 9 | `after`-timing behavior unchanged | `use-checkout-outlet.test.tsx`, `checkout-outlet-journey/first-paint/screen` suites | PASS |

Enforcement chokepoints (pre-existing, verified): `checkout/page.tsx:50`
replaces the whole checkout with `CheckoutOutletScreen` while
`isMissingRequiredSelection`; `useCheckout.ts:945` blocks submit on it.

## Validation commands

- `npx jest checkout-outlet outlets- use-checkout use-branch` → **31 suites, 523 tests, all pass**
- `npm test` → 6010 passed / 34 failed — the 34 are in 5 suites (leads,
  order-token, cache, inventory-live e2e) verified to fail identically at
  clean HEAD with no working-tree changes; environment-dependent, unrelated
  to this work.
- `npx eslint` on the three touched files → clean. Repo-wide lint errors are
  pre-existing in `sms/`, `webnegosyo-app/`, `jest.config.cjs`.

## Known gaps / intentional follow-ups (NOT fixed here)

Order-creation surfaces that never send a branch at all (server accepts a
missing `outlet_id` by design, `src/lib/outlets/order-outlet.ts:9-11`):

1. **Desktop POS** (`webnegosyo-desktop`) — zero outlet references; every
   counter sale on a multi-branch tenant is Unassigned.
2. **Customer mobile app** (`mobile/`) — neither the Convex nor the Supabase
   checkout path stamps a branch.
3. **Merchant-app POS / QR scan** — uses the cashier's *account* branch
   (`app_users.outlet_id`); owners (null) produce Unassigned counter sales;
   the in-app branch selector is never consulted.
4. **Web QR-handoff payload** (`useCheckout.ts:881-899`) — drops
   `outlet.selectedOutletId` from `QrOrderPayloadV1`.
5. **`after`-timing fetch failure** lifts the requirement (documented
   deliberate degrade, `use-checkout-outlet.ts`).

Server-side rejection of branchless orders was deliberately NOT added: those
clients would start *failing* orders instead of misfiling them, which is
worse until each client is taught to send the branch.

## Merge evidence

If these commits are squashed, this file preserves the RED/GREEN record; copy
the task-report table into the PR body.

# TDD Evidence — POS Register (merchant app)

**Source plan**: none on disk. Journeys were derived during the `/ecc:plan` run in
this session and confirmed by the user via three scoping decisions (see
"Decisions" below). No `*.plan.md` artifact was produced.

**Scope**: a fourth workspace view in `webnegosyo-app` for counter sales, with
cash tendered/change, QR display for e-wallets, mandatory payment-confirmation
photo before completion, and cash/change printed on the receipt.

---

## Decisions taken before implementation

| Decision | Chosen | Consequence |
|---|---|---|
| Order backend | Convex only (`source: "pos"`) | Tenants without `convex_deployment_url` see an explicit unavailable state; no new routing layer |
| Cash/change/proof storage | `customerData.pos` blob | No Convex schema bump; works on every already-deployed tenant. Untyped at the DB edge, typed via `PosPaymentPayload` |
| POS sales / drawer tab | In scope | Phase 9 shipped |

---

## User journeys

1. As a cashier, I want to tap products into a running sale so I can ring up a
   walk-in customer quickly.
2. As a cashier, I want to pick size/add-on options for a configurable item so
   the kitchen makes the right drink.
3. As a cashier, I want to type the cash a customer handed me and see the change
   instantly so I do not do mental arithmetic at a queue.
4. As a customer, I want the change I am owed printed on my receipt so I can
   check it.
5. As a cashier, I want to show the store's GCash QR on screen so the customer
   can scan it.
6. As a store owner, I want a payment-confirmation photo captured before any
   non-cash sale completes so I am not defrauded by a faked payment screen.
7. As a store owner, I want restricted staff to reach the register only if I
   granted them the POS permission.
8. As a store owner, I want an end-of-shift figure for what should be in the
   drawer.

---

## Task report

### 1. Register view + permission gating
Added a 4th workspace (`register`, tabs `pos` + `pos-sales`) and mapped both
tabs to the pre-existing `pos` permission key.

- **RED** — `npx jest lib/workspaces.test.ts lib/staff-permissions.test.ts`
  - `workspaces.test.ts`: *Test suite failed to run* — `TS2345: Argument of type
    '"register"' is not assignable to parameter of type 'WorkspaceKey'` (4 sites).
    Compile-time RED: the missing 4th view is exactly what the test names.
  - `staff-permissions.test.ts`: `3 failed, 6 passed, 9 total` —
    `isTabAllowed(ordersOnly, "pos")` returned `true`, expected `false`;
    `allowedWorkspaces` missing `"register"` for both owner and cashier.
- **GREEN** — same command: `2 passed, 23 passed, 23 total`.
- **Guarantees**: a POS-only cashier sees exactly Operations(dashboard) +
  Register; an orders-only staffer cannot reach either register tab; Operations
  stays at index 0 so `getWorkspace`'s unknown-key fallback is unchanged.

### 2. Cash + cart engines
`lib/pos-cash.ts` (change making, quick-tender chips) and `lib/pos-cart.ts`
(immutable line ops, service charge, modifier min/max validation).

- **RED** — `npx jest lib/pos-cash.test.ts lib/pos-cart.test.ts`: both suites
  *failed to run* — `Cannot find module './pos-cash'` / `'./pos-cart'`.
- **GREEN** — same command: `48 passed, 48 total`.
- **Guarantees**: change is centavo-exact (`99.90` paid with `100.10` → exactly
  `0.20`); a short, negative, or NaN tender is never treated as payment; quick
  tenders never suggest below the total and never exceed 4 chips; cart functions
  never mutate their input; identical configurations stack while different sizes
  stay separate; a fixed service charge applies once, not per item.

### 3. Receipt cash block
Extended `ReceiptOrder` with optional `cashTendered` / `changeDue` /
`paymentReference`. **`receipt-formatter.ts` had no test file before this work.**

- **RED** — `npx jest lib/receipt-formatter.test.ts`: *failed to compile* —
  `TS2353: 'cashTendered' does not exist in type 'ReceiptOrder'` (5 sites).
- **GREEN** — same command: `11 passed, 11 total`.
- **Guarantees**: `CASH:`/`CHANGE:` print only when **both** halves are present,
  so every pre-POS receipt is byte-identical (explicitly regression-tested);
  the block prints after `TOTAL:`; exact-change sales still print `CHANGE: P0.00`;
  no line exceeds the configured paper width, including a ₱100,000 tender and an
  80-character reference.

### 4. Order builder
`lib/pos-order.ts` — cart + tender → `orders:createOrder` args.

- **RED** — `npx jest lib/pos-order.test.ts`: *failed to run* — `TS2307 Cannot
  find module './pos-order'`.
- **GREEN** — same command: `19 passed, 19 total`.
- **Guarantees**: `source: "pos"` (Convex already skips the pending queue for it);
  selections map to the `variationSelections` shape Convex expects; existing
  `customerData` is preserved, not overwritten; cash fields never appear on a
  non-cash sale; **an empty cart throws** and **a short-paid cash sale throws**,
  so the register cannot write an under-paid order.

### 5. Payment-method classification
`lib/pos-payment-methods.ts` — which methods open the cash keypad, which gate on
a photo.

- **RED** — `npx jest lib/pos-payment-methods.test.ts`: *failed to run* —
  `TS2307 Cannot find module './pos-payment-methods'`.
- **GREEN** — same command: `11 passed, 11 total`.
- **Guarantees**: `payment_methods` has no `is_cash` column, so cash is inferred
  from the name with a **whole-word anchored** regex — `GCash` (a wallet ending
  in "cash") is explicitly tested as NOT cash; every non-cash method requires a
  photo, and a merchant's explicit `require_payment_proof` still forces one on a
  cash method.

### 6. Folder-aware image upload
Generalized `uploadProductImage` → `uploadImage(image, folder)`.

- **RED** — `npx jest lib/product-image-upload.test.ts`: *failed to compile* —
  `TS2305: no exported member 'uploadImage' / 'PAYMENT_PROOF_FOLDER' /
  'PRODUCT_IMAGE_FOLDER'`.
- **GREEN** — same command: `8 passed, 8 total`.
- **Guarantees**: proofs upload to `payment-proofs`; a regression test asserts
  product photos still upload to `menu-items` and that no call site changed.

### 7. Drawer reconciliation
`lib/pos-sales.ts` — end-of-shift totals.

- **RED** — `npx jest lib/pos-sales.test.ts`: *failed to run* — `TS2307 Cannot
  find module './pos-sales'`.
- **GREEN** — same command: `8 passed, 8 total`.
- **Guarantees**: web and QR-handoff orders are excluded; cancelled sales are
  excluded from every figure; cash and non-cash are separated using the *same*
  name rule as the tender screen so the drawer and the keypad cannot disagree; a
  sale with no recorded method counts as non-cash (understates the drawer rather
  than overstating it); a sale with no POS payload does not throw.

### 8. Supabase reads for the register
`lib/pos-catalog.ts` — order types and payment methods.

- **Deviation from strict TDD, stated plainly**: this module was written as
  screen plumbing *before* its tests, then covered retroactively
  (`lib/pos-catalog.test.ts`, `11 passed, 11 total`). It is the only module in
  this work that did not go RED-first.
- **Guarantees**: the payment-method query is an **inner** join on
  `payment_method_order_types` — asserted explicitly, because the storefront
  filters that way and a divergence would let the register accept payments the
  customer-facing checkout refuses; query errors surface rather than returning
  an empty list; a disabled service charge maps to `undefined`.

### 9. Screens
`app/(main)/pos.tsx`, `pos-tender.tsx`, `pos-sales.tsx`; components
`ModifierSheet`, `CartPanel`, `ProofCapture`, `SwipeToComplete`; store
`stores/pos-cart-store.ts`; tab wiring in `_layout.tsx`.

Not unit-tested — `jest.config.js` scopes `roots` to `lib/` and `theme/` by
design ("Component/UI tests are out of scope here — screens are exercised
manually via Expo"). All screen *logic* was pushed into the tested pure modules
above. Verified by `tsc --noEmit` and ESLint; see "Known gaps".

---

## Test specification

| # | What is guaranteed | Test file / name | Type | Result | Evidence |
|---|---|---|---|---|---|
| 1 | A pos-only cashier gets the Register view and no analytics/menu tabs | `lib/staff-permissions.test.ts:gives a pos-only cashier the register view and nothing else` | unit | PASS | `npx jest lib/staff-permissions.test.ts` |
| 2 | Register tabs are unreachable without the `pos` permission | `lib/staff-permissions.test.ts:gates the register tabs behind the pos permission` | unit | PASS | same |
| 3 | Operations stays the unknown-key fallback view | `lib/workspaces.test.ts:keeps operations first...` | unit | PASS | `npx jest lib/workspaces.test.ts` |
| 4 | Change is centavo-exact, free of float drift | `lib/pos-cash.test.ts:rounds to whole centavos instead of leaking float noise` | unit | PASS | `npx jest lib/pos-cash.test.ts` |
| 5 | A short/negative/NaN tender is never accepted as payment | `lib/pos-cash.test.ts:reports insufficient...`, `:never treats a negative tender as payment`, `:rejects non-finite input` | unit | PASS | same |
| 6 | Quick-tender chips never suggest less than the total | `lib/pos-cash.test.ts:never suggests less than the total` | unit | PASS | same |
| 7 | Cart operations never mutate the caller's array | `lib/pos-cart.test.ts:does not mutate the cart it was given` (×3) | unit | PASS | `npx jest lib/pos-cart.test.ts` |
| 8 | Identical configurations stack; different options stay separate | `lib/pos-cart.test.ts:stacks quantity...`, `:keeps differently-configured lines...` | unit | PASS | same |
| 9 | A required modifier group blocks adding the line | `lib/pos-cart.test.ts:flags a required group left unselected` | unit | PASS | same |
| 10 | Fixed service charge applies once, not per item | `lib/pos-cart.test.ts:applies a fixed service charge once, not per item` | unit | PASS | same |
| 11 | Cash and change print on the receipt after the total | `lib/receipt-formatter.test.ts:prints what the customer handed over...`, `:prints the cash block after the total` | unit | PASS | `npx jest lib/receipt-formatter.test.ts` |
| 12 | Non-POS receipts are unchanged (no CASH/CHANGE block) | `lib/receipt-formatter.test.ts:prints no cash block for an order that was not paid in cash` | unit | PASS | same |
| 13 | No receipt line exceeds the paper width | `lib/receipt-formatter.test.ts:keeps every line within the configured width`, `:keeps cash lines within...`, `:truncates an over-long reference` | unit | PASS | same |
| 14 | An empty cart cannot become an order | `lib/pos-order.test.ts:refuses to build an order from an empty cart` | unit | PASS | `npx jest lib/pos-order.test.ts` |
| 15 | A short-paid cash sale cannot become an order | `lib/pos-order.test.ts:refuses to build a cash order whose tender does not cover the total` | unit | PASS | same |
| 16 | Cash fields never leak onto a non-cash sale | `lib/pos-order.test.ts:does not put cash fields on a non-cash sale` | unit | PASS | same |
| 17 | Existing customerData (e.g. advance-order schedule) survives | `lib/pos-order.test.ts:preserves any existing customerData rather than overwriting it` | unit | PASS | same |
| 18 | A malformed customerData blob returns null, never throws | `lib/pos-order.test.ts:returns null rather than throwing on a malformed blob` | unit | PASS | same |
| 19 | GCash is not misclassified as cash | `lib/pos-payment-methods.test.ts:is not fooled by 'cash' appearing inside another word` | unit | PASS | `npx jest lib/pos-payment-methods.test.ts` |
| 20 | Every non-cash method requires a confirmation photo | `lib/pos-payment-methods.test.ts:requires a confirmation photo for every non-cash method` | unit | PASS | same |
| 21 | Proofs upload to payment-proofs; products still to menu-items | `lib/product-image-upload.test.ts:uploads a payment proof...`, `:keeps routing product images...` | unit | PASS | `npx jest lib/product-image-upload.test.ts` |
| 22 | Cancelled and non-POS orders are excluded from the drawer | `lib/pos-sales.test.ts:excludes cancelled sales from every total`, `:counts only counter sales` | unit | PASS | `npx jest lib/pos-sales.test.ts` |
| 23 | Cash and non-cash takings are reported separately | `lib/pos-sales.test.ts:separates the cash drawer from non-cash takings` | unit | PASS | same |
| 24 | Payment methods are inner-joined to the order type | `lib/pos-catalog.test.ts:inner-joins the order-type link so unlinked methods are never offered` | integration (mocked Supabase) | PASS | `npx jest lib/pos-catalog.test.ts` |
| 25 | Supabase errors surface rather than returning an empty list | `lib/pos-catalog.test.ts:surfaces a query error instead of silently returning nothing` (×2) | integration (mocked Supabase) | PASS | same |

---

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/pos-*.ts'

File                    | % Stmts | % Branch | % Funcs | % Lines
------------------------|---------|----------|---------|--------
All files               |     100 |    97.53 |     100 |     100
 pos-cart.ts            |     100 |       95 |     100 |     100
 pos-cash.ts            |     100 |      100 |     100 |     100
 pos-catalog.ts         |     100 |      100 |     100 |     100
 pos-order.ts           |     100 |       96 |     100 |     100
 pos-payment-methods.ts |     100 |      100 |     100 |     100
 pos-sales.ts           |     100 |      100 |     100 |     100
```

Full suite and static checks:

```
npx jest         -> Test Suites: 24 passed, Tests: 349 passed, 0 failed
npx tsc --noEmit -> exit 0
npx eslint <new POS files> -> 0 errors, 0 warnings
```

(Pre-existing lint errors remain in `lib/modifier-groups.test.ts`,
`lib/products.test.ts`, and `lib/printer.ts`. They are untouched by this work.)

---

## Known gaps and follow-ups

1. **Payment proofs are not auto-purged.** POS proofs upload to **ImageKit**
   (`payment-proofs` folder), but the web app's purge-on-payment-verified sweep
   deletes from **Cloudinary**. Register-captured proofs therefore accumulate.
   Not a blocker — merchant-captured, not customer PII-heavy — but it should be
   unified with the Cloudinary sweep.
2. **`lib/pos-catalog.ts` was not written RED-first** (see task 8). Covered
   retroactively at 100%.
3. **Screens have no automated tests.** `jest.config.js` deliberately scopes to
   `lib/` and `theme/`. Screen logic lives in the tested pure modules, but the
   wiring itself — swipe gesture, camera capture, tab visibility — is verified
   only by `tsc`, ESLint, and manual Expo runs. **Not yet run on a device.**
4. **`receipt-formatter.ts` is at 58% line coverage.** The new cash/reference
   paths are fully covered; the uncovered remainder is pre-existing
   bundle-grouping and add-on rendering that had no tests before this work.
5. **Convex `updatePaymentStatus` failure is swallowed** (logged via
   `console.warn`) so a completed sale is never lost to a follow-up call. The
   order is created and correct; only `paymentStatus` may lag at `pending`.
6. **Not verified end-to-end against a live tenant.** No counter sale has been
   rung up against a real Convex deployment or printed on physical hardware.

---

## Merge evidence

Checkpoint commits on `feat/unified-modifier-groups`, oldest first:

| Commit | Stage |
|---|---|
| `a003867` | RED — register view + pos gating |
| `effb0a0` | GREEN — register view + pos gating |
| `14608b2` | RED — cash + cart engines |
| `ddde754` | GREEN — cash + cart engines |
| `a0cafbd` | RED — receipt cash block + order builder |
| `c8f1f20` | GREEN — receipt cash block + order builder |
| `432be6b` | RED — payment-method classification |
| `94c6c74` | GREEN — payment-method classification |
| `6882e4f` | RED+GREEN — folder-aware upload (RED quoted in commit body) |
| `4690a13` | RED+GREEN — drawer summary + all screens (RED quoted in body) |
| `889d388` | pos-catalog coverage + this report |

Note: commits from a concurrent session on this branch (inventory stock
depletion) are interleaved with the above. Only the commits listed here belong
to this work.

If these are squashed, this file is the surviving record of what was verified
and how.

## Follow-up: register screen redesign (2026-07-26)

The first register layout shipped functional but visually poor — tall text-only
tiles, a permanently-open 220px cart that still showed nothing, and a search
field under the notch. The redesign is presentational except for one derived
value, which went through its own RED/GREEN cycle.

| Stage | Evidence |
|---|---|
| RED | `npx jest lib/pos-cart.test.ts` → `lib/pos-cart.test.ts:6:3 - error TS2305: Module '"./pos-cart"' has no exported member 'quantityByItem'.` — Test Suites: 1 failed |
| GREEN | `npx jest lib/pos-cart.test.ts` → Test Suites: 1 passed, Tests: 38 passed |

New guarantees:

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 26 | An empty cart yields no tile badges | `lib/pos-cart.test.ts:returns an empty map for an empty cart` | PASS |
| 27 | The badge counts units, not lines | `lib/pos-cart.test.ts:counts units, not lines` | PASS |
| 28 | Separate lines of one item sum into a single badge | `lib/pos-cart.test.ts:sums separate lines of the same item...` | PASS |
| 29 | Different items keep separate counts | `lib/pos-cart.test.ts:keeps different items separate` | PASS |

Full suite after the redesign: `npx jest` → 24 suites, 353 tests passed.
`npx tsc --noEmit` → exit 0. `npx eslint` on every touched file → clean.

Unchanged gap: the screens themselves are still outside the jest roots, so the
collapse behaviour, the backdrop, and the notch padding are verified by
typecheck and lint only — not by an executed test or a device run.

| Commit | Stage |
|---|---|
| `809e70e` | RED — tile quantity badges |
| `74e9f1a` | GREEN — tile quantity badges |
| `3c828b4` | Redesign (presentational) |

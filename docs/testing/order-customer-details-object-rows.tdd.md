# Order customer details rendered `[object Object]`

## Source plan

No `*.plan.md`. Journey derived from a merchant screenshot of the order screen
(Gungjeon Unlimited, POS dine-in order) showing:

```
CUSTOMER DETAILS
Discount        [object Object]
Pos             [object Object]
```

## User journey

As a merchant reviewing an order, I want the Customer Details card to show only
real customer-supplied fields, so that I am not shown internal blobs rendered as
`[object Object]`.

## Root cause

`app/(main)/order/[orderId].tsx` rendered every key of `order.customerData`
through `String(value)`. That blob is free-form: alongside merchant-collected
fields (address, landmark, table number) the platform stashes structured
internals — the discount breakdown (`discount`), the POS tender (`pos`), the
advance-order schedule. Non-scalar values stringify to `[object Object]`.

## Task report

| Stage | Summary | Command | Result |
|---|---|---|---|
| RED | New pure module `lib/customer-details.ts` did not exist; the reproducer failed to compile, which is the intended RED signal for the missing implementation. | `npx jest lib/customer-details.test.ts` | `TS2307: Cannot find module './customer-details'` — suite failed to run |
| GREEN | `buildCustomerDetailRows` drops hidden fields, non-scalars, and blank values; screen now maps its rows. | `npx jest lib/customer-details.test.ts` | 7 passed |
| Regression | Full app logic suite re-run after the fix. | `npx jest lib/` | 156 suites / 2479 tests passed |

Checkpoint commits (both on `feat/android-sms-followups`):

- `1cee932` test: add reproducer for [object Object] rows in order customer details
- `7ee506c` fix: stop rendering order internals as [object Object] in customer details

Two unrelated commits from a concurrent session (`83d94f9`, `3b7c5b8`) landed
between them; they do not touch these files.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Structured blobs (`discount`, `pos`) produce no rows instead of `[object Object]` | `lib/customer-details.test.ts:drops structured blobs that would render as [object Object]` | unit | PASS |
| 2 | Plain scalar fields survive with a humanised label | `…:keeps plain fields with a humanised label` | unit | PASS |
| 3 | Arrays are dropped like objects | `…:drops arrays as well as objects` | unit | PASS |
| 4 | Internal fields (PSID, lat/lng, payment proof, duplicated contact) stay hidden | `…:omits hidden internal fields` | unit | PASS |
| 5 | Null, undefined and whitespace-only values produce no row | `…:omits null, undefined and blank values` | unit | PASS |
| 6 | `false` renders as a value rather than being dropped | `…:renders booleans rather than dropping false` | unit | PASS |
| 7 | Missing `customerData` yields no rows (card hides) | `…:returns no rows when there is no customer data` | unit | PASS |

## Coverage and known gaps

- The extracted module is fully covered by the seven cases above; the
  render-side change is a direct `.map` over those rows and has no other logic.
- No screen-level render test was added — this repo tests order-screen behaviour
  through pure modules rather than RNTL, and that convention was kept.
- The equivalent web-admin order detail view was not audited in this pass; if it
  stringifies `customer_data` the same way, it needs the same treatment.
- `npx tsc --noEmit` reports one pre-existing error in
  `lib/voucher-service.test.ts` from concurrent work in this tree; unrelated and
  untouched here.

# Loyverse receipts rejected without a payment type — TDD evidence

**Reported symptom:** "orders are still not going to Loyverse even though I already
confirmed it on the app."

**Source plan:** none. Journeys derived during this TDD run from a live
investigation of tenant `Loyverse Integration Test`
(`0c42ec6d-396d-4bef-b7a3-2119ef79659a`).

## User journeys

1. As a merchant, when I confirm an order in the app, I want it to appear in
   Loyverse as a sales receipt, so my POS reporting and stock stay correct.
2. As a platform operator, when a tenant's Loyverse credentials are incomplete,
   I want that surfaced as configuration state, not as a silent per-order
   failure buried in a server log.

## Root cause

Loyverse rejects `POST /receipts` when the `payments` field is absent:

```
{"errors":[{"code":"MISSING_REQUIRED_PARAMETER",
            "details":"Field must be set",
            "field":"object.payments (line: 1, column: 162)"}]}
HTTP 400
```

`buildLoyverseReceipt` emitted `payments` only when `loyverse_payment_type_id`
was set, and `resolveLoyverseConfig` reported a tenant without one as `ready`
— documented as *"Null = push receipts without a payment line; merchant settles
in Loyverse."* That assumption is false. Any tenant with no payment type
therefore failed **every** push, permanently, with the only signal a
`console.error` on the server.

The affected tenant had `loyverse_payment_type_id = NULL`.

### Ruled out first (all verified against live systems)

| Link | Result |
|---|---|
| Tenant flag / token / store id | ready — store `684ab5a1…` valid |
| `/api/loyverse` deployed to production | live |
| `app_users` authorization gate | passes (sole superadmin) |
| Convex read-back `orders:getOrderById` | returns lines |
| `loyverse_item_map` variant ids | all 5 exist in Loyverse |
| Receipts in Loyverse (14 days) | **0**, against 4 confirmed orders |

## Task report

**Execution summary:** inverted the two tests that encoded the false
"payments is optional" assumption, then made the payment type a required
credential so every receipt carries a `payments` line.

**RED** — `npx jest tests/unit/loyverse-config.test.ts tests/unit/loyverse-order-push.test.ts`

```
● resolveLoyverseConfig › requires a payment type, because Loyverse rejects a receipt without one
  Expected: "incomplete"
  Received: "ready"
● resolveLoyverseConfig › treats a blank payment type as missing, like the other credentials
  Expected: "incomplete"
  Received: "ready"

Tests: 2 failed, 14 passed, 16 total
```

**GREEN** — `npx jest tests/unit/loyverse`

```
Test Suites: 10 passed, 10 total
Tests:       78 passed, 78 total
```

**Live end-to-end**, production route, same shape the merchant app posts:

```
POST https://www.webnegosyo.com/api/loyverse
  {"tenantId":"0c42…","orderId":"js7bfkyksxr5x00qga6ytm6s3d8ckjmr",…}

before config repair: {"success":false,"error":"Field must be set"}
after  config repair: {"success":true,"receiptNumber":"0011","unmapped":[]}
```

Confirmed present in Loyverse: receipt `0011`, order `CKJMR`, total 300.00, 1 line.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A tenant with no payment type is reported `incomplete`, naming `loyverse_payment_type_id` | `loyverse-config.test.ts:requires a payment type…` | unit | PASS |
| 2 | A whitespace-only payment type is treated as missing, like other credentials | `loyverse-config.test.ts:treats a blank payment type as missing…` | unit | PASS |
| 3 | Every built receipt carries a `payments` line | `loyverse-order-push.test.ts:always carries a payments line…` | unit | PASS |
| 4 | A fully-configured tenant still resolves `ready` with its payment type | `loyverse-config.test.ts:returns a ready config when fully configured` | unit | PASS |

## Coverage and known gaps

`npx jest tests/unit/loyverse` — 78/78 pass across all 10 Loyverse suites.
`npx eslint` on the four changed files — clean.

Two suites fail in the full run: `tests/unit/order-create-parity.test.ts` and
`tests/unit/vouchers/engine-parity.test.ts`. Both belong to the uncommitted
order-parity/dedupe work in the shared working tree; neither references
Loyverse (`grep -c loyverse` = 0). Not caused by this change.

### Follow-ups not addressed here

1. **Multi-variant items with no recorded selection still drop.** "Smart Menu"
   has a required `min_select: 1` Size group and three `lv-` variant rows, but
   no `local_key=''` base row. A confirmed order for it recorded
   `variation: null, variationSelections: null`, so `findVariantId` falls
   through to a null `baseVariantId`, the line is dropped, and the receipt has
   zero lines. Two questions remain: why the required choice was never captured
   on the order, and whether such an item should fall back to its default
   variant rather than vanish.
2. **Failures are invisible to the merchant.** A failed push for a Convex-backed
   order records nothing (no platform row) and surfaces only as a server log
   line. This defect survived precisely because of that.
3. Tenants other than the one repaired may also have a null
   `loyverse_payment_type_id`; with this change they now report `incomplete`
   rather than failing per order.

## Merge evidence

- RED: `ccce348` test: RED reproducer for Loyverse receipts rejected without a payment type
- GREEN: `d0953e9` fix: always send a Loyverse payment type so receipts are accepted
- Refactor: none required; the fix removed a branch rather than adding one.

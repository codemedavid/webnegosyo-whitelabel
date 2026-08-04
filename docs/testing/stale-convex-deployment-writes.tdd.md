# Stale Convex deployment — write-path errors

**Source plan:** none. Journeys derived from a live failure report:

```
[CONVEX M(orders:createOrder)] Server Error
ArgumentValidationError: Value does not match validator.
Path: .source
Value: "pos"
Validator: v.union(v.literal("web"), v.literal("mobile"))
```

## Diagnosis

`convex-template/convex/orders.ts` has accepted `source: "pos"` since bundle **v9**,
and the pre-built push bundle in `src/lib/convex-push-bundle.json` contains it
(verified: the bundled `orders.js` includes both `"pos"` and `"qr_handoff"`).
Head is **v18**.

The validator in the error still reads `web | mobile`, i.e. the *store's own*
Convex deployment predates v7. A live count of tenants with a Convex deployment:

| `convex_schema_version` | tenants | deploy key present |
|---|---|---|
| 18 (head) | 41 | 41 |
| 9 | 1 | 1 |
| 5 | 10 | 10 |
| 0 | 1 | 1 |
| null | 1 | 1 |

So the error is **not** an app bug: 13 stores run a bundle older than head and
cannot accept a counter sale until they are re-pushed. Fixing it for those
stores is the superadmin bulk deploy, not a code change.

What *was* an app bug: the register showed the raw validator dump to whoever was
standing at the till. Read screens have long treated validator drift as a
recoverable "this store needs a backend update" (`lib/hooks.ts`); the write paths
did not.

## User journeys

1. As a cashier, when the store's backend is too old to take a counter sale, I want
   to be told the store needs an update and that nothing was charged, so that I know
   whether to ring the sale up again.
2. As a staff member accepting a QR handoff on an old deployment, I want the same
   answer, so that a scan failure is not mistaken for a bad code.
3. As a developer, I want one definition of "the deployment is stale" shared by
   reads and writes, so that the two cannot drift apart.

## Task report

| Task | Validation command | Result |
|---|---|---|
| Add reproducer for the validator-dump message | `npx jest lib/stale-backend.test.ts` | **RED** — `TS2307: Cannot find module './stale-backend'` (the test newly references the missing module; that compile failure is the intended RED signal) |
| Implement `lib/stale-backend.ts` | `npx jest lib/stale-backend.test.ts` | **GREEN** — 8 passed |
| Wire into register tender + QR accept, de-duplicate `hooks.ts` | `npx tsc --noEmit` | clean |
| Whole app suite | `npx jest --ci` | 155 suites / 2448 tests passed |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A validator rejection of an argument *value* is read as a stale deployment | `lib/stale-backend.test.ts:recognises a validator rejection of an argument value` | unit | PASS |
| 2 | A function missing from the bundle is read as a stale deployment | `lib/stale-backend.test.ts:recognises a function that does not exist on the deployment` | unit | PASS |
| 3 | An argument the validator has never heard of is read as a stale deployment | `lib/stale-backend.test.ts:recognises an argument the validator has never heard of` | unit | PASS |
| 4 | An ordinary failure (network, stock) is **not** blamed on the deployment | `lib/stale-backend.test.ts:does not claim an ordinary failure is a stale deployment` | unit | PASS |
| 5 | The till sees actionable words, never `ArgumentValidationError` or `v.literal` | `lib/stale-backend.test.ts:replaces a validator rejection with something a cashier can act on` | unit | PASS |
| 6 | An ordinary failure's own message still reaches the merchant unchanged | `lib/stale-backend.test.ts:passes an ordinary failure through unchanged` | unit | PASS |
| 7 | A non-`Error` rejection still yields a usable sentence | `lib/stale-backend.test.ts:falls back to a usable sentence for a non-Error rejection` | unit | PASS |
| 8 | The message states the sale was not saved, since a rejected write created no order | `lib/stale-backend.test.ts:says nothing was charged, because a rejected write created no order` | unit | PASS |

## Coverage and known gaps

- `lib/stale-backend.ts` is fully covered by the eight cases above (every branch of
  both exported predicates and of `staleBackendMessage`).
- **No pre-flight version gate was added.** The app knows the tenant's recorded
  `convexSchemaVersion`, so the register could refuse to open on a store below v9.
  It deliberately does not: the recorded version can lag the real deployment, and a
  wrong gate would block a register that would otherwise work. Mapping the failure
  after the fact cannot produce that false negative.
- `components/pos/DiscountSheet.test.tsx` failed twice under full-suite load in one
  run and passed on three isolated repeats and on a clean `--ci` run. Pre-existing
  flake, untouched by this change, not investigated here.
- **Still outstanding, and the only thing that makes the reported error stop:**
  the 13 stale tenants above need the superadmin bulk Convex deploy.

## Merge evidence

RED: `TS2307` on the missing module, from a test that exercises the message the
register shows. GREEN: 8/8 in `lib/stale-backend.test.ts`, `tsc --noEmit` clean,
2448/2448 app tests. No refactor commit — `hooks.ts` was de-duplicated as part of
the fix and is covered by the existing suite.

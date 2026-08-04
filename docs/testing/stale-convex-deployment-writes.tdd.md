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

So the immediate error is a store running a bundle older than head: 13 of them
cannot accept a counter sale until they are re-pushed.

**Why those 13 were never re-pushed** is a second, real bug.
`tenants.convex_schema_version` is a **TEXT** column, and `bulkDeployConvexAction`
asked PostgREST for `convex_schema_version.lt.18`. Text compares lexically, and
lexically `"5" > "18"` and `"9" > "18"`. From the moment head passed version 10,
every tenant on a single-digit version fell out of the bulk deploy's result set
and stayed out — the button reported success and skipped exactly the oldest
deployments. The distribution above is the fingerprint of that bug: tenants are
either at head or stranded at 5/9/0/null, with nothing in between.

The selection is therefore now made in TypeScript with a numeric comparison
(`src/lib/convex-deploy-selection.ts`).

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
4. As a superadmin, I want Bulk Deploy to re-push every store that is behind —
   including the ones on single-digit versions — so that "0 updated" means
   "nothing is behind" rather than "the filter could not see them".

## Task report

| Task | Validation command | Result |
|---|---|---|
| Add reproducer for the validator-dump message | `npx jest lib/stale-backend.test.ts` | **RED** — `TS2307: Cannot find module './stale-backend'` (the test newly references the missing module; that compile failure is the intended RED signal) |
| Implement `lib/stale-backend.ts` | `npx jest lib/stale-backend.test.ts` | **GREEN** — 8 passed |
| Wire into register tender + QR accept, de-duplicate `hooks.ts` | `npx tsc --noEmit` | clean |
| Whole app suite | `npx jest --ci` (webnegosyo-app) | 155 suites / 2448 tests passed |
| Add reproducer for the lexical bulk-deploy filter | `npx jest tests/unit/convex-deploy-selection.test.ts` | **RED** — module `@/lib/convex-deploy-selection` not found |
| Implement it and use it in `bulkDeployConvexAction` | `npx jest tests/unit/convex-deploy-selection.test.ts` | **GREEN** — 7 passed |
| Web unit suite | `npx jest tests/unit --ci` | 422 suites / 5188 tests passed (1 pre-existing failure, below) |
| Lint the changed web files | `npx next lint --file src/app/actions/convex.ts --file src/lib/convex-deploy-selection.ts` | no warnings or errors |

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
| 9 | A bulk deploy selects stores on v5 and v9, which the lexical filter hid | `tests/unit/convex-deploy-selection.test.ts:selects a single-digit version that lexical comparison hid` | unit | PASS |
| 10 | A store that has never been deployed (null or blank version) is selected | `tests/unit/convex-deploy-selection.test.ts:selects a tenant that has never been deployed` | unit | PASS |
| 11 | A store already at head is left alone | `tests/unit/convex-deploy-selection.test.ts:skips a tenant already on the current version` | unit | PASS |
| 12 | A store ahead of this build is not pushed backwards onto an older bundle | `tests/unit/convex-deploy-selection.test.ts:skips a tenant ahead of this build, rather than pushing it backwards` | unit | PASS |
| 13 | An unreadable version errs toward deploying rather than skipping | `tests/unit/convex-deploy-selection.test.ts:treats an unreadable version as never deployed` | unit | PASS |
| 14 | A numeric version works too, since the column's type is not guaranteed | `tests/unit/convex-deploy-selection.test.ts:accepts a numeric version, since the column's type is not guaranteed` | unit | PASS |
| 15 | Selection preserves input order | `tests/unit/convex-deploy-selection.test.ts:preserves input order, so a deploy run reads predictably` | unit | PASS |

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
- `tests/unit/menu-engineering-classify.test.ts` failed to run during this work —
  it imported `@/lib/menu-engineering-classify` before that module existed. That
  was another session's RED state (`87e80d7`), resolved by its own GREEN commit
  (`6fc891e`); the suite passes 16/16 now. Nothing to do with this change.
- The bulk-deploy fix is covered as a pure function. `bulkDeployConvexAction`
  itself (superadmin check, credential filter, per-tenant loop) still has no
  test — it needs a Supabase client double that does not exist in this suite.
- **Still outstanding, and the only thing that makes the reported error stop:**
  the 13 stale tenants need the superadmin bulk Convex deploy. It will now
  actually select them.

## Merge evidence

RED: `TS2307` on the missing module, from a test that exercises the message the
register shows. GREEN: 8/8 in `lib/stale-backend.test.ts`, `tsc --noEmit` clean,
2448/2448 app tests. No refactor commit — `hooks.ts` was de-duplicated as part of
the fix and is covered by the existing suite.

# TDD evidence — Customers page crash: `query.range is not a function`

**Source plan:** none. Journeys derived from the production stack trace supplied
with the bug report.

## Symptom

Every load of `/[tenant]/admin/customers` rendered the error state added
earlier ("We couldn't load your customers."), with this on the server:

```
[customers] failed to load customers page TypeError: query.range is not a function
    at getCustomersPage (src/lib/customers-service.ts:380:17)
    at async CustomersContent (src/app/[tenant]/admin/customers/page.tsx:30:14)
```

## Root cause

`applyCustomerFilters` was declared `async` — for no reason other than a
dynamic `import('@/lib/phone')`. A PostgREST query builder is **thenable**, and
`await` on a promise that resolves to a thenable *chains into it*. So

```ts
query = await applyCustomerFilters(query, params)
```

did not return the builder: it **executed the query** and assigned the response
`{ data, error }`. Calling `.range()` on that object threw.

The count query at line 368 hid the problem. It also ran early, but the caller
destructures `{ count, error }` from it, which works fine on an
accidentally-executed query — so the failure only surfaced on the data query.

Note this is the *same class* of bug as the error-swallowing fix that preceded
it: the page previously `.catch(() => emptyResult)`-ed this exact throw and
rendered "no customers yet". The crash only became visible because that silent
fallback was removed.

## User journeys

1. As a merchant, I want to open Customers and see my customer list, so that I
   can act on my regulars.
2. As a merchant with more than one page of customers, I want page 2 to show the
   next window rather than error.
3. As a merchant with no customers yet, I want an empty list, not an error.

## Task report

**Reproduce.** Added `tests/unit/customers-page-query.test.ts`, driving
`getCustomersPage` / `getCustomersByTenant` against a fake Supabase client whose
builder is *deliberately thenable* — a non-thenable stub would pass against the
broken code and prove nothing.

```
$ npx jest --testPathPatterns=customers-page-query
Tests: 5 failed, 1 passed, 6 total

  ● getCustomersPage — query construction › returns the first page of customers instead of throwing
    TypeError: query.range is not a function
      at range (src/lib/customers-service.ts:380:17)
```

RED, failing with the exact production error at the exact production line. (The
one initial pass is the empty-list case, which returns before reaching
`.range`.) Checkpoint: `4a83135`.

**Fix.** Imported `normalizePhoneE164` statically and made
`applyCustomerFilters` synchronous; dropped `await` at its three call sites. A
comment on the function records that it must stay synchronous and why.

```
$ npx jest --testPathPatterns=customers-page-query
Tests: 6 passed, 6 total
```

Checkpoint: `9c47e4b`.

**Regression + static checks.**

```
$ npx jest --testPathPatterns=customer
Test Suites: 16 passed, 16 total
Tests:       150 passed, 150 total

$ npx tsc --noEmit | grep -E "customers-page-query|customers-service"
(no output)

$ npx eslint src/lib/customers-service.ts tests/unit/customers-page-query.test.ts
(clean)
```

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|--------------------|------|------|--------|
| 1 | The first page of customers is returned instead of throwing | `customers-page-query.test.ts:returns the first page of customers instead of throwing` | unit | PASS |
| 2 | Page 2 of size 3 requests rows 3–5, not 0–2 | `…:applies the page window as a range on the data query` | unit | PASS |
| 3 | `sort: 'top_spend'` orders by `total_spent` descending | `…:applies the requested sort column` | unit | PASS |
| 4 | Exactly two queries run — one count, one data — so filters never execute a query as a side effect | `…:runs the count query and the data query exactly once each` | unit | PASS |
| 5 | A tenant with no customers gets an empty list and no second query | `…:does not run the data query when there are no matching customers` | unit | PASS |
| 6 | `getCustomersByTenant` applies its offset window without throwing | `…:returns customers instead of throwing on the offset window` | unit | PASS |

Guarantee 4 is the real regression lock: it fails the moment anything makes the
filter helper execute the builder again.

## Coverage and known gaps

Full-suite coverage was not re-run for this fix; the changed function is covered
by the six tests above plus the 150 passing customer-domain tests. Known gaps:

- No test asserts the `search` branch's `.or(...)` / `.ilike(...)` predicate
  strings. Those paths are exercised by the fake builder but not asserted on.
- `tsc --noEmit` reports pre-existing errors in unrelated test files
  (`revalidate-menu.test.ts`, `product-detail-theme.test.ts`,
  `integrations-provisioning.test.ts`); none are in files touched here.

## Merge evidence

RED `4a83135` (5 failures, production TypeError) → GREEN `9c47e4b` (6 passed,
150 customer-domain tests passing). No refactor commit; the fix was the
simplification.

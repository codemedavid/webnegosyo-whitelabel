# Product analytics — filter performance

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from a merchant-app
screenshot of the Products screen and the report that "the filters are
destroying the UI/UX".

Two distinct problems sit behind that report. They are recorded separately
because only one of them was addressed here.

1. **Layout** — the filter groups (Period, Jump to a day, Rank by, Show per
   day, Channel, Category) were stacked inline down the screen, pushing the
   numbers below the fold. A redesign collapsing these into a Filters sheet
   plus a removable chip row already existed uncommitted in the working tree
   and is covered by `lib/product-filter-summary.test.ts` and the
   `ProductFilterSheet` / `FilterChipsRow` guardrails. **Not authored here.**
2. **Responsiveness** — typing in the search box recomputed the whole
   aggregation per character. **This is what this report covers.**

## User journeys

> As a merchant, I want to type a product name into the search box and have the
> caret keep up with my fingers, so that filtering does not feel broken.

> As a merchant with a long sales history, I want filtering to stay responsive
> as that history grows, so that the screen does not get slower every month.

## Task report

### 1. The search term was re-normalised once per line item

`matchesProduct` ran `options.search?.trim().toLowerCase()` inside the loop
over every line item — two string allocations per item, on a pass that runs
twice per recompute (current window plus the comparison window).

- **Validation command:** `npx jest lib/product-daily-analytics.test.ts`
- **RED:** `expect(reads).toBeLessThanOrEqual(2)` → `Received: 200`
- **GREEN:** 58 passed across both suites after hoisting the normalisation into
  a `ProductMatcher` resolved once per call.
- **Guaranteed:** the cost of applying the search filter no longer scales with
  the number of line items, and case-insensitive/whitespace-tolerant matching
  is unchanged (existing tests at `product-daily-analytics.test.ts:227`).

### 2. Every keystroke ran two full aggregation passes

The search box was bound directly into both `buildProductAnalytics` calls, so
each character walked every order and every line item the store has ever sold,
twice, synchronously on the JS thread.

- **Validation command:** `npx jest lib/product-analytics-screen-mount.test.ts`
- **RED:** suite failed to run — `ENOENT: lib/use-debounced-value.ts`
- **GREEN:** passes. The input stays bound to the raw `search` (asserted, so a
  later change cannot quietly make the text field itself laggy); the two
  expensive passes read a 250 ms-settled `debouncedSearch`.
- **Guaranteed:** a burst of keystrokes queues exactly one recompute, and the
  aggregation can never be re-bound to the raw keystroke value without the
  guardrail failing.

### 3. The breakdown re-rendered on keystrokes that changed nothing

The screen must re-render per character to keep the text field live. With the
inputs now debounced, `DailyProductBreakdown` was re-walking every day and row
to emit identical markup.

- **Validation command:** `npx tsc --noEmit && npx jest`
- **Result:** typecheck clean, suite unchanged. Behaviour-preserving.
- **Guaranteed:** nothing new — this is a refactor under the existing green
  tests, verified only by the suite staying green.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | Search-term normalisation is constant per call, not per line item | `lib/product-daily-analytics.test.ts:normalises the search term once per call, not once per line item` | unit | PASS | 200 → ≤2 reads |
| 2 | Search matching stays case-insensitive and whitespace-tolerant | `lib/product-daily-analytics.test.ts:matches the search term case-insensitively on the product name` | unit | PASS | pre-existing, still green |
| 3 | The text field stays bound to the raw value so typing never lags | `lib/product-analytics-screen-mount.test.ts:keeps the search box on the raw value so typing never lags` | guardrail | PASS | `npx jest` |
| 4 | The analytics core reads the debounced term, not the keystroke | `lib/product-analytics-screen-mount.test.ts:debounces the search term before it reaches the analytics core` | guardrail | PASS | `npx jest` |
| 5 | The debounce clears its pending timer rather than queuing a backlog | `lib/product-analytics-screen-mount.test.ts:clears its pending timer so a fast typist never queues a backlog` | guardrail | PASS | `npx jest` |

## Coverage and known gaps

`npx jest` — **1522 passed, 1 failed, 1523 total.** The single failure is
`lib/daily-report/parity.test.ts:67` (movement-reason parity against the web
list). It is pre-existing on this branch, unrelated to this work, and was
failing identically before the first commit here. Not fixed.

No coverage percentage is reported: this package has no coverage script
configured and `jest.config.js` restricts roots to `lib/` and `theme/`.

Deliberate gaps:

- **Tests 3–5 are source guardrails, not render tests.** `jest.config.js`
  states component/UI tests are out of scope for this package (node
  environment, `lib/` and `theme/` roots only, no React renderer installed).
  Guardrail-on-source is this repo's established substitute — the existing
  `*-screen-mount.test.ts` files all work this way. The debounce hook's runtime
  timing is therefore **not** executed by any test; it is held by review plus
  the assertions on its source. Installing `react-test-renderer` would close
  this, and was not done to avoid adding a dependency for one hook.
- **`getAllOrderItems` is still fetched unbounded.** `useSafeQuery(getAllOrderItemsRef, {})`
  pulls every line item the store has ever sold into JS memory with no limit,
  while orders are capped at 2000. This is the real ceiling on the screen and
  is untouched here — bounding it needs backend paging, not a client change.
- **Neither list is virtualised.** The lifetime view renders every menu item as
  a card inside a plain `ScrollView`, and the daily view renders days × rows.
  Default settings (Top 10 × 7 days) keep this modest, but "All" over 90 days
  is unbounded. Converting to `FlatList` with `ListHeaderComponent` is the
  follow-up; it restructures an 821-line screen and was left out of this
  change deliberately.

## Merge evidence

Checkpoints on `feat/platform-supabase-order-parity`:

- `40fc86d` — RED: reproducer, 200 reads vs ≤2 and the missing debounce seam
- `5fefb84` — GREEN: matcher hoist + debounced search wiring
- `41629f1` — refactor: `React.memo` on the breakdown, suite still green

A concurrent session interleaved three unrelated commits between RED and GREEN.
`git merge-base --is-ancestor 40fc86d HEAD` confirms the RED checkpoint is
reachable from `HEAD` on this branch.

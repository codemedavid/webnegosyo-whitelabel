# Branch management redesign — TDD evidence

**Date:** 2026-07-30
**Branch:** `feat/platform-supabase-order-parity`
**Surface:** merchant admin app (`webnegosyo-app`) — Branches + Portfolio screens

## Source plan

No `*.plan.md` was supplied. Journeys were derived during this TDD run from the
request ("redesign branch management, graphs and trends, only the KPIs that
matter for scaling, great UI/UX") plus scope decisions the user confirmed
up front:

| Decision | Chosen |
|---|---|
| Surface | Merchant app only (not web admin) |
| KPI set | Five KPIs + one bottleneck verdict per branch |
| Repeat-guest rate | Port customer-identity resolution properly rather than defer |

## Research inputs (why these five KPIs)

- **Hormozi**: revenue = customers × frequency × ticket; diagnose one constraint
  at a time; measure gross profit, not revenue; LTGP:CAC 3:1 surviving / 12:1
  scaling.
- **Multi-unit F&B operators**: the four that matter before anything else are
  prime cost, average check, repeat guest rate and break-even; sales per labour
  hour is the fastest weekly efficiency read; and multi-location comparisons must
  be **normalised** (per guest / per hour) or the biggest branch always "wins".

Applied to what this platform actually stores:

| KPI shipped | Lever | Source |
|---|---|---|
| Revenue + trend vs previous window | the outcome; direction over level | `orders.total`, `_creationTime` |
| Average ticket | ticket size (upsells, bundles, meal upgrades) | derived |
| Repeat-guest rate | loyalty / frequency | ported customer identity |
| Revenue per trading hour | throughput + the like-for-like normaliser | distinct traded Manila hours |
| Cancellation leak | money earned then lost | `status = cancelled` |

**Deliberately not shipped, and stated on screen:** prime cost (no labour hours,
no recipe-level food cost) and CAC / LTGP:CAC (no ad spend). Both would have to
be guessed, and an owner would make hiring and marketing decisions on the guess.

## User journeys

1. As a multi-branch owner, I want to see which branch is performing best **for
   its size**, so I can copy its playbook instead of rewarding the busiest
   location.
2. As an owner, I want one instruction per branch, so five KPIs across four
   branches becomes a decision rather than twenty numbers.
3. As an owner, I want to see the direction of each branch, not just its level,
   so a branch taking good money while sliding is visible.
4. As an owner, I want to know when the store is busy, so I can staff the peak
   and promote into the dead hours.
5. As a branch manager, I want this screen to show only my branch.
6. As an owner, I want the figures here to match every other screen in the app.

## Task report

### 1 — Port customer identity to the app

Ported `normalizePhoneE164` + identity resolution from `src/lib` as hand-synced
copies, so a returning guest is one guest whatever the tenant named their form
field, and a walk-in is nobody.

- RED: `npx jest lib/customer-identity.test.ts` →
  `TS2307: Cannot find module './phone'` / `'./customer-identity'` (both modules absent)
- GREEN: same command → `Tests: 13 passed, 13 total` (later 15 with the phone edge cases)
- Commits: `7e71395` (RED) → `c9e3988` (GREEN)

### 2 — The five KPIs

- RED: `npx jest lib/branch-kpis.test.ts` → `TS2307: Cannot find module './branch-kpis'`
- GREEN: `Tests: 29 passed, 29 total`
- Commits: `6b0a3ef` (RED) → `78a39ed` (GREEN)

Two test failures during GREEN were **test bugs, fixed in the test**: a `rowFor`
helper that over-narrowed the row type, and a blob key written as `outletId`
when the real key is `outlet_id`. The implementation was correct in both cases.

### 3 — One verdict per branch

- RED: `npx jest lib/branch-verdict.test.ts` → `TS2307: Cannot find module './branch-verdict'`
- GREEN: `Tests: 19 passed, 19 total`
- Commits: `99a25d0` (RED) → `a5ebc58` (GREEN)

### 4 — The screens

- RED: `npx jest lib/branch-period.test.ts` → `TS2307: Cannot find module './branch-period'`
- GREEN: `Tests: 7 passed, 7 total`; `npx tsc --noEmit` exit 0; whole app suite
  `Test Suites: 77 passed, Tests: 1230 passed` — including the pre-existing
  `business-screen-mount` guardrails, which both rewritten screens still satisfy.
- Commit: `720f431`

### 5 — Parity guardrail

`lib/owner-surface-parity.test.ts` pins that Branches and Portfolio keep deriving
from one KPI module, one card and one period builder. **Written as a regression
pin after the fact, not as a RED-first driver** — the parity was built
deliberately; this stops the next edit from breaking it.

- Result: `Tests: 10 passed, 10 total`
- Commit: `cdf98f0`

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The same guest's `0917…`, `+63917…` and `0917 123 4567` collapse to one identity | `lib/customer-identity.test.ts` | unit | PASS |
| 2 | A phone found under `phone`, `mobile`, `contact_number` or `customer_phone` yields the same key | `lib/customer-identity.test.ts` | unit | PASS |
| 3 | "POS" / "walk-in" / "N/A" identify nobody, so walk-ins never merge into one immortal regular | `lib/customer-identity.test.ts` | unit | PASS |
| 4 | Untyped rows from three backends resolve to "unidentified" instead of throwing | `lib/customer-identity.test.ts` | unit | PASS |
| 5 | Every branch the store has appears, including one that has never traded | `lib/branch-kpis.test.ts` | unit | PASS |
| 6 | Branches rank by revenue per trading hour, not raw takings | `lib/branch-kpis.test.ts` | unit | PASS |
| 7 | Unattributed takings survive as a trailing row, so branch figures add up to the store's | `lib/branch-kpis.test.ts` | unit | PASS |
| 8 | POS sales carrying the branch only in `customerData` are still counted | `lib/branch-kpis.test.ts` | unit | PASS |
| 9 | Trends compare against the equal-length window immediately before | `lib/branch-kpis.test.ts` | unit | PASS |
| 10 | A first period reports no delta rather than an infinite one | `lib/branch-kpis.test.ts` | unit | PASS |
| 11 | Days bucket by Manila, so a 23:30 order stays on its own day | `lib/branch-kpis.test.ts` | unit | PASS |
| 12 | Cancelled orders leave revenue/count/average and become the leak | `lib/branch-kpis.test.ts` | unit | PASS |
| 13 | A guest's later orders count as repeats, never their first | `lib/branch-kpis.test.ts` | unit | PASS |
| 14 | Repeat rate divides by identified orders only, so walk-ins are not disloyalty | `lib/branch-kpis.test.ts` | unit | PASS |
| 15 | A cancelled order is not credited as a visit | `lib/branch-kpis.test.ts` | unit | PASS |
| 16 | Each branch's repeat rate covers its own guests only | `lib/branch-kpis.test.ts` | unit | PASS |
| 17 | Trading hours count each traded hour once, and exclude all-cancelled hours | `lib/branch-kpis.test.ts` | unit | PASS |
| 18 | A malformed `total` degrades to zero instead of NaN-ing the comparison | `lib/branch-kpis.test.ts` | unit | PASS |
| 19 | Store totals are summed from the same rows the cards render | `lib/branch-kpis.test.ts` | unit | PASS |
| 20 | Hour volume returns 24 Manila buckets, excluding cancellations | `lib/branch-kpis.test.ts` | unit | PASS |
| 21 | Verdicts follow fix-order: leak → volume → ticket → loyalty | `lib/branch-verdict.test.ts` | unit | PASS |
| 22 | Repeat is not judged when too few of a branch's guests are identifiable | `lib/branch-verdict.test.ts` | unit | PASS |
| 23 | Exactly one branch is crowned, and never one failing a benchmark | `lib/branch-verdict.test.ts` | unit | PASS |
| 24 | A single-branch store and the unassigned bucket are never crowned | `lib/branch-verdict.test.ts` | unit | PASS |
| 25 | Periods are whole Manila days ending today, never a rolling N×24h | `lib/branch-period.test.ts` | unit | PASS |
| 26 | A non-positive day count cannot produce an inverted window | `lib/branch-period.test.ts` | unit | PASS |
| 27 | Both owner screens derive from one KPI module, one card, one period builder | `lib/owner-surface-parity.test.ts` | guardrail | PASS |
| 28 | Both owner screens keep the un-narrowed account scope | `lib/owner-surface-parity.test.ts` | guardrail | PASS |
| 29 | Every Business-view tab still has a route file and mounts the switcher | `lib/business-screen-mount.test.ts` (pre-existing) | guardrail | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/branch-kpis.ts' ... (five new libs)

All files             |   98.59 |    93.93 |     100 |     100
 branch-kpis.ts       |   99.07 |    91.48 |     100 |     100
 branch-period.ts     |     100 |      100 |     100 |     100
 branch-verdict.ts    |     100 |    96.15 |     100 |     100
 customer-identity.ts |     100 |    97.05 |     100 |     100
 phone.ts             |    92.3 |    90.47 |     100 |     100

Tests: 70 passed, 70 total
```

Whole app suite: `Test Suites: 78 passed, Tests: 1242 passed`. `npx tsc --noEmit`
exit 0. Root `npm run lint`: **zero findings in any file touched by this work**
(the 88 pre-existing errors are in `src/` and `webnegosyo-desktop/`, untouched here).

## Known gaps

- **Nothing has run on a device.** The five new libs are unit-tested and both
  screens typecheck and pass the source-level mount guardrails, but no simulator
  or device render has been performed. The visual design is unverified.
- **No live tenant can exercise this yet.** Per `branch-scoped-order-reads`,
  production holds 0 branch-scoped accounts and 0 branch-attributed orders, so
  every branch card would currently render into the Unassigned bucket. The
  redesign is safe to ship and proves nothing about production.
- **Jest cannot render RN components here** (pure-logic roots only), so
  `Sparkline`, `VerdictPill`, `BranchPerformanceCard`, `StoreHeroCard` and
  `HourVolumeChart` have no render tests — only typecheck plus the source
  guardrails. A `jest-expo` render suite is the follow-up that would close this.
- **Repeat rate is windowed.** A guest whose first visit falls before the
  selected period reads as a first visit inside it, so short windows
  under-report loyalty. Stated on screen as the 2000-order ceiling, but not
  separately explained.
- **The 2000-order ceiling now covers two periods**, since every trend compares
  against the preceding window: a 90-day view reads 180 days of history and a
  busy store will exceed it. The screen says the figures derive from the most
  recent 2000 orders; it does not warn when that ceiling has actually been hit.

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`, in order:

| Commit | Stage |
|---|---|
| `7e71395` | RED — customer identity reproducer |
| `c9e3988` | GREEN — identity port, 13/13 |
| `6b0a3ef` | RED — five-KPI spec |
| `78a39ed` | GREEN — `branch-kpis.ts`, 29/29 |
| `99a25d0` | RED — verdict fix-order spec |
| `a5ebc58` | GREEN — `branch-verdict.ts`, 19/19 |
| `720f431` | GREEN — screens + period math, 7/7 and 1230/1230, tsc clean |
| `cdf98f0` | Guardrail — owner-surface parity, 10/10; coverage 98.59% |

If these are squashed, this file is the retained record.

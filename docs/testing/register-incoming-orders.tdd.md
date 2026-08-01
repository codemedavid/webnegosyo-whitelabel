# TDD evidence — incoming web orders on the Register

## Source plan

No `*.plan.md`. Journeys were derived during this TDD run from the request:
_"on the register, we want to be able to see the new order coming as well from the web
on the drawer and we should be able to hear a notification as well … so that even when
the cashier is actively using the register it knows we are receiving orders from other
sources."_

Two ambiguities were resolved with the user before any test was written:

- **Placement** — a new slide-out drawer on the Register screen (`pos.tsx`), _not_ the
  existing "Drawer" tab (`pos-sales.tsx`, cash reconciliation).
- **Backends** — must work on Convex **and** the shared platform Supabase.

## User journeys

1. As a cashier ringing up a walk-in, I want web orders to appear in a pull-up drawer on
   the Register, so I know orders are arriving without leaving the sale.
2. As a cashier, I want the handle to tell me how many I have not looked at, so a glance
   is enough.
3. As a cashier, I want the sale I just rang up at this till to stay out of that drawer,
   so the badge means something.
4. As a cashier, I want to hear the ringtone when a web order lands while I am on the
   Register.
5. As a merchant whose orders live on the shared platform database, I want that same
   ringtone — today I get none, anywhere in the app.
6. As a cashier, I want to tap an incoming order and land on its detail screen.

## Task report

### 1. Pure rule for "what is incoming?" (`lib/pos-incoming.ts`)

Flattens `orders:getRealtimeQueue` across every open status, drops orders whose
`source` is the register itself, de-dupes by id, sorts newest-first, caps at 20.
Badge counting reuses the existing `selectNewOrders`; row text reuses
`formatOrderAlertBody`, so the drawer and the ringtone can never describe the same
order differently.

- Command: `npx jest lib/pos-incoming.test.ts`
- RED: `Cannot find module './pos-incoming'` — module did not exist.
- GREEN: 21 tests pass.

### 2. Shared "is there a backend at all?" gate (`lib/order-backend.ts`)

`hasLiveOrderBackend({ convexUrl, orderBackend })`. `platform` → true even with no
Convex url; `supabase` (separate per-tenant project, no adapter shipped) → false.

- RED: `'"./order-backend"' has no exported member named 'hasLiveOrderBackend'`
- GREEN: 5 new tests pass.

### 3. Ringtone gate (`lib/order-alerts-utils.ts`, `components/GlobalOrderAlerts.tsx`)

`shouldAlertOnNewOrders` = not demo **and** `hasLiveOrderBackend`. This is a bug fix
as well as a feature: `GlobalOrderAlerts` tested `convexUrl` directly, so every tenant
moved to the shared platform database was permanently silent on every tab.

- RED: `'"./order-alerts-utils"' has no exported member 'shouldAlertOnNewOrders'`
- GREEN: 4 new tests pass.

### 4. Wiring (`app/(main)/pos.tsx`, `components/pos/IncomingOrdersSheet.tsx`)

Jest here only runs pure roots (`lib/`, `theme/`), so wiring is locked by source
assertions — the same convention as `inventory-screen-mount.test.ts`.

- RED: `ENOENT … components/pos/IncomingOrdersSheet.tsx`
- GREEN: 14 tests pass.

### 5. Register/tender availability gate

`pos.tsx` and `pos-tender.tsx` gated the whole register on `convexUrl`, which locked
platform-backed merchants out of their own POS even though `orders:createOrder` is a
supported platform ref. Both now use `hasLiveOrderBackend`. Without this the drawer
would be unreachable for exactly the tenants journey 5 is about.

## Test specification

| # | What is guaranteed | Test file or command | Test type | Result | Evidence |
|---|--------------------|----------------------|-----------|--------|----------|
| 1 | A loading queue yields no rows rather than a flash of empty state | `lib/pos-incoming.test.ts:returns nothing while the queue is still loading` | unit | PASS | `npx jest lib/pos-incoming.test.ts` |
| 2 | Orders in every open status (pending→ready) reach the drawer | `lib/pos-incoming.test.ts:flattens every open status into one feed` | unit | PASS | same |
| 3 | A sale rung up at this register never appears as "incoming" | `lib/pos-incoming.test.ts:drops the register's own counter sales` | unit | PASS | same |
| 4 | A legacy row with no `source` is shown, not hidden | `lib/pos-incoming.test.ts:keeps orders whose source is unknown` | unit | PASS | same |
| 5 | The feed is newest-first across status buckets | `lib/pos-incoming.test.ts:sorts newest first across statuses` | unit | PASS | same |
| 6 | A row appearing in two buckets renders once | `lib/pos-incoming.test.ts:shows an order once even when it appears under two statuses` | unit | PASS | same |
| 7 | A backlog cannot mount unbounded rows | `lib/pos-incoming.test.ts:caps the feed …` | unit | PASS | same |
| 8 | A missing/malformed status bucket does not throw | `lib/pos-incoming.test.ts:tolerates a status bucket that is missing or not an array` | unit | PASS | same |
| 9 | The badge opens at zero on a busy store, not at "everything" | `lib/pos-incoming.test.ts:counts nothing on the first snapshot …` | unit | PASS | same |
| 10 | The badge counts only unacknowledged ids | `lib/pos-incoming.test.ts:counts only ids the cashier has not acknowledged` | unit | PASS | same |
| 11 | Handle label leads with unseen, falls back to open count, then "No orders coming in" | `lib/pos-incoming.test.ts:formatIncomingHandle` (5 cases) | unit | PASS | same |
| 12 | Platform-backed tenants count as having a live backend | `lib/order-backend.test.ts:is true for a platform-backed tenant even with no Convex url` | unit | PASS | `npx jest lib/order-backend.test.ts` |
| 13 | A per-tenant Supabase project does not (no adapter shipped) | `lib/order-backend.test.ts:is false for a tenant on its own dedicated Supabase project` | unit | PASS | same |
| 14 | Platform-backed merchants now hear the ringtone (regression) | `lib/order-alerts-utils.test.ts:rings for a platform-backed merchant that has no Convex url` | unit | PASS | `npx jest lib/order-alerts-utils.test.ts` |
| 15 | The read-only demo stays silent for App Store review | `lib/order-alerts-utils.test.ts:stays silent in the read-only demo` | unit | PASS | same |
| 16 | The Register subscribes to the live queue | `lib/pos-incoming-mount.test.ts:subscribes to the live order queue …` | wiring | PASS | `npx jest lib/pos-incoming-mount.test.ts` |
| 17 | Neither screen nor drawer re-derives "is this a counter sale?" beside the JSX | `lib/pos-incoming-mount.test.ts:filters the queue through the shared rule, never inline` | wiring | PASS | same |
| 18 | Tapping a row opens `/(main)/order/<id>` | `lib/pos-incoming-mount.test.ts:routes a tapped order to its detail screen` | wiring | PASS | same |
| 19 | The two bottom sheets cannot stack open over the grid | `lib/pos-incoming-mount.test.ts:keeps the sale drawer and the incoming drawer from stacking open` | wiring | PASS | same |
| 20 | Register and tender open for any live backend, not Convex only | `lib/pos-incoming-mount.test.ts:opens the register for any tenant with a live order backend …` | wiring | PASS | same |
| 21 | The alert host no longer gates on a Convex url | `lib/pos-incoming-mount.test.ts:decides audibility through the shared gate …` | wiring | PASS | same |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/pos-incoming.ts' \
  --collectCoverageFrom='lib/order-alerts-utils.ts' --collectCoverageFrom='lib/order-backend.ts'

File                   | % Stmts | % Branch | % Funcs | % Lines
-----------------------|---------|----------|---------|--------
All files              |     100 |    94.59 |     100 |     100
 order-alerts-utils.ts |     100 |      100 |     100 |     100
 order-backend.ts      |     100 |      100 |     100 |     100
 pos-incoming.ts       |     100 |     87.5 |     100 |     100
```

Full suite: `npx jest` → **46 suites, 751 tests, all passing**.
`npx tsc --noEmit` clean; `npx eslint` clean on all seven changed files.

## Known gaps

- **No render test.** This package's Jest config restricts roots to `lib/` and `theme/`;
  there is no React Native test renderer wired up. Drawer behaviour is covered by pure
  unit tests plus source-assertion guardrails, which is the established convention here
  (`inventory-screen-mount.test.ts`, `workspace-switcher-mount.test.ts`). Visual and
  gesture behaviour still needs a manual pass on device.
- **Branch 87.5% on `pos-incoming.ts` line 71** — the `seen.has(id) || isFromThisRegister(o)`
  short-circuit has one untaken operand ordering. Both outcomes are individually covered.
- **Alert scope deliberately unchanged.** `GlobalOrderAlerts` still rings on `pending`
  only. Self-confirming sources (`qr_handoff`, `pos`) are created `confirmed` and so
  never rang before and still do not. Widening that is a separate decision.
- **Other `convexUrl` gates left alone** — `dashboard.tsx`, `pos-sales.tsx`, and
  `product-analytics.tsx` still gate on a Convex url and will show their
  "not configured" placeholder for platform-backed tenants. Out of scope for this
  change; worth a follow-up sweep using `hasLiveOrderBackend`.

## Merge evidence

- RED: `2386ce4 test: add reproducer for register incoming-order drawer and alerts`
  — 4 suites failed to run (3 compile-time on missing exports, 1 ENOENT on the missing
  component), all for the intended missing implementation.
- GREEN: `b28bd92 feat: show incoming web orders on the register and alert on every backend`
  — 46 suites / 751 tests pass, typecheck and lint clean.
- No separate refactor commit: the implementation was written against the shared pure
  modules from the start, so there was nothing to fold back.

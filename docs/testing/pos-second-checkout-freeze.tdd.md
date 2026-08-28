# POS second-checkout freeze — TDD evidence

**Reported:** the merchant app's register works for the first sale; on the second
one the checkout "just loads", and the only cure is force-quitting the app and
removing it from the background.

**Source plan:** none. Journeys were derived during this TDD run from the report.

## Root cause

The tender screen (`app/(main)/pos-tender.tsx`) awaits four bookkeeping calls
after `createOrder` succeeds, before it clears `isCompleting` and navigates:

| call | module |
|---|---|
| stock depletion | `lib/pos-stock-notify.ts` |
| Loyverse receipt | `lib/loyverse-notify.ts` |
| voucher burn | `lib/voucher-service.ts` (`burnPosRedemptions`) |
| customer capture | `lib/customers/capture.ts` |

Each was the same two unbounded awaits:

```ts
const { data } = await supabase.auth.getSession();   // no deadline
await fetch(url, { /* no signal */ });               // no deadline
```

`GoTrueClient._acquireLock` chains every caller behind whoever currently holds
its storage lock (React Native has no `navigator.locks`, so the lock degrades to
an in-process promise queue — see `node_modules/@supabase/auth-js/dist/main/GoTrueClient.js:1112`).
`autoRefreshToken` runs on a timer that keeps ticking after the OS suspends the
app's network, so a refresh fired while the register was backgrounded never
completes and never releases the queue. From that moment **every** `getSession()`
in the process waits forever.

The first sale is rung up before that happens, so it goes through. The next one
reaches the bookkeeping block, hangs on the session read, and `setIsCompleting(false)`
is never reached — the footer spinner stays up with no way out but a force quit.
That is exactly the reported symptom, including the role of backgrounding.

`lib/voucher-service.ts` already documented this hazard for the voucher *lookup*
path ("a client midway through a token refresh with no signal hangs here rather
than in fetch") and had bounded it. The write path had not been.

This is distinct from the earlier `freshTenderSession` fix (53540ff), which
addressed per-sale state surviving on a tab screen that never unmounts. That fix
is still correct and still in place.

## User journeys

1. As a cashier, I want to ring up a second sale after completing a first one,
   so that I can serve a queue without restarting the app.
2. As a cashier, I want a bookkeeping call the platform never answers to give up,
   so that a paid sale still closes at the till.
3. As a merchant, I want the sale's stock, receipt, voucher burn and customer
   capture still to be reported, so that nothing is traded away for the fix.

## Task report

### 1. Bound the authenticated POST (`lib/authorized-post.ts`)

One never-throwing, always-settling authenticated POST replaces the four
hand-rolled copies. The session read sits **inside** the deadline, and the
deadline both aborts the request and races it (React Native's fetch has not
always propagated an abort as a rejection — the same reasoning `voucher-service`
records).

- RED: `npx jest --selectProjects logic --testPathPattern "authorized-post|supabase-auth-refresh"`
  → `TS2307: Cannot find module './authorized-post'` (compile-time RED; the tests
  newly exercise a path that did not exist), 2 suites failed.
- GREEN: same command → `Test Suites: 2 passed, Tests: 15 passed`.

### 2. Never start the refresh that stalls (`lib/supabase-auth-refresh.ts`)

Supabase's own React Native guidance: stop the refresh timer while the app is
away, start it on return. Applied in `lib/supabase.ts`, together with
`lock: processLock` so two concurrent refreshes cannot race for the stored
session on a platform with no `navigator.locks`.

- Covered by the same RED/GREEN run above.

### 3. Rewire the four call sites

`pos-stock-notify`, `loyverse-notify`, `customers/capture` and
`voucher-service.burnPosRedemptions` now delegate to `postAuthorized`. Their
existing suites — which assert URL, bearer token and body — were left untouched
and still pass, which is the evidence that behaviour was preserved.

- GREEN: `npx jest --selectProjects logic` → `Test Suites: 208 passed, Tests: 2974 passed`.

### 4. Report the bookkeeping concurrently (refactor)

Four independent calls run end to end only add up their deadlines; a cashier
watching 40s of spinner reads it as another freeze. They now run under one
`Promise.all`, capping the worst case at a single deadline.

- GREEN: `npx tsc --noEmit` (clean), `npx eslint` on the changed files (clean),
  `npx jest --selectProjects logic --testPathPattern "pos-|customers/|voucher|loyverse|authorized|supabase-auth"`
  → `Test Suites: 43 passed, Tests: 598 passed`.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A post-sale write reaches the web app route with the cashier's bearer token and JSON body | `lib/authorized-post.test.ts:posts the body to the web app route…` | unit | PASS |
| 2 | A session read that never returns still settles — the register cannot hang on it | `lib/authorized-post.test.ts:settles rather than hanging when the session read never returns` | unit | PASS |
| 3 | A request that never returns still settles | `lib/authorized-post.test.ts:settles rather than hanging when the request never returns` | unit | PASS |
| 4 | The deadline releases the socket, not just the wait | `lib/authorized-post.test.ts:aborts the stalled request instead of leaving the socket open` | unit | PASS |
| 5 | No session means no call at all | `lib/authorized-post.test.ts:does not call the route at all when there is no session` | unit | PASS |
| 6 | A bookkeeping failure never surfaces as a failed tender | `lib/authorized-post.test.ts:never throws when the request rejects` | unit | PASS |
| 7 | A server refusal is reported as undelivered | `lib/authorized-post.test.ts:reports a refusal from the server as undelivered` | unit | PASS |
| 8 | Tokens refresh while the app is foreground | `lib/supabase-auth-refresh.test.ts:refreshes while the app is in the foreground` | unit | PASS |
| 9 | The refresh that stalls is never started — backgrounded and inactive both stop the timer | `lib/supabase-auth-refresh.test.ts:stops refreshing once the app is backgrounded` / `…while the app is inactive` | unit | PASS |
| 10 | Refreshing resumes when the app returns | `lib/supabase-auth-refresh.test.ts:resumes refreshing when the app comes back` | unit | PASS |
| 11 | An app launched in the foreground refreshes without waiting for a transition | `lib/supabase-auth-refresh.test.ts:starts refreshing immediately…` | unit | PASS |
| 12 | Binding cannot take the app down at module load | `lib/supabase-auth-refresh.test.ts:never throws when the platform has no auth client to drive` | unit | PASS |
| 13 | Stock, Loyverse, voucher-burn and capture still send what they always sent | `lib/pos-stock-notify.test.ts`, `lib/loyverse-notify.test.ts`, `lib/voucher-service.test.ts`, `lib/customers/capture.test.ts` (unchanged) | unit | PASS |

## Coverage and known gaps

Full logic suite: 208 suites / 2974 tests passing. `npx tsc --noEmit` clean;
`npx eslint` clean on every changed file.

Deliberate gaps:

- **The screen itself is not rendered under test.** The components project's
  roots are `components/` only, so screens under `app/` are covered by
  source-text mount tests. The freeze is fixed in the modules the screen awaits,
  which are fully covered; the `Promise.all` restructure in `pos-tender.tsx` is
  covered only by typecheck, lint and the existing mount assertions.
- **Not verified on a device.** The failure needs a real backgrounded app and a
  stalled refresh. This needs an EAS build (or an update, if the JS-only parts
  suffice for the channel in use) and a two-sale run at a counter to confirm.
- Worth checking before shipping: whether the build cashiers are running even
  contains 53540ff (`freshTenderSession`), which fixed a *different* cause of the
  same symptom and merged on 2026-08-21 in PR #45.

## Merge evidence

Checkpoints on `main`, in order:

- `3f67ed4f` test: add reproducers for the POS second-checkout freeze (RED: modules missing)
- `889d90fa` fix: stop a stalled session read freezing the POS second checkout (GREEN: 2974/2974)
- `5eb6ca97` refactor: report a counter sale's bookkeeping concurrently, not in sequence

# TDD Evidence — POS second checkout freezes until app restart

## Source plan

No `*.plan.md` was provided. Journeys were derived during this TDD run from the
bug report: "first POS sale works through checkout; the second time the
checkout just loads and is unusable until the app is killed and refreshed."

## Root cause

`app/(main)/pos-tender.tsx` is registered as a **hidden tab screen**
(`Tabs.Screen name="pos-tender" options={{ href: null }}` in
`app/(main)/_layout.tsx`), so it mounts once per app launch and is never
unmounted by navigation. Two pieces of "per sale" state were initialized at
mount:

1. `isCompleting` — set `true` when the cashier swipes to complete, and on the
   success path the screen navigates away **without resetting it**. On the next
   visit the still-mounted screen renders the footer `ActivityIndicator`
   instead of `SwipeToComplete` — the reported permanent "just loads" freeze.
2. `clientOrderId` — the createOrder idempotency key, minted once in a
   `useState` initializer. Every sale after the first reused the first sale's
   key, so the backend would dedupe a second sale into the first order.

Stale `tenderedText` / `reference` / `proof` / `editReason` carried over the
previous customer's inputs for the same reason.

## User journeys

1. As a cashier, I want to ring up a second sale immediately after the first,
   so that the register never needs an app restart mid-shift.
2. As a merchant, I want every counter sale recorded as its own order, so that
   two back-to-back sales are never silently merged by idempotency dedupe.
3. As a customer, I want my payment reference/proof attached only to my own
   order, not inherited from the previous customer.

## Fix

- New pure module `webnegosyo-app/lib/pos-tender-session.ts`:
  `freshTenderSession()` / `newClientOrderId()` define what a new sale starts
  from.
- `pos-tender.tsx` applies `freshTenderSession()` in a `useFocusEffect`, so a
  sale begins at **focus**, not mount. A retry within the same visit still
  reuses the key (no refocus occurs), preserving the no-double-charge
  guarantee.

## Task report

| Step | Command | Result |
|---|---|---|
| RED | `npx jest lib/pos-tender-session.test.ts` | FAIL — `TS2307: Cannot find module './pos-tender-session'` (missing implementation; compile-time RED) |
| GREEN | `npx jest lib/pos-tender-session.test.ts` | PASS — 5/5 tests |
| Typecheck | `npx tsc --noEmit` (webnegosyo-app) | clean |
| Regression | `npx jest` (webnegosyo-app, both projects) | 194 suites, 2842 tests, all pass |
| Lint | `npm run lint` (webnegosyo-app) | 0 errors (6 pre-existing warnings in unrelated files) |

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | Idempotency keys keep the `pos-` prefix the backend keys counter sales on | `pos-tender-session.test.ts: carries the pos- prefix…` | unit | PASS |
| 2 | Two consecutive sales never share an idempotency key (200 mints, all unique) | `…never share an idempotency key` | unit | PASS |
| 3 | A new sale starts with `isCompleting: false` (no frozen spinner) | `…not stuck completing the previous one` | unit | PASS |
| 4 | Cash/reference/proof/edit-reason inputs start empty each sale | `clears the previous sale's tender inputs` | unit | PASS |
| 5 | Each session mints a fresh key | `mints a fresh idempotency key per session` | unit | PASS |

## Checkpoint commits (branch `lalamove-overhaul`)

- `a484206` test: RED — POS tender screen keeps per-sale state across sales
- `53540ff` fix: reset the POS tender session on every focus, not once at mount

## Coverage and known gaps

- The pure module is 100% covered by its suite. The `useFocusEffect` wiring in
  `pos-tender.tsx` is not automatically tested: the Jest `components` project
  deliberately renders only `components/` (screens pull in expo-router and the
  full navigator), matching this repo's established seam of "pure lib tested,
  screen wires it". Verify on-device: complete a sale, return to the register,
  ring a second sale — the swipe control must appear and both orders must
  exist separately.
- No refactor commit: the fix introduced no duplication to clean up.

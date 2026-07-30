# Kiosk mode — TDD evidence

**Source plan**: none on disk. Journeys were derived during the `/ecc:plan` run in this
session and confirmed by the user before implementation began.

**Branch**: `feat/platform-supabase-order-parity`
**Commits**: `9c32a8d` → `79f336f`

## What was asked for

> "I want to add a kiosk_mode on every storefront. The kiosk mode is just parameter on url
> or something that allows when customer orders it always goes back to the main storefront
> after 3 second. no messenger or anything..."

Scope taken literally: a URL parameter, **no migration**, no superadmin toggle. Kiosk mode is
URL + `localStorage` state only.

## User journeys

1. As a merchant, I want to point a counter tablet at `?kiosk=1`, so that the storefront
   serves a queue instead of one person.
2. As a merchant, I want the tablet to stay in kiosk mode as the customer moves from menu to
   cart to checkout, so that I only have to set it once.
3. As a merchant, I want to take a tablet back out of kiosk mode with a link, so that I do not
   need devtools on a locked-down device.
4. As a customer at a kiosk, I want the screen to return to the menu shortly after I order, so
   that the person behind me is not left staring at my receipt.
5. As a customer at a kiosk, I do not want to be handed off to Messenger, because the tablet is
   not my device and has no account of mine.
6. As an ordinary customer on my own phone, I want checkout to behave exactly as it does today.

## Design decisions recorded

| Decision | Why |
|---|---|
| `?kiosk=0` explicitly exits kiosk mode | Otherwise a locked tablet needs devtools to leave the mode. |
| `router.replace`, not `push`, for the auto-return | A Back tap must not reopen a stranger's receipt. |
| Kiosk hides the tracking link | The tracking link needs no login. On a shared tablet it hands the next customer a live link to the previous customer's order. |
| Kiosk hides the order-message box | It exists to be pasted into Messenger, which kiosks never use. |
| No `kiosk_mode` DB column | The user specified a URL parameter. A URL-only flag means any customer can type `?kiosk=1` on their own phone and lose their Messenger handoff — flagged in the plan, accepted as the stated design. |

## Task report

### 1. Pure kiosk resolver (`src/lib/kiosk/kiosk-mode.ts`)

Decides kiosk on/off from the URL value and the stored flag; owns storage and the return path.

- **RED** — `npx jest tests/unit/kiosk-mode.test.ts`
  ```
  Cannot find module '../../src/lib/kiosk/kiosk-mode' from 'tests/unit/kiosk-mode.test.ts'
  Test Suites: 1 failed, 1 total
  ```
- **GREEN** — same command: `Tests: 35 passed, 35 total`
- **Guarantees**: URL beats storage; `?kiosk=0` clears the flag; an unrecognised value never
  knocks a tablet out of kiosk mode; storage is namespaced per tenant and survives Safari
  private mode throwing on access.

### 2. Browser wiring (`src/hooks/use-kiosk-mode.ts`)

Reads `?kiosk=`, resolves against `localStorage`, persists the answer.

- **RED** — `npx jest tests/unit/use-kiosk-mode.test.tsx`
  ```
  Cannot find module '../../src/hooks/use-kiosk-mode'
  ```
- **GREEN** — same command: `Tests: 7 passed, 7 total`
- **Guarantees**: the mode survives the `router.push` navigations that drop the query string,
  which is how the cart and checkout are actually reached.

### 3. Post-order behaviour (`src/hooks/use-kiosk-return.ts`, `src/lib/messenger-availability.ts`)

Messenger suppression at the seam `useCheckout` already calls, and the three-second return.

- **RED** — `npx jest tests/unit/kiosk-checkout-return.test.tsx`
  ```
  Cannot find module '../../src/hooks/use-kiosk-return'
  ```
- **GREEN** — same command: `Tests: 17 passed, 17 total`
- Messenger regression suite unchanged: `npx jest tests/unit/messenger-order-type-toggle.test.tsx`
  → `13 passed`.

**A real defect was found while going green.** The first implementation listed the router in
the effect's dependency array. Router identity is not guaranteed stable, so every re-render
restarted the countdown and its timers. A trace showed the true severity:

```
mount   renders=3  countdown=3
t=1000  renders=6  countdown=3
t=2000  renders=9  countdown=3
t=3000  renders=12 countdown=3  replace=0
```

The kiosk would have counted "3, 3, 3…" and **never returned to the menu**. The navigation
tests passed anyway, because a single `advanceTimersByTime(3000)` fires all three ticks before
React re-renders — only the per-second tick assertion exposed it. Fixed by keying the timers on
primitives and holding the router in a ref. Locked by the test
`still returns when React re-renders between ticks`, which advances one second at a time so a
render can land between ticks.

### 4. Confirmation screen (`checkout-shared.tsx`) and `useCheckout` wiring

- **RED** — `npx jest tests/unit/kiosk-confirmation-screen.test.tsx`
  ```
  Tests: 5 failed, 7 passed, 12 total
  ```
  The 7 that passed at RED are the non-kiosk regressions plus "never offers the Messenger
  handoff", which was already satisfied by task 3's suppression.
- **GREEN** — same command: `Tests: 12 passed, 12 total`
- One shared component serves all five checkout designs, so this covers classic, modern,
  wizard, minimal and express.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | `?kiosk=1` turns kiosk mode on | `kiosk-mode.test.ts:turns kiosk mode on when the URL asks for it` | unit | PASS |
| 2 | The mode is remembered so in-app navigation keeps it | `kiosk-mode.test.ts:persists the choice so in-app navigation keeps kiosk mode` | unit | PASS |
| 3 | A page reached without the param stays in kiosk mode | `kiosk-mode.test.ts:stays in kiosk mode on a page the customer reached without the param` | unit | PASS |
| 4 | `?kiosk=0` takes a tablet back out of kiosk mode and clears the flag | `kiosk-mode.test.ts:lets ?kiosk=0 take a tablet out of kiosk mode` | unit | PASS |
| 5 | An unrecognised param does not drop kiosk mode | `kiosk-mode.test.ts:ignores an unrecognised param instead of dropping out of kiosk mode` | unit | PASS |
| 6 | One tenant's kiosk flag never leaks into another's storefront | `kiosk-mode.test.ts:keeps one tenant's kiosk flag out of another's storefront` | unit | PASS |
| 7 | Storage being unavailable never throws | `kiosk-mode.test.ts:survives storage being unavailable, as in Safari private mode` | unit | PASS |
| 8 | The hook persists and clears the flag against real `localStorage` | `use-kiosk-mode.test.tsx` (7 cases) | unit | PASS |
| 9 | Messenger is off on a kiosk even when the order type allows it | `kiosk-checkout-return.test.tsx:is off on a kiosk even when the order type allows Messenger` | unit | PASS |
| 10 | A kiosk never auto-opens Messenger | `kiosk-checkout-return.test.tsx:never auto-opens Messenger on a kiosk` | unit | PASS |
| 11 | The phone flow's Messenger handoff is untouched | `kiosk-checkout-return.test.tsx:leaves an ordinary customer's Messenger handoff alone` | unit | PASS |
| 12 | Callers that know nothing about kiosks behave as before | `kiosk-checkout-return.test.tsx:behaves exactly as before for callers that know nothing about kiosks` | unit | PASS |
| 13 | The kiosk returns to `/{tenant}/menu?kiosk=1` after three seconds | `kiosk-checkout-return.test.tsx:sends the kiosk back to the menu after the order` | unit | PASS |
| 14 | It still returns when React re-renders between ticks (regression) | `kiosk-checkout-return.test.tsx:still returns when React re-renders between ticks` | unit | PASS |
| 15 | It does not navigate early, and navigates exactly once | `kiosk-checkout-return.test.tsx:leaves the confirmation up long enough to read` / `navigates once, not once per tick` | unit | PASS |
| 16 | Back cannot reopen a stranger's receipt | `kiosk-checkout-return.test.tsx:replaces rather than pushes...` | unit | PASS |
| 17 | A phone customer is never navigated away | `kiosk-checkout-return.test.tsx:never navigates for a customer ordering on their own phone` | unit | PASS |
| 18 | No stray timer fires after the screen unmounts | `kiosk-checkout-return.test.tsx:stops its timer when the screen goes away` | unit | PASS |
| 19 | The screen says it is returning, and counts down | `kiosk-confirmation-screen.test.tsx:tells the customer...` / `counts the seconds down on screen` | unit | PASS |
| 20 | "Start a New Order" skips the wait, staying in kiosk mode | `kiosk-confirmation-screen.test.tsx:lets the next customer skip the wait` | unit | PASS |
| 21 | A kiosk shows no Messenger button, no order text, no tracking link | `kiosk-confirmation-screen.test.tsx` (3 cases) | unit | PASS |
| 22 | The ordinary confirmation screen is unchanged | `kiosk-confirmation-screen.test.tsx` — "ordinary customer (regression)", 5 cases | unit | PASS |

## Coverage

```
npx jest tests/unit/kiosk-*.test.* tests/unit/use-kiosk-mode.test.tsx --coverage

File                        | % Stmts | % Branch | % Funcs | % Lines
All files                   |   96.66 |    96.07 |   84.61 |   96.66
  use-kiosk-mode.ts         |     100 |    91.66 |     100 |     100
  use-kiosk-return.ts       |     100 |     90.9 |     100 |     100
  kiosk-mode.ts             |     100 |      100 |     100 |     100
  messenger-availability.ts |   86.90 |      100 |      50 |   86.90
```

Above the 80% threshold. `messenger-availability.ts`'s uncovered lines are the CTA label
helpers, which are covered by the pre-existing `messenger-order-type-toggle.test.tsx` suite
(13 passing) rather than by this run's file selection.

## Whole-repo validation

| Command | Result |
|---|---|
| `npm run test` | `310 passed, 1 skipped` suites; `3804 passed, 8 skipped` tests; **0 failed** |
| `npm run build` | exit `0` |
| `npx eslint` on the six touched files | 0 errors, 1 warning — pre-existing `exhaustive-deps` on the cart-empty effect, which this change does not touch (verified with `git diff HEAD~5`) |
| `npx tsc --noEmit` | 26 errors, all pre-existing and all in files this change never touched (`tests/integration/inventory-live-e2e.test.ts`, `tests/product-detail-*.test.*`, `tests/unit/api/inventory-order-stock.test.ts`). Zero errors in any kiosk, checkout or messenger file. |

The `useSearchParams` Suspense risk raised in planning was checked rather than assumed:
`{children}` in `src/app/[tenant]/layout.tsx` sits outside that file's Suspense boundary, so
there is no boundary above the checkout page — but `/[tenant]/checkout` builds as a dynamic
route (`ƒ`), is never statically prerendered, and `npm run build` exits 0.

## Known gaps

- **The QR-handoff path is not covered.** Tenants with `qr_handoff_enabled` navigate to
  `/[tenant]/order/qr/[cid]` from `useCheckout.ts` instead of showing the shared confirmation,
  so kiosk auto-return does not apply to them. Deliberately out of scope for this change; a
  kiosk on a QR-handoff tenant will sit on the QR page as it does today.
- **No end-to-end browser test.** `useCheckout` is a 1280-line hook that the repo tests through
  its pure seams rather than by rendering. This change follows that convention: the suppression
  is tested at the exact function `useCheckout` calls, and the return at the hook that owns the
  timer, so neither can pass while the real path differs. The remaining untested link is the
  handful of wiring lines inside `useCheckout` itself, which are covered only by the type
  checker and the passing build.
- **Anyone can type `?kiosk=1`.** Inherent to a URL-only flag, per the stated design. Gating it
  behind a `kiosk_mode_enabled` tenant column would close this and needs one migration.

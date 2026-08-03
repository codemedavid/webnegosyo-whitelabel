# TDD evidence — subscription start date & anchored billing cycle

**Source plan**: none on disk. Journeys were derived during an interactive `/ecc:plan`
session on 2026-08-03 and confirmed by the platform owner before implementation.

**Migration**: `supabase/migrations/20260818120000_subscription_billing_anchor.sql`
— APPLIED to the live project and probed (`information_schema` shows
`billing_anchor_date date NULL` on `public.tenant_subscriptions`).

## The problem

A payment always bought a month starting the day it was recorded. A client who
paid late on the 20th moved their own renewal date to the 20th, permanently, and
nothing moved it back. The platform owner knows when each client actually
started — that date is what the month should hang off.

## Decisions confirmed before building

| Question | Chosen | Rejected |
|---|---|---|
| What does setting a start date do? | **Anchor only.** It fixes the cycle; access still moves only when a payment is recorded. | Granting the first period free, or auto-writing a backdated ledger row. |
| A lapsed client pays on the 20th? | **Keep the anchor** — they buy the 1st–30th, the month they were already using. | Starting from today, which is what drifted the cycle in the first place. |
| Which "joined" date? | **Both.** `tenants.created_at` as *Joined*, the editable anchor as *Billing since*. | One conflated column. |

## User journeys

1. As the platform owner, I want to see the exact date a client joined, so I know
   how long we have had them.
2. As the platform owner, I want to set the date a client's subscription started,
   so billing matches what we actually agreed.
3. As the platform owner, I want the monthly cycle to run from that date, so a
   client anchored to the 1st renews on the 1st — even when they pay late.
4. As a merchant, I want to see when my billing month starts, so a renewal date
   is not a surprise.

## Task report

### 1. Anchored period arithmetic (`src/lib/billing/billing-anchor.ts`)

New pure module. Decides start **and** end together, because an anchored period
ends the day before the *next* anchor date. Deriving the end from the start would
make a 31st anchor sell 28 February as both the last day of one month and the
first day of the next.

- RED: `npx jest tests/unit/billing-anchor.test.ts` → *Cannot find module
  `@/lib/billing/billing-anchor`* (compile-time RED; the test references the
  missing implementation). Commit `e187a54`.
- GREEN: 22/22 pass. Commit `4714c79`.
- One real defect caught by the cycle: the stacking branch computed
  `nextIndex + periodMonths - 1`, which sold a merchant the month they had
  already bought (Sep 1 – Aug 31). Two tests failed; fixed to `+ periodMonths`.

Guarantees: a null anchor reproduces pre-anchor behaviour exactly; a lapsed
client is never sold the months they skipped; the roll-forward is month-delta
arithmetic with a ±1 correction, never a loop (a client anchored in 2019 would
otherwise iterate ~80 times on a page that renders every tenant).

### 2. `markPaid` honours the anchor (`subscription-service.ts`)

Period arithmetic moved out; `markPaid` now delegates. The
ledger-write-before-access ordering is untouched.

- RED: 3 failed / 19 passed — the 19 pre-existing tests confirm no regression to
  unanchored billing. Commit `382b902`.
- GREEN: 47/47 across service + anchor. Commit `7d04fc3`.

### 3. Setting the anchor (`subscription-lifecycle.ts`, action, projection)

`setBillingAnchor` lives with the pause lever because it shares that module's
invariant, harder: **it grants nothing**. It writes one column and never touches
`paid_through` or `status`.

- RED: 10 failed / 6 passed. Commit `699f349`.
- GREEN: 26/26. Commit `2fff107`.

### 4. Roster + collections screen

- RED (roster): 7/7 failed. GREEN: 47/47 across four roster suites.
- RED (screen): 3/10 failed. GREEN: 10/10.
- The 3 screen failures were **my test assumptions, not the code**: `en-PH`
  renders `Mar 12, 2026`, not `12 Mar 2026`. Expectations corrected to match
  actual rendering.
- One real regression caught: moving the slug into a `<span>` broke the existing
  legibility guard, which asserts the slug carries dimmed light ink on the black
  superadmin shell. Fixed by naming the class on the element itself.

### 5. Merchant page

`/[tenant]/subscription` shows "Billing month starts" — only when an anchor is
set. An em dash there would read as something missing from the account rather
than a rule that does not apply.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A client with no anchor bills exactly as before this shipped | `billing-anchor.test.ts` → "without an anchor" (4 cases) | unit | PASS |
| 2 | An anchored client is billed the month they are living in, not a month from today | `billing-anchor.test.ts:bills the month the merchant is already living in` | unit | PASS |
| 3 | A lapsed client paying on the 20th still renews on the 1st | `billing-anchor.test.ts:keeps the turnover date when a lapsed merchant pays late` | unit | PASS |
| 4 | A client months lapsed is sold one month, not the backlog | `billing-anchor.test.ts:does not sell back the months a lapsed merchant skipped` | unit | PASS |
| 5 | A 31st anchor tiles without selling a day twice | `billing-anchor.test.ts:tiles a clamped month without selling a day twice` | unit | PASS |
| 6 | Paying early never reclaims days already bought | `billing-anchor.test.ts:picks up the day after a period that is still running` | unit | PASS |
| 7 | Realignment comps the stub, never bills it | `billing-anchor.test.ts:realigns an off-grid merchant by comping the stub` | unit | PASS |
| 8 | A corrupt anchor never blocks a payment being recorded | `billing-anchor.test.ts:refusing to trust a bad anchor` (2 cases) | unit | PASS |
| 9 | The ledger records the same period as the access | `subscription-service.test.ts:records the anchored period in the ledger` | unit | PASS |
| 10 | Setting a start date moves no access | `subscription-billing-anchor-write.test.ts:grants no access — paid_through is untouched` | unit | PASS |
| 11 | Setting a start date does not reopen a paused client | `subscription-billing-anchor-write.test.ts:does not reopen a paused client` | unit | PASS |
| 12 | A malformed date is refused, not stored | `subscription-billing-anchor-write.test.ts:refusing bad input` (4 cases) | unit | PASS |
| 13 | Every column the billing code reads is in the query that fetches it | `subscription-select-projection.test.ts` (7 cases) | unit | PASS |
| 14 | Joined date is read on the Manila boundary, not UTC | `subscription-joined-dates.test.ts:reads the joined date on the Manila boundary` | unit | PASS |
| 15 | A corrupt `created_at` does not blank the collections table | `subscription-joined-dates.test.ts:survives an unparseable joined date` | unit | PASS |
| 16 | Joined and Billing-since stay distinct on screen | `subscription-start-date-screen.test.tsx:keeps the join date out of the editable column` | unit | PASS |
| 17 | A refused date surfaces instead of closing as though it saved | `subscription-start-date-screen.test.tsx:surfaces a refused date` | unit | PASS |
| 18 | An anchor can be cleared back to pay-day billing | `subscription-start-date-screen.test.tsx:clears an anchor back to pay-day billing` | unit | PASS |

## Validation actually run

```
npx jest tests/unit                → 391 suites, 4864 tests, all PASS
npx jest --coverage --collectCoverageFrom="src/lib/billing/**/*.ts"
                                   → 97.62% stmts, 98.96% branch (billing-anchor.ts 100%)
npx tsc --noEmit                   → no errors in any billing/subscription file
npm run lint                       → no findings in any file changed here
npm run build                      → compiled successfully
```

## Coverage and known gaps

Billing modules: **97.62% statements, 98.96% branches** — above the 80% floor.
`billing-anchor.ts`, `subscription-service.ts` and `subscription-lifecycle.ts`
are at 100%. The shortfall is `subscription-repository.ts` (67%), whose uncovered
lines are the Supabase write store — the deliberate seam that exists so the logic
above it can be tested without a database.

Intentional gaps and follow-ups:

- **`src/types/supabase.ts` was hand-patched, not regenerated.** Only the
  `tenant_subscriptions` Row/Insert/Update blocks were edited, because a full MCP
  regen would not fit in the working context. A full regen is a known follow-up —
  see the `generated-supabase-types-drift` note, where hand-patching previously
  hid four latent defects.
- **No E2E test.** The flow is superadmin-only and covered at the unit and
  component level; there is no Playwright suite for `/superadmin` in this repo.
- **The anchor is not applied to any live tenant.** The column is null everywhere,
  which means the feature is inert until the owner sets a date per client. That is
  the intended deploy posture, not an oversight.

## Out-of-scope changes made

The branch build was **already red** before this work began. Two pre-existing type
errors, in files untouched by this feature and last committed 4 and 13 days ago,
were fixed so the build could validate this work (commit `43687bd`):

- `src/app/api/mcp/oauth/token/route.ts` — `FormData.entries()` not in this
  project's TS lib.
- `src/hooks/useCart.tsx` — `NodeJS.Timeout` on a browser `setTimeout`.

Neither is related to billing. Flagged here because they widen the diff.

## Merge evidence

Checkpoint commits on `feat/android-sms-followups`, in order:

| Commit | Stage |
|---|---|
| `e187a54` | RED — anchored period reproducer |
| `4714c79` | GREEN — anchor arithmetic |
| `382b902` | RED — markPaid honours the anchor |
| `7d04fc3` | GREEN — markPaid delegates to the anchor |
| `699f349` | RED — setting the anchor |
| `2fff107` | GREEN — setter, action, projection, migration |
| `01e1d16` | RED — joined/billing-since dates |
| (roster) | GREEN — roster carries both dates |
| (screen) | GREEN — collections screen columns + dialog |
| `02526ce` | GREEN — merchant-facing billing start date |
| `43687bd` | Out-of-scope pre-existing build repair |

If these are squashed, this file is the surviving record of what was verified.

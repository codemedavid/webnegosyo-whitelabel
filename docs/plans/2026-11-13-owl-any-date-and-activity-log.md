# Owl: any date, and "who punched what"

Status: APPROVED 2026-11-13 ("go") with the order lookup added; BUILT on branch feat/owl-any-date-activity. Branch filter and the app timeline card were left out (Owl has no branch refs yet; the existing `ranked` card renders on web and app without an OTA).

## Problem

- `get_sales_overview` takes only `today | 7d | 30d | 90d`, so "yesterday", "last Saturday", "Nov 1–10", "last month" or "3–5pm yesterday" cannot be answered.
- `get_staff_activity` takes only `today | 7d | 30d` (rolling windows, so "today" means the last 24 hours) and gives per-person totals, never the individual actions.
- `get_orders_now` covers today only.
- Owl has no tool for the Store Activity log at all, although the log is full. Platform, last 24 h: 1,552 status changes, 947 orders placed, 130 marked paid, 100 price changes, 29 cancels, 14 discounts, 14 pay-outs, 13 shift closes, reprints, expenses, stock moves. Nearly all of them name the person who did it.

## Changes

### 1. One "when" input for every time-based tool (`src/lib/assistant/insights/when.ts`, pure)

`{ period?: today | yesterday | this_week | last_week | this_month | last_month | last_7_days | last_30_days | last_90_days, from?: YYYY-MM-DD, to?: YYYY-MM-DD, fromTime?: HH:MM, toTime?: HH:MM }`

- Resolves to a half-open window in the store's business days: Manila midnight, or the store's cut-off schedule (`tradingDayWindow`), the same rule the dashboard uses.
- One day is compared with the same weekday a week earlier; a longer window with the window just before it.
- A future date is refused. A window may be at most 93 days; anything longer comes back as `tooLong` with that limit, so Owl says so instead of cutting the window short without telling anyone.
- Old period keys (`7d`, `today`) still parse, so stored conversations replay.
- `buildContextNote` already carries "Now"; the system prompt gains one line: dates go in `from`/`to`, never computed by the model as offsets.

### 2. `get_sales_overview` takes "when" (every backend)

- Reads through `readTenantSales(tenantId, window)`, which already routes through `resolveOrderBackend` (platform, per-store Supabase, Convex). Past windows set the read end to the window end.
- For a single day it adds sales per hour (to answer "what happened around 3pm") and still shows top items and channels.
- An optional `branch` filter is available to store-wide accounts. A branch-locked account is already refused by Owl.

### 3. NEW `get_activity_log`: who did what, when

- Calls `get_store_activity` + `get_store_activity_summary` through the CALLER's session client (`src/lib/activity/repository.ts`). The database already enforces `activity_view` / `approve_requests` and the branch scope, so there is no service role here.
- Tool access: `activity_view` (an opt-in key; the owner always has it).
- Inputs: `when`, `staff` (ref `s#`), `category` (orders, money, cash, stock, menu, team, expenses, approvals, loyalty), `flaggedOnly`, `order` (order number), `includeRoutine` (default off, so "order placed" and "stock sale" don't bury voids and discounts).
- Facts:
  - The roll-up: counts per category and per person.
  - The newest ≤25 rows: time, person, action label, order #, ₱ amount, reason, approved by, flags such as oversold or no reason given.
  - A `more` count when there are more rows than shown.
- The model never sees customer data or ids. Staff become `s#` refs and orders their display number.
- Card: a timeline list. Link: the app's Activity screen; on the web, the Staff page until a web Activity page exists.
- Examples it answers: "who voided orders yesterday", "who gave discounts on Saturday", "what did Ana do this morning", "who changed the price of Sisig", "who reprinted receipts", "pay-outs last week", "what happened to order #42".

### 4. `get_staff_activity` takes "when" too

It stays as the per-person scoreboard and replaces its rolling windows with real business days.

### 5. `get_orders_now` stays live-only

Its description points to `get_sales_overview` for past days, so the model routes "yesterday" questions correctly.

## Mirrors / contracts

- Tool order: the new tool is APPENDED to `ASSISTANT_TOOLS`. The changed input schemas invalidate the prompt cache once.
- App: `webnegosyo-app/lib/assistant/presentation.ts` (tool label + timeline card) and `links.ts` (Activity screen). The app ships only through an OTA. The web works without it, and an old app shows the card generically.
- Golden routing set (`tests/fixtures/assistant/golden.json`): add about 15 date and activity questions in English and Taglish ("benta kahapon", "sino nag-void kanina").

## Tests / proof

- Unit tests:
  - `when.ts`: Manila midnight, cut-off-schedule stores, month edges, future dates, the 93-day limit, old keys still parsing.
  - Builders for the three tools.
  - The ids-never-reach-the-model check over the new facts.
- Live checks (`tests/live/assistant-live.test.ts`, opt-in):
  - "Yesterday" on one platform store and one Convex store, matched against `/admin/reports` for the same day.
  - `get_activity_log` run as the owner, as a staff member without `activity_view` (refused), and as a branch account (refused by Owl).
- `ASSISTANT_GOLDEN=1` routing run.
- A browser walk of Owl on sample-demo: "how were sales yesterday", "who discounted orders yesterday". Screenshots go in the reply.
- Blast radius: read-only tools, no migration, no writes. Money figures come from the dashboard engine that already exists, with no new formula.

## Not in this round (ask)

- An order-detail lookup ("show me order #42: items, who rang it, payments"). Part of it is covered by `get_activity_log` with `order` set.
- A web admin Activity page. Today it exists only in the merchant app.

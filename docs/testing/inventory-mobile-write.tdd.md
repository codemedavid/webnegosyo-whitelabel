# TDD evidence — recording stock from the merchant app (Phase C)

**Source plan** — no `*.plan.md`. Phase C of the A → B → C inventory roadmap: after
availability (A) and clarity (B), the merchant gets the power to *act* from the phone.

## User journeys

1. As a merchant, I want to record a delivery from my phone, so stock is right without
   walking to a laptop.
2. As a merchant, I want to correct the count when the shelf disagrees with the app.
3. As a merchant, I want to log waste at the moment it happens, not from memory later.
4. As a merchant, I want to see what the number will become **before** I commit, so a typo
   is caught while it is still free.

## The correction that shaped this phase

My own note from Phase B said this needed **no new API route** — "the app authenticates as a
tenant admin and inventory RLS is admin-scoped." That is true of the permission and wrong as
a design. `stock_movements` RLS would indeed accept a direct insert from the phone, but three
things live on the server side of that call and cannot follow the client:

| | why it cannot move to the phone |
|---|---|
| the signed delta | resolved against the on-hand quantity read in the *same request*; a phone would use whatever figure it last refreshed |
| moving-average cost | a delivery's price blends into the cost of stock already on the shelf |
| alerts + auto-86 | crossing the reorder line raises an alert and can take a dish off the menu |

A direct insert skips the last two and gets the first one wrong. Since the ledger is the
source of truth for stock, a wrong delta is not a stale screen — it is a silently wrong shelf
until someone counts it again. So Phase C adds `POST /api/inventory/movement`, and the phone
sends a **magnitude and a reason**, never a delta.

`recordStockMovement` was split so both callers share one body: the web keeps the cookie-bound
client and `verifyTenantPermission`; the app arrives with a Bearer token, authorizes at the
route, and passes its own client into `recordStockMovementWith`.

## The other design distinction

This route is deliberately **not** best-effort, unlike its neighbour `/api/inventory/order-stock`.
That one runs behind a sale already rung up and paid for, where a stock failure must never fail
the tender — a drifting ledger is reconcilable, a register that will not close a sale is not.

Here the merchant is *watching*. They typed a delivery and are waiting to be told it landed.
A swallowed error would show a confirmation for a write that never happened, and they would
find out at the next stocktake with no way to tell which movement went missing. Every failure
is returned and shown.

## Task report

### 1. `lib/inventory-movement.ts` — the rules

Payload building, the before/after preview, and the over-wasting warning. Zero is rejected for
a delivery and accepted for a count: receiving nothing is a slip, but counting zero is the most
important count a merchant can record.

Wasting more than the shelf holds warns but never blocks — stock legitimately goes negative
when a sale lands before its delivery is recorded, so refusing would leave a merchant unable to
record the truth.

- RED: `Cannot find module './inventory-movement'`
- GREEN: `npx jest lib/inventory-movement` — 15 passed

### 2. `lib/inventory-movement-service.ts` — the call

- RED: `Cannot find module './inventory-movement-service'`
- GREEN: 5 passed

### 3. Widening `StockItemView`

`loadInventoryStock` already selected `stock_unit_id` and `buildStockViews` discarded it —
nothing had needed it while inventory was read-only. Carried through now, which is the second
half of the RED signal (`'stockUnitId' does not exist in type 'StockItemView'`).

### 4. Route and screen

Tapping an ingredient opens the sheet. On success the shelf **reloads from the server** rather
than patching the row: the write can cross a reorder line, which re-levels the ingredient and
can 86 a dish, and none of that is knowable from the quantity alone.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | The phone sends a magnitude and reason, never a delta | `inventory-movement.test.ts:sends a magnitude and a reason` | unit | PASS |
| 2 | The movement is recorded in the ingredient's own stock unit | `…:records the movement in the ingredient's own stock unit` | unit | PASS |
| 3 | A blank, non-numeric or negative amount is rejected | `…:rejects a blank, non-numeric or negative quantity` | unit | PASS |
| 4 | Zero is refused for a delivery and accepted for a count | `…:rejects zero for a delivery but accepts it for a count` | unit | PASS |
| 5 | Only the three hand-made reasons are offered | `…:offers exactly the three movements` | unit | PASS |
| 6 | A note is kept when written, dropped when blank | `…:keeps a note when one was written` | unit | PASS |
| 7 | The preview adds a delivery, subtracts waste, replaces on a count | `…:adds a delivery`, `…:takes waste away`, `…:replaces the figure outright` | unit | PASS |
| 8 | An unusable amount previews nothing rather than a guess | `…:shows nothing rather than a guess` | unit | PASS |
| 9 | Over-wasting warns but still builds the payload | `…:is a warning and not a block` | unit | PASS |
| 10 | A delivery or count is never flagged as over-wasting | `…:never flags a delivery or a count` | unit | PASS |
| 11 | The call carries the merchant's own token | `inventory-movement-service.test.ts:posts the payload with the merchant's own token` | unit | PASS |
| 12 | The screen shows the server's figure, not the phone's arithmetic | `…:returns the server's figure` | unit | PASS |
| 13 | A server rejection throws, carrying the reason | `…:throws when the server rejects it` | unit | PASS |
| 14 | A dead network throws rather than reassuring | `…:throws when the network is gone` | unit | PASS |
| 15 | An expired session throws without posting | `…:throws rather than posting when there is no session` | unit | PASS |
| 16 | The card is itself the way to record stock | `inventory-screen-mount.test.ts:offers recording stock as the card's own action` | unit | PASS |

## Coverage and known gaps

- App: `npx tsc --noEmit` clean; `npx jest` — **50 suites, 797 passed**.
- Web: `npx jest` — **248 suites, 2965 passed, 8 skipped**. `src/` typecheck clean.
- `npm run lint` — zero findings in any file this phase touched. (The repo-wide run reports
  87 pre-existing errors in `webnegosyo-desktop`, untouched here.)

One existing guardrail changed shape and was updated rather than deleted: the card's
accessibility label is still built from the shared `describeStockView` sentence, but the
assertion now allows the tap affordance appended to it. A second assertion was added to lock
in the new behaviour.

**Not covered.** No render test for `StockMovementSheet` — every rule behind it is pure and
tested, the composition is not. The route has no integration test; its authorization is a copy
of `/api/inventory/order-stock`, which also has none.

**Not verified end to end.** No movement has been recorded against a live tenant from a device.
A read-only check confirms the one tenant with inventory enabled (`brewdazeexpress`) has its
single active ingredient carrying a stock unit, so the one hard precondition is met there.

**Not deployed.** This branch has no upstream and is 240+ commits ahead of `origin/main`. The
app calls `${webAppUrl}/api/inventory/movement`, which **does not exist in production** — this
phase cannot work from a device until the branch ships.

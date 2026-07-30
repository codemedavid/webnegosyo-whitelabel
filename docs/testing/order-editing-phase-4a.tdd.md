# TDD evidence — Order editing, Phase 4A + backend hardening

**Source plan**: produced inline in-session (`/ecc:plan`), not written to a `.plan.md` file. Continues `order-editing-pos-mode.tdd.md`, which recorded Phases 1–3 as complete and Phase 4 (the screens) as not started.

**Scope of this run**: the two read seams the screens depend on, the first two hardening items from that document's "Known gaps" list, and then — once Convex v16 was deployed — the screens themselves.

## Why this ran before the screens

Reviewing the existing work turned up two defects that the earlier document did not record. Both are invisible until a screen exercises them, and both are wrong about money:

1. `OrderDto` carried no `revisionNumber`. `startEditSession` falls back to `order.revisionNumber ?? 0`, so every edit would have submitted expected-revision 0. The optimistic lock in `order-revise.ts` would then have refused *every* edit after an order's first — with a "someone else saved first" message that was false.
2. The platform adapter could not serve the settlement ledger at all. `orders:getOrderPayments` / `orders:getOrderRevisions` existed only on Convex. On the platform backend a session would have opened with `payments: []`, read a fully-paid order as unpaid, and asked the cashier to collect the whole bill a second time.

## User journeys

1. As a cashier, when I reopen an order I already edited once, I want my second edit to save, so that I am not told someone else changed it when nobody did.
2. As a cashier on a platform-backend store, when I edit an order the customer already paid, I want the screen to know it was paid, so that I am not asked to collect the bill twice.
3. As a merchant, I want an edited receipt to add up, so that a customer reading "10.01 × 3" sees the total they were actually charged.
4. As a merchant on Convex, I want the same protections against a bad edit as a merchant on the shared platform database.

## Task report

### Task 1 — `revisionNumber` and `amountPaid` on the platform read path

Columns were already selected (`ORDER_COLUMNS = "*"`), so only the row type and the mapper needed changing.

- **RED**: `npx jest lib/backends/supabase-orders.test.ts` → `TS2353: 'revision_number' does not exist in type 'Partial<PlatformOrderRow>'` and `TS2339: Property 'revisionNumber' does not exist on type 'OrderDto'` (×6). Suite failed to run; **0 tests**.
- **GREEN**: `npx jest lib/backends/supabase-orders.test.ts` → **32 passed**. Full app suite → **81 suites / 1279 tests**.
- **Guaranteed**: an order edited twice reports revision 2; an order never edited reports `0` rather than `undefined`, so the optimistic lock is fed a real number; `amount_paid` coerces from the string PostgREST returns for `numeric`; an unpaid order reports `0` paid and is never mistaken for settled.

### Task 2 — Serving the ledger from the platform backend

- **RED**: `npx jest lib/backends/supabase-adapter.test.ts` → **5 failed, 35 passed**, each `Query "orders:getOrderPayments" is not supported by the platform backend.` — a runtime failure for the intended reason.
- **GREEN**: `npx jest lib/backends/` → **123 passed**. `npx tsc --noEmit` → exit 0.
- **Guaranteed**: payments return oldest-first and revisions newest-first, matching the Convex ordering; both map snake_case rows to the **camelCase shape Convex returns**, so `computeBalance` reads `kind`/`amount` rather than netting to zero; both reads are scoped to `tenant_id` *and* `order_id`; a failed ledger read **throws instead of returning an empty array**, because an empty ledger and a failed one are indistinguishable and one of them tells a cashier to collect a bill that was already paid.

### Task 3 — Convex order-edit rules made testable (gap #3 from the prior document)

The prior document called this "the weakest link in the phase": `reviseOrder`/`recordPayment` had **no automated tests at all**, because neither Jest project reaches a Convex handler. The rules are now extracted into `convex-template/convex/orderRevise.ts` — Convex-import-free, and therefore swept up by the root `jest.config.cjs`, which does not ignore `convex-template/`. This mirrors the pattern already established by `pushRecipients.ts`.

- **RED**: `npx jest --config jest.config.cjs convex-template/convex/orderRevise.test.ts` → `Cannot find module './orderRevise'`. **0 tests**.
- **GREEN**: **29 passed**; `npx tsc --noEmit -p .` in `convex-template` → exit 0.
- **Guaranteed**: a stale revision is refused and is reported *before* an empty cart, because if the order moved on nothing about the submission — including its item list — is trustworthy; an order with no `revisionNumber` reads as revision 0, so a legacy order can still be edited a first time; quantity and price bounds match the platform backend exactly, and the offending item is named; a zero price is allowed, since a comped line is legitimate; submitted items are not mutated; `netAmountPaid` goes negative on an over-refund rather than clamping, and skips a non-finite row instead of turning the whole cache into `NaN`.

**One failure in this suite was a real finding, not a bad expectation.** The test initially mirrored the platform backend's arithmetic and expected `30.02`; the new implementation produced `30.03`. Investigating showed the *platform* path was inconsistent — see Task 4.

### Task 4 — An edited line must total to its own price

`toItemRow` stored `price: round2(item.price)` but computed `subtotal: round2(item.price * quantity)` from the **raw** price. For a price of `10.005 × 3` it wrote a unit price of `10.01` beside a subtotal of `30.02` — a line whose own numbers contradict each other, on the one feature whose entire purpose is a bill that stays defensible weeks later. No existing test pinned that boundary, so the behaviour was unproven rather than deliberate.

- **RED**: `npx jest lib/backends/order-revise.test.ts` → `Expected: 30.03, Received: 30.02`. **1 failed, 19 passed**.
- **GREEN**: `npx jest` (merchant app) → **81 suites / 1285 tests**. `npx tsc --noEmit` → exit 0.
- **Guaranteed**: the stored subtotal equals `round2(stored price × quantity)` on **both** backends, asserted as an identity rather than a literal so the two cannot drift apart silently.

### Task 5 — Schema v16 + rebundle

`CURRENT_SCHEMA_VERSION` bumped 15 → 16 in `src/lib/convex-deploy.ts` and `npm run convex:prebundle` re-run. Without both, the Deploy Schema button ships the old bundle and no tenant receives the change.

- **Validated**: bundle contains `priceRevisedItems`; **no `*.test.js` leaked into the bundle** (checked explicitly); 16 modules written. Full web suite → **300 suites / 3646 passed, 8 skipped**.

## Test specification

| # | What is guaranteed | Test | Type | Result |
|---|---|---|---|---|
| 1 | A twice-edited order reports revision 2, so the optimistic lock is fed a real number | `lib/backends/supabase-orders.test.ts:carries the revision number…` | unit | PASS |
| 2 | An order never edited reads as revision 0, not undefined | `…:reads an order never edited as revision 0` | unit | PASS |
| 3 | `amountPaid` survives the string PostgREST returns for `numeric` | `…:coerces amount_paid from the string…` | unit | PASS |
| 4 | An unpaid order reads as 0 paid and is never mistaken for settled | `…:reads an unpaid order as 0 paid` | unit | PASS |
| 5 | The platform backend claims the ledger read refs | `lib/backends/supabase-adapter.test.ts:claims the ledger read refs…` | unit | PASS |
| 6 | Payments return oldest-first in the camelCase shape Convex returns | `…:returns an order's payments oldest first…` | unit | PASS |
| 7 | Revisions return newest-first in the camelCase shape Convex returns | `…:returns revision history newest first…` | unit | PASS |
| 8 | The ledger is scoped to both tenant and order | `…:scopes the ledger to the caller's tenant…` | unit | PASS |
| 9 | A failed ledger read throws rather than reporting an order as unpaid | `…:surfaces a ledger error instead of…` | unit | PASS |
| 10 | A stale revision is refused, ahead of an empty cart | `convex-template/convex/orderRevise.test.ts:refuses an edit built against a stale revision` / `:reports the stale revision before the empty cart` | unit | PASS |
| 11 | An order cannot be emptied by editing on Convex | `…:refuses to empty an order by editing` | unit | PASS |
| 12 | Convex quantity/price bounds match the platform backend, naming the bad line | `…:refuses a non-positive quantity` ×6, `:names the offending item` | unit | PASS |
| 13 | `amountPaid` goes negative on an over-refund rather than clamping | `…:goes negative when refunds exceed charges` | unit | PASS |
| 14 | One corrupt ledger row does not turn the cache into NaN | `…:ignores a non-finite row…` | unit | PASS |
| 15 | An edited line's subtotal equals its stored price × quantity — Convex | `…:builds the subtotal from the price it actually stores…` | unit | PASS |
| 16 | An edited line's subtotal equals its stored price × quantity — platform | `lib/backends/order-revise.test.ts:builds the subtotal from the price it actually stores` | unit | PASS |
| 17 | `itemCount` follows the edit, counting units not lines | `…orderRevise.test.ts:counts units, not lines` | unit | PASS |

## Coverage

```
convex-template/convex/orderRevise.ts   |  100 |  100 |  100 |  100
webnegosyo-app lib/backends/
  order-revise.ts                       |  100 |  100 |  100 |  100
  supabase-orders.ts                    |  100 | 83.78|  100 |  100
  supabase-adapter.ts                   | 85.57| 57.53| 86.95| 85.41
```

`supabase-adapter.ts`'s uncovered region is the pre-existing mutation path (lines 439–496), untouched by this run. Well above the 80% bar.

Full suites: merchant app **81 suites / 1285 tests**; web + Convex **300 suites / 3646 passed, 8 skipped**. Typechecks clean in both projects. No regressions.

## Known gaps

Carried forward from `order-editing-pos-mode.tdd.md`, with this run's changes marked:

1. **The screens are still not built.** `order/[orderId]/edit.tsx` and `settle.tsx` do not exist, and `pos-sales.tsx:39` still calls `summarizeCounterSales` with one argument, so the drawer fix remains inert. **No merchant can edit an order yet.** Everything beneath them is now built, tested, and — for the first time — reachable on both backends.
2. **RLS policies still not probed under a real user session.** Unchanged: the live probe ran through MCP with elevated rights, which does not exercise them.
3. ~~Convex `reviseOrder`/`recordPayment` have no automated tests~~ — **closed by Task 3** for the rules. The *handlers* remain untested (database effects, transaction behaviour), and neither mutation has ever been executed against a real deployment.
4. **The platform revise path is still not atomic.** PostgREST cannot span a transaction across the revision insert, item delete/insert, and order patch. Moving it into a Postgres RPC remains a real follow-up.
5. **Stock movement is still computed but never applied.** `stockDelta` remains unused.
6. **The POS price divergence is still not fixed upstream.** `pos-order.ts:toOrderItem` still writes the base price into `order_items.price`.
7. **Schema v16 is bundled but not deployed.** No tenant has received it, and `reviseOrder`/`recordPayment` have still never run once.

## Phase 4B — the screens (after v16 was deployed)

v16 was deployed to **Gungjeon Unlimited**, verified by reading `convex_schema_version = 16` off the tenant row rather than taking the deploy on trust. The screens were then built on top.

### Task 6 — Payments and edit-history view models (`lib/order-history-view.ts`)

- **RED**: `npx jest lib/order-history-view.test.ts` -> `Cannot find module './order-history-view'`. **0 tests**.
- **GREEN**: **20 passed**.
- **Guaranteed**: a refund renders as money *leaving* (`-P40.00`) even though the ledger stores it unsigned; centavos always show, so a merchant can total the card by hand; a missing method name renders "Payment", never `undefined`; the ledger keeps the order it was taken in, because that sequence is the story an edited bill has to tell; revision history is re-sorted newest-first here rather than trusted from a backend; an order with an empty ledger reports `collect` for its whole total rather than `settled`. The summary routes through `order-balance.ts`, so this card and the settle screen cannot show a cashier different numbers.

### Tasks 7-9 — The three screens

`components/order/SettlementCards.tsx`, `app/(main)/order-edit/[orderId].tsx`, `app/(main)/order-settle/[orderId].tsx`, plus the permission-gated Edit button on order detail.

Routes are flat (`order-edit/`, `order-settle/`) rather than nested under `order/[orderId]/`, which would have put a file and a directory on the same route segment.

- **Validated**: `npx tsc --noEmit` -> exit 0; `npx expo lint` -> **0 errors**; full app suite **82 suites / 1307 tests**.
- **A pre-existing guardrail caught a real bug in this work.** `lib/tab-navigation.test.ts` failed on `router.replace("/(main)/order-settle/...")` — replacing into the tab navigator breaks it. Changed to `router.push`. Backing out of settle therefore lands on a now-stale edit screen, which is safe rather than merely tolerated: the optimistic lock refuses that second save and says why.
- The edit screen refuses to open when the ledger read fails, rather than opening an order that would look unpaid.
- Settlement offers **every** active payment method, not only those linked to the order's type (`listAllPaymentMethods`): a GCash delivery order topped up with cash at the counter must be closable.

### Not done: 4B.4, and why

`pos-sales.tsx` still calls `summarizeCounterSales` with one argument, so the drawer split stays **inert**. It needs every settlement row for the day's counter sales, and **no bulk ledger query exists on either backend** — only `getOrderPayments(orderId)`, which would be an N+1 across a shift. Closing it means a new `orders:getPaymentsSince` on Convex *and* the adapter, a bump to v17, a rebundle, and another tenant deploy. Deliberately not started at the end of a long session, on cash-reconciliation code.

## Task 10 — Editing stops when the kitchen starts (requested after first use)

**A rule change, not a bug fix.** The original gate allowed edits through `preparing`, with an explicit rationale in the test: "the kitchen is mid-ticket but the bill is not final — this is exactly when 'make that a large' happens." The merchant reversed that: once the ticket is printed and the food started, an edit desynchronises the bill from what is actually being cooked, and the stock has already moved against the original lines. `ready` is past `preparing`, so it is blocked too. Editable statuses are now **`pending` and `confirmed` only**.

This is a STATUS rule, not a permission one — no role can un-cook food, so there is deliberately no owner override.

### The rule was enforced in three places, not one

The screen gate alone would have been a UI preference rather than a rule: an edit screen opened while an order was still `confirmed` survives the kitchen starting, and its save would otherwise still land. The revision lock does not catch this, because the revision number has not changed — only the status has. So the rule is enforced on both write paths as well, duplicated the way `staff-permissions.ts` already is across surfaces.

- **RED (screen gate)**: `npx jest lib/order-edit-guards.test.ts` → **3 failed, 18 passed**, including the pre-existing test that asserted the opposite.
- **RED (write paths)**: `npx jest --config jest.config.cjs convex-template/convex/orderRevise.test.ts` → **3 failed, 30 passed**; `npx jest lib/backends/order-revise.test.ts` → compile failure on the new `status` field, **0 tests**.
- **GREEN**: merchant app **82 suites / 1313 tests**; `npx tsc --noEmit` exit 0 in both projects; `npx expo lint` **0 errors**.
- **One assertion was corrected, not the behaviour**: the first test matched `/prepar/i`, but the message reads "The kitchen has already started this order…". The message is the better copy, so the over-specific regex was relaxed to `/kitchen/i`.
- **Guaranteed**: `preparing`, `ready`, `delivered` and `cancelled` are refused by the screen gate *and* by both write paths; `pending` and `confirmed` still pass all three; the status refusal is reported **ahead of** the stale-revision one, because a started ticket stays uneditable however many times it is reopened and "reopen and try again" would send the cashier round a loop that never ends; the owner is refused too.
- The platform adapter now selects `status` alongside `total, revision_number` — without that the rule would have been dormant on that backend, refusing nothing.

**Coverage**: `order-edit-guards.ts` 100% stmts, `order-revise.ts` 100% stmts, `orderRevise.ts` 100% stmts.

**Schema v17 bundled** (`kitchen has already started` confirmed present in `convex-push-bundle.json`) — **needs a redeploy to reach Gungjeon Unlimited**. Until then that tenant has the screen gate but not the Convex write-path guard.

## Remaining work, in order

| # | Task | Blocked on |
|---|---|---|
| — | **Redeploy v17** to Gungjeon Unlimited, so the kitchen-started rule reaches the write path | **user action** |
| — | Try the edit -> settle flow on Gungjeon Unlimited | **ready now** (screen gate already correct) |
| 4B.4 | Bulk ledger query, then pass it into `summarizeCounterSales` | needs Convex v17 + a deploy |
| 4B.5 | Apply the stock delta on save | the concurrent inventory work on `order-stock-claim.ts` |
| 5.3 | Probe RLS under a real user session | user action |
| 5.4 | Move the platform revise into a Postgres RPC | nothing |
| 5.5 | Fix `pos-order.ts:toOrderItem` price convention | nothing |

Superseded: 5.2 (v16 deployed and verified), 4B.1-4B.3 (built above).

## Merge evidence

Checkpoint commits on `feat/platform-supabase-order-parity`:

| Commit | Stage |
|---|---|
| `79c5e86` | RED — revision/amountPaid reproducers (TS2353/TS2339, 0 tests run) |
| `4981727` | GREEN — 32 passed; app suite 81 suites / 1279 tests |
| `e921975` | RED — ledger read reproducers (5 failed, unsupported-ref at runtime) |
| `76d4426` | GREEN — 123 backend tests; app suite 1284; tsc exit 0 |
| `4bb849e` | RED — Convex order-edit rule reproducers (module not found, 0 tests run) |
| `028ae23` | GREEN — 28 passed; Convex tsc exit 0; schema v16 + rebundle; web 3646 passed |
| `e10277a` | RED — platform subtotal consistency (Expected 30.03, Received 30.02) |
| `a425a89` | GREEN — app suite 81 suites / 1285 tests; tsc clean |
| `a513c1f` | Coverage — `orderRevise.ts` to 100% |
| `419791c` | RED — payments/edit-history view models (module not found, 0 tests run) |
| `5a7ddcd` | GREEN — 20 passed |
| `4cd9177` | Order detail: settlement + history cards, gated Edit button |
| `843a973` | Edit and settle screens; 82 suites / 1307 tests; tsc + lint clean |
| `fdcbae3` | RED — kitchen-started gate (3 failed, 18 passed) |
| `583c440` | RED — same rule on both write paths (3 failed Convex; compile failure platform) |
| `ab0d325` | GREEN — 82 suites / 1313 tests; schema v17 + rebundle; tsc + lint clean |

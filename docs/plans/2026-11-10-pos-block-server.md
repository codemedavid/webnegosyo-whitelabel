# Server-enforced "block" stock policy for the register (2026-11-10)

Owner decision 2026-11-09: on a `tenants.pos_stock_policy = 'block'` store the
SERVER refuses an online register sale that sells past the shelf unless it
carries a manager approval the server can verify. Sales taken offline are
accepted but flagged "oversold offline". `warn` stores and the web checkout are
unchanged.

## 1. The real flow today (mapped 2026-11-10)

| Question | Answer |
|---|---|
| Where platform POS orders are written | **Direct PostgREST inserts by the cashier's `authenticated` session**: `webnegosyo-app/lib/backends/supabase-adapter.ts` `createOrder` → `orders` insert, then a separate `order_items` insert. No server route. The QR hand-off (`scan.tsx`, `source = 'qr_handoff'`) uses the same `createOrder`. Web checkout inserts with the service role (`orders-service.ts`). |
| When | Platform counter sales are **written behind** (`place-sale.ts`, `writeBehind: isPlatform`): the order id is minted on the device, the sale is queued and handed over at once, and the outbox writes it seconds (or hours) later. So a refusal at the INSERT lands after the customer already has the food. |
| Where stock is checked | Only on the device: `/api/inventory/ceilings` (TS engine `producible.ts` over `readTenantStockGraph`, which judges every shelf on a block store) → `pos-stock-warning.ts` / `pos-stock-decision.ts` / `StockShortSheet`. |
| Where stock is deducted | After the write, `POST /api/inventory/order-stock` (service role) → `apply_order_stock_claim` → `stock_movements` rows; `apply_stock_movement` stamps `balance_after` (the branch shelf after the movement). |
| Manager override today | There is **no PIN**: "Sell anyway" on a block store needs the signed-in account to hold `inventory` (`canSellPastStock`); otherwise the sheet says "ask a manager to sign in on this register". Offline the register never blocks. |
| Offline queue | `order-outbox.ts` stores the full `orderArgs`; `sync-outbox.ts` replays `createOrder`; a 4xx-class refusal is permanent and stays visible to the cashier. Nothing in the row says the sale was taken offline. |
| Block stores live (read-only probe 2026-11-10, service-role REST GET of `tenants`) | **1 of 308: `sofiaskitchen`**, pinned `order_backend = 'platform'`, **0 platform orders so far** (it is mid-move from Convex). |

## 2. Enforcement point

A DB judgement of "does this oversell" at INSERT would need a SQL twin of the
~1,000-line TS stock engine (recipes, option/linked/simple stock, unit
conversion, block-store shelf rules), and because sales are written behind it
would refuse honest sales AFTER hand-over whenever the shelf moved between
Charge and sync. Neither is acceptable.

So the judgement stays in the one TS engine, made **synchronously at Charge,
before hand-over**, and the database refuses any client write that did not go
through it:

1. **`POST /api/pos/stock-clearance`** (bearer, member of the store with `pos`,
   own branch): judges the sale's lines with the same engine as the ceilings /
   checkout guard. Fits → a *clearance*. Short → `409 needs_manager` with the
   approvers, unless the caller may sell past stock themselves (owner /
   `inventory`, branch rule) or the body carries an approver + PIN, verified by
   `verify_staff_approval_pin` (bcrypt, 5 tries, 15 min → 1 h → 24 h lock)
   behind the shared PIN rate limits (`staff-pin/pin-limits.ts`) plus a
   per-cashier-per-approver limit (as remittances). Clearances live in
   `pos_stock_clearances` (service role only: no client can read, write or
   forge one), bound to **store, branch, cashier, the device-minted order id,
   and the per-dish quantities judged** (the binding idea of
   `approval-binding.ts`; the order does not exist yet, but its id does).
2. **Trigger `orders_pos_stock_guard`** (BEFORE INSERT on `orders`, acts only
   when `current_user = 'authenticated'`, every `source`): on a block store the
   row must have a clearance for (tenant, `new.id`, `auth.uid()`, outlet) or
   carry the offline marker `customer_data.pos.stockCheck = 'offline'`.
   Otherwise `42501` `POS_STOCK_NEEDS_APPROVAL`. A direct PostgREST insert from a
   staff session has no clearance (it cannot make one) → refused.
3. **Trigger `order_items_pos_stock_guard`** (AFTER INSERT, statement): for a
   fresh order (no `order_revisions` yet) on a block store with a clearance,
   the per-dish totals of ALL its items must not exceed the latest clearance's
   — so a clearance for one coffee cannot carry fifty steaks, also not split
   over several inserts.
4. **Ledger flag** (AFTER INSERT on `stock_movements`, only for a `sale`
   movement of an order that leaves an active shelf below zero on a block
   store): one Store Activity row `stock.oversold` per order —
   approved (latest clearance has an approver) → no flag, approver named;
   offline marker → flag `oversold_offline`; anything else (an edit, a race,
   an option swap) → flag `oversold_unapproved`. Owners see it under Store
   Activity → "Needs a look". This is the "least invasive existing surface": no
   new screen, push or notification kind.

Service role (web checkout, server writers, the stock route) and anon are never
touched by 2–3. `warn` stores return at the first line.

What the server cannot verify: a register that *claims* to be offline. That is
the owner's rule (offline sales are kept) and every such oversell is flagged.

## 3. App (OTA-only, no native module)

- `lib/pos-stock-clearance.ts`: the call (bounded, via `callWebRoute`) and a
  per-store policy memo fed by the ceilings read and by the route (a known
  `warn` store never pays the round trip).
- Tender (`pos-tender.tsx`): before `placeCounterSale` on a platform store that
  is not known to be `warn`: offline → stamp `pos.stockCheck = 'offline'`;
  online → ask for a clearance for the minted id; `needs_manager` →
  `StockApprovalSheet` (approver list + `PinPad`, reused from Senior/PWD) and
  retry with the PIN; unreachable (at the first ask OR when the PIN is sent,
  e.g. before this migration is applied) → stamp offline and sell (never freeze
  the till). Order id is kept across the retry.
- `pos-stock-decision.ts`: on block + online, "Sell anyway" now continues to the
  tender (where the PIN is asked) instead of dead-ending on "sign in".
- `scan.tsx`: mints the order id, asks for a clearance on non-`warn` platform
  stores, refuses with the server's message when a manager is needed; strips any
  `pos.stockCheck` a customer's QR might carry.
- Edits (revise/append) are not refused by the server (they write a revision
  first); an edit that oversells is flagged `oversold_unapproved`.

## 4. Older installed app builds

They never ask for a clearance, so on a block store EVERY platform sale they
write is refused at sync (`42501`), including sales that fit and sales taken
offline (they don't stamp the marker) — the sale stays in the outbox with the
error. Impact today: one store (`sofiaskitchen`) with no platform sales yet.
**Rollout order: app OTA first → confirm SofiasKitchen's registers run it →
then apply the migration.** `warn` stores (307) are unaffected by any build.

## 5. Rollout

1. Merge; deploy web (route is inert until a block store's register calls it).
2. OTA the merchant app (production channel); confirm SofiasKitchen devices.
3. Apply `20261110120000_pos_stock_block_server.sql`, probe triggers/table/
   grants, regenerate `src/types/database.ts`.
4. Owners/managers who approve need a PIN (Settings → Tax & discounts, today
   gated to `discount_review`; widening it to `inventory` is a follow-up).

# Bills: combine and split: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Bills: combine & split (merchant app)

`webnegosyo-app/app/(main)/bill.tsx?orders=<id,id>` — one bill over one or more PLACED orders. Opened from a table ("Bill & split") or an order ("Split or combine bill"); "Combine another order" adds more. Modes: One bill · Split evenly · By item (tap a guest, tap dishes) · Custom amount (type what a guest pays; blank guests share the rest evenly).

- **A bill never moves items between orders** (unlike Toast/Loyverse "merge/split tickets"): kitchen, stock, analytics and each order's own receipt are untouched. Only the paper and the payment spread change. Pure engine in `webnegosyo-app/lib/bill/` (tested in place).
- **Money in centavos** (`money.ts` largest-remainder): by item prices every PIECE (`bill-split.ts` units) with its slice of its order's service/delivery/discount, so an order's units always sum to its total. Even split freezes the owed amount when chosen (`bill-plan.ts` `basisCents`).
- **Paying** = `settleBill`: one `orders:recordPayment` row per order the payment settles (by-item shares fill their own orders first, else oldest first), never more than an order owes; cash/change noted on the first row only; `updatePaymentStatus('paid')` only when square. Stops at the first failed write and reports it. Gate = `canCollectPayment` for every owing order (`bill-state.ts`).
- **Custom amount** (`custom-split.ts`): typed amounts must add up to `basisCents` (frozen like even); otherwise the screen shows by how much and holds every guest's Collect. A guest who has paid keeps the share they paid against (`recordCustomPayment` pins it), and the others' amounts stay editable — the one exception to "locked once a guest pays". Slips reuse the even-share receipt.
- **Split between methods** (`split-tender.ts`, `SplitTenderEditor`): ₱200 cash + the rest by GCash = one ledger row per method. Offered on the bill's Collect (every mode) AND the order screen's Collect (`use-order-payment-flow.ts` `settle`). The register's tender screen has none yet.
- **Plan** (mode, guests, who-had-what, typed amounts, per-guest paid) is in-memory zustand (`stores/bill-store.ts`), locked once a guest pays; the ledgers stay the truth. By item is refused once money was taken outside the split.
- **Receipts** go through the merchant's layout: `ReceiptOrder.bill` (heading / orderRefs / share) + `amountPaid` (Paid · Balance due · Amount due). Bills print without the tracking QR (`printOrder(order, { printKey, withQr: false })`) and never inherit an order's stored cash/change.
- **Register split** (`lib/pos-split-tender.ts`, tender screen "Split between methods", new sales paid now): the order is inserted PAID with NO `payment_method_name` and `customerData.pos.split` as a record; each line is its own `orders:recordPayment` row (queued behind a write-behind/offline sale, replayed after it). Ledger rows override the order's method in the drawer, the shift SQL twin and reports; until they land a method-less sale reads as non-cash, so cash is never over-expected. Lines must cover the whole sale; a non-cash line whose method requires proof needs its reference.

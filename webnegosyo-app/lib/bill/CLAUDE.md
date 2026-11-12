# Bills: combine and split: rules for this folder

<!-- Moved verbatim from the root CLAUDE.md on 2026-11-11. The root file's rules for every change
     (Platform Supabase First, verification, conventions) still apply here. -->

## Bills: combine & split (merchant app)

`webnegosyo-app/app/(main)/bill.tsx?orders=<id,id>` — one bill over one or more PLACED orders. Opened from a table ("Bill & split") or an order ("Split or combine bill"); "Combine another order" adds more. Modes: One bill · Split evenly · By item (tap a guest, tap dishes).

- **A bill never moves items between orders** (unlike Toast/Loyverse "merge/split tickets"): kitchen, stock, analytics and each order's own receipt are untouched. Only the paper and the payment spread change. Pure engine in `webnegosyo-app/lib/bill/` (tested in place).
- **Money in centavos** (`money.ts` largest-remainder): by item prices every PIECE (`bill-split.ts` units) with its slice of its order's service/delivery/discount, so an order's units always sum to its total. Even split freezes the owed amount when chosen (`bill-plan.ts` `basisCents`).
- **Paying** = `settleBill`: one `orders:recordPayment` row per order the payment settles (by-item shares fill their own orders first, else oldest first), never more than an order owes; cash/change noted on the first row only; `updatePaymentStatus('paid')` only when square. Stops at the first failed write and reports it. Gate = `canCollectPayment` for every owing order (`bill-state.ts`).
- **Plan** (mode, guests, who-had-what, per-guest paid) is in-memory zustand (`stores/bill-store.ts`), locked once a guest pays; the ledgers stay the truth. By item is refused once money was taken outside the split.
- **Receipts** go through the merchant's layout: `ReceiptOrder.bill` (heading / orderRefs / share) + `amountPaid` (Paid · Balance due · Amount due). Bills print without the tracking QR (`printOrder(order, { printKey, withQr: false })`) and never inherit an order's stored cash/change.

# TDD evidence — folding order editing into POS mode

**Source plan**: inline `/ecc:plan` output, this session (no `*.plan.md` artifact).
**Branch**: `feat/platform-supabase-order-parity`

## What was asked

1. Remove the `order-edit` and `order-settle` navigation.
2. Editing an order enters POS mode — the register, its product grid, its modifier sheet.
3. Settlement runs through the POS tender screen, "just like on the POS".

This is what the code always intended. `lib/order-edit-cart.ts` opens with *"Editing an order turns the order detail screen into the POS register"*; the two standalone screens were the shortcut taken to get the flow working.

## User journeys

- As a cashier, I want to correct a placed order on the register I already use, so I do not learn a second, worse editing screen.
- As a cashier, I want to collect or refund the difference through the tender screen, so settlement works the way every other sale does.
- As a merchant, I want an edited order to keep its delivery fee and its service charge, so editing never quietly undercharges the customer.
- As a cashier, I want to be stopped from loading an order on top of a counter sale I am half way through ringing up.

## Task report

### Task 1 — edit-mode rules in `lib/`

Screens in this app are untestable: `webnegosyo-app/jest.config.js` scopes Jest to `lib/` and `theme/`. Every judgement therefore moved into `lib/pos-edit-mode.ts`, and `pos.tsx` / `pos-tender.tsx` only render what it returns.

- **RED** — `npx jest lib/pos-edit-mode.test.ts` → `TS2307: Cannot find module './pos-edit-mode'`. Compile-time RED, single cause. Commit `9c3bcd5`.
- **GREEN** — same command, 23/23 pass. Commit `543318b`.

Guarantees: the open-sale refusal; deferral of the status / permission / backend / branch rules to `canEditOrder` rather than a fourth copy; refusal ordering; hydration, ledger and revision carry-forward.

### Task 2 — the part of a bill that is not its line items

Discovered mid-implementation, and the reason this task exists at all: **`serviceChargeAmount` is not stored on an order in either backend.** The platform orders table has no column; the Convex schema (`convex-template/convex/schema.ts`) has no field. `reviseOrder` accepts it as an argument and folds it into the total, but nothing persists it — so reading it back on a later edit always yields `undefined` and the charge silently disappears from the bill.

A carry-forward that read a field which never exists would have been the original bug wearing a better shape, so this was pinned separately before implementing.

- **RED** — `npx jest lib/pos-edit-mode.test.ts` → `TS2339: Property 'carriedCharges' does not exist on type 'OrderEditContext'`. Commit `bc2c557`.
- **GREEN** — 26/26 pass. Commit `2190028`.

`deriveCarriedCharges` subtracts the line items and the delivery fee from the placed total. Named `carriedCharges`, **not** for the service charge: the same residue also carries discounts and rounding, and naming it for one cause invites someone to recompute it from the order type's rate — which is exactly the mistake. Not floored at zero, because a negative residue is a discount the customer was given and clamping it would re-bill them for it.

The load-bearing assertion is the identity: reopening an order and changing nothing reproduces the placed total to the centavo.

### Task 3 — the screens, and the deletion

Commit `34d7361`. No RED gate: these are rendering changes in files Jest cannot reach, verified by `tsc`, `expo lint`, and the full suite.

- `pos.tsx` — edit banner (was/now, Cancel), locked order type, incoming-orders drawer hidden, charge button relabelled to the settlement intent.
- `pos-tender.tsx` — `reviseOrder` then `recordPayment`, and only when there is a difference. Revise lands first: a payment recorded against the old total settles a bill that no longer exists. Refund hides the cash pad and the proof capture and is gated on `order_refund`. Methods come from `listAllPaymentMethods`, so a GCash delivery order can be topped up in cash.
- `order/[orderId].tsx` — Edit loads the menu, calls `enterEditMode`, and `goTo`s the register.
- `app/(main)/order-edit/` and `app/(main)/order-settle/` deleted.

## Test specification

| # | What is guaranteed | Test | Result |
|---|---|---|---|
| 1 | An editable order opens on an empty register | `pos-edit-mode.test.ts:allows opening an editable order on an empty register` | PASS |
| 2 | A placed order cannot be loaded over an open counter sale | `:refuses while a counter sale is still open on the register` | PASS |
| 3 | The refusal names the way out, not just the refusal | `:names the way out rather than just refusing` | PASS |
| 4 | The kitchen-started rule still applies on the register | `:still refuses an order the kitchen has started` | PASS |
| 5 | The order's own refusal is reported ahead of the open-sale one | `:reports the order's own refusal ahead of the open-sale one` | PASS |
| 6 | The order's items become register cart lines | `:loads the order's items into a register cart` | PASS |
| 7 | The delivery fee survives the edit | `:carries the order's delivery fee into the context` | PASS |
| 8 | The rest of the bill is recovered from the placed total | `:recovers the rest of the bill from the placed total` | PASS |
| 9 | A discount is preserved, not clamped to zero | `:preserves a discount rather than clamping it away` | PASS |
| 10 | A no-op edit reproduces the placed total exactly | `:reproduces the placed total exactly when nothing is changed` | PASS |
| 11 | The optimistic-lock revision is recorded on open | `:records the revision the register opened, for the optimistic lock` | PASS |
| 12 | Off-menu modifiers are reported, never dropped | `:reports modifiers that are no longer on the menu instead of dropping them` | PASS |
| 13 | Fees are re-applied on top of the edited cart | `:adds the carried delivery fee and remaining charges to the items total` | PASS |
| 14 | Raising the bill asks the cashier to collect | `:asks the cashier to collect when the edit raised the bill` | PASS |
| 15 | Lowering the bill asks the cashier to refund | `:asks the cashier to refund when the edit lowered the bill` | PASS |
| 16 | An unpaid order opens owing its whole total | `:owes the full total when nothing was ever paid` | PASS |
| 17 | A prior refund nets out of what is still owed | `:nets a prior refund out of what is still owed` | PASS |
| 18 | An emptied order cannot be saved, and says why | `:blocks saving an emptied order and says why` | PASS |
| 19 | A no-op edit cannot be saved | `:blocks saving when nothing was actually changed` | PASS |

## Coverage

```
npx jest --coverage --collectCoverageFrom='lib/pos-edit-mode.ts' …
 pos-edit-mode.ts   |     100 |      100 |     100 |     100 |
```

Full suite: `npx jest` → **83 suites, 1337 tests, all passing**.
`npx tsc --noEmit` → exit 0. `npx expo lint` → **0 errors** (5 warnings, all pre-existing and in files not touched here).

## A bug closed on the way past

`order-edit/[orderId]` and `order-settle/[orderId]` were **never registered in `app/(main)/_layout.tsx`**. Every other non-tab route there — `order/[orderId]`, `pos-tender`, `scan`, `product/[productId]`, `printer-settings`, `account` — is declared with `href: null`. In an Expo Router `Tabs` layout an undeclared route still gets a tab button, so those two had been leaking stray entries into the tab bar for every account. Deleting them closes it.

## Known gaps

| Gap | Why it is still open |
|---|---|
| **Convex v17 is bundled but not deployed** | Needs a redeploy to reach Gungjeon Unlimited. Until then that tenant has the screen gate but not the Convex write-path guard for the kitchen-started rule. **User action.** |
| Stock is not adjusted on save | `lib/order-stock-delta.ts` has the arithmetic, but nothing claims it against the ledger yet. Spending ingredients twice is worse than not spending them. Blocked on the concurrent session's `order-stock-claim.ts`. |
| `carriedCharges` absorbs everything unexplained | It is the residue, so a genuine data error in `total` or `subtotal` would be preserved as a "charge" rather than surfaced. Preferable to dropping it, but a stored service-charge column on both backends would be the real fix. |
| The screens themselves are untested | Jest is scoped to `lib/`. Mitigated by keeping every judgement in `pos-edit-mode.ts`; the screens hold no money logic. |
| The revise + record pair is not atomic | If `recordPayment` fails the order is correctly revised and shows an outstanding balance the cashier can settle again. Chosen ordering makes the failure recoverable rather than corrupting. Platform-side atomicity is task 5.4. |

## Merge evidence

| Commit | Stage |
|---|---|
| `9c3bcd5` | RED — compile-time, `lib/pos-edit-mode` absent |
| `543318b` | GREEN — 23/23 |
| `bc2c557` | RED — compile-time, `carriedCharges` absent |
| `2190028` | GREEN — 26/26 |
| `34d7361` | Screens folded into the register; old routes deleted |

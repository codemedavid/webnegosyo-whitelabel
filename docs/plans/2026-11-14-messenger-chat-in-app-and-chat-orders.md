# Messenger: chat in the app + orders taken from a chat

Date: 2026-11-14 · Status: **APPROVED 2026-11-14.** C1 built on `feat/messenger-chat-app`. C2 + C3 approved with D1 = hold until the customer confirms AND staff can push the order through themselves; D2 = payment-method buttons after Confirm; D3 = counts as Messenger; D4 = store-wide accounts only for now; D5 = ask Meta for the names feature after the current review passes. Builds on `docs/plans/2026-11-11-messenger-studio-and-chat-inbox.md` (chat log + names, B1, live on platform).

Owner ask (2026-11-14):
1. Show the customer's Facebook name on Messenger orders in the app, and their short chat. (Designed 11 Nov as B2; "develop those now".)
2. A customer who types their order instead of using the cart: staff should be able to take it. Open the register **for that person**, and the order summary is **sent to them automatically to confirm**.
3. While taking that order, **tap the customer's chat** to pull the name, phone number or address into the order.

Later rounds (brainstormed 2026-11-14, not in this plan): choices in chat, typed orders read by the bot, order again, cart reminder, closed-store cart replies, pairing after add, finish in chat.

---

## 1. What exists today (checked 2026-11-14)

| Fact | Where |
|---|---|
| Chat log, names and photos are stored and readable by staff as themselves (RLS): `messenger_sessions` chat columns, `messenger_messages`, `messenger_chats()`, `messenger_chat_for_order()` | `20261111224021_messenger_chat_log.sql` (applied) |
| No real chat has been logged yet: 0 lines, 0 names (App Review in progress, stores must reconnect) | platform, 2026-11-14 |
| Facebook names need Meta's "Business Asset User Profile Access" feature for a business app; it was not in the 4 Nov review. Phone-number Messenger accounts never have a profile | Meta docs |
| The app shows a Messenger order as the plain word "messenger" | `webnegosyo-app/components/OrderCard.tsx` |
| The register takes nothing by route param; a table pre-attaches itself through the cart store | `stores/pos-cart-store.ts`, `tables.tsx` `startOrderFor` |
| A register order is inserted as `confirmed`, straight into the kitchen, and its chit prints at once | `lib/backends/supabase-orders.ts` `SELF_CONFIRMING_SOURCES`, `pos-tender.tsx` |
| On platform stores a sale is always queued first; the order row exists up to 20 s later (or after an outage), after the cart was cleared | `lib/offline/place-sale.ts`, `use-outbox-sync.ts` |
| A typed phone is kept only for dine-in walk-ins and delivery; pickup drops it | `pos-tender.tsx`, `lib/customers/pos-attachment.ts` |
| Status messages fire on a status CHANGE only; a new order sends nothing | trigger `orders_messenger_order_update` |
| The order summary the customer gets after web checkout is hard-coded ("New Order from … Please confirm your order!") | `src/lib/messenger-message-formatter.ts` |

---

## 2. C1 — Chat in the app (approved; building now)

Read-only. Platform stores, accounts that can read orders. No new tables, no new server code: the app reads as the signed-in account.

1. **Order card**: the customer's Messenger photo replaces the initials circle; a neutral chip "Messenger" (with the Facebook name when it adds something: "Messenger · Ana C." beside a checkout name of "Table 4"); a coral "New message" chip when the customer wrote after ordering and the order is still open.
2. **Order screen**: a "Messenger chat" card with the last 3 lines and "See chat".
3. **Chat screen** `(main)/chat/[sessionId]`: photo, name, "Bot on" / "Bot paused · 42 min", day separators, customer bubbles left, staff right, bot lines as one grey line each. Footer: "Reply in Messenger" (opens the Page inbox). No typing in v1.
4. **Chats list** `(main)/chats`: opened from a header button on Orders (never a new tab). Newest first, with the latest order's status chip.

**Name rule (new)**: Facebook name when we have it, else the name typed at checkout, else "Messenger customer". A card is never blank.

**Change from the 11 Nov design**: the chats list is a plain screen behind a header button, not a `SUBSCREEN_PARENTS` tab. A new tab key would have to be added to the four permission registries; the screen instead asks for an order-reading key itself and the database enforces the same rule.

Not in C1: pausing / resuming the bot from the app (needs a server route; comes with C2), push on a new message, replying.

---

## 3. C2 — Take an order from a chat (needs OK)

### The flow

1. Customer types "pa-order po 2 inasal 1 halo-halo, pickup 6pm". The bot hands over (Talk to staff, or staff reply in the inbox).
2. Staff open the chat in the app and tap **Make order**. The register opens with a banner: "Ordering for Ana C. · View chat".
3. Staff ring up the dishes. On the payment screen **View chat** opens the conversation as a sheet (step "Tap to fill" below).
4. Staff tap **Send to customer**. The order is saved and the customer gets the summary in Messenger at once, with two buttons: **Confirm order** · **Change something**.
5. Customer taps **Confirm order** → the order goes to the kitchen, the chit prints, the customer gets "Confirmed, thank you" with how to pay. Staff can also confirm by hand (the customer said yes in words).
6. Customer taps **Change something** → the bot says "Sige po, tell us what to change", stays quiet, and the order shows a "Wants a change" chip. Staff edit the order from the order screen as today.

### Waiting for the customer's OK

A chat order is saved as **waiting** (`pending`), not `confirmed`. The kitchen board shows `confirmed` and `preparing` only, so nothing is cooked or printed until the customer (or staff) confirms. An order still waiting after 30 minutes shows "No answer yet" on its card; nothing is cancelled automatically. See **D1**.

It is saved as pay later (unpaid). The existing collect-payment flow settles it. See **D2** for the payment line.

### Tap to fill

In the chat sheet on the payment screen:
- **Found in chat** row at the top: chips the app spotted in the customer's own lines. Phone numbers (09…, +63…, with spaces or dashes) are found automatically; the Facebook name is offered as the name. One tap fills the field.
- **Any customer bubble** can be tapped: "Use as name · phone · address · order note". Addresses are never guessed; staff pick the line.
- A filled field shows where it came from and can still be typed over.
- A phone from the chat is kept for every order type, including pickup (today the register drops a typed phone on pickup).
- An address fills the delivery sheet's address box; the pin and fee work as they do now.
- Order note: the register has no order-level note today. It is stored as a checkout answer named "Note from chat" and prints with the other answers.

Detection runs on the phone, over lines already on screen. Nothing is sent to an AI model.

### How the summary is sent (server)

The register cannot send it: the order row does not exist yet when the sale is queued, and the phone may be offline.

- The app writes the chat's id on the order (`customer_data.messenger_session_id`), nothing else.
- A database trigger on a new order carrying that id posts the order id to a new route, `POST /api/messenger/chat-order` (same pattern as the status messages: ids only, everything re-read with the service role, a once-only claim row).
- The route checks the chat belongs to the order's store, writes the customer's `messenger_psid` onto the order itself (the register never does), and sends the summary with the two buttons. It sends only inside Meta's 24 hours since the customer's last message; outside it the order shows "Couldn't send: customer last wrote over 24 hours ago" and staff use the inbox.
- Limits: one summary per order; a cap per chat per hour.
- The buttons are our own payloads (`wn1|oc|<order>` / `wn1|ox|<order>`), re-checked against this customer and store. Confirm is one conditional update `pending → confirmed`; a second tap answers "Already confirmed".
- Taps on our buttons answer even while the bot is paused (as today), so the handover does not block the confirmation.
- Platform stores only. Convex stores do not get the Make order button.

Hardening that ships with it: the register path stops accepting a customer id typed by the client on an order; only the server attaches one.

### App changes

- Cart store: a `chat` slice (`sessionId`, name) set like a table is; cleared with every sale.
- `Make order` asks "Clear the register?" when a sale is in progress (same as Tables).
- Tender screen: banner, chat sheet, "Send to customer" replaces "Charge" while a chat is attached.
- Order card / screen: "Waiting for customer", "Wants a change", "No answer yet", "Couldn't send" chips; a "Confirm for customer" button.
- Bot pause / resume on the chat screen (new bearer route, `orders` or `pos`).

### Branch accounts

A branch account can only read chats that already have an order at its branch. So **Make order** from a chat with no order yet is for store-wide accounts; a branch cashier can still take a repeat customer's order. See **D4**.

---

## 4. C3 — The summary's words (needs OK; C2 depends on it)

The summary becomes registry messages like every other bot message (`messages/registry.ts`), editable in Messenger Studio → Messages → After ordering:

- Opening line, closing line (today's fixed "Please confirm your order!").
- Switches: customer details, price per dish, payment details.
- Payment line per payment method, e.g. "Send {total} to GCash {details}, then send the screenshot here."
- Buttons: Confirm order, Change something (chat orders); Track order, Talk to staff (web orders).
- Blank = today's exact words for web-checkout orders (golden test pins it), so no store changes until the owner edits.

---

## 5. Build order

1. **C1** (now): pure chat module + reads + order card + order screen card + chat screen + chats list. Unit and component tests; simulator walk on sample-demo once a real chat exists.
2. **C3**: registry entries + builder + Studio fields + golden test.
3. **C2 server**: migration (trigger, claim table, key hardening), `chat-order` route, payload verbs, confirm / change handlers, pause route. PGlite runner as each role; applied + probed on platform.
4. **C2 app**: cart slice, Make order, banner, chat sheet + tap to fill, Send to customer, chips.
5. Live walk on the demo Page (the owner's Facebook account): type an order, Make order, fill from chat, Send, Confirm.

## 6. Decisions for the owner

- **D1 — Hold the order until the customer confirms?** Recommended: yes (nothing cooks on a wrong order), with "Confirm for customer" for staff. Alternative: send straight to the kitchen and treat the summary as a receipt.
- **D2 — What does "Confirmed" say about paying?** Recommended: the store's payment methods as buttons after Confirm ("How will you pay? GCash · Cash on pickup"), then that method's payment line. Simpler alternative: one fixed payment line the owner writes.
- **D3 — Sales channel of a chat order taken at the register.** Recommended: count it as Messenger in channel reports (it came from the chat), keep the cashier on it. Alternative: POS.
- **D4 — Branch cashiers and brand-new chats.** Recommended: store-wide accounts only for now. Alternative: let branch accounts read every chat of the store (wider access to customer messages).
- **D5 — Ask Meta for the names feature** in a follow-up App Review once the current one passes. Recommended: yes.

## 7. Risks

- Nothing here has met a real customer yet. C1 can be checked with real rows only after someone messages a connected Page.
- A held order that nobody confirms sits in the queue. The "No answer yet" chip is the only nudge in this round.
- Customer messages are personal data: read as the staff account under the same rule as orders, 30-day purge unchanged, never sent to a model.
- Money: a held order is unpaid and counts in sales only as other unpaid orders do. No new revenue formula.
- The summary uses Meta's standard 24-hour messaging. No message tags, no new review permission.

## 7. As built (2026-11-14) — C2 + C3

Built on `feat/messenger-chat-app`. Where the build differs from the sections above, this section wins.

**Flow**

1. Chat screen → **Make order** (store-wide accounts with the register, platform stores). The register opens with a banner "Ordering for Ana C."; the Facebook name is pre-filled.
2. **View chat** on the banner (register and payment screen) opens the chat beside the sale: the Facebook name and any phone number the customer typed are one tap; any line the customer wrote can be used as the name, phone, delivery address or the order's note ("Note from chat"). Bot and staff lines are never offered.
3. The payment screen has no pay-now / pay-later choice for a chat order: **Swipe to send to the customer**. The order is saved `pending`, unpaid, `source = 'pos'`, with `customer_data.messenger_session_id` (the register never sends a Messenger id).
4. Trigger `orders_messenger_chat_order` → `POST /api/messenger/chat-order` → the server attaches the chat's customer, builds the summary (dishes, choices, discount / service / delivery, total) and sends it with **Confirm order** / **Change something**. One row per order in `messenger_chat_orders` (claim + outcome).
5. **Confirm** → the order becomes `confirmed` (kitchen board, auto-print), then the payment question: one method = its payment line straight away; several = quick-reply buttons, then that method's line. The method is written on the order while it is unpaid.
6. **Change something** → the bot pauses for the chat, the order is flagged "Wants a change", staff edit the order and confirm it themselves.
7. **D1, staff push-through** = the order's normal Confirm button on Orders / the order screen. No separate control.

**On the order** (Orders list chip + order screen card): Sending to customer → Waiting for customer → No answer yet (30 min, nothing is cancelled) · Couldn't send (with the reason: over 24 hours since the customer wrote, Page not connected, …) · Wants a change · Customer confirmed.

**C3 as built**: the chat-order wording is eleven registry entries (`chatorder.*`, moment "After ordering"), editable in Messenger Studio like every other bot message. The web-checkout order summary keeps its current wording; moving it into the registry is not in this release.

**Changed from the plan**

- **D3 (count as Messenger) is not delivered.** The sales channel is derived only from `orders.source`, which has no Messenger value; web orders that come from Messenger report as "online" today. A chat order stays `source = 'pos'` (shift, drawer and cashier totals depend on it) and reports under Counter. A real Messenger channel means a change to the sales model, its SQL twins and the source constraint, for web Messenger orders too. Needs its own decision.
- Not in this release: bot pause / resume from the app, re-sending the summary after staff edit the order, and the register-key hardening listed in §3 (tracked separately).
- Stock is taken when the sale syncs (like any order placed unpaid) and returns if the order is cancelled.
- A register sale confirmed later is not pushed to Loyverse a second time (`/api/loyverse` skips `source = 'pos'` unless it is the sale-time push).

**Release order**: migration `20261115013219_messenger_chat_orders.sql` → web deploy → app update. Until the web is live, a chat order would save and never be summarised, so the app update goes last.

**Checked**: PGlite `tests/sql/run-messenger-chat-orders.cjs` (45 checks over the real migration, each role), `tests/unit/messenger/chat-order.test.ts`, `handle-event.test.ts`, app suites under `lib/messenger-chat`, `components/chat`, `stores/pos-chat-order-journey.test.ts`. **Not checked** (as of 2026-11-14): the migration is not applied to the platform yet, so no live probe; no walk on a device or a real Page.

**2026-11-15 walk (sample-demo, simulator + a real chat on the test Page)**: migration applied and probed as real roles (owner reads its rows from the app, another store's owner 0 rows, anon 42501, staff 42501 on the attach function, one pg_net call per register order naming a chat). Chats list → chat → Make order → register banner → View chat (name, phone, note) → Swipe to send → the summary arrived in Messenger → Confirm → payment buttons → the method's payment line; the order card went Waiting for customer → Customer confirmed. The trigger's call reached production (404, not deployed), so the route and the two taps ran on a local server against the platform database. Three defects found and fixed: the phone tapped in from the chat was wiped when the order type changed; the summary left out a register line's size and add-ons (`variation_selections`); a store-wide account at a multi-branch store reached the register with no branch and no way forward (Make order now asks for the branch first). **Still not checked**: Change something on a real order, a real button tap delivered by Meta (needs the web deploy), a physical phone.

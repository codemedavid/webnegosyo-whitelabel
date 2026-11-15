# Messenger: reply from the app, with quick actions

Date: 2026-11-15 · Status: **APPROVED 2026-11-15** (R1–R5 as recommended; T1 + T2 in, T3 out; design canvas §8 incl. the tablet layout 4c, approved as drawn). Builds on `2026-11-14-messenger-chat-in-app-and-chat-orders.md` (C1 chat screen, C2/C3 chat orders; branch `feat/messenger-chat-app`, not deployed yet).

Owner ask (2026-11-15): chat with the customer from the app, plus quick actions: send the checkout page when they already have a cart, send the menu, other quick actions, reply, and send the order status.

---

## 1. What exists today (checked 2026-11-15)

| Fact | Where |
|---|---|
| The chat screen is read-only: lines, "Bot on / paused", latest order strip, **Make order**, "Reply in Business Suite" | `webnegosyo-app/app/(main)/chat/[sessionId].tsx` |
| It refreshes every 20 s while open | same, `REFRESH_MS` |
| Every bot card is built by one set of pure builders in the store's own words (menu, categories, featured, hours & location, cart with Checkout button, order status) | `src/lib/messenger/replies.ts`, `messages/registry.ts` |
| Staff typing `/menu`, `/categories`, `/hours` in Page Inbox already sends that card without pausing the bot | `handle-event.ts` `handleEcho` |
| A person typing in Page Inbox pauses the bot (setting, default 60 min) | same |
| Our own sends carry `metadata: "wn"` and our app id; their echoes are ignored, so a send is logged when it goes out, not from the echo | `send.ts`, `handle-event.ts` |
| The chat cart (`messenger_sessions.cart_data`) is readable by the service role only, and is re-priced on every read | `chat-cart-store.ts`, column grants in `20261111224021` |
| The checkout link is `/cart?mc=1&m=<token>`; the token names the chat, never the PSID | `link-token.ts` |
| Status messages go out automatically on a status change, inside 24 h, when that status is switched on | `order-update.ts`, `decideOrderUpdate` |
| There is no server route for the app to send a message or pause the bot | `src/app/api/messenger/` |
| Meta allows free replies only within 24 h of the customer's last message. Up to 7 days needs the `human_agent` permission, which was not in the 4 Nov App Review | Meta docs, App Review notes |
| Until App Review passes, only people with a role on our Meta app can receive messages (the owner's account works) | App Review in progress |

---

## 2. What staff get

### The composer

- A text box at the bottom of the chat screen with **Send**. The reply goes out from the Page, as the store, exactly like a reply typed in Page Inbox.
- It shows at once as a staff bubble "Sending…", then "Sent". If Meta refuses, the bubble says "Not sent · Try again"; nothing is sent twice (each reply carries its own id).
- Under each staff bubble sent from the app: who sent it ("Joy · app"). Replies typed in Page Inbox keep showing as "Staff". See **R5**.
- Typing a reply **pauses the bot** for the store's takeover time, like Page Inbox does. See **R3**.
- While the screen is open, new customer lines show within about 5 s (today 20 s).

### Quick actions (a row of chips above the box)

| Chip | Shown when | What the customer gets |
|---|---|---|
| **Send checkout** · "Cart · 3 items · ₱420" | their chat cart has items | the cart card the bot sends: lines, total, **Checkout** button to `/cart?mc=1&m=<token>` (prices re-read now; dishes that can't be ordered are dropped and named) |
| **Send menu** | always | the menu card (same as the bot's "menu" answer) |
| **Categories** | the menu has categories | the categories card |
| **Order status** · "#07 Preparing" | they have an open order at this store | that status's message in the store's words with **Track order**, even if that status's automatic message is switched off |
| **How to pay** | their latest order is unpaid and the store has payment methods | the payment buttons from the chat-order flow (one method = its payment line) |
| **Hours & location** | always | the hours & location card |

Quick actions never pause the bot (like `/menu` in Page Inbox). Before sending, the chip shows a preview of the card in a sheet with **Send** — one tap more, so a stray tap doesn't message a customer.

### Status from the chat

The latest-order strip gets the order's next step as a button (**Confirm**, **Preparing**, **Ready**, **Done**), using the app's normal status change. The automatic status message follows as it does today. "Order status" above re-sends the current one.

### Bot on / off

The header's "Bot on" / "Bot paused · 42 min" becomes a switch: **Pause bot** (for the store's takeover time) / **Turn bot back on**.

### After 24 hours

When the customer last wrote more than 24 h ago, the box and the chips are replaced by: "They last wrote 2 days ago. Messenger only lets you reply within 24 hours of their last message." with **Reply in Business Suite**. In the last hour the box shows "You can reply for 40 min more". See **R2**.

### The chats list

A coral **Needs a reply** chip on chats where the customer wrote last and asked for staff, or wrote while the bot was paused.

---

## 3. How it works (server)

One bearer route, `POST /api/messenger/chat` (wrapped in `withRequestBearer`, like the Owl routes), one strict zod body per action:

- `tools {sessionId}` → can this account reply, window ends at, bot paused until, cart summary (priced now, lines + total only), latest open order (number, status, unpaid), which chips apply.
- `send_text {sessionId, clientId, text}` → text ≤ 2,000 characters (Meta's cap), trimmed, not empty.
- `send_card {sessionId, clientId, card: menu|categories|cart|hours|order_status|pay, orderId?}`.
- `bot {sessionId, pause: true|false}`.

Every action, in order:
1. The caller is a member of the store, store-wide, with an order key (same people as **Make order**; **R1**).
2. The chat is read **as the caller** (RLS); no row = 404. Only then is the PSID read with the service role. The PSID never reaches the app.
3. Platform store, Page connected, chat inside 24 h (`last_inbound_at`), else 409 with the reason.
4. Limits: per person (Upstash burst + per minute) and per chat; `clientId` claimed once in Redis (SET NX, 10 min) so a retry after a timeout never sends twice.
5. Cards are built by the same builders as the bot with the store's own words; an order id must be this chat's order at this store.
6. Sent with `messaging_type: RESPONSE`. The line is written to `messenger_messages` straight away (staff line for text, bot summary line for cards) with Meta's message id, so the echo is skipped as a duplicate.
7. `send_text` pauses the bot for the store's takeover minutes.

Small schema change (one migration, **R5**): `messenger_messages.sent_by` (nullable `uuid`, the staff account that sent it from the app; written by the service role only; readers see it under the same policy as the line). The app shows the account's name from the staff list it already loads.

Push (**R4**): when a customer asks for staff or writes while the bot is paused, the store's devices get "Ana C. wrote: …" (first 60 characters), on its own Android channel (never the order ringtone). Tap opens the chat. Same recipients as people who can read the chat.

Platform stores only; Convex stores keep "Reply in Business Suite".

---

## 4. Build order

1. **Server**: `sendMessages` returns Meta's message ids; route + guards + limits + log + pause; `sent_by` migration (PGlite runner as each role, then applied + probed on platform after your yes).
2. **App**: composer, sending states, quick-action chips + preview sheet, bot switch, next-status button, 24 h lock, 5 s refresh, "Needs a reply" chip.
3. **Push** (if R4 = yes).
4. **Tests + walk**: unit tests for every guard and chip rule, route test, component tests; then a real round trip on Sample Demo: the simulator replies and sends each chip, your Facebook in Chrome receives them and answers. This needs the web deployed (the app talks to the live route), or a local run like today's.

Release order stays web → app. It ships with the chat-order work already on this branch.

---

## 5. Decisions for the owner

- **R1 — Who can reply from the app?** Recommended: the same people who can **Make order** (store-wide accounts that can read orders). Alternative: a new "Messenger" permission key (four registries change together, and owners must tick it for staff).
- **R2 — After 24 hours.** Recommended: lock the box and point to Business Suite now, and add `human_agent` (reply up to 7 days) to the next App Review together with D5 (names).
- **R3 — Does a reply from the app pause the bot?** Recommended: yes, for the store's takeover time, same as Page Inbox; quick actions don't pause.
- **R4 — Push on new customer messages?** Recommended: yes, but only when the customer asked for staff or wrote while the bot was paused. Every message would be noise, since the bot answers most of them.
- **R5 — Show who replied?** Recommended: yes ("Joy · app"), one nullable column. Alternative: no name, no migration.
- **Later rounds** (not in this plan): saved replies the owner writes ("Ready na po!"), sending photos, typing indicator, reading the customer's photos in the app.

## 6. Risks

- Until App Review passes, replies only reach people with a role on our Meta app (the owner's account). Merchants also have to reconnect their Pages after it passes.
- A reply from the app is public-facing: it speaks as the store. That's why the access rule (R1), the limits and the preview on cards come first.
- Customer messages stay personal data: read as the staff account under the orders rule, 30-day purge unchanged, never sent to an AI model.
- No money changes. "How to pay" only re-sends the payment question; it never marks anything paid.

## 7. Customers who type their order (owner question, 2026-11-15)

Already built (C2): staff open the chat → **Make order** → ring it up → the customer gets the summary and taps **Confirm order**. Proposed help, no AI unless T3 is chosen:

- **T1 — The bot notices a typed order and hands over.** A message that reads like an order (order words in English/Taglish such as "order", "pa-order", "pabili", plus a quantity or a dish name from this menu) gets "Got it! We'll confirm your order here shortly", pauses the bot, marks the chat **Needs a reply** and sends the staff push (R4). Without it the bot answers with its fallback.
- **T2 — The register suggests the dishes.** On Make order the app matches the customer's lines against the menu by name (folded, Taglish numbers "dalawa", "2x", "x2") and shows "Found in chat: 2 × Chicken Inasal · 1 × Halo-halo" with one tap to add each. Sizes and add-ons are still picked by staff. Runs on the phone, nothing leaves it.
- **T3 — AI reads the order (optional).** The customer's recent lines go to the same model family as the menu parser and come back as a suggested cart (dishes, sizes, notes) that staff review. Better with messy spelling; sends customer messages to a model, which the chat plans so far ruled out.
- **T4 — Later: the bot offers the cart itself.** "Add these to your cart? 2 × Chicken Inasal · 1 × Halo-halo" with Yes / Change, then the normal chat cart + checkout link. No staff needed for clean orders.

Recommended now: T1 + T2. T3 only on the owner's say-so; T4 in a later round once T2's matching has been seen on real chats.

### Owner, 2026-11-15: no AI in production; take the order without leaving the chat

T3 is out (cost at scale). T1 + T2 in. The owner likes Make order but not switching to the register to type the order, so:

- **Take order panel on the chat screen.** A sheet pulled up to half height, the chat stays visible above it (side by side on tablets). Inside: search, **Found in chat** suggestions (T2: "2 × Chicken Inasal · 1 × Halo-halo", tap to add), then the menu by category. A dish with choices opens the register's own choices sheet (`ModifierSheet`). Below: the lines and total, order type chips (Pickup / Delivery / Dine-in), name, phone, address. Tapping a chat bubble above fills a field, as the tap-to-fill sheet does. Delivery uses the register's `DeliverySheet` (address, pin, fee). **Send to customer** sends the summary for confirmation, as today.
- **Same cart, same send.** The panel edits the register's cart store (`pos-cart-store`) with the chat attached, so **Open in register** carries everything over for discounts, vouchers, Senior/PWD or anything the panel doesn't offer. The send step (build order → stock clearance on 'block' stores → `placeCounterSale` with `holdForCustomer`) moves out of `pos-tender.tsx` into one shared function both screens call, so the panel can never skip a check the register makes.
- Branch: a store-wide account at a multi-branch store picks the branch in the panel (the register's rule, `registerNeedsBranch`).

## 8. UI first + editable "after ordering" messages (owner, 2026-11-15)

Design canvas (7 screens, private): https://claude.ai/artifact/3cdquMkqkpbLLZD16iM29U — chats list built for monitoring (Needs reply / Waiting for OK / Cart with no order, oldest first), chat with reply box + quick-action chips, quick-action preview sheet, take order inside the chat, after sending (Sent → Confirms → Picks payment → Kitchen, Confirm for them / Edit / Resend), 24 h lock, and Studio → Messages after ordering.

Messages the owner wants editable:
- Already registry entries (Studio → Messages → After ordering): `chatorder.intro` / `ask` / buttons (staff-taken summary), `chatorder.confirmed` + `chatorder.pay_ask` (thank you + how will you pay), `chatorder.pay_line` (payment line; `{details}` = the payment method's own text in Settings › Payment methods).
- **New entries** (today hard-coded):
  - Cart from the website (`/api/messenger/send-cart`, `formatCartSummary`): top line, closing line, switches "List each dish" / "Show the total", Checkout as a button. Dish names and prices are re-read from the menu by item id (the route is public: never print text the browser sent).
  - Web-checkout order summary (`formatOrderMessage` in `src/lib/messenger-message-formatter.ts`): first line, last line, switches customer details / price per dish / payment details. Blank = today's exact text (golden test), the C3 part deferred on 2026-11-14.

### Owner, 2026-11-15 (later): phone only; keep the chat visible; orders management

- **Take order = split screen** (canvas 4a): chat on top, register grid below, a handle between them with three sizes (More chat · Half · More menu). The "Found in chat" picks sit on the handle. Same register cart and send. The tablet layout (canvas 4c: chat | register | order) is kept.
- **Orders management: dropped** (owner, 2026-11-15: did not like the Orders-tab lanes and chat-order screen, canvas 8 + 9 removed). The Orders tab and order screen stay as they are this round.

## 9. Build status (2026-11-15, uncommitted in worktree messenger-chat-app)

Built and unit-tested:
- **Server**: `POST /api/messenger/chat` (`src/app/api/messenger/chat/route.ts`) → `staff-chat-handler.ts` (decisions, deps injected) + `staff-chat.ts` (pure: body schema, chips, 24 h window, pause rule) + `staff-chat-deps.ts` (facts, card builders, send). `sendMessages` returns Meta's message ids; a Send tap is claimed once in Redis (`clientId`) and given back when Meta took nothing.
- **App**: composer + quick-action chips + preview sheet (`ChatComposer`, `QuickSendSheet`), bot switch in the header, 24 h lock, 5 s refresh, replies on their way (Sending… / Sent / Try again). Chats list: "N customers are waiting for a person" + "Needs a reply · 12 min" chips, waiting chats first.
- **T1**: `typed-order.ts` (`readsLikeOrder`) in the webhook; registry `handover.typed_order` + toggle `handover.notice_typed_orders` (Studio → Messages → Handover).
- **R4 push**: `staff-alert.ts` / `staff-alert-deps.ts` → Android channel `chat-alerts`, tap opens the chat; once per chat per 10 min; recipients = owner + store-wide accounts with an order key and `pos`.
- **T2**: "Found in chat" chips on the register banner (`found-in-chat.ts`, matcher byte-identical to the web, parity test).
- **Migration** `20261115073959` (sent_by, needs_reply_since + grant, messenger_chats returns it): PGlite runner `tests/sql/run-messenger-reply-from-app.cjs`; APPLIED + probed on platform 2026-11-15 (owner's yes), types regenerated. The app now selects `sent_by` and shows "You · app" / "Staff · app" under app replies (other staff names are not read: not every account may read the team list).
- **Live send, 2026-11-15** (owner's yes, the owner's own test chat on Sample Demo, through the real handler + side effects): typed reply sent, logged as `staff` with `sent_by` + Meta mid, bot paused for the takeover time; menu card sent and logged as `bot` with `sent_by`; then the bot was resumed. Defect found: with no Redis configured locally, a repeated tap with the same `clientId` delivered the menu card a second time. Fixed with an in-instance claim under the Redis one (`local-claims.ts`); the fix is unit-tested, not re-sent live.

- **Editable website messages** (`web-messages.ts`, pure): registry `webcart.*` (first line, last line with `{checkout_link}` — added back if the owner leaves it out — emptied cart, total line; switches "list each dish" and "show the total", both OFF so nothing changes until the owner asks) and `weborder.*` (first line, last line; switches customer details, price per dish, payment details, all ON). `send-cart` names dishes from the MENU by `itemId` (the storefront now sends ids; the browser's `name` is never printed) and prints a total only when every line has its plain menu price. `formatOrderMessage(order, tenant, messages?)`: uncustomised output proven identical to the previous formatter on three orders, plus a byte-for-byte golden. Wording read with `readStoreWording` (one row, failure = built-in words). Studio → Messages shows them under Cart / After ordering with a sample preview.
- `/api/messenger/chat` is declared with `defineRoute` (staff `pos`, bearer, store-wide, 60/min per person; 12 sends/min per chat inside).

- **Take order with the chat on screen** (4a / 4c): while the register rings up a sale for a chat, `ChatSplitPane` keeps the chat visible — above the grid on a phone with a More chat · Half · More menu handle (`chat-split.ts`), as its own column left of the grid on a wide tablet (`withChatColumn` in `pos-layout.ts`; a portrait tablet whose grid would drop under 420pt keeps the phone shape). It is the normal register (same cart, same send, same checks), so the send did not need to move out of `pos-tender.tsx`. A tap on a customer line opens the tap-to-fill sheet (`fillRegisterFromChat`, shared with the banner). "Found in chat" stays on the banner.

Not built yet: "Waiting" progress on the order strip.

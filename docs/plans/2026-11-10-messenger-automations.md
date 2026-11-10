# Messenger automations: triggers, menu carousels, chat cart, order updates

Date: 2026-11-10 · Status: **APPROVED (D1–D7 = recommendations, 2026-11-10); release 1 built, release 2 built 2026-11-10, migration applied (090200 waits for deploy)** · Goal: `/board` → "Messenger automations" (created 2026-11-04)

## The ask

Merchants choose their own Messenger triggers: keywords, Get Started, ice breakers and the persistent menu. For each trigger they pick what it sends:
- the menu card
- a category carousel with Add to cart / View item
- the cart
- order progress
- their own text

The wording is editable and there's a live preview. Customers can browse, add, remove and check out from the chat, and they get order updates. It has to work end to end on platform Supabase first.

## Short answer

Build it in two releases.

1. **Release 1: triggers + menu replies + editor.** Rewrite the webhook as a small engine (`src/lib/messenger/`), make today's hardcoded keywords the default rules, add category/item carousels, and add the editor under Settings → Messenger → Automations.
2. **Release 2: chat cart + order updates.** Add a server cart per store + customer, a signed checkout link that loads it into the web cart, "where is my order" replies, and status messages when an order moves. Status messages are platform orders only and must fall inside Meta's 24-hour window.

The webhook fixes that make all of this safe come first: answer Meta within 5 seconds, ignore retries, and pause the bot when staff reply. They don't change any visible behaviour.

## What exists today

### The webhook

`src/app/api/webhook/route.ts` is 595 lines. It does three things:
- When the page itself types a menu keyword or `/menu`, the customer gets the generic "View menu" card (`sendMenuCard`).
- A referral `ORDER_<id>` sends the order summary (service role, page must match the store) and saves `customer_data.messenger_psid`.
- A customer message matching `MENU_KEYWORDS`, but not `ORDER_STATUS_KEYWORDS`, gets the menu card.

What it lacks:
- **No postback handling.** It reads `postback.payload` but never acts on it.
- **No quick replies, no carousels, no Messenger Profile** (Get Started, ice breakers, persistent menu).
- **No dedupe.** Meta's retries are processed again.
- **All work happens before the 200.** Meta now wants an answer within **5 seconds**. If it keeps failing for 1 hour, Meta **unsubscribes the Page**.
- **No human takeover.** A staff reply in Inbox doesn't pause anything.

### The menu card link carries a raw PSID

The menu card link is `?psid=<raw>` (`src/lib/facebook-api.ts:409`). Three places trust it:
- The storefront stores it in localStorage under one GLOBAL key (`useCart.tsx:80`).
- `send-cart` trusts any PSID that has a `messenger_sessions` row.
- Checkout copies it into `customer_data.messenger_psid` from the browser (`useCheckout.ts:904`), and the server keeps whatever the browser sent.

So anyone can attach any PSID to an order, which makes the order's updates go to that person. Today that's harmless because nothing sends updates. Once order updates exist, it is a spam path.

### `messenger_sessions` is keyed wrongly

- It has `psid UNIQUE` across ALL stores, and `ensureMessengerSession` upserts `onConflict: 'psid'`.
- PSIDs are page-scoped, so a clash is rare, but the key is wrong. If one Page is reconnected to another store, the row silently moves.
- It already has `cart_data`, `checkout_state` and `state` columns. Nothing uses them.
- RLS: service role only.

### Checkout no longer uses `m.me?ref=ORDER_`

Checkout opens `m.me/<page>?text=…`, or `send-order-public` sends the order with the stored PSID. The webhook's referral path still works for old links.

### Reusable pieces

| Need | Existing piece |
|---|---|
| Signed, expiring link | `src/lib/delivery/pin-link-token.ts` (purpose + id + exp HMAC) |
| Server pricing of lines | `loadAndPriceOrderLines` / `priceOrderLines` (`src/lib/checkout/`) |
| Menu for the store | `getStorefrontMenu(slug)` (cached, tagged), `isMenuItemOrderable`, `getMenuStockAvailability`, `resolveMenuForOutlet` |
| Status-change → route | pg_net + Vault secret header pattern (`20260929120000_loyalty_wallet_passes.sql` → `/api/loyalty/passes/sync`) |
| Order text | `formatOrderMessage` (`src/lib/messenger-message-formatter.ts`) |
| Thread control on 2018300 | `sendMessage` already takes control once (#100) |
| Page token reads | `src/lib/facebook/page-tokens.ts` (service role only, test-enforced) |
| Who may edit | `canManageFacebook` / settings section `messenger` = `settings` permission |

There is no SET-NX dedupe helper, and no status-change trigger on `orders`.

## Meta rules that shape the design

Checked 2026-11-10 against the current developers.facebook.com docs.

- **5-second answer.** Retries are immediate and repeated, so dedupe on `mid`. After 1 hour of failures Meta disables the subscription. → Verify the signature, return 200, and process in `after()`.
- **24-hour window.** It opens on any customer action: a message, a postback, Get Started, or an `m.me?ref=` open of an existing thread. Inside the window we may send anything.
- **Order updates outside 24h.** `POST_PURCHASE_UPDATE`, `CONFIRMED_EVENT_UPDATE` and `ACCOUNT_UPDATE` are **removed** (2026; they now return error 100). `HUMAN_AGENT` (7 days) is for a person typing, never the bot. The only way left is **utility message templates**: permission `page_utility_messaging`, a UTILITY template created per Page (approved in seconds), available in the PH since July 2025.
- **Carousel limits.** Up to 10 elements and up to 3 buttons each. Titles and subtitles are up to 80 characters. Images are cropped to 1.91:1.
- **Quick replies.** Up to 13, titles up to 20 characters, payloads up to 1000 characters.
- **Messenger Profile.** `/me/messenger_profile` allows 10 calls per 10 minutes per Page.
  - Ice breakers: up to 4, with a `default` locale.
  - Persistent menu: needs Get Started, up to 20 items, titles up to 30 characters. It doesn't show in the Facebook in-app browser.
- **Telling staff replies apart.** An echo carries `app_id`.
  - Our app id means our bot sent it.
  - Page Inbox is `263902037430900`. That id, or any other app id, means a person or another tool replied, so the bot pauses for that thread.
  - Our sends carry `metadata: "wn"` as a second check.
- **Rate limits.** 300 sends/s per Page; error 613 when hit. Not a concern at our volume.
- **App Review.** Submitted 2026-11-04 and still in review. Until it is approved, only people with a role on the app can talk to the bot, so shipping is safe and live tests use the owner's own Facebook account. `page_utility_messaging` was part of the earlier draft but **was not in the submitted set**. Order updates outside 24h need a second review.

## Design

### 1. Webhook foundation (no visible change)

`src/app/api/webhook/route.ts` becomes thin. It verifies the signature, parses with zod, returns 200, and runs `after(() => handleEntries(entries))`.

New `src/lib/messenger/` (pure where possible, each file small):

| File | Job |
|---|---|
| `events.ts` | zod schema + `toInboundEvents(body)`: one typed event per messaging item. Kinds: text, quick_reply, postback, referral, echo, read/delivery (ignored). Sorted by `timestamp`. |
| `dedupe.ts` | Redis `SET NX EX 86400` on `mid` (postbacks: `psid:timestamp:payload` hash). **Fails open.** A double reply is better than a dropped one. |
| `router.ts` | event → handler. Page → store via `getActivePageByPageId`. Unknown page = log + drop. |
| `takeover.ts` | Echo whose app id is not ours → `bot_paused_until = now + takeover_minutes` on the session. Customer events while paused are ignored, except the referral order summary. |
| `send.ts` | One Graph wrapper: `sendMessages(page, psid, messages[])`. It handles typing_on, `messaging_type: RESPONSE`, `metadata`, the 2018300 retry, and 613/551/10 errors logged once (masked PSID). |
| `payload.ts` | Postback / quick-reply codec `v1:<verb>:<args>`, e.g. `v1:cat:<categoryId>:<page>`, `v1:add:<itemId>`. |
| `session.ts` | Read/update `messenger_sessions` by `(tenant_id, psid)`. It also stamps `last_inbound_at`, which is the 24h window. |

- **Payload signing.** Not needed. Postback and quick-reply payloads are only ever ours, they arrive inside a signature-checked webhook, and every id in them is re-checked against the store the Page belongs to. A foreign or unknown id answers "That item isn't available any more."
- **Staff shortcuts.** Today, staff typing anything containing "menu" in Inbox sends the card. With takeover, a staff message pauses the bot. Only **slash commands** (`/menu`, `/cart`, `/order`) still send their card, and they don't pause the bot. **Owner decision D3.**
- **Logging.** Replace the current ~60 `console.log` lines (some print whole events with message text) with `createLogger('messenger', 'DEBUG_MESSENGER')`. Errors are never gated, and PSIDs are always masked.

### 2. Triggers and actions

**Rule = trigger + action + wording.** Evaluated in `position` order. The first match wins.

Triggers:
- `keyword`: a list of words. Match is `contains_word` (default) or `exact`. Normalised: lower case, accents and punctuation stripped, spaces collapsed, and "po"/"pls"/"please" ignored at the end. Matching is on word boundaries, so "item" no longer fires inside "items".
- `get_started`: the Get Started button. Its referral, if any, is still handled first.
- `ice_breaker`: one of up to 4 starter questions.
- `menu_button`: one item in the persistent menu (up to 20; we cap at 5 so it stays usable).
- `fallback`: nothing matched. Off by default, at most once per thread per 12 hours, never while paused.

Actions (`src/lib/messenger/actions/`, each `buildReply(ctx) → MessengerMessage[]`, pure):

| Action | Sends |
|---|---|
| `menu_card` | Today's card: title, subtitle, image, button label editable. The link carries a signed token (§4). |
| `categories` | Quick replies, one per category (up to 12 + "Full menu"). |
| `category_items` | Carousel for one chosen category (§3). |
| `featured_items` | Carousel of items the owner picks, or best sellers. |
| `cart` | The chat cart (release 2). |
| `order_status` | This customer's recent orders (release 2). |
| `text` | The owner's text plus up to 3 buttons (link / menu / talk to staff). Placeholders: `{store}`, `{menu_link}`, `{hours}`, `{address}`. No `{first_name}` (it needs the User Profile API, not in our review). |
| `hours_location` | Today's hours + address + a Google Maps link, from the store's data. |
| `talk_to_staff` | A short "Someone will reply soon" and a bot pause. |

**Defaults = today's behaviour.**
- A store with no rules runs `DEFAULT_RULES` from code:
  - today's order-status words → `order_status`
  - today's menu words → `menu_card`
- Until release 2, `order_status` falls back to "Check the tracking link on your receipt."
- Filipino defaults are added: `magkano`, `ano meron`, `pa order`, `order po`, `nasaan order ko`, `asan na order ko`.
- No backfill: rows are written the first time an owner saves. So nothing regresses on deploy, and the 8 connected stores keep working untouched.

**Profile sync.**
- Saving rules that use Get Started, ice breakers or the persistent menu (or the greeting) calls `/me/messenger_profile` once.
- `profile_hash` skips unchanged saves, which matters with 10 calls per 10 minutes.
- `whitelisted_domains` gets the store's link host.
- A failure shows on the card with Retry. Disconnecting the page deletes what we set.

### 3. Menu replies

- **Carousel card.**
  - Image: the dish photo, else the store logo.
  - Title: the name (up to 80 characters).
  - Subtitle: price ("₱149" or "from ₱99") + description, trimmed.
  - Tap: opens the item page.
- **Buttons, up to 3:**
  - **Add to cart.** Only when the item has no required choices and is orderable. Release 1 shows **"Order"** instead (a link to the item page).
  - **Choose options.** For items with required variations or add-ons; opens the item page.
  - **See full menu.**
- **Paging.** 9 items + a "See more" card (`v1:cat:<id>:<page+1>`). Large menus never hit the 10-element cap.
- **Availability.**
  - Sold out (`is_available = false` or an inventory ceiling of 0) is left out.
  - Hidden categories and hidden items are left out.
  - Bundles are not shown in chat in v1.
- **Multi-branch stores.** The chat shows the store-wide menu. The branch is chosen on the web at checkout, where branch overrides re-price or refuse items as they do today. **Owner decision D5.**
- **Reading the menu.** `getStorefrontMenu(slug)` (already cached and invalidated by menu writes). There is no new query path.

### 4. Signed Messenger link (replaces `?psid=`)

`src/lib/messenger/link-token.ts`, modelled on `pin-link-token.ts`:
- Format: `mt1.<exp>.<sessionId>.<hmac>`, purpose `messenger-link`, 7-day life, `API_SECRET`.
- It carries the **session id, never the PSID**.

How it is used:
- Every link we send carries `?m=<token>`: menu card, item page, checkout.
- `MessengerPsidCapture` stores the token **per store** (`messenger_link:<slug>`), replacing the global `messenger_psid` key.
- `send-cart` and checkout send the token. The server resolves it to `(tenant_id, psid)` and refuses another store's token.
- `createOrderAction` sets `customer_data.messenger_psid` **server-side** from a valid token and drops any browser-sent value.
- **Transition:** links already sitting in chats carry `?psid=`. For 30 days the server still accepts a raw PSID **only if** a session row exists for that store (today's check), and logs every use. After that the code is removed.

### 5. Chat cart (release 2)

- **Where it lives.** `messenger_sessions.cart_data`, `[{ itemId, qty }]`, up to 20 lines, qty 1–50. Simple items only.
- **Prices are never stored.** Every cart reply re-prices from the live menu (`priceOrderLines`). Lines that went sold out or were deleted are dropped and the customer is told.
- **Postbacks.**
  - `v1:add:<itemId>` → "Added Chicken Inasal ✓ · Cart: 3 items ₱447", with quick replies [View cart] [Checkout] [Keep browsing].
  - `v1:inc` / `v1:dec` / `v1:rm` + itemId.
  - `v1:cart`.
  - `v1:clear` asks to confirm.
- **Cart reply.**
  - A carousel with one card per line: name, qty × price, and buttons [−] [+] [Remove].
  - Then a summary card: total, [Checkout] (web link with token), [Keep browsing].
  - More than 9 lines → the summary card says "+N more on the checkout page".
- **Checkout.**
  - The link is `/<tenant>/checkout?m=<token>`.
  - The server verifies the token, reads the session cart, and returns lines for the web cart.
  - If the web cart is empty, they're loaded. If not, the page asks "Replace your cart with the 3 items from Messenger?"
  - The chat cart is emptied when an order is placed with that token.
- **Web → chat.** Unchanged: the existing debounced `send-cart` text summary, now authenticated by the token. No two-way live sync (YAGNI).

### 6. Order progress (release 2, platform orders)

**"Where is my order" (`order_status` action).**
- Reads this store's orders where `customer_data->>'messenger_psid' = psid`, from the last 7 days, newest 3.
- Each is a card: "#07 · Preparing · ₱447", with a [Track order] button (tracking token link).
- Needs a partial index `orders (tenant_id, (customer_data->>'messenger_psid'), created_at desc) where customer_data ? 'messenger_psid'`, created `concurrently` outside the migration transaction.

**Status messages.**
- **Trigger.** `orders_messenger_status` fires `after update of status`, `when (old.status is distinct from new.status and new.customer_data ? 'messenger_psid')`. It pg_net-POSTs `{orderId}` to `/api/messenger/order-update` with `X-Messenger-Secret` from Vault. It never fails the order write.
- **Route.** Re-reads the order with the service role, then checks:
  - the store is on the platform backend
  - updates are on and this status is one the owner picked (default: preparing, ready, out for delivery, delivered, cancelled)
  - the session's `last_inbound_at` is within 24h and the bot isn't paused
- **Claim.** `messenger_order_updates (order_id, status)` UNIQUE claims each status once.
- **Wording.** Per status, editable, default EN + Taglish. "Ready" for pickup vs. "out for delivery" follows the order type.
- **Outside 24h.** Skipped and recorded as `outside_window`. Release 3 adds utility templates once `page_utility_messaging` is approved. That needs a second App Review and per-Page template creation. **Owner decision D4.**
- **Convex and per-store Supabase stores.** Their orders aren't in `public.orders`.
  - "Where is my order" answers "Check the tracking link on your receipt."
  - No status messages.
  - Convex parity is a later bundle (Convex `updateStatus` → our route), and only if the owner wants it, since 92 stores are on Convex.

### 7. Merchant editor (web)

**Placement.** `/[tenant]/admin/settings/messenger/automations`, a tab next to the existing connection card.
- Gated by the existing **`settings`** permission. No new key, so the 4 registry copies aren't touched.
- Store-wide accounts only.

**Screens.**
- **Rule list.** Name, trigger chips, action, on/off switch, drag to reorder. Default rules show as "Built-in" until edited.
- **Editor sheet.**
  - Trigger (keyword chips with match type; or Get Started / ice breaker question / menu button label).
  - Action picker.
  - Wording + button labels with character counters that follow Meta's limits.
  - Category or item picker where needed.
- **Live preview.** A Messenger-style thread rendered from **the same `buildReply` output** that the webhook sends, so the preview can't drift from the real message. It uses sample customer data and the store's real menu.
- **Settings card.**
  - Bot on/off.
  - Pause after a staff reply: 30 min / 1 h / 4 h / until tomorrow.
  - Fallback reply.
  - Order updates on/off + which statuses (release 2).
- **"Send test to me" (optional, D6).**
  - The editor shows a code, e.g. `TEST 4821`.
  - The owner messages it to their Page from their own Facebook account, and the webhook links that PSID as the store's tester (10-minute code).
  - After that, "Send test" sends the previewed reply to the owner's own Messenger.

**Writes.**
- A server action with zod (strict) through the caller's session client.
- RLS: `settings` + store-wide (§8), and affected rows are checked.
- After save: Redis rule cache invalidated, then profile sync.

**Merchant app.** Not in scope. The app has no Messenger screens today, and the editor is a desk task.

### 8. Database (one migration per release, applied + probed on platform)

**Release 1 (`20261110000421_messenger_automations.sql`):**
- `messenger_sessions`:
  - add `page_id text`, `last_inbound_at timestamptz`, `bot_paused_until timestamptz`
  - add UNIQUE `(tenant_id, psid)`
  - **keep** the old `UNIQUE(psid)` until release 2, so old and new code both work during the deploy
- `messenger_rules`:
  - columns: `id`, `tenant_id`, `name`, `trigger_kind` (check), `keywords text[]` (≤30, each ≤40 chars), `match_mode` (check), `action_kind` (check), `action_config jsonb`, `position int`, `is_enabled bool`, `created_at`, `updated_at`, `updated_by`
  - up to 50 rules per store (trigger-enforced)
  - `action_config` is validated by zod on save AND again on read in the webhook
- `messenger_settings`:
  - columns: `tenant_id` PK, `bot_enabled` (default **true** = today), `takeover_minutes` (60), `fallback_enabled` (false), `profile_hash`, `profile_synced_at`, `profile_error`, `tester_psid`, `tester_code_hash`, `tester_code_expires_at`
  - the tester columns are service-role only, via a column grant

RLS for the new tables:
- `anon`: nothing.
- `authenticated`: SELECT/INSERT/UPDATE/DELETE when `app_user_has_permission(tenant_id,'settings')` and `app_user_may_reach_branch(tenant_id, NULL)`.
- The webhook reads with the service role.

**Release 2:**
- Drop `UNIQUE(psid)`.
- `messenger_order_updates` (service role only).
- `messenger_settings.order_updates jsonb`.
- Orders trigger + Vault secret `messenger_update_secret` (env `MESSENGER_UPDATE_SECRET`).
- The partial index, built `concurrently`, probed with `set local statement_timeout = '5s'`.

After each release: regenerate `src/types/database.ts` via MCP and probe the objects (columns, policies, trigger, index), not just the migration name.

## Security notes

- **Store resolution.** The store always comes from the Page (`entry.id` → `facebook_pages`), never from a payload. Every item or category id is re-checked against that store.
- **The signed link replaces the raw PSID.** No browser can attach someone else's PSID to an order. That matters once orders send messages.
- **The bot never sends an order to a plain message.** Today's rule (`messenger-webhook-privacy.test.ts`) stays. "Where is my order" only lists orders already linked to this PSID on this store.
- **Owner text.** Plain text to Meta, with no HTML anywhere. Button URLs are https only and on the store's own host, or Google Maps.
- **Logs.** Masked PSIDs, no message text, no tokens.

## Tests

- **Unit (pure):**
  - event parsing (fixtures captured from real webhook bodies, ids scrubbed)
  - matcher (EN + Taglish table, boundaries, priority, fallback)
  - payload codec
  - takeover rule
  - link token
  - each action's `buildReply`
  - cart ops (add/inc/dec/remove/cap/re-price/drop sold out)
- **Contract test over every action × sample menus:** no message breaks Meta's limits (10 elements, 3 buttons, 80/20/30 characters, 13 quick replies, payload ≤1000).
- **Property (`*.property.test.ts`):**
  - cart ops never go below 1 or above the caps
  - the codec round-trips
  - the matcher never matches across a word boundary
- **Route tests:**
  - webhook returns 200 before work and dedupes a retried `mid`
  - staff echo pauses the bot
  - another store's item id is refused
  - order-update route claims once and skips outside 24h
- **PGlite RLS runner** (`tests/sql/`) for `messenger_rules`, `messenger_settings` and `messenger_order_updates` as anon / authenticated (with and without `settings`, branch-locked) / service, asserting affected rows.
- **Live (opt-in) `tests/live/messenger-automations-live.test.ts`:** on sample-demo / Inviting You page — send a keyword from the owner's account → card arrives; tap Add → cart reply; checkout link loads the cart; status change → update arrives. **Needs the owner's phone in hand** (the owner is the only app-role user).
- Lint + build + code/security review before each PR.

## Phases

| Phase | What | Release |
|---|---|---|
| P1 | Webhook foundation: router, `after()`, dedupe, takeover, send layer, logger, signed link + per-store capture, session key | 1 |
| P2 | Rules engine + defaults + migration 1 + profile sync | 1 |
| P3 | Menu replies: categories, carousels, paging, availability | 1 |
| P6 | Editor + preview (+ test send if D6) | 1 |
| P4 | Chat cart + checkout handoff | 2 |
| P5 | Order progress + status messages + migration 2 | 2 |
| P7 | Live e2e, review, deploy, CLAUDE.md section | each release |
| (R3) | Utility templates for updates outside 24h | after a second App Review |

Each release is one PR. Web only: no app OTA, no Convex deploy.

## Owner decisions

- **D1 Who may edit automations.** Recommend the existing `settings` permission (store-wide accounts only). The alternative is a new `messenger` key: 4 registry copies + a key backfill.
- **D2 Defaults.** Recommend keeping the bot **on** for already-connected stores with today's keywords + Filipino additions. The fallback reply stays **off**.
- **D3 Staff typing in Inbox.** Recommend: a staff reply pauses the bot for 60 min, and only `/menu`, `/cart` and `/order` send cards. Today, any staff message containing "menu" sends the card.
- **D4 Order updates outside 24h.** Recommend: release 2 sends updates inside 24h only (most orders finish within hours of the chat). Apply for `page_utility_messaging` separately, after the current review passes.
- **D5 Multi-branch stores.** Recommend: the chat shows the store-wide menu, and the branch is picked at web checkout.
- **D6 "Send test to me".** Recommend including it in release 1 (about a day of work). The preview alone covers most of the need.
- **D7 Convex stores** (92 stores). Recommend: triggers, menus and the chat cart work for every store (the menu lives on platform Supabase), and order updates are platform-only for now.

## Risks

- **App Review.** If Meta rejects or delays it, none of this reaches real customers; it works only for app-role accounts. The code is safe to ship meanwhile.
- **Merchants with another chatbot or inbox tool.** They may own the thread (subcode 2018300). We take control once, as today. Stores using ManyChat and similar tools should keep our bot off. The editor says so.
- **Meta changes.** Tag removal and ice breaker format changes happened in 2025–26. All Graph shapes live in `send.ts` + `profile.ts` only.
- **Platform load.** Webhook reads are a cached menu + one session row. The order lookup is indexed and limited to 3 rows.

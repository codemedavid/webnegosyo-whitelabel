# Messenger Studio + chat inbox foundations

Date: 2026-11-11 · Status: **APPROVED 2026-11-11 ("lets do it", D1–D5 = recommendations); A1–A5 + B1 BUILT 2026-11-12 on `feat/messenger-studio`; B2 app screens await a separate go-ahead** · Builds on release 1 + 2 (`docs/plans/2026-11-10-messenger-automations.md`, PR #118, merged to local main 719f8f91).

Owner ask (2026-11-11): make the Messenger automations editor much better to use, let the owner customize **everything** the bot says (the cart message and the rest), make it feel like building an automation, and **prepare** order management in the merchant app for Messenger orders: who ordered, and the short chat, without leaving the SmartMenu app. The app screens are designed now and built later.

---

## 1. What is wrong today

| Problem | Where |
|---|---|
| ~40 bot messages are hard-coded and can't be changed: "✅ Added …", the cart card, "Checkout", "Keep browsing", "Empty cart?", item-card buttons ("🛒 Add to cart", "View item", "Choose options"), "See more", "Full menu", "Pick a category", "Your recent orders", "That dish can't be ordered…", hours/location buttons | `DEFAULT_WORDING` in `src/lib/messenger/replies.ts` |
| The editor is a flat list in a settings card. It reads as a form, not as "my chat runs by itself". There is no picture of what a customer goes through | `automations-editor.tsx` |
| Order status messages, tester and settings are three more cards under the list | `order-updates-card.tsx`, `tester-panel.tsx` |
| The only way to try a rule is to send it to your own phone (needs a linked tester and the 24h window) | `rule-editor-sheet.tsx` |
| Reorder is up/down arrows; no starting points beyond the 4 defaults | |
| The bot doesn't know the customer's name, and nothing of the chat is stored, so the app can't show who ordered or what they said | webhook keeps only `messenger_sessions` |

---

## 2. Part A — Messenger Studio (web admin, build now)

### A1. One full-screen studio, four tabs

`/[tenant]/admin/settings/messenger/automations` becomes a full-screen studio built from the **Branding Studio's own parts** (PRODUCT.md: the Studio is the binding house style), not a new look:
- top bar = the Studio's (white 54px, Back chip, ink mark, extrabold name, page status, ink pill Save, coral "N changes" dot);
- the dark icon rail (`SurfaceRail`: ink, amber glyph tile when active) holds the four tabs;
- the white 336px settings panel (`SettingsSheet`: bottom sheet on phones) holds the controls, with the Studio's uppercase section labels, 10px bordered rows, emerald switches and pill choice chips;
- the dotted cream canvas holds the phone preview, with a `JourneyBar`-style pill row (First hello › Browsing › Cart › After ordering).
Only the inside of the phone looks like Messenger (as the current preview does); every control around it uses the admin tokens (`#1D1815` ink, `#EFECE6` canvas, `#E5E0D6` lines, `#6B655B` muted text, coral `#E4572E`, Geist). Placeholder chips use coral wash (`#FBEAE3` / `#B23E1B`).

1. **Journey** (landing tab). The customer's path as a vertical flow of moments, each a card with an on/off switch, a one-line summary of what happens, and a tiny phone preview:
   `First hello` (Get Started, starter questions, chat menu buttons) → `Browsing` (menu card, categories, dishes) → `Cart` (added, cart, checkout) → `After ordering` (order summary, status messages, "where is my order") → `Handover` (talk to staff, staff takeover pause) → `Didn't understand` (fallback).
   Connectors between cards show the order things happen. Tapping a card opens that moment's editor. This is the "feels like automating" view: the owner sees the whole conversation the bot runs.
2. **Auto-replies** (the rules, renamed in the UI). Each rule is a **When → Then** card: trigger chips on the left ("types *magkano*, *price* +4"), an arrow, the reply type on the right, switch, drag handle (`@dnd-kit/sortable`, already a dependency; arrows stay for keyboard). "First match wins" is drawn as a numbered lane. Add → a **recipe gallery** (one tap fills a rule, owner edits):
   - Prices ("magkano", "how much") → Featured dishes
   - Open today? → Hours & location
   - Payment methods (GCash, Maya, COD) → your own message
   - Delivery areas / fee → your own message
   - Promo of the day → Featured dishes with your words
   - Talk to a person ("tao", "human", "agent") → Talk to staff
   - Blank automation
3. **Messages** (new). Every message the bot sends, grouped by the same moments, editable in place (section A2). Order status messages move here (under After ordering), so there is one place for wording.
4. **Settings & test**. Bot on/off, takeover pause, Page connection state, profile sync errors, the existing "Test on your phone" linking, and the new **chat simulator** (A4).

The rule editor sheet stays (it works), restyled to the When/Then layout, with the preview following the field in focus.

### A2. Every message editable: one registry

New `src/lib/messenger/messages/registry.ts` — the ONE list of bot messages, like `tracking-style/keys.ts`:

```ts
{ id: 'cart.added', moment: 'cart', kind: 'text', max: 640,
  placeholders: ['item', 'qty', 'count', 'total', 'store', 'name'],
  default: '✅ Added {item}{qty_note}\n🛒 Your cart: {count} · {total}', label: 'After adding a dish' }
{ id: 'cart.checkout_button', moment: 'cart', kind: 'button', max: 20, default: '✅ Checkout' }
{ id: 'cart.show_keep_browsing', moment: 'cart', kind: 'toggle', default: true }
```

- `kind`: `text` (Meta's text / button-template limit), `button` (20 chars), `quick` (quick reply, 20), `toggle` (show/hide an optional button or line).
- Every string now in `DEFAULT_WORDING` and `defaultUpdateText` becomes an entry; builders read `msg(ctx, id)` instead of `DEFAULT_WORDING.x`. **Blank = today's exact wording** (snapshot tests pin every builder's output for an un-customized store, so nothing changes for stores that never open the tab).
- Placeholders per message, inserted as chips (no typing braces): `{store}` `{name}` (customer first name, A3) `{item}` `{qty}` `{count}` `{total}` `{order}` `{status}` `{hours}` `{address}` `{menu_link}`. A message may only use its own list (save refuses others). `{name}` blank → the token and its joining space/comma are removed ("Hi {name}! " → "Hi! "), never "Hi !".
- **Language packs**: "Use Taglish" / "Use English" fills every message with a reviewed set in one tap (owner can still edit each). Packs live in the registry (`default` + `taglish`), contract test checks both fit the limits.
- Per message: "Reset to default", character counter against Meta's limit, live preview that jumps to the message being edited (the preview renders the same `OutgoingMessage[]` the webhook sends, as today).
- Toggles cover the "customize the cart" asks without free-form layout: show Keep browsing, show Empty cart, show "was ₱" prices, show View item on dish cards, show Categories button on the menu card, cart lead text before the dish cards.

**Stored** in a new `messenger_settings.messages jsonb` (flat `id → string|boolean`, size-checked, strict zod on save AND re-validated on read in the webhook; unknown ids dropped). `order_updates.texts` folds into it on read (old rows keep working; no data repair).

### A3. Customer first name (shared with Part B)

On a customer's first message (or when the stored name is older than 30 days) the webhook fetches `GET /{psid}?fields=first_name,last_name,profile_pic` with the Page token, in `after()`, and stores it on `messenger_sessions` (`first_name`, `last_name`, `profile_pic_url`, `profile_fetched_at`). Failure = no name, never a failed reply. Names are cut to name-like words before use in a message (same rule as SMS `template.ts`).

### A4. Chat simulator (try it without a phone)

A chat box under the preview: type "magkano po" or tap a button, and the simulator shows which automation answered ("Matched **Prices** · rule 2") and the reply. It runs the real pure `decideReply` + builders in the browser over the store's cached menu with a sample cart, so it is exactly what the webhook would decide. Cart taps change a local sample cart. No Meta call, no 24h window, no tester link.

### A5. Optional, small: open/closed hours condition

Each auto-reply gets "Only when: always / store open / store closed". Lets an owner answer "Closed na po kami, bukas 10am" after hours and the menu while open. Uses the store's existing hours (`hoursText` source). Adds one optional field to the trigger schema. **D3 below** — include or leave for later.

---

## 3. Part B — Chat inbox foundations (prepare now; app screens later)

Goal: in the SmartMenu app an order from Messenger shows **who** ordered (name + photo from Messenger) and the **short chat** (what they asked, what the bot answered, what staff said), so staff don't open Page Inbox to understand an order.

### B1. Build now (server + database)

- **Migration `2026111112xxxx_messenger_chat_log.sql`**
  - `messenger_sessions` + `first_name`, `last_name`, `profile_pic_url`, `profile_fetched_at`, `last_message_at`, `last_message_preview` (≤120 chars).
  - `messenger_messages`: `id`, `tenant_id`, `session_id`, `direction` (`in` customer · `bot` · `staff`), `kind` (`text`, `tap`, `photo`, `sticker`, `card`, `other`), `body` (≤1,000 chars, clipped), `mid` (unique, dedupe), `sent_at`, `created_at`. Index `(tenant_id, session_id, sent_at desc)`.
  - What gets written: customer text, quick-reply and postback taps (their button title), attachments as "📷 Photo" (no media stored), our bot replies as a one-line summary ("Sent cart · 2 items · ₱447"), staff echoes from Page Inbox as text.
  - **Retention**: rows older than 30 days deleted hourly by pg_cron (same pattern as `20260924130000`). It is a "short messages" view, not an archive; Page Inbox stays the record.
  - **RLS**: service role writes only. SELECT for store members who can read orders (`ORDER_READ_KEYS`) on store-wide accounts; branch-locked accounts only for chats linked to an order of their branch (via `orders.customer_data->>'messenger_psid'` + the existing `orders_messenger_psid_idx`). See **D1**.
  - RPCs for the app (SECURITY INVOKER, so RLS applies): `messenger_chat_for_order(order_id)` → session + last 30 messages; `messenger_chats(limit, before)` → conversation list (name, preview, last time, latest order id/number/status), paged.
- **Webhook**: write the log rows in `after()` next to the reply (one batched insert per event batch); fetch the profile (A3). The decision code stays pure; logging is a new dep in `webhook-deps.ts`.
- **Tests**: PGlite runner `tests/sql/run-messenger-chat-log.cjs` (each role, asserting affected rows: owner reads, staff without order keys 0 rows, branch account only its branch's chats, anon/authenticated insert 42501), unit tests for the log summaries and name cleaning, webhook route test that a failed profile fetch still replies.
- Applied to platform + probed as real roles + types regenerated before it counts (CLAUDE.md).

### B2. Designed now, built later (merchant app)

Mockups in the artifact linked from the PR / chat. Summary:

1. **Order card** (`OrderCard.tsx`): a Messenger badge replaces the plain "messenger" source text, with the customer's Messenger photo + first name ("Juan D."), and a "💬 2 new" chip when the customer wrote after ordering.
2. **Order detail**: a "Chat" section with the last 3 messages as bubbles (customer left, bot grey and compact, staff right) and "See chat".
3. **Chat screen** (`(main)/chat/[sessionId].tsx`): read-only v1. Header: photo, name, "Bot paused 42 min · Resume bot" / "Bot on · Pause bot". Day separators, bot lines collapsed to one grey line each ("🤖 Sent the menu"), linked orders as chips inside the thread ("Order #07 · Preparing"). Footer: **Reply in Meta Business Suite** (opens the app/website). No typing in v1 (see **D2**).
4. **Chats list**: a sub-screen of Orders (`SUBSCREEN_PARENTS`, a header icon button with a coral unread count, like Kitchen), never a new tab or a per-screen chip (fixed-bar IA). Conversations newest first, with the latest order's status chip. Same RLS as above.

All app screens use `theme/colors.ts` only: cream canvas, white cards with the urgency left border, avatar palette, coral totals, the warm status pills, ink pill buttons, 28pt / 20pt headers (`ScreenHeader` / `BackHeader`). Messenger shows as a neutral `primaryLight` chip, never Messenger blue; staff bubbles are ink, customer bubbles white.
5. **Push** (later): a customer message on a chat with an open order → one push on a quiet channel (not the order ringtone).

### B3. Later (not in this plan's build): replying from the app

Send API as `RESPONSE` within 24h of the customer's last message, with our own metadata (`wn-staff`) so it pauses the bot like a Page Inbox reply; outside 24h the box is disabled with "Reply in Business Suite" (the `HUMAN_AGENT` tag needs its own App Review). Needs a new route, permission check and rate limit. Listed so the B1 schema already fits it (`direction = 'staff'`).

---

## 4. Build order (after OK)

1. A2 registry + builders read it; snapshot tests prove un-customized output is byte-identical. Migration `messages` column. (web, ~1 day)
2. A1 studio shell + Journey + restyled Auto-replies + recipe gallery + Messages tab; move order-status wording in. (web)
3. A4 simulator. (web)
4. B1 migration + webhook logging + profile fetch, PGlite + live probe as real roles, types. (DB + webhook)
5. A5 if D3 = yes.
6. Verify: walk the studio at `sample-demo.localhost:3000` (verify-webnegosyo), screenshots; webhook route tests; live Meta test on the demo Page once #118 is deployed (still owed from release 2).

App screens (B2) wait for your go-ahead on a separate build.

## 5. Decisions for the owner

- **D1 — Who can read chats in the app?** Recommended: anyone who can read orders, store-wide; branch accounts only chats tied to their branch's orders. Alternative: a new opt-in permission key "Chats" (four registry copies + backfill).
- **D2 — Reply from the app in v1?** Recommended: no; read-only + "Reply in Business Suite" button now, replying as B3 later.
- **D3 — Open/closed hours condition (A5) now?** Recommended: yes, it's small and is the most-asked chatbot rule for restaurants.
- **D4 — Keep 30 days of chat lines?** Recommended: 30. Shorter = less personal data held; longer = better context for regulars.
- **D5 — Taglish pack as the default for new stores?** Recommended: no, keep English as the default (today's words) and offer Taglish as one tap.

## 5b. Build notes (2026-11-12)

- **A2** registry: commits 7bf7b7c8 (golden snapshot) + 98abaa25. `messenger_settings.messages` APPLIED as `20261111212438` (file renamed to the recorded version).
- **A1 + A4**: `src/components/admin/messenger-studio/`, simulator `src/lib/messenger/chat-simulator.ts` (runs the real `decideReply`).
- **B1**: `20261111224021_messenger_chat_log.sql` APPLIED on platform 2026-11-12 and probed in a rolled-back block as owner (reads own store), another store's owner (0 rows), settings-only staff (0 rows), anon (42501). Branch scoping proved in PGlite only (`tests/sql/run-messenger-chat-log.cjs`, 55 checks): sample-demo has no order at an outlet. Webhook logs in `handle-event.ts` (deps `logChat`, `refreshProfile`), status messages in `order-update.ts`. Types hand-added to `src/types/supabase.ts` in the generator's format.
- **A5**: `when?: 'open' | 'closed'` on keyword / Get Started / fallback triggers (`rules.ts`; starter questions and chat-menu buttons live in Meta's profile and always answer). Open = the store's OWN hours (`ReplyStore.isOpenNow`, `getStoreOpenStatus` with hours forced on, pre-launch ignored; no hours = open). A Get Started / fallback limited to the current state beats the always one; one of each per "Only when" choice. The Test chat has a Store open / closed switch once a rule uses it.
- **Verified** on sample-demo (verify-webnegosyo `drive/messenger-studio.spec.ts`): evidence `test-results/verify/messenger-studio-1/` and `…/messenger-studio-hours/`. Rules were never saved from the spec (that would sync sample-demo's real Page profile).

## 6. Risks

- Customer names and message text are personal data: service-role writes, RLS on reads, 30-day purge, no media stored, never sent to the Owl model.
- User Profile API: works with `pages_messaging` for people who messaged the Page; must be checked on the live demo Page (only app-role users until App Review passes). Without it the app shows "Messenger customer" and the bot skips `{name}`.
- Webhook cost: logging adds one insert per batch inside `after()`; never before the 200.
- Release 2 still owes deploy → `090200` → live Meta test. This work stacks on it.

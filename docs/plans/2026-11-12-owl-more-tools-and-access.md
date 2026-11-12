# Owl: payment methods, inventory Q&A, Lalamove help, University videos, and who may use Owl

Status: PLAN — waiting for the owner's OK. Nothing built yet.

## What Owl can already do (no work needed, just confirmed in code)

| Ask | Already there |
|---|---|
| Add a dish | `propose_menu_item` (one dish) |
| Upload many dishes | `propose_menu_from_photo` + `propose_menu_import_edit` (≤3 menu photos, ≤40 dishes) |
| Check stock | `get_inventory` (out/low, stock value if `costs`, recent movements) |
| Record a delivery / waste / count | `propose_stock_adjustment` |
| Create loyalty | `propose_loyalty_program` (new = draft), `propose_loyalty_status` |
| Create campaigns | `propose_sms_campaign`, `propose_sms_automation` (+ status / run now) |
| Permissions | every tool is filtered by the caller's staff keys; every write is a proposal the person taps Confirm on, and the writer re-checks the key |

## What this plan adds

### 1. Who may use Owl (owner decides)

Today any staff account on an Owl-enabled store gets Owl (tools filtered by their keys). New rule:

- New staff permission key **`assistant`** ("Use the Owl assistant"), **opt-in** (like `activity_view`): `permissions: null` legacy admins do NOT hold it. Owners always may use Owl.
- Four registry copies change together (web `staff-permissions.ts`, app, desktop, `manage-staff/staff-core.ts` + redeploy) and the SQL twin `app_user_has_permission`. Parity tests already pin them.
- Owner ticks it per staff in the normal staff editor (web + app), and a new owner-only **"Who can use Owl"** sheet in the Owl panel header lists staff with a switch each — it writes through the SAME staff writer, no second copy of the rule.
- Enforced in `resolveAssistantAccess` (all four routes: chat, actions, conversations, transcribe), so the browser and app get a plain 403 "Ask the owner to give you Owl".
- The app hides the owl for people without it (session reads the key), web admin likewise.
- Live today: 4 owners and 1 staff account used Owl in the last 60 days; that one staff account loses Owl until the owner ticks it.

### 2. Payment methods

- `get_payment_methods` (read, `store_setup`): name, on/off, which order types, proof required, has QR. Hands out refs `pm1…`.
- `propose_payment_method` (create): name, account details (e.g. "GCash 0917… · J. Dela Cruz"), order types (by name, matched to the store's own), require proof, and a **QR photo** if one is attached to the message. The QR is uploaded to ImageKit when proposed (URL stored in the payload; the photo itself never reaches the chat model, same as menu photos). Confirm runs `createPaymentMethod` through the caller's cookie/bearer session (`store_setup` check stays inside it).
- `propose_payment_method_change`: turn on/off, change details, swap QR, change order types. Refuses if the method changed since the card was shown. **No delete.**
- New action kinds `payment_method`, `payment_method_change` → migration widens `assistant_actions_kind_check` (test-enforced), applied + probed before the code ships.

### 3. Inventory: ask anything

- `get_ingredient` (read, `inventory`): one ingredient by ref/name — on hand (per branch for multi-branch), unit, reorder level, cost per unit (only with `costs`), last delivery/waste/count, which dishes use it, how many of each dish the stock still covers (reuses the producible-quantity math).
- `get_dish_recipe` (read, `menu` or `inventory`): what one dish uses and what it costs to make (cost only with `costs`).
- `propose_ingredient` (create, `menu` per the inventory ledger rules): name, stock unit, reorder level, optional opening count (filed as a `stocktake` movement after the item exists — never a direct `current_qty` write).
- `get_inventory` keeps its two views; the system prompt learns to use `get_ingredient` for "how much X do I have".

### 4. Lalamove help

- `get_delivery_setup` (read, owner-only, like the Settings → Delivery card): is Lalamove switched on for the store (superadmin flag), are keys saved (yes/no only, **never the keys**), sandbox or live, market, rider-call phone, store pin set, delivery order type on, last 7 days' bookings vs. failures with the failure reason. Returns a step checklist + link to Settings → Delivery + the matching University lesson.
- Owl never takes keys in chat: conversations are stored and sent to OpenRouter. A message that looks like a Lalamove key (`pk_test_` / `pk_prod_` / `sk_…`, same shapes as `lalamove-keys.ts`) is **cut before it is stored or sent**, and Owl answers "paste your keys in Settings → Delivery, not here".
- If Lalamove isn't switched on for the store, Owl says so and how to ask for it (owner can't flip the flag; it is privileged).

### 5. SmartMenu University videos

- `find_lessons` (read, everyone with Owl): search the published lessons (24 today, 14 with video) by the question's words (title, summary, module, course; folded, English + Tagalog words), top 3.
- New card type **`video`**: thumbnail, title, length, plays in place on web (the existing YouTube/Vimeo/Loom embed from `university/video.ts`), "Open lesson" → `/admin/learn/<course>/<lesson>`. App: thumbnail card that opens the lesson in the browser (no in-app player module).
- The prompt tells Owl to attach a lesson when someone asks "how do I…" and one matches; lessons without a video still show as a link.

## Every new piece, the same rules as today

- Tenant injected, never a tool input; ids → refs; cards only in the browser; writes two-phase with 30-min expiry and CAS.
- New tools APPENDED to `ASSISTANT_TOOLS` (cached prefix stays).
- Mirrored in the app: `lib/assistant/presentation.ts` + `links.ts` (+ video card).
- Golden routing set (`tests/fixtures/assistant/golden.json`) gets the new asks.

## Tests and proof before "done"

- Unit: each tool's builder + refusals; access filter (no `assistant` key → 403; owner always ok); key-redaction; kinds-vs-migration test; registry parity for the new key.
- SQL: migration applied to platform and probed (kinds CHECK accepts the new kinds; `app_user_has_permission(..,'assistant')` false for a legacy null-permission admin, true when ticked).
- Live: `ASSISTANT_LIVE=1` on Sample Demo (proposes, never confirms) for payment method, ingredient, delivery setup, lessons; one confirm round trip on Sample Demo with cleanup.
- Browser: walk the Owl on `sample-demo.localhost:3000` (verify-webnegosyo) — "who can use Owl", a QR payment method, a lesson video playing. App: simulator check of the hidden owl + video card. Anything not run is reported inconclusive.

## Ship order

1. Migration (kinds + key twin) applied + probed → 2. manage-staff redeploy with the new key → 3. web deploy → 4. app OTA.
The key must ship with the code that knows it (production rejects unknown keys).

## Not in this plan

Deleting payment methods / dishes / ingredients; taking Lalamove keys in chat; booking Lalamove riders from chat; editing University content.
